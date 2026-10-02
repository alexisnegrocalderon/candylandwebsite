import { invokeLLM, extractContent, NO_THINKING } from './_core/llm';
import { ENV } from './_core/env';
import {
  getSiteSettings,
  updateSiteSettings,
  listIgThreads,
  listWaThreads,
  getIgMessages,
  getWaMessages,
  listAgentHandoffLog,
  getAgentSalesSummary,
  getAgentCoachReport,
} from './db';
import { sendEmail } from './email';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { normalizeAgentCoachReport, type AgentCoachReport } from '../shared/agentCoach';
import { chileHourOf, formatChileDate } from '../shared/chileDate';
import { ADMIN_NOTIFICATION_EMAIL } from '../shared/const';

/* Coach semanal del agente de IA (pedido del dueño, 27/09): que el agente
 * vaya aprendiendo "cada vez más" de los clientes. Una vez por semana la IA
 * lee las conversaciones de Instagram y WhatsApp, las derivaciones y las
 * ventas que trajo el agente, y le devuelve al dueño un reporte accionable:
 * qué preguntan más, dónde se enfría la gente, y el texto exacto que
 * convendría sumar a "Qué tiene que saber el agente" y a la guía de ventas.
 *
 * No toca la config sola a propósito: el conocimiento del agente lo escribe
 * el dueño. El coach sugiere; el panel tiene un botón para agregar cada
 * sugerencia con un toque, pero la decisión y el "Guardar" son del dueño. */

const MAX_THREADS_PER_CHANNEL = 40;
const MAX_MESSAGES_PER_THREAD = 20;
const MAX_CHARS_PER_MESSAGE = 300;

/** Lunes a las 10:00 hora de Chile. */
const COACH_WEEKDAY = 1;
const COACH_HOUR_CHILE = 10;

// Modelo más capaz que el del chat (Haiku): corre una vez por semana y el
// análisis es justamente lo que tiene que salir bien. Solo aplica cuando el
// proveedor activo es Anthropic -- con otro, invokeLLM usa su default.
const COACH_MODEL = 'claude-sonnet-5';

const COACH_SCHEMA = {
  name: 'reporte_coach_agente',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Resumen de la semana en 3 a 5 frases, en español chileno, directo al dueño.' },
      topQuestions: { type: 'array', items: { type: 'string' }, description: 'Las preguntas o temas más frecuentes, de más a menos, cada uno en una línea corta.' },
      dropOffPoints: { type: 'array', items: { type: 'string' }, description: 'Momentos en que la gente dejó de contestar o no compró, con la causa probable.' },
      knowledgeSuggestions: { type: 'array', items: { type: 'string' }, description: 'Textos listos para pegar en "Qué tiene que saber el agente": datos o respuestas que al agente le faltaron. Cada uno autocontenido.' },
      playbookSuggestions: { type: 'array', items: { type: 'string' }, description: 'Textos listos para pegar en la guía de ventas: nuevos tipos de cliente u objeciones con cómo responderlas.' },
      highlights: { type: 'array', items: { type: 'string' }, description: 'Qué funcionó bien o mal en cómo contestó el agente, con un ejemplo breve.' },
    },
    required: ['summary', 'topQuestions', 'dropOffPoints', 'knowledgeSuggestions', 'playbookSuggestions', 'highlights'],
    additionalProperties: false,
  },
} as const;

/** Día de la semana en Chile (0 = domingo), respetando el horario de verano. */
export function chileWeekdayOf(date: Date): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

export function shouldRunAgentCoachNow(now: Date): boolean {
  return chileWeekdayOf(now) === COACH_WEEKDAY && chileHourOf(now) === COACH_HOUR_CHILE;
}

type TranscriptMessage = { direction: 'in' | 'out'; source: string; text: string | null };

/** Una conversación como texto plano, sin nombres (Persona N): el coach no
 * necesita saber quién es quién para aprender de la conversación. */
