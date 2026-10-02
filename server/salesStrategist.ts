import { invokeLLM, extractContent, NO_THINKING } from './_core/llm';
import { ENV } from './_core/env';
import {
  getEventById,
  getFeaturedEvent,
  getEventAccessSalesRows,
  getEventsBefore,
  getAccessTicketMix,
  getSalesByUtmOrigin,
  getAgentSalesSummary,
  getSalesStrategyState,
  updateSiteSettings,
} from './db';
import { sendEmail } from './email';
import { ADMIN_NOTIFICATION_EMAIL } from '../shared/const';
import { formatChileDate, chileHourOf } from '../shared/chileDate';
import { normalizeTandaSchedule, nextPhase } from '../shared/tandaSchedule';
import { isUnlimitedStock } from '../shared/stock';
import {
  daysUntil,
  projectFinalUnits,
  totalRevenue,
  totalUnits,
  unitsSoldAtDaysOut,
  weeklyPace,
  normalizeSalesStrategyReport,
  normalizeSalesStrategyState,
  type SalesStrategyReport,
  type SalesStrategyState,
} from '../shared/salesStrategy';
import { chileWeekdayOf } from './agentCoach';

/* Director comercial IA (plan del 02/10): cada lunes -- o cuando el dueño lo
 * pide desde el panel -- cruza las ventas del próximo evento contra el evento
 * anterior a la misma distancia de su fecha, proyecta cuántas entradas se
 * van a vender y la IA recomienda qué hacer (promo, mailing, contenido,
 * embajadores...).
 *
 * Solo datos AGREGADOS: cantidades, precios y orígenes de venta. Nunca un
 * nombre, un correo ni una orden individual. Y los números los calcula el
 * código (shared/salesStrategy.ts); la IA solo los interpreta. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Lunes 09:00 de Chile: una hora antes del coach del agente, para que los
 * dos correos no lleguen juntos. */
const STRATEGY_WEEKDAY = 1;
const STRATEGY_HOUR_CHILE = 9;

// Mismo criterio que el coach: corre una vez por semana y el análisis es
// justo lo que tiene que salir bien, así que usa el modelo más capaz.
const STRATEGY_MODEL = 'claude-sonnet-5';

export function shouldRunSalesStrategyNow(now: Date): boolean {
  return chileWeekdayOf(now) === STRATEGY_WEEKDAY && chileHourOf(now) === STRATEGY_HOUR_CHILE;
}

const STRATEGY_SCHEMA = {
  name: 'estrategia_comercial',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Dónde estamos, en 3 a 5 frases en español chileno, directo al dueño: cómo va la venta frente al evento anterior y qué se proyecta.' },
      recommendations: {
        type: 'array',
        description: 'De 3 a 5 acciones concretas, de más a menos importante.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'La acción en una línea corta (ej. "Lanzar una flash promo el jueves").' },
            why: { type: 'string', description: 'Por qué, apoyado en un número de los datos entregados.' },
            action: { type: 'string', description: 'Cómo hacerlo con lo que ya tiene el panel (flash promo, mailing, plan de Instagram, embajadores, agente), paso a paso y corto.' },
            urgency: { type: 'string', enum: ['alta', 'media', 'baja'] },
          },
          required: ['title', 'why', 'action', 'urgency'],
          additionalProperties: false,
        },
      },
      risks: { type: 'array', items: { type: 'string' }, description: 'Riesgos o señales de alerta (ritmo que se enfría, un acceso que no se vende, una tanda que cierra...). Vacío si no hay.' },
    },
    required: ['summary', 'recommendations', 'risks'],
    additionalProperties: false,
  },
} as const;

type StrategyData = {
  event: NonNullable<Awaited<ReturnType<typeof getEventById>>>;
  numbers: SalesStrategyReport['numbers'];
  daysOut: number;
  dataBlock: string;
};

/** Junta todo lo que la IA necesita en un bloque de texto, y los números del
 * reporte. Exportada para probarla con la base simulada. */
