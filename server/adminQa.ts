import { invokeLLM, extractContent } from "./_core/llm";
import * as db from "./db";

/* Preguntas simples sobre ventas/movimientos (pedido explícito del dueño,
 * 02/09): reusa la misma IA que ya está integrada para mailing, pero acá
 * responde en texto plano (sin json_schema, no llena ningún formulario) a
 * partir de datos YA AGREGADOS -- nunca filas crudas ni datos de clientes.
 * El system prompt exige responder solo con esos datos y admitir cuando la
 * pregunta no se puede contestar con ellos, para no inventar números. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function buildDataBlock(
  stats: { totalOrders: number; totalRevenue: number; approvedOrders: number },
  utmSales: Awaited<ReturnType<typeof db.getSalesByUtmOrigin>>,
  pnl: Awaited<ReturnType<typeof db.getEventPnl>>,
): string {
  const parts: string[] = [];

  parts.push([
    'Estadísticas generales de órdenes (todos los canales, web + caja):',
    `- Total de órdenes: ${Number(stats.totalOrders)}`,
    `- Órdenes aprobadas (pagadas): ${Number(stats.approvedOrders)}`,
    `- Ingreso total de órdenes aprobadas: ${clp(Number(stats.totalRevenue))}`,
  ].join('\n'));

  if (utmSales.length > 0) {
    const top = utmSales.slice(0, 10);
    parts.push([
      'Ventas web aprobadas por origen (UTM), de mayor a menor ingreso:',
      ...top.map((r) => `- ${r.utmSource}${r.utmMedium ? ` / ${r.utmMedium}` : ''}${r.utmCampaign ? ` / ${r.utmCampaign}` : ''}: ${r.ordersCount} órdenes, ${clp(r.revenue)}`),
    ].join('\n'));
  } else {
    parts.push('Ventas por origen (UTM): todavía no hay datos.');
  }

  if (pnl) {
    const totalExpenses = pnl.cogs + pnl.directExpensesTotal + pnl.generalExpensesAssigned + pnl.ambassadorCommissions;
    parts.push([
      `P&L del evento "${pnl.title}" (mes ${pnl.monthKey}):`,
      `- Ingreso bruto: ${clp(pnl.grossIncome)}`,
      `- Costo de mercadería vendida: ${clp(pnl.cogs)} (dato cargado para ${pnl.cogsCoverage}% de las unidades vendidas)`,
      `- Comisiones de embajadores: ${clp(pnl.ambassadorCommissions)}`,
      `- Gastos directos del evento: ${clp(pnl.directExpensesTotal)}`,
      `- Gastos generales prorrateados: ${clp(pnl.generalExpensesAssigned)}`,
      `- Gasto total: ${clp(totalExpenses)}`,
      `- Utilidad neta: ${clp(pnl.netProfit)}`,
    ].join('\n'));
  } else {
    parts.push('P&L de evento: no hay ningún evento para calcularlo.');
  }

  return parts.join('\n\n');
}

const SYSTEM_PROMPT = `Eres un asistente interno del panel de administración de Mansion Playroom, una productora de fiestas en Valparaíso/Viña del Mar, Chile.
Respondes preguntas simples sobre ventas, movimientos y plata a partir de datos YA CALCULADOS que se te dan en el mensaje del usuario -- nunca inventes ni estimes un número que no esté ahí.
Si la pregunta no se puede responder con los datos entregados (pide un dato que no está, un desglose más fino, una comparación con datos que no se dieron, etc.), dilo explícitamente en vez de adivinar -- ej. "Con los datos que tengo no puedo responder eso, pero sí puedo decirte...".
Responde en español chileno, breve (unas pocas frases, no un informe largo), directo y sin rodeos. Sin JSON, sin markdown pesado: texto plano, como si le contestaras por WhatsApp al dueño.`;

/** Responde una pregunta libre sobre ventas/movimientos con los datos que ya
 * existen en el sistema (getOrderStats, getSalesByUtmOrigin, getEventPnl del
 * evento pedido o, si no se especifica, el destacado). Sin json_schema:
 * devuelve el texto de la IA tal cual, no un objeto para llenar un form. */
export async function answerSalesQuestion(question: string, eventId?: number): Promise<string> {
  const [stats, utmSales] = await Promise.all([
    db.getOrderStats(),
    db.getSalesByUtmOrigin(),
  ]);

  const resolvedEventId = eventId ?? (await db.getFeaturedEvent())?.id;
  const pnl = resolvedEventId ? await db.getEventPnl(resolvedEventId) : null;

  const datos = buildDataBlock(stats, utmSales, pnl);

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${datos}\n\nPregunta: ${question}` },
    ],
  });

  const answer = extractContent(result.choices[0]?.message ?? { content: '' }).trim();
  if (!answer) throw new Error('La IA no devolvió ninguna respuesta. Intenta de nuevo.');
  return answer;
}
