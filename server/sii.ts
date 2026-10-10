/**
 * Sección SII: arma el F29 sugerido de un mes con datos reales, el libro de
 * honorarios, el calendario y los avisos de vencimiento.
 *
 * Regla clave: el IVA se declara en el mes de la VENTA (fecha de la orden en
 * hora de Chile), no en el mes del evento. Solo cuentan las ventas de eventos
 * que factura Mansion Playroom; lo pagado con saldo PlayCard ya se contó al
 * recargar (`isPrepaidSpend`).
 */
import { and, eq, gte, inArray, like, lte } from "drizzle-orm";
import { accountMovements, emailLog, events, expenses, orderItems, orders, siteSettings, staffMembers, staffShifts, taxPeriods, taxRegularizations, ticketTypes } from "../drizzle/schema";
import * as db from "./db";
import { monthKeyFor } from "../shared/ambassadorProgram";
import { cashCollectedFromOrders, isPrepaidSpend } from "../shared/expenses";
import { honorariosBreakdown } from "../shared/honorarios";
import {
  aggregateMonthSales, compareWithProposal, regularizationBacklog, type RegMonth, type RegStatus, computeF29, learnFromPeriods, f29DueDateFor, monthLabel, normalizeSiiConfig, obligationsForYear, previousMonthKey, reminderFor,
  type Obligation, type PeriodRecord, type SiiConfig,
} from "../shared/sii";
import { sendEmail, buildFinanceDigestEmail } from "./email";
import { sendPushToAdmins } from "./push";
import { ADMIN_NOTIFICATION_EMAIL } from "../shared/const";
import { invokeLLM, extractContent } from "./_core/llm";

const DAY = 86_400_000;
const clp = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;

async function need() {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  return conn;
}

export async function getSiiConfig(): Promise<SiiConfig> {
  const settings = await db.getSiteSettings();
  return normalizeSiiConfig((settings as any).siiConfig);
}

export async function saveSiiConfig(patch: Partial<SiiConfig>) {
  const conn = await need();
  const cfg = normalizeSiiConfig({ ...(await getSiiConfig()), ...patch });
  const [row] = await conn.select({ id: siteSettings.id }).from(siteSettings).limit(1);
  if (row) await conn.update(siteSettings).set({ siiConfig: cfg } as any).where(eq(siteSettings.id, row.id));
  else await conn.insert(siteSettings).values({ siiConfig: cfg } as any);
  return cfg;
}

/** Ventana de búsqueda amplia (±1 día) y luego se filtra por mes de Chile. */
function monthWindow(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - DAY), to: new Date(Date.UTC(y, m, 1) + DAY) };
}

