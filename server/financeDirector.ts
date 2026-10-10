/**
 * "Director financiero": resúmenes automáticos por correo y preguntas libres.
 *
 * Nada acá calcula plata por su cuenta: todo sale de `getEventFinanceReport`,
 * `getCompanyYear` y `getPayables` (las mismas fuentes que la pantalla de
 * Finanzas), y la IA solo redacta respuestas a partir de esos números ya
 * calculados -- nunca inventa uno.
 */
import { and, desc, gte, like } from "drizzle-orm";
import { emailLog, events } from "../drizzle/schema";
import * as db from "./db";
import { sendEmail, buildFinanceDigestEmail } from "./email";
import { invokeLLM, extractContent } from "./_core/llm";
import { getEventFinanceReport } from "./finance";
import { getCompanyYear, getPayables } from "./financeCompany";
import { normalizeAdminAlertsConfig } from "../shared/adminAlertsConfig";
import { ADMIN_NOTIFICATION_EMAIL } from "../shared/const";
import { formatChileDate } from "../shared/chileDate";

const clp = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
const HOUR = 3_600_000;
const SITE = "https://mansionplayroom.cl";
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Día de la semana (0 = domingo) y año/mes en hora de Chile. */
export function chileParts(now: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", year: "numeric", month: "numeric", weekday: "short" }).formatToParts(now);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dow, year: Number(get("year")), month: Number(get("month")) };
}

/** Evita mandar dos veces el mismo correo (el cron puede repetirse). */
async function alreadySent(subject: string): Promise<boolean> {
  const conn = await db.getDb();
  if (!conn) return false;
  const rows = await conn.select({ id: emailLog.id }).from(emailLog)
    .where(and(like(emailLog.subject, subject), gte(emailLog.sentAt, new Date(Date.now() - 4 * 24 * HOUR)))).limit(1);
  return (rows as any[]).length > 0;
}

export async function buildNightSummary(eventId: number) {
  const rep = await getEventFinanceReport(eventId);
  if (!rep) return null;
  const p = rep.pnl;
  const tips = [...rep.recommendations.recommended].slice(0, 3).map((r) => ({ title: r.title, gain: `+${clp(r.gainClp)}` }));
  const alerts = [
    ...(p.netProfit < 0 ? [`La noche cerró en pérdida de ${clp(Math.abs(p.netProfit))}.`] : []),
    ...(p.netProfit >= 0 && p.marginPercent != null && p.marginPercent < rep.input.marginTargetPercent ? [`El margen (${p.marginPercent}%) quedó bajo la meta de ${rep.input.marginTargetPercent}%.`] : []),
    ...(rep.payables.staffUnpaid > 0 ? [`Hay ${clp(rep.payables.staffUnpaid)} de staff sin pagar.`] : []),
    ...(p.warnings ?? []).slice(0, 2),
  ];
  const html = buildFinanceDigestEmail({
    title: `💰 Cierre de la noche — ${rep.eventTitle}`,
    subtitle: `${rep.verdict.label}${p.marginPercent != null ? ` · margen ${p.marginPercent}%` : ""}`,
    rows: [
      { label: "Ingreso real", value: clp(p.grossIncome) },
      { label: "Costos, comisiones e IVA", value: clp(p.grossIncome - p.netProfit) },
      { label: p.netProfit < 0 ? "Pérdida" : "Ganancia", value: clp(p.netProfit), tone: p.netProfit < 0 ? "bad" : "good" },
      { label: "Entradas vendidas", value: String(rep.ticketsSold) },
      { label: "Por pagar: estacionamiento al local", value: clp(rep.payables.parkingVenue) },
      { label: "Por pagar: staff", value: clp(rep.payables.staffUnpaid), tone: rep.payables.staffUnpaid > 0 ? "warn" : undefined },
      { label: "Por pagar: IVA al SII", value: clp(rep.payables.ivaAPagar) },
    ],
    tips, alerts, link: `${SITE}/admin`,
  });
  return { html, subject: `💰 Cierre de la noche — ${rep.eventTitle}` };
}

export async function buildWeeklySummary(now: Date) {
  const { year, month } = chileParts(now);
  const [company, payables] = await Promise.all([getCompanyYear(year), getPayables()]);
  if (!company || !payables) return null;
  const m = company.months[month - 1];
  const totalPay = payables.ambassadorsPending + payables.staffUnpaidTotal + payables.parkingTotal;
  const alerts = [
    ...(m.result < 0 ? [`${MONTH_NAMES[month - 1]} va en ${clp(m.result)}.`] : []),
    ...(payables.ambassadorsPending > 0 ? [`Comisiones de embajadores pendientes: ${clp(payables.ambassadorsPending)}.`] : []),
  ];
  const html = buildFinanceDigestEmail({
    title: "📅 Resumen financiero de la semana",
    subtitle: `Mes de ${MONTH_NAMES[month - 1]} y lo que viene por pagar`,
    rows: [
      { label: `Resultado de ${MONTH_NAMES[month - 1]}`, value: clp(m.result), tone: m.result < 0 ? "bad" : "good" },
      { label: `Ingreso de ${MONTH_NAMES[month - 1]}`, value: clp(m.grossIncome) },
      { label: `Resultado de ${year} hasta ahora`, value: clp(company.totals.result), tone: company.totals.result < 0 ? "bad" : "good" },
      { label: "Total por pagar", value: clp(totalPay), tone: totalPay > 0 ? "warn" : undefined },
      { label: "Saldo PlayCard de clientes", value: clp(payables.playcardSaldoClientes) },
    ],
    alerts, link: `${SITE}/admin`,
  });
  return { html, subject: `📅 Resumen financiero de la semana — ${formatChileDate(now, { withYear: true })}` };
}