export function formatTranscript(label: string, messages: TranscriptMessage[]): string {
  const lines = messages
    .filter((m) => (m.text ?? '').trim().length > 0 && !(m.text ?? '').startsWith('['))
    .map((m) => {
      const who = m.direction === 'in' ? 'Cliente' : m.source === 'bot' ? 'Agente' : 'Dueño';
      return `${who}: ${(m.text as string).replace(/\s+/g, ' ').slice(0, MAX_CHARS_PER_MESSAGE)}`;
    });
  return lines.length > 0 ? `### ${label}\n${lines.join('\n')}` : '';
}

export type AgentCoachResult = { ran: boolean; reason?: string; report?: AgentCoachReport; emailed?: boolean };

/** Arma el reporte y lo guarda. `trigger: 'cron'` respeta el interruptor y
 * evita correr dos veces el mismo día; `'manual'` (botón del panel) siempre
 * corre. Nunca manda nada a los clientes. */
export async function runAgentCoach(opts: { now?: Date; trigger?: 'cron' | 'manual'; email?: boolean } = {}): Promise<AgentCoachResult> {
  const now = opts.now ?? new Date();
  const trigger = opts.trigger ?? 'cron';
  const settings = await getSiteSettings();
  const config = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);

  if (trigger === 'cron') {
    if (!config.coachWeeklyEnabled) return { ran: false, reason: 'apagado en Ajustes del agente' };
    const last = normalizeAgentCoachReport(await getAgentCoachReport());
    if (last && now.getTime() - new Date(last.generatedAt).getTime() < 20 * 60 * 60 * 1000) {
      return { ran: false, reason: 'ya se generó hoy' };
    }
  }

  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recent = <T extends { lastMessageAt: Date | null }>(threads: T[]) =>
    threads.filter((t) => t.lastMessageAt && new Date(t.lastMessageAt).getTime() >= since.getTime()).slice(0, MAX_THREADS_PER_CHANNEL);

  const [igThreads, waThreads, handoffs, sales] = await Promise.all([
    listIgThreads(100).then(recent),
    listWaThreads(100).then(recent),
    listAgentHandoffLog({ onlyPending: false, limit: 100 }),
    getAgentSalesSummary(since),
  ]);

  const transcripts: string[] = [];
  let customerMessages = 0;
  let n = 0;
  for (const t of igThreads) {
    const msgs = (await getIgMessages(t.id, MAX_MESSAGES_PER_THREAD)) as TranscriptMessage[];
    customerMessages += msgs.filter((m) => m.direction === 'in').length;
    const block = formatTranscript(`Persona ${++n} (Instagram)`, msgs);
    if (block) transcripts.push(block);
  }
  for (const t of waThreads) {
    const msgs = (await getWaMessages(t.id, MAX_MESSAGES_PER_THREAD)) as TranscriptMessage[];
    customerMessages += msgs.filter((m) => m.direction === 'in').length;
    const block = formatTranscript(`Persona ${++n} (WhatsApp)`, msgs);
    if (block) transcripts.push(block);
  }
  const weekHandoffs = handoffs.filter((h) => new Date(h.createdAt).getTime() >= since.getTime());

  const stats = {
    conversations: igThreads.length + waThreads.length,
    customerMessages,
    handoffs: weekHandoffs.length,
    agentOrders: sales.ordersCount,
    agentRevenue: sales.revenue,
  };

  if (transcripts.length === 0) {
    return { ran: false, reason: 'no hubo conversaciones esta semana' };
  }

  const userContent = [
    `Semana analizada: ${formatChileDate(since, { withYear: true })} al ${formatChileDate(now, { withYear: true })}.`,
    `Conversaciones: ${stats.conversations}. Mensajes de clientes: ${stats.customerMessages}. Derivaciones a una persona: ${stats.handoffs}. Compras que entraron por un botón del agente: ${stats.agentOrders} ($${Math.round(stats.agentRevenue).toLocaleString('es-CL')}).`,
    '',
    'LO QUE EL AGENTE YA SABE HOY ("Qué tiene que saber el agente") -- no sugieras repetir esto:',
    config.brandNotes,
    '',
    'GUÍA DE VENTAS ACTUAL -- no sugieras repetir esto:',
    config.salesPlaybook || '(vacía)',
    '',
    'DERIVACIONES DE LA SEMANA (pregunta -> motivo):',
    ...(weekHandoffs.length > 0 ? weekHandoffs.slice(0, 40).map((h) => `- "${h.incomingText.slice(0, 200)}" -> ${h.reason}`) : ['(ninguna)']),
    '',
    'CONVERSACIONES:',
    ...transcripts,
  ].join('\n');

  const result = await invokeLLM({
    messages: [
      {
        role: 'system',
        content: [
          'Eres el coach de ventas del agente de IA que contesta el Instagram y el WhatsApp de Mansion Playroom, una productora de fiestas en Valparaíso / Viña del Mar.',
          'Tu trabajo: leer las conversaciones de la semana y decirle al dueño, en español chileno, claro y accionable, cómo hacer que el agente venda más entradas sin dejar de ser cálido ni sonar desesperado.',
          'Reglas: basa todo en lo que de verdad pasó en las conversaciones (nada inventado), no nombres a nadie, no repitas lo que el agente ya sabe, y escribe las sugerencias de conocimiento y de guía como textos listos para pegar tal cual.',
          'Cuando una pregunta se derivó porque al agente le faltaba un dato, la sugerencia de conocimiento tiene que decir qué dato falta y dejar el hueco para que el dueño complete lo que no puedas saber (ej. "El estacionamiento cuesta $___ y ...").',
        ].join('\n'),
      },
      { role: 'user', content: userContent },
    ],
    responseFormat: { type: 'json_schema', json_schema: COACH_SCHEMA as any },
    maxTokens: 4500,
    ...(ENV.anthropicApiKey ? { model: COACH_MODEL, thinking: NO_THINKING } : {}),
  });

  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as Record<string, unknown>;
  const report = normalizeAgentCoachReport({
    ...parsed,
    generatedAt: now.toISOString(),
    periodFrom: since.toISOString(),
    periodTo: now.toISOString(),
    stats,
  });
  if (!report) throw new Error('El coach devolvió un reporte vacío');

  await updateSiteSettings({ agentCoachReport: report });

  let emailed = false;
  if (opts.email !== false) {
    const sent = await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: '🎯 Coach semanal del agente — Mansion Playroom',
      html: buildAgentCoachEmail(report),
    });
    emailed = sent.success;
  }

  return { ran: true, report, emailed };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildAgentCoachEmail(report: AgentCoachReport): string {
  const section = (title: string, items: string[]) =>
    items.length === 0
      ? ''
      : `<h3 style="margin:24px 0 8px;font-size:16px;color:#2A1B3D;">${title}</h3><ul style="margin:0;padding-left:20px;color:#3A2E4A;font-size:14px;line-height:1.5;">${items.map((i) => `<li style="margin-bottom:6px;">${escapeHtml(i)}</li>`).join('')}</ul>`;
  const s = report.stats;
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#FFFFFF;">
      <h2 style="margin:0 0 4px;font-size:20px;color:#2A1B3D;">Coach semanal del agente</h2>
      <p style="margin:0 0 16px;color:#7A6F86;font-size:13px;">${escapeHtml(formatChileDate(new Date(report.periodFrom)))} al ${escapeHtml(formatChileDate(new Date(report.periodTo)))}</p>
      <p style="margin:0 0 16px;color:#3A2E4A;font-size:14px;">
        ${s.conversations} conversaciones · ${s.customerMessages} mensajes de clientes · ${s.handoffs} derivaciones · ${s.agentOrders} compras por el agente ($${Math.round(s.agentRevenue).toLocaleString('es-CL')})
      </p>
      <p style="margin:0;color:#2A1B3D;font-size:15px;line-height:1.6;">${escapeHtml(report.summary)}</p>
      ${section('Lo que más preguntan', report.topQuestions)}
      ${section('Dónde se enfría la gente', report.dropOffPoints)}
      ${section('Para agregar a "Qué tiene que saber el agente"', report.knowledgeSuggestions)}
      ${section('Para agregar a la guía de ventas', report.playbookSuggestions)}
      ${section('Lo que funcionó y lo que no', report.highlights)}
      <p style="margin:24px 0 0;color:#7A6F86;font-size:12px;">Cada sugerencia se puede agregar con un toque desde /admin → Marketing → Instagram → Coach semanal.</p>
    </div>
  `;
}