export async function getF29Month(monthKey: string) {
  const conn = await need();
  const cfg = await getSiiConfig();
  const { from, to } = monthWindow(monthKey);

  const allEvents = await conn.select({ id: events.id, title: events.title, eventDate: events.eventDate, taxIssuer: events.taxIssuer, taxNote: events.taxNote }).from(events);

  // ── Ventas del mes (por fecha de la orden) ──
  const orderRows = ((await conn.select({
    id: orders.id, eventId: orders.eventId, total: orders.total, channel: orders.channel, paymentMethod: orders.paymentMethod,
    missionTopupStatus: orders.missionTopupStatus, missionTopupAmount: orders.missionTopupAmount, createdAt: orders.createdAt,
  }).from(orders).where(and(eq(orders.paymentStatus, "approved"), gte(orders.createdAt, from), lte(orders.createdAt, to)))) as any[])
    .filter((o) => monthKeyFor(o.createdAt) === monthKey && !isPrepaidSpend(o));

  // Monto de entradas por orden (solo si las entradas son exentas).
  const accesoByOrder = new Map<number, number>();
  if (cfg.ticketsExempt && orderRows.length) {
    const items = await conn.select({ orderId: orderItems.orderId, total: orderItems.totalPrice, category: ticketTypes.category })
      .from(orderItems).innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
      .where(inArray(orderItems.orderId, orderRows.map((o) => o.id)));
    for (const it of items as any[]) if (it.category === "acceso") accesoByOrder.set(it.orderId, (accesoByOrder.get(it.orderId) ?? 0) + Number(it.total));
  }

  const agg = aggregateMonthSales(
    orderRows.map((o) => ({ orderId: o.id, eventId: o.eventId, amount: cashCollectedFromOrders([o]), accesoAmount: accesoByOrder.get(o.id) ?? 0, channel: o.channel })),
    new Map((allEvents as any[]).map((e) => [e.id, { title: e.title, taxIssuer: e.taxIssuer, taxNote: e.taxNote }])),
    cfg.ticketsExempt,
    cfg.webSalesInF29,
  );
  const salesTaxableGross = agg.taxableGross, salesExempt = agg.exempt;
  const byEventList = agg.byEvent;

  // ── Compras del mes (crédito fiscal: solo facturas no exentas) ──
  const expenseRows = ((await conn.select().from(expenses).where(and(gte(expenses.expenseDate, from), lte(expenses.expenseDate, to), eq(expenses.recurrence, "none")))) as any[])
    .filter((e) => monthKeyFor(e.expenseDate) === monthKey);
  const facturas = expenseRows.filter((e) => e.documentType === "factura" && !e.ivaExempt);
  const creditoFacturas = facturas.reduce((s, e) => s + Number(e.ivaAmount), 0);

  // ── Honorarios: boletas del staff de eventos de este mes ──
  const honorarios = await getHonorariosForMonth(monthKey);
  const retencionHonorarios = honorarios.reduce((s, h) => s + h.retention, 0);

  // ── Remanente del mes anterior ──
  const [prev] = await conn.select().from(taxPeriods).where(eq(taxPeriods.monthKey, previousMonthKey(monthKey))).limit(1);
  const [period] = await conn.select().from(taxPeriods).where(eq(taxPeriods.monthKey, monthKey)).limit(1);

  const f29 = computeF29({
    salesTaxableGross, salesExempt, creditoFacturas,
    remanenteAnterior: prev ? Number((prev as any).remanente) : 0,
    retencionHonorarios, ppmRatePercent: cfg.ppmRatePercent,
  });

  // ── Revisión antes de declarar ──
  const alerts: { level: "danger" | "warning" | "info"; text: string }[] = [];
  const pending = byEventList.filter((e) => e.issuer === "por_revisar");
  if (pending.length) alerts.push({ level: "danger", text: `${pending.length} evento(s) con ventas este mes no tienen definido quién factura: ${pending.map((e) => `«${e.title}» (${clp(e.amount)})`).join(", ")}. Defínelo en Eventos antes de declarar.` });
  const sinFoto = facturas.filter((e) => !e.receiptUrl);
  if (sinFoto.length) alerts.push({ level: "warning", text: `${sinFoto.length} factura(s) sin foto adjunta. Guarda el respaldo: el SII puede pedirlo.` });
  const sinRut = facturas.filter((e) => !e.supplierRut);
  if (sinRut.length) alerts.push({ level: "warning", text: `${sinRut.length} factura(s) sin RUT del proveedor. Sin RUT no puedes cruzarlas con el Registro de Compras del SII.` });
  const sinDoc = expenseRows.filter((e) => e.documentType === "sin_documento");
  if (sinDoc.length) alerts.push({ level: "info", text: `${sinDoc.length} gasto(s) sin documento este mes: no dan crédito fiscal. Pide factura cuando puedas.` });
  const honSinRut = honorarios.filter((h) => !h.rut);
  if (honSinRut.length) alerts.push({ level: "warning", text: `${honSinRut.length} boleta(s) de honorarios de personas sin RUT registrado (${honSinRut.map((h) => h.name).join(", ")}). Lo necesitas para la DJ 1879.` });
  if (!cfg.webSalesInF29 && agg.webExcluded.iva > 0) alerts.push({ level: "danger", text: `Tu modo actual NO incluye las ventas web en el F29: quedan ${clp(agg.webExcluded.iva)} de IVA de este mes sin declarar (${agg.webExcluded.orders} venta(s) web). Es plata que se suma a lo por regularizar. Mira la pestaña Regularizar y habla con tu contador.` });
  if (cfg.ppmRatePercent === null) alerts.push({ level: "warning", text: "La tasa de PPM no está configurada (Ajustes). Confírmala una vez con un contador o en tu F29 anterior." });
  if (!prev && f29.debito > 0) alerts.push({ level: "info", text: `No tienes registrado el F29 de ${monthLabel(previousMonthKey(monthKey))}: si te quedó remanente de crédito, no se está sumando.` });

  const snapshot: any = (period as any)?.snapshot ?? null;
  const siiProposal: number | null = typeof snapshot?.siiProposal === "number" ? snapshot.siiProposal : null;
  const comparison = siiProposal !== null ? compareWithProposal(f29.total, siiProposal) : null;
  if (comparison && comparison.level !== "ok") alerts.push({ level: comparison.level === "distinto" ? "danger" : "info", text: comparison.message });

  return {
    monthKey, label: monthLabel(monthKey), dueDate: f29DueDateFor(monthKey, cfg.f29DueDay), config: cfg,
    siiProposal, comparison,
    salesTaxableGross, salesExempt, creditoFacturas, retencionHonorarios,
    salesByEvent: byEventList,
    channels: agg.channels,
    webExcluded: cfg.webSalesInF29 ? null : agg.webExcluded,
    facturas: facturas.map((e) => ({ id: e.id, date: e.expenseDate, supplier: e.supplier, supplierRut: e.supplierRut, total: Number(e.amountTotal), iva: Number(e.ivaAmount), hasReceipt: !!e.receiptUrl, description: e.description })),
    honorarios,
    f29,
    period: period ? { status: (period as any).status, folio: (period as any).folio, amountPaid: (period as any).amountPaid, declaredAt: (period as any).declaredAt, paidAt: (period as any).paidAt, notes: (period as any).notes } : { status: "pendiente" },
    alerts,
  };
}