/** Cron diario: manda el cierre de la noche (la mañana siguiente) y, los
 * lunes, el resumen semanal. Cada uno tiene su interruptor en Ajustes. */
export async function runFinanceDigest(now: Date = new Date()) {
  const settings = await db.getSiteSettings();
  const config = normalizeAdminAlertsConfig((settings as any).adminAlertsConfig);
  const sent: string[] = [];

  if (config.financeNightlyEmail) {
    // La fiesta que terminó hace entre 8 y 40 horas.
    const conn = await db.getDb();
    const all = conn ? await conn.select().from(events).orderBy(desc(events.eventDate)).limit(5) : [];
    const ev = (all as any[]).find((e) => {
      const age = now.getTime() - new Date(e.eventDate).getTime();
      return age >= 8 * HOUR && age <= 40 * HOUR;
    });
    if (ev) {
      const mail = await buildNightSummary(ev.id);
      if (mail && !(await alreadySent(mail.subject))) {
        const r = await sendEmail({ to: ADMIN_NOTIFICATION_EMAIL, subject: mail.subject, html: mail.html });
        if (r.success) sent.push("noche");
      }
    }
  }

  if (config.financeWeeklyEmail && chileParts(now).dow === 1) {
    const mail = await buildWeeklySummary(now);
    if (mail && !(await alreadySent(mail.subject))) {
      const r = await sendEmail({ to: ADMIN_NOTIFICATION_EMAIL, subject: mail.subject, html: mail.html });
      if (r.success) sent.push("semana");
    }
  }
  return { success: true, sent };
}

/* ─── Preguntas libres ──────────────────────────────────────── */

const SYSTEM_PROMPT = `Eres el director financiero de Mansion Playroom, productora de fiestas en Viña del Mar, Chile. El dueño te pregunta por su plata.
Respondes SOLO con los datos que te entregan en el mensaje; nunca inventes ni estimes un número que no esté ahí. Si la pregunta pide algo que los datos no cubren, dilo y ofrece lo que sí puedes decir.
Español chileno, directo, breve (pocas frases), texto plano sin markdown pesado. Cuando des una recomendación, usa solo las que aparecen en los datos.`;

export async function buildFinanceDataBlock(now: Date = new Date()): Promise<string> {
  const { year } = chileParts(now);
  const [cur, prev, payables] = await Promise.all([getCompanyYear(year), getCompanyYear(year - 1), getPayables()]);
  const parts: string[] = [`Hoy es ${formatChileDate(now, { withYear: true })}.`];
  for (const c of [cur, prev]) {
    if (!c) continue;
    parts.push([
      `Resultado ${c.year} mes a mes (ganancia de eventos menos gastos fijos sin evento):`,
      ...c.months.filter((m) => m.events.length || m.unassignedExpenses).map((m) =>
        `- ${MONTH_NAMES[Number(m.monthKey.slice(5)) - 1]} ${c.year}: eventos ${m.events.map((e) => e.title).join(", ") || "ninguno"}; ingreso ${clp(m.grossIncome)}; ganancia de eventos ${clp(m.eventsProfit)}; gastos sin evento ${clp(m.unassignedExpenses)}; resultado ${clp(m.result)}`),
      `- Total ${c.year}: ingreso ${clp(c.totals.grossIncome)}, resultado ${clp(c.totals.result)}`,
    ].join("\n"));
  }
  const featured = await db.getFeaturedEvent();
  if (featured) {
    const rep = await getEventFinanceReport(featured.id);
    if (rep) {
      const p = rep.pnl;
      parts.push([
        `Evento destacado "${rep.eventTitle}" (en vivo):`,
        `- Ingreso real ${clp(p.grossIncome)}; costos, comisiones e IVA ${clp(p.grossIncome - p.netProfit)}; ${p.netProfit < 0 ? "pérdida" : "ganancia"} ${clp(Math.abs(p.netProfit))}; margen ${p.marginPercent ?? "n/d"}%`,
        `- Entradas vendidas ${rep.ticketsSold}; entradas para no perder ${rep.result.breakevenTickets ?? "n/d"}`,
        `- Cascada: IVA ${clp(p.iva.debitoFiscal)}, productos ${clp(p.cogs)}, gastos ${clp(p.directExpensesTotal)}, gastos fijos del mes ${clp(p.generalExpensesAssigned)}, embajadores ${clp(p.ambassadorCommissions)}, tarjeta ${clp(p.cardFeeAmount)}, local ${clp(p.extraCostsTotal)}, staff ${clp(p.staffCostsTotal)}`,
        ...rep.recommendations.recommended.slice(0, 3).map((r) => `- Consejo: ${r.title} (+${clp(r.gainClp)})`),
      ].join("\n"));
    }
  }
  if (payables) {
    parts.push([
      "Por pagar:",
      `- Comisiones de embajadores por pagar ahora (eventos que ya ocurrieron) ${clp(payables.ambassadorsPending)}`,
      `- Comisiones de embajadores de eventos que aún no ocurren (todavía no se deben) ${clp(payables.ambassadorsPendingFuture)}`,
      `- Staff sin pagar ${clp(payables.staffUnpaidTotal)}`,
      `- Estacionamiento al local ${clp(payables.parkingTotal)}`,
      `- Saldo PlayCard de clientes ${clp(payables.playcardSaldoClientes)}`,
    ].join("\n"));
  }
  return parts.join("\n\n");
}

export async function askFinance(question: string): Promise<string> {
  const datos = await buildFinanceDataBlock();
  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${datos}\n\nPregunta: ${question}` },
    ],
  });
  const answer = extractContent(result.choices[0]?.message ?? { content: "" }).trim();
  if (!answer) throw new Error("La IA no devolvió ninguna respuesta. Intenta de nuevo.");
  return answer;
}