export async function gatherStrategyData(eventId: number | undefined, now: Date): Promise<StrategyData | { error: string }> {
  const event = eventId ? await getEventById(eventId) : await getFeaturedEvent();
  if (!event) return { error: 'No hay ningún evento publicado para analizar.' };

  const eventDate = new Date(event.eventDate);
  const daysOut = daysUntil(eventDate, now);
  const rows = await getEventAccessSalesRows(event.id);
  const unitsSold = totalUnits(rows);
  const pace = weeklyPace(rows, now);

  // El evento anterior: el más reciente que haya vendido algo. Si el
  // inmediato anterior quedó vacío (un evento de prueba, uno cancelado), se
  // prueba con el siguiente en vez de comparar contra nada.
  let previous: SalesStrategyReport['numbers']['previousEvent'] = null;
  let previousForProjection: { atSameDaysOut: number; finalUnits: number } | null = null;
  for (const candidate of await getEventsBefore(eventDate, 3)) {
    const prevRows = await getEventAccessSalesRows(candidate.id);
    const finalUnits = totalUnits(prevRows);
    if (finalUnits === 0) continue;
    const atSame = unitsSoldAtDaysOut(prevRows, new Date(candidate.eventDate), Math.max(daysOut, 0));
    previous = { title: candidate.title, unitsAtSameDaysOut: atSame, finalUnits };
    previousForProjection = { atSameDaysOut: atSame, finalUnits };
    break;
  }

  const projection = projectFinalUnits({ unitsSoFar: unitsSold, daysOut, last7: pace.last7, previous: previousForProjection });

  const numbers: SalesStrategyReport['numbers'] = {
    unitsSold,
    revenue: totalRevenue(rows),
    unitsLast7: pace.last7,
    unitsPrev7: pace.prev7,
    previousEvent: previous,
    projectedFinalUnits: projection?.projectedFinalUnits ?? null,
    projectionMethod: projection?.method ?? null,
  };

  const [mix, origins, agentSales] = await Promise.all([
    getAccessTicketMix(event.id),
    getSalesByUtmOrigin(event.id),
    getAgentSalesSummary(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
  ]);

  const schedule = normalizeTandaSchedule(event.tandaDiscountSchedule);
  const current = schedule[event.tandaPhaseIndex];
  const next = nextPhase(event.tandaPhaseIndex, schedule);

  const lines: string[] = [];
  lines.push(`EVENTO: "${event.title}" -- ${formatChileDate(eventDate, { withWeekday: true })}. Faltan ${daysOut} días.`);
  lines.push('');
  lines.push('VENTAS DE ENTRADAS (accesos aprobados, web + caja):');
  lines.push(`- Vendidas hasta hoy: ${unitsSold} entradas (${clp(numbers.revenue)}).`);
  lines.push(`- Últimos 7 días: ${pace.last7}. Los 7 días anteriores: ${pace.prev7}.`);
  if (previous) {
    lines.push(`- Evento anterior "${previous.title}": a esta misma distancia de su fecha (${Math.max(daysOut, 0)} días antes) llevaba ${previous.unitsAtSameDaysOut} entradas, y terminó vendiendo ${previous.finalUnits} en total.`);
  } else {
    lines.push('- No hay un evento anterior con ventas para comparar.');
  }
  if (projection) {
    lines.push(`- Proyección de entradas totales al cierre: ${projection.projectedFinalUnits} (método: ${projection.method === 'comparado' ? 'escalando por cómo cerró el evento anterior' : 'extendiendo el ritmo de los últimos 7 días, sin comparar'}).`);
  } else {
    lines.push('- No hay base suficiente para proyectar todavía.');
  }

  lines.push('');
  lines.push('ACCESOS (precio vigente, vendidas / cupo):');
  for (const t of mix) {
    const cupo = isUnlimitedStock(Number(t.totalStock)) ? 'sin tope' : String(t.totalStock);
    const original = t.originalPrice && Number(t.originalPrice) > Number(t.price) ? ` (precio general ${clp(Number(t.originalPrice))})` : '';
    lines.push(`- ${t.name}: ${clp(Number(t.price))}${original} -- ${t.soldCount} / ${cupo} (${t.status})`);
  }

  lines.push('');
  lines.push('TANDAS:');
  if (current) {
    lines.push(`- Tanda vigente: ${current.percent}% de descuento${current.untilDate ? `, rige hasta ${formatChileDate(new Date(current.untilDate), { withWeekday: true })}` : ', sin fecha de cierre (se cierra a mano)'}.`);
  }
  if (next) {
    lines.push(`- Siguiente tanda: ${next.phase.percent}% de descuento (los precios suben al pasar a ella).`);
  } else {
    lines.push('- Es la última tanda: no hay una siguiente que apure la compra.');
  }

  lines.push('');
  lines.push('DE DÓNDE VIENEN LAS VENTAS WEB (por origen):');
  if (origins.length === 0) {
    lines.push('- Todavía no hay ventas con origen registrado.');
  } else {
    for (const o of origins.slice(0, 6)) {
      lines.push(`- ${o.utmSource}${o.utmCampaign ? ` / ${o.utmCampaign}` : ''}: ${o.ordersCount} órdenes, ${clp(o.revenue)}`);
    }
  }
  lines.push(`- Compras que entraron por un botón del agente de Instagram/WhatsApp en los últimos 7 días: ${agentSales.ordersCount} (${clp(agentSales.revenue)}).`);

  return { event, numbers, daysOut, dataBlock: lines.join('\n') };
}

const SYSTEM_PROMPT = [
  'Eres el director comercial de Mansion Playroom, una productora de fiestas en Valparaíso / Viña del Mar, Chile. Le hablas al dueño: directo, en español chileno, sin rodeos.',
  'Recibes los números de venta del próximo evento ya calculados. Tu trabajo es decirle qué está pasando y qué hacer esta semana para vender más entradas sin desesperarse ni inventar urgencia que no existe.',
  'Reglas: basa TODO en los datos entregados -- nunca inventes ni estimes una cifra que no esté ahí, y si algo no se puede saber con esos datos, dilo. No nombres a ninguna persona.',
  'Las acciones tienen que poder hacerse con lo que ya tiene el panel: flash promo, cerrar tanda y activar la siguiente, mailing a la base, un plan de contenido para Instagram, el agente de DMs, los embajadores. Dale pasos concretos, no consejos generales.',
  'Si la proyección viene "sin comparar" (solo ritmo), adviértelo: es una cota conservadora porque la venta suele acelerar al final.',
  'Ordena las recomendaciones de más a menos importante. Pocas y buenas: de 3 a 5.',
].join('\n');

export type SalesStrategyResult = { ran: boolean; reason?: string; report?: SalesStrategyReport; emailed?: boolean };

/** Arma el reporte y lo guarda. `trigger: 'cron'` respeta el interruptor del
 * correo y no repite el mismo día; `'manual'` (botón del panel) siempre corre
 * y no manda correo salvo que se pida. Nunca escribe nada hacia los clientes. */
export async function runSalesStrategist(opts: { now?: Date; trigger?: 'cron' | 'manual'; eventId?: number; email?: boolean } = {}): Promise<SalesStrategyResult> {
  const now = opts.now ?? new Date();
  const trigger = opts.trigger ?? 'cron';
  const state = normalizeSalesStrategyState(await getSalesStrategyState());

  if (trigger === 'cron') {
    if (!state.weeklyEnabled) return { ran: false, reason: 'apagado en el Director comercial' };
    if (state.report && now.getTime() - new Date(state.report.generatedAt).getTime() < 20 * 60 * 60 * 1000) {
      return { ran: false, reason: 'ya se generó hoy' };
    }
  }

  const data = await gatherStrategyData(opts.eventId, now);
  if ('error' in data) return { ran: false, reason: data.error };

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: data.dataBlock },
    ],
    responseFormat: { type: 'json_schema', json_schema: STRATEGY_SCHEMA as any },
    maxTokens: 4000,
    ...(ENV.anthropicApiKey ? { model: STRATEGY_MODEL, thinking: NO_THINKING } : {}),
  });

  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as Record<string, unknown>;
  const report = normalizeSalesStrategyReport({
    ...parsed,
    generatedAt: now.toISOString(),
    eventId: data.event.id,
    eventTitle: data.event.title,
    eventDate: new Date(data.event.eventDate).toISOString(),
    daysOut: data.daysOut,
    numbers: data.numbers,
  });
  if (!report) throw new Error('El Director comercial devolvió un reporte vacío');

  await saveState({ weeklyEnabled: state.weeklyEnabled, report });

  let emailed = false;
  const shouldEmail = opts.email ?? trigger === 'cron';
  if (shouldEmail) {
    const sent = await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `📈 Director comercial — ${report.eventTitle}`,
      html: buildSalesStrategyEmail(report),
    });
    emailed = sent.success;
  }

  return { ran: true, report, emailed };
}