/** Boletas de honorarios del staff de los eventos de ese mes. */
export async function getHonorariosForMonth(monthKey: string) {
  const conn = await need();
  const { from, to } = monthWindow(monthKey);
  const rows = ((await conn.select({
    shiftId: staffShifts.id, eventId: staffShifts.eventId, eventTitle: events.title, eventDate: events.eventDate,
    name: staffMembers.name, rut: staffMembers.rut, amountClp: staffShifts.amountClp, paymentType: staffShifts.paymentType, amountMode: staffShifts.amountMode,
  }).from(staffShifts)
    .innerJoin(events, eq(events.id, staffShifts.eventId))
    .innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(and(eq(staffShifts.paymentType, "boleta_honorarios"), gte(events.eventDate, from), lte(events.eventDate, to)))) as any[])
    .filter((r) => monthKeyFor(r.eventDate) === monthKey);
  return rows.map((r) => {
    const pay = honorariosBreakdown({ amount: Number(r.amountClp), paymentType: "boleta_honorarios", amountMode: r.amountMode, year: Number(monthKey.slice(0, 4)) });
    return { shiftId: r.shiftId, eventId: r.eventId, eventTitle: r.eventTitle, name: r.name, rut: r.rut as string | null, gross: pay.gross, retention: pay.retention, net: pay.net, ratePercent: pay.ratePercent };
  });
}

/** Resumen anual por persona (para la DJ 1879). */
export async function getHonorariosYear(year: number) {
  const byPerson = new Map<string, { name: string; rut: string | null; gross: number; retention: number; boletas: number }>();
  for (let m = 1; m <= 12; m++) {
    for (const h of await getHonorariosForMonth(`${year}-${String(m).padStart(2, "0")}`)) {
      const key = h.rut || h.name;
      const cur = byPerson.get(key) ?? { name: h.name, rut: h.rut, gross: 0, retention: 0, boletas: 0 };
      cur.gross += h.gross; cur.retention += h.retention; cur.boletas += 1;
      byPerson.set(key, cur);
    }
  }
  return Array.from(byPerson.values()).sort((a, b) => b.gross - a.gross);
}

/** Marca el mes como declarado o pagado y guarda el remanente para el mes siguiente. */
export async function markF29(monthKey: string, p: { status: "pendiente" | "declarado" | "pagado"; folio?: string | null; amountPaid?: number | null; notes?: string | null }) {
  const conn = await need();
  const data = await getF29Month(monthKey);
  const now = new Date();
  const values: any = {
    status: p.status,
    folio: p.folio ?? null,
    amountPaid: p.amountPaid ?? null,
    notes: p.notes ?? null,
    remanente: data.f29.remanenteSiguiente,
    snapshot: { lines: data.f29.lines, total: data.f29.total, savedAt: now.toISOString(), siiProposal: data.siiProposal },
    declaredAt: p.status === "pendiente" ? null : now,
    paidAt: p.status === "pagado" ? now : null,
  };
  const [existing] = await conn.select({ id: taxPeriods.id, declaredAt: taxPeriods.declaredAt }).from(taxPeriods).where(eq(taxPeriods.monthKey, monthKey)).limit(1);
  if (existing) {
    if ((existing as any).declaredAt && p.status !== "pendiente") values.declaredAt = (existing as any).declaredAt;
    await conn.update(taxPeriods).set(values).where(eq(taxPeriods.id, existing.id));
  } else {
    await conn.insert(taxPeriods).values({ monthKey, ...values });
  }
  return { success: true };
}

/** Guarda (o borra) el monto que muestra la propuesta del SII para el mes. */
export async function saveSiiProposal(monthKey: string, amount: number | null) {
  const conn = await need();
  const [existing] = await conn.select().from(taxPeriods).where(eq(taxPeriods.monthKey, monthKey)).limit(1);
  const prev: any = (existing as any)?.snapshot ?? {};
  const snapshot = { ...prev, siiProposal: amount };
  if (existing) await conn.update(taxPeriods).set({ snapshot }).where(eq(taxPeriods.id, (existing as any).id));
  else await conn.insert(taxPeriods).values({ monthKey, status: "pendiente", remanente: 0, snapshot } as any);
  return { success: true };
}

/** Precisión de nuestro cálculo frente a lo realmente pagado, y PPM implícito. */
export async function getSiiLearning() {
  const conn = await need();
  const cfg = await getSiiConfig();
  const rows = (await conn.select().from(taxPeriods)) as any[];
  const records: PeriodRecord[] = rows.filter((r) => r.status === "pagado").map((r) => ({
    monthKey: r.monthKey,
    estimate: typeof r.snapshot?.total === "number" ? r.snapshot.total : null,
    paid: r.amountPaid ?? null,
    lines: Array.isArray(r.snapshot?.lines) ? r.snapshot.lines.map((l: any) => ({ code: l.code, value: l.value })) : null,
  }));
  return learnFromPeriods(records, cfg.ppmRatePercent);
}