/** Guarda el interruptor del correo de los lunes sin tocar el último reporte. */
export async function setSalesStrategyWeekly(enabled: boolean): Promise<void> {
  const state = normalizeSalesStrategyState(await getSalesStrategyState());
  await saveState({ weeklyEnabled: enabled, report: state.report });
}

/** Guarda el estado. Si la columna todavía no existe en la base (la migración
 * se corre a mano en TiDB), el error de SQL no le dice nada al dueño: se
 * cambia por uno que sí. */
async function saveState(state: SalesStrategyState): Promise<void> {
  try {
    await updateSiteSettings({ salesStrategyState: state });
  } catch (err) {
    if (/unknown column/i.test(String((err as any)?.cause?.message ?? (err as Error)?.message ?? ''))) {
      throw new Error('Falta crear la columna salesStrategyState en la base de datos (una línea de SQL en TiDB). Pídele a quien te ayuda con el sistema que la corra.');
    }
    throw err;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const URGENCY_LABEL = { alta: '🔴 Alta', media: '🟠 Media', baja: '🟢 Baja' } as const;

export function buildSalesStrategyEmail(report: SalesStrategyReport): string {
  const n = report.numbers;
  const projection = n.projectedFinalUnits != null
    ? ` · proyección al cierre: ${n.projectedFinalUnits} entradas${n.projectionMethod === 'ritmo' ? ' (cota conservadora)' : ''}`
    : '';
  const recs = report.recommendations
    .map((r) => `
      <div style="margin:0 0 16px;padding:12px 14px;border:1px solid #E4DDEC;border-radius:10px;">
        <p style="margin:0 0 4px;font-size:12px;color:#7A6F86;">${URGENCY_LABEL[r.urgency]}</p>
        <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#2A1B3D;">${escapeHtml(r.title)}</p>
        <p style="margin:0 0 6px;font-size:13px;color:#3A2E4A;line-height:1.5;">${escapeHtml(r.why)}</p>
        <p style="margin:0;font-size:13px;color:#3A2E4A;line-height:1.5;"><strong>Cómo:</strong> ${escapeHtml(r.action)}</p>
      </div>`)
    .join('');
  const risks = report.risks.length === 0
    ? ''
    : `<h3 style="margin:24px 0 8px;font-size:16px;color:#2A1B3D;">Ojo con</h3><ul style="margin:0;padding-left:20px;color:#3A2E4A;font-size:14px;line-height:1.5;">${report.risks.map((x) => `<li style="margin-bottom:6px;">${escapeHtml(x)}</li>`).join('')}</ul>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#FFFFFF;">
      <h2 style="margin:0 0 4px;font-size:20px;color:#2A1B3D;">Director comercial</h2>
      <p style="margin:0 0 16px;color:#7A6F86;font-size:13px;">${escapeHtml(report.eventTitle)} · faltan ${report.daysOut} días</p>
      <p style="margin:0 0 16px;color:#3A2E4A;font-size:14px;">
        ${n.unitsSold} entradas ($${Math.round(n.revenue).toLocaleString('es-CL')}) · últimos 7 días: ${n.unitsLast7}${projection}
      </p>
      <p style="margin:0 0 20px;color:#2A1B3D;font-size:15px;line-height:1.6;">${escapeHtml(report.summary)}</p>
      <h3 style="margin:0 0 10px;font-size:16px;color:#2A1B3D;">Qué hacer esta semana</h3>
      ${recs}
      ${risks}
      <p style="margin:24px 0 0;color:#7A6F86;font-size:12px;">Puedes verlo y volver a generarlo desde /admin → Ventas → Director comercial.</p>
    </div>
  `;
}