/** Calendario del año con el estado de cada obligación. */
export async function getTaxCalendar(year: number) {
  const conn = await need();
  const cfg = await getSiiConfig();
  const periods = (await conn.select({ monthKey: taxPeriods.monthKey, status: taxPeriods.status }).from(taxPeriods)) as any[];
  const statusByMonth = new Map(periods.map((p) => [p.monthKey, p.status]));
  const today = chileToday();
  return obligationsForYear(year, cfg).map((o) => ({
    ...o,
    status: o.kind === "f29" ? (statusByMonth.get(o.period!) ?? "pendiente") : null,
    daysLeft: Math.round((Date.parse(`${o.dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY),
  }));
}

export function chileToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/* ─── Avisos ──────────────────────────────────────────────── */

const REMINDER_TEXT: Record<string, (o: Obligation) => string> = {
  inicio: (o) => `Ya puedes preparar el ${o.title}. Vence el ${o.dueDate.split("-").reverse().join("-")}.`,
  "5dias": (o) => `Faltan 5 días: ${o.title} vence el ${o.dueDate.split("-").reverse().join("-")}.`,
  "1dia": (o) => `Mañana vence el ${o.title}. Declara y paga hoy para evitar multas.`,
  hoy: (o) => `HOY vence el ${o.title}. Si no lo has hecho, entra a sii.cl ahora.`,
  vencido: (o) => `El ${o.title} venció el ${o.dueDate.split("-").reverse().join("-")} y no está marcado como pagado. Mientras antes lo regularices, menor es la multa.`,
};

async function alreadySent(subject: string): Promise<boolean> {
  const conn = await db.getDb();
  if (!conn) return false;
  const rows = await conn.select({ id: emailLog.id }).from(emailLog)
    .where(and(like(emailLog.subject, subject), gte(emailLog.sentAt, new Date(Date.now() - 20 * 3_600_000)))).limit(1);
  return (rows as any[]).length > 0;
}

/** Cron diario: revisa el calendario y avisa (push + correo) lo que toca hoy. */
export async function runSiiReminders(now: Date = new Date()) {
  const cfg = await getSiiConfig();
  if (!cfg.remindersEnabled) return { success: true, sent: [], reason: "apagado en Ajustes SII" };
  const conn = await need();
  const today = chileToday(now);
  const year = Number(today.slice(0, 4));
  const periods = (await conn.select({ monthKey: taxPeriods.monthKey, status: taxPeriods.status }).from(taxPeriods)) as any[];
  const paid = new Set(periods.filter((p) => p.status === "pagado").map((p) => p.monthKey));
  // Las anuales no tienen registro de cumplimiento: se avisa solo antes de la fecha.
  const obligations = [...obligationsForYear(year, cfg), ...obligationsForYear(year + 1, cfg).filter((o) => o.dueDate.slice(5) <= "01-31")];
  const sent: string[] = [];
  for (const o of obligations) {
    const done = o.kind === "f29" ? paid.has(o.period!) : false;
    let kind = reminderFor(today, o, done);
    if (o.kind !== "f29" && kind === "vencido") kind = null;
    if (!kind) continue;
    let body = REMINDER_TEXT[kind](o);
    const rows: { label: string; value: string; tone?: "good" | "bad" | "warn" }[] = [
      { label: "Vence", value: o.dueDate.split("-").reverse().join("-"), tone: kind === "vencido" || kind === "hoy" ? "bad" : "warn" },
    ];
    let alerts: string[] = [];
    if (o.kind === "f29" && o.period) {
      try {
        const m = await getF29Month(o.period);
        rows.push({ label: "Total sugerido a pagar", value: m.f29.sinMovimiento ? "$0 (sin movimiento)" : clp(m.f29.total) });
        if (!m.f29.sinMovimiento) {
          rows.push({ label: "IVA", value: clp(m.f29.ivaDeterminado) }, { label: "Retención de honorarios", value: clp(m.f29.retencion) });
          if (m.f29.ppm !== null) rows.push({ label: "PPM", value: clp(m.f29.ppm) });
        }
        if (m.webExcluded && m.webExcluded.iva > 0) rows.push({ label: "IVA web NO incluido en este F29", value: clp(m.webExcluded.iva), tone: "bad" });
        if (m.comparison) rows.push({ label: "Propuesta del SII", value: clp(m.comparison.proposal), tone: m.comparison.level === "distinto" ? "bad" : "good" });
        alerts = m.alerts.filter((a) => a.level !== "info").map((a) => a.text);
        body += m.f29.sinMovimiento ? " Este mes no tiene movimiento: igual hay que declararlo (sin movimiento)." : ` Total sugerido: ${clp(m.f29.total)}.`;
        if (alerts.length) body += ` ${alerts.length} cosa(s) por revisar.`;
      } catch { /* el aviso sale igual */ }
    }
    const subject = `🧾 SII: ${o.title} (${kind})`;
    if (await alreadySent(subject)) continue;
    await sendPushToAdmins("siiReminders", { title: "🧾 SII", body, url: "/admin" } as any);
    await sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL, subject,
      html: buildFinanceDigestEmail({ title: `🧾 ${o.title}`, subtitle: REMINDER_TEXT[kind](o), rows, alerts, link: "https://mansionplayroom.cl/admin" }),
    });
    sent.push(o.key + ":" + kind);
  }
  return { success: true, sent };
}

/* ─── Asistente SII ───────────────────────────────────────── */

const SII_PROMPT = `Eres el asistente tributario de Mansion Playroom (productora de fiestas en Chile). El dueño hace él mismo su F29 en sii.cl.
Respondes SOLO con los datos que se entregan (ya calculados por el sistema); nunca inventes números. Explica en español chileno, simple y breve, paso a paso cuando te pidan cómo hacer algo en sii.cl.
Si la pregunta depende de su régimen tributario, de una exención o de algo legal que no está en los datos, dilo y recomienda confirmarlo con un contador o en el SII. Nunca sugieras ocultar ventas ni evitar declarar: si algo no va en su F29, debe ser porque otro lo factura o está exento.
Texto plano, sin markdown pesado.`;

export async function askSii(question: string, monthKey: string): Promise<string> {
  const m = await getF29Month(monthKey);
  const datos = [
    `Mes: ${m.label}. Vence el ${m.dueDate}. Estado: ${m.period.status}.`,
    `Configuración: plazo día ${m.config.f29DueDay}; PPM ${m.config.ppmRatePercent ?? "no configurado"}%; régimen ${m.config.regime ?? "no indicado"}; entradas ${m.config.ticketsExempt ? "exentas" : "afectas"}.`,
    `Ventas afectas (IVA incluido): ${clp(m.salesTaxableGross)}. Ventas exentas: ${clp(m.salesExempt)}. Crédito de facturas: ${clp(m.creditoFacturas)} (${m.facturas.length} facturas). Retención honorarios: ${clp(m.retencionHonorarios)} (${m.honorarios.length} boletas).`,
    "Ventas por evento: " + (m.salesByEvent.map((e) => `«${e.title}» ${clp(e.amount)} (quién factura: ${e.issuer})`).join("; ") || "ninguna"),
    "Casillas sugeridas del F29: " + m.f29.lines.map((l) => `${l.code} ${l.label}: ${clp(l.value)}`).join("; "),
    m.f29.sinMovimiento ? "El mes no tiene movimiento: igual se declara (sin movimiento)." : "",
    "Alertas: " + (m.alerts.map((a) => a.text).join(" | ") || "ninguna"),
    "Ruta en sii.cl: Servicios online → Impuestos mensuales → Declaración mensual (F29) → Declarar IVA → elegir período → revisar la propuesta del SII → completar/corregir casillas → enviar → pagar (PEC, tarjeta o transferencia) → guardar el folio.",
  ].filter(Boolean).join("\n");
  const result = await invokeLLM({ messages: [{ role: "system", content: SII_PROMPT }, { role: "user", content: `${datos}\n\nPregunta: ${question}` }] });
  const answer = extractContent(result.choices[0]?.message ?? { content: "" }).trim();
  if (!answer) throw new Error("La IA no devolvió ninguna respuesta. Intenta de nuevo.");
  return answer;
}


/* ─── Regularización de ventas web de meses anteriores ───────────── */

/** IVA de las ventas web (de eventos que factura Mansion) por mes, con su estado. */
export async function getWebRegularization() {
  const conn = await need();
  const cfg = await getSiiConfig();
  const evs = (await conn.select({ id: events.id, taxIssuer: events.taxIssuer }).from(events)) as any[];
  const mansion = new Set(evs.filter((e) => e.taxIssuer === "mansion").map((e) => e.id));
  const rows = ((await conn.select({
    eventId: orders.eventId, total: orders.total, channel: orders.channel, paymentMethod: orders.paymentMethod,
    missionTopupStatus: orders.missionTopupStatus, missionTopupAmount: orders.missionTopupAmount, createdAt: orders.createdAt,
  }).from(orders).where(and(eq(orders.paymentStatus, "approved"), eq(orders.channel, "web")))) as any[]).filter((o) => mansion.has(o.eventId));
  const byMonth = new Map<string, number>();
  for (const o of rows) {
    const m = monthKeyFor(o.createdAt);
    byMonth.set(m, (byMonth.get(m) ?? 0) + cashCollectedFromOrders([o]));
  }
  const regs = (await conn.select().from(taxRegularizations)) as any[];
  const regByMonth = new Map(regs.map((r) => [r.monthKey, r]));
  const months: (RegMonth & { folio: string | null; installments: number | null; note: string | null; dueDate: string })[] = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([monthKey, gross]) => {
    const r = regByMonth.get(monthKey);
    return {
      monthKey, webGross: gross, webIva: Math.round((gross * 19) / 119), status: (r?.status ?? "pendiente") as RegStatus,
      folio: r?.folio ?? null, installments: r?.installments ?? null, note: r?.note ?? null, dueDate: f29DueDateFor(monthKey, cfg.f29DueDay),
    };
  });
  const today = chileToday();
  const backlog = regularizationBacklog(months, today, cfg.f29DueDay);
  return { months, backlog, today };
}

export async function saveRegularization(monthKey: string, p: { status: RegStatus; folio?: string | null; installments?: number | null; note?: string | null }) {
  const conn = await need();
  const values = { status: p.status, folio: p.folio ?? null, installments: p.installments ?? null, note: p.note ?? null };
  const [existing] = await conn.select({ id: taxRegularizations.id }).from(taxRegularizations).where(eq(taxRegularizations.monthKey, monthKey)).limit(1);
  if (existing) await conn.update(taxRegularizations).set(values).where(eq(taxRegularizations.id, (existing as any).id));
  else await conn.insert(taxRegularizations).values({ monthKey, ...values });
  return { success: true };
}

/** CSV para el contador: por mes y canal, ventas, IVA, comisiones de Mercado Pago y facturas de compra. */
export async function buildAccountantCsv(): Promise<string> {
  const conn = await need();
  const evs = (await conn.select({ id: events.id, title: events.title, taxIssuer: events.taxIssuer }).from(events)) as any[];
  const evById = new Map(evs.map((e) => [e.id, e]));
  const orderRows = (await conn.select({
    id: orders.id, eventId: orders.eventId, total: orders.total, channel: orders.channel, paymentMethod: orders.paymentMethod,
    missionTopupStatus: orders.missionTopupStatus, missionTopupAmount: orders.missionTopupAmount, createdAt: orders.createdAt,
  }).from(orders).where(eq(orders.paymentStatus, "approved"))) as any[];
  type Acc = { gross: number; orders: number };
  const sales = new Map<string, Acc>();
  for (const o of orderRows) {
    if (isPrepaidSpend(o)) continue;
    const ev = evById.get(o.eventId);
    const key = `${monthKeyFor(o.createdAt)}|${o.channel}|${ev?.title ?? o.eventId}|${ev?.taxIssuer ?? "por_revisar"}`;
    const cur = sales.get(key) ?? { gross: 0, orders: 0 };
    cur.gross += cashCollectedFromOrders([o]); cur.orders += 1; sales.set(key, cur);
  }
  const mpFees = new Map<string, number>();
  for (const m of (await conn.select().from(accountMovements).where(eq(accountMovements.kind, "venta"))) as any[]) {
    const k = monthKeyFor(m.occurredAt);
    mpFees.set(k, (mpFees.get(k) ?? 0) + Number(m.raw?.fee ?? 0));
  }
  const facturas = new Map<string, { total: number; iva: number; n: number }>();
  for (const e of (await conn.select().from(expenses).where(eq(expenses.documentType, "factura"))) as any[]) {
    if (e.ivaExempt) continue;
    const k = monthKeyFor(e.expenseDate);
    const cur = facturas.get(k) ?? { total: 0, iva: 0, n: 0 };
    cur.total += Number(e.amountTotal); cur.iva += Number(e.ivaAmount); cur.n += 1; facturas.set(k, cur);
  }
  const lines: string[][] = [["Mes", "Canal", "Evento", "Quién factura", "N° ventas", "Ventas brutas (IVA incluido)", "IVA de la venta (19/119)"]];
  for (const [key, v] of Array.from(sales.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const [m, ch, title, issuer] = key.split("|");
    lines.push([m, ch === "web" ? "Web" : ch === "caja" ? "Barra / caja" : ch, title, issuer, String(v.orders), String(Math.round(v.gross)), String(Math.round((v.gross * 19) / 119))]);
  }
  lines.push([], ["Mes", "Comisión Mercado Pago (cobros sincronizados)", "IVA recuperable estimado (solo si te emite factura)", "Facturas de compra (N°)", "Compras con factura (IVA incl.)", "IVA crédito de facturas"]);
  const months = Array.from(new Set([...Array.from(mpFees.keys()), ...Array.from(facturas.keys())])).sort();
  for (const m of months) {
    const fee = mpFees.get(m) ?? 0, f = facturas.get(m);
    lines.push([m, String(Math.round(fee)), String(Math.round((fee * 19) / 119)), String(f?.n ?? 0), String(f?.total ?? 0), String(f?.iva ?? 0)]);
  }
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "\uFEFF" + lines.map((r) => r.map(esc).join(";")).join("\r\n");
}
