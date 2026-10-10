/**
 * Informe financiero REAL de un evento: los mismos gráficos y consejos del
 * Simulador, pero con la plata que de verdad entró y salió.
 *
 * Las cifras grandes (ingreso, costos, ganancia) salen tal cual de
 * `getEventPnl`, la misma fuente que usan Gastos y P&L y el Resumen de la
 * noche, así que nunca se contradicen. Para reusar el motor de consejos y
 * escenarios del simulador, el evento real se traduce a un
 * `BudgetSimulationInput` (adaptador `realToSimulationInput`); esa traducción
 * solo alimenta los consejos, escenarios y sensibilidad -- nunca pisa los
 * números reales.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { customers, orderItems, orders, ticketTypes, staffMembers, staffShifts } from "../drizzle/schema";
import * as db from "./db";
import { isTopupProduct } from "../shared/prepaid";
import { isPrepaidSpend, categoryLabel } from "../shared/expenses";
import { honorariosBreakdown } from "../shared/honorarios";
import { taxReserve } from "../shared/sii";
import { getSiiConfig } from "./sii";
import { computeBudgetResult, type BudgetSimulationInput, type BudgetResult } from "../shared/eventBudget";
import {
  buildRecommendations, buildScenarios, buildSensitivity, profitCurve, verdictFor,
} from "../shared/budgetInsights";

import { normalizeAdminAlertsConfig } from "../shared/adminAlertsConfig";

/** Meta de margen que eligió el dueño en Finanzas (30 % por defecto). */
export async function getMarginTarget(): Promise<number> {
  const settings = await db.getSiteSettings();
  return normalizeAdminAlertsConfig((settings as any).adminAlertsConfig).financeMarginTargetPercent;
}

export type RealPnl = NonNullable<Awaited<ReturnType<typeof db.getEventPnl>>>;

export type IncomeLine = { label: string; qty: number; amount: number; group: "entradas" | "consumo" | "extras" | "saldo" | "otros" };

export type EventFinanceData = {
  pnl: RealPnl;
  eventTitle: string;
  ticketsSold: number;
  incomeLines: IncomeLine[];
  byChannel: { web: number; caja: number; import: number; saldoGastado: number };
  byMethod: { method: string; amount: number }[];
  staff: { id: number; shiftId: number; name: string; role: string | null; amountClp: number; netClp: number; retentionClp: number; paid: boolean }[];
  payables: {
    parkingVenue: number;
    staffUnpaid: number;
    staffRetention: number;
    ambassadorCommissions: number;
    ivaAPagar: number;
    playcardSaldoClientes: number;
  };
  input: BudgetSimulationInput;
};

const PERSONAS_RE = /d[uú]o|pareja/i;

/** Traduce el evento real a las entradas del simulador (solo para consejos). */
export function realToSimulationInput(p: {
  pnl: RealPnl;
  marginTargetPercent?: number;
  cardFeePercent: number;
  tiers: { label: string; price: number; qty: number; personas: number }[];
  extraIncomes: { label: string; unitPrice: number; quantity: number; venueCostPerUnit?: number }[];
  expenseLines: { category: string; label: string; amount: number }[];
}): BudgetSimulationInput {
  const { pnl } = p;
  const attendance = p.tiers.reduce((s, t) => s + t.qty * t.personas, 0);
  const ticketRevenue = p.tiers.reduce((s, t) => s + t.price * t.qty, 0);
  const extraTotal = p.extraIncomes.reduce((s, e) => s + e.unitPrice * e.quantity, 0);
  const otherRevenue = Math.max(0, pnl.grossIncome - ticketRevenue - extraTotal);
  const entriesAndBar = ticketRevenue + otherRevenue;
  return {
    ivaApplies: pnl.ivaApplies,
    marginTargetPercent: p.marginTargetPercent ?? 30,
    cardFeePercent: p.cardFeePercent,
    commissionPercent: entriesAndBar > 0 ? (pnl.ambassadorCommissions / entriesAndBar) * 100 : 0,
    variableCostPerPerson: attendance > 0 ? pnl.cogs / attendance : 0,
    otherRevenuePerPerson: attendance > 0 ? otherRevenue / attendance : 0,
    venueBarSharePercent: 0,
    extraIncomes: p.extraIncomes,
    revenueTiers: p.tiers.map((t) => ({ label: t.label, price: t.price, expectedQty: t.qty, personasPorEntrada: t.personas })),
    expenseLines: p.expenseLines.map((l) => ({ ...l, ivaMode: "incluido" as const })),
  };
}

export async function getEventFinanceData(eventId: number): Promise<EventFinanceData | null> {
  const pnl = await db.getEventPnl(eventId);
  const conn = await db.getDb();
  if (!pnl || !conn) return null;

  const orderRows = await conn.select({
    id: orders.id, total: orders.total, channel: orders.channel, paymentMethod: orders.paymentMethod,
    missionTopupStatus: orders.missionTopupStatus, missionTopupAmount: orders.missionTopupAmount,
  }).from(orders).where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, "approved")));

  const byChannel = { web: 0, caja: 0, import: 0, saldoGastado: 0 };
  const methodMap = new Map<string, number>();
  const spendIds = new Set<number>();
  for (const o of orderRows as any[]) {
    const total = Number(o.total) + (o.missionTopupStatus === "paid" ? Number(o.missionTopupAmount ?? 0) : 0);
    if (isPrepaidSpend(o)) { byChannel.saldoGastado += total; spendIds.add(o.id); continue; }
    byChannel[o.channel as "web" | "caja" | "import"] += total;
    const m = o.channel === "web" ? "Web (tarjeta)" : (o.paymentMethod ?? "otro");
    methodMap.set(m, (methodMap.get(m) ?? 0) + total);
  }

  const itemRows = (orderRows as any[]).length
    ? await conn.select({
      orderId: orderItems.orderId, qty: orderItems.quantity, total: orderItems.totalPrice,
      name: ticketTypes.name, category: ticketTypes.category, topupAmount: ticketTypes.topupAmount,
    }).from(orderItems)
      .innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
      .where(inArray(orderItems.orderId, (orderRows as any[]).map((o) => o.id)))
    : [];

  const lineMap = new Map<string, IncomeLine>();
  for (const r of itemRows as any[]) {
    // Lo gastado con saldo ya se contó al recargar.
    if (spendIds.has(r.orderId)) continue;
    const group: IncomeLine["group"] = isTopupProduct({ topupAmount: r.topupAmount }) ? "saldo"
      : r.category === "acceso" ? "entradas" : r.category === "consumo" ? "consumo" : r.category === "extra" ? "extras" : "otros";
    const key = `${group}|${r.name}`;
    const cur = lineMap.get(key) ?? { label: r.name, qty: 0, amount: 0, group };
    cur.qty += Number(r.qty); cur.amount += Number(r.total);
    lineMap.set(key, cur);
  }
  const incomeLines = Array.from(lineMap.values()).sort((a, b) => b.amount - a.amount);

  const tiers = incomeLines.filter((l) => l.group === "entradas" && l.qty > 0)
    .map((l) => ({ label: l.label, price: l.amount / l.qty, qty: l.qty, personas: PERSONAS_RE.test(l.label) ? 2 : 1 }));
  const parking = await db.getParkingReport(eventId);
  const extraIncomes = incomeLines.filter((l) => l.group === "extras" && l.qty > 0).map((l) => ({
    label: l.label, unitPrice: l.amount / l.qty, quantity: l.qty,
    venueCostPerUnit: /estacionamiento|parking/i.test(l.label) ? (parking?.venueFeePerCarClp ?? 0) : 0,
  }));

  const shifts = await conn.select({
    shiftId: staffShifts.id, id: staffMembers.id, name: staffMembers.name, role: staffMembers.role,
    amountClp: staffShifts.amountClp, paymentType: staffShifts.paymentType, amountMode: staffShifts.amountMode, paid: staffShifts.paid,
  }).from(staffShifts).innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(eq(staffShifts.eventId, eventId));
  const staffYear = Number(pnl.monthKey.slice(0, 4));
  // `amountClp` = lo que cuesta (bruto), para que los números del informe cuadren con el P&L.
  const staff = (shifts as any[]).map((s) => {
    const pay = honorariosBreakdown({ amount: Number(s.amountClp), paymentType: s.paymentType, amountMode: s.amountMode, year: staffYear });
    return { ...s, amountClp: pay.cost, netClp: pay.net, retentionClp: pay.retention, paid: !!s.paid };
  }) as EventFinanceData["staff"];

  const expenseRows = await db.getEventExpenseLines(eventId);
  const expenseLines = [
    ...expenseRows,
    ...(pnl.generalExpensesAssigned > 0 ? [{ category: "otros", label: "Gastos fijos del mes (parte del evento)", amount: pnl.generalExpensesAssigned }] : []),
    ...(pnl.staffCostsTotal > 0 ? [{ category: "staff", label: "Pagos al staff", amount: pnl.staffCostsTotal }] : []),
  ];

  const settings = await db.getSiteSettings();
  const input = realToSimulationInput({
    pnl, marginTargetPercent: normalizeAdminAlertsConfig((settings as any).adminAlertsConfig).financeMarginTargetPercent,
    cardFeePercent: Number(settings.cardFeePercent ?? 3.5), tiers, extraIncomes, expenseLines,
  });

  const [{ saldo }] = await conn.select({ saldo: sql<number>`COALESCE(SUM(${customers.prepaidBalance}), 0)` }).from(customers) as any[];

  return {
    pnl,
    eventTitle: pnl.title,
    ticketsSold: tiers.reduce((s, t) => s + t.qty, 0),
    incomeLines,
    byChannel,
    byMethod: Array.from(methodMap.entries()).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    staff,
    payables: {
      parkingVenue: parking?.amountOwedToVenueClp ?? 0,
      // A la persona se le transfiere el líquido; la retención va aparte, al SII.
      staffUnpaid: staff.filter((s) => !s.paid).reduce((s, x) => s + x.netClp, 0),
      staffRetention: staff.reduce((s, x) => s + x.retentionClp, 0),
      ambassadorCommissions: pnl.ambassadorCommissions,
      ivaAPagar: pnl.iva.ivaAPagar,
      playcardSaldoClientes: Number(saldo ?? 0),
    },
    input,
  };
}

/** IVA a apartar y plata libre del evento. null si el evento no va en tu F29. */
export async function getEventTaxReserve(eventId: number, pnl: RealPnl) {
  const event = await db.getEventById(eventId);
  const issuer = ((event as any)?.taxIssuer as string | undefined) ?? (pnl.ivaApplies ? "mansion" : "por_revisar");
  if (issuer !== "mansion") return { applies: false as const, issuer, note: ((event as any)?.taxNote as string | null) ?? null };
  const cfg = await getSiiConfig();
  return {
    applies: true as const, issuer, ppmConfigured: cfg.ppmRatePercent !== null,
    ...taxReserve({
      grossIncome: pnl.grossIncome, debito: pnl.iva.debitoFiscal, credito: pnl.iva.creditoFiscal,
      ppmRatePercent: cfg.ppmRatePercent, retencion: (pnl as any).staffRetentionTotal ?? 0,
    }),
  };
}

/** Informe completo para la pantalla: cifras reales + consejos del motor. */
export async function getEventFinanceReport(eventId: number) {
  const data = await getEventFinanceData(eventId);
  if (!data) return null;
  const model: BudgetResult = computeBudgetResult(data.input);
  // Lo REAL manda: el modelo solo aporta techo de gasto y punto de equilibrio.
  const result: BudgetResult = {
    ...model,
    grossIncome: data.pnl.grossIncome,
    ticketsSold: data.ticketsSold || model.ticketsSold,
    pnl: data.pnl as any,
    status: data.pnl.netProfit < 0 ? "danger" : model.status,
  };
  return {
    ...data,
    tax: await getEventTaxReserve(eventId, data.pnl),
    result,
    verdict: verdictFor(result),
    recommendations: buildRecommendations(data.input),
    scenarios: buildScenarios(data.input),
    sensitivity: buildSensitivity(data.input),
    curve: profitCurve(data.input),
    categoryLabels: Object.fromEntries(data.pnl.directByCategory.map((c) => [c.category, categoryLabel(c.category)])),
  };
}


/* ─── En vivo: minuto a minuto ──────────────────────────────── */

export type LiveAlert = { level: "danger" | "warning" | "info"; text: string };

const MIN = 60_000;

/** Movimiento de plata del evento, por minuto y por hora, más las alertas.
 * No incluye lo pagado con saldo PlayCard (ya se contó al recargar). */
export async function getEventLive(eventId: number, windowMinutes = 60, now: Date = new Date()) {
  const pnl = await db.getEventPnl(eventId);
  const conn = await db.getDb();
  if (!pnl || !conn) return null;
  const win = Math.min(240, Math.max(10, Math.round(windowMinutes)));

  const rows = (await conn.select({
    id: orders.id, total: orders.total, channel: orders.channel, paymentMethod: orders.paymentMethod, createdAt: orders.createdAt,
    buyerName: orders.buyerName,
  }).from(orders).where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, "approved")))) as any[];
  const sales = rows.filter((o) => !isPrepaidSpend(o) && Number(o.total) > 0)
    .map((o) => ({ ...o, amount: Number(o.total), at: new Date(o.createdAt).getTime() }))
    .sort((a, b) => a.at - b.at);

  const nowMs = now.getTime();
  const startMin = Math.floor((nowMs - (win - 1) * MIN) / MIN) * MIN;
  const perMinute = Array.from({ length: win }, (_, i) => ({ at: new Date(startMin + i * MIN).toISOString(), amount: 0, count: 0 }));
  for (const s of sales) {
    const idx = Math.floor((s.at - startMin) / MIN);
    if (idx >= 0 && idx < win) { perMinute[idx].amount += s.amount; perMinute[idx].count += 1; }
  }

  // Por hora, de la primera venta a la última (la noche completa).
  const hourMap = new Map<number, { amount: number; count: number }>();
  for (const s of sales) {
    const h = Math.floor(s.at / (60 * MIN)) * 60 * MIN;
    const cur = hourMap.get(h) ?? { amount: 0, count: 0 };
    cur.amount += s.amount; cur.count += 1; hourMap.set(h, cur);
  }
  const perHour = Array.from(hourMap.entries()).sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ at: new Date(t).toISOString(), ...v }));

  const since = (mins: number) => sales.filter((s) => s.at > nowMs - mins * MIN).reduce((sum, s) => sum + s.amount, 0);
  const last = sales[sales.length - 1];

  const recent = sales.slice(-25).reverse();
  const items = recent.length
    ? await conn.select({ orderId: orderItems.orderId, qty: orderItems.quantity, name: ticketTypes.name })
      .from(orderItems).innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
      .where(inArray(orderItems.orderId, recent.map((r) => r.id)))
    : [];
  const itemsByOrder = new Map<number, string[]>();
  for (const it of items as any[]) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push(`${it.qty}× ${it.name}`);
    itemsByOrder.set(it.orderId, list);
  }
  const feed = recent.map((r) => ({
    id: r.id, at: new Date(r.at).toISOString(), amount: r.amount, channel: r.channel as string,
    method: r.channel === "web" ? "Web" : (r.paymentMethod ?? "caja"),
    summary: (itemsByOrder.get(r.id) ?? []).slice(0, 3).join(", "),
  }));

  const closings = (await db.listShiftClosings(eventId)) as any[];
  const diffs = closings.map((c) => ({
    name: `${c.registerName} · ${c.operatorName}`,
    diff: (c.countedCash + c.countedDebit + c.countedCredit + c.countedQr) - (c.expectedCash + (c.openingCash ?? 0) + c.expectedDebit + c.expectedCredit + c.expectedQr),
  })).filter((d) => Math.abs(d.diff) >= 1);

  const marginGoal = await getMarginTarget();
  const alerts: LiveAlert[] = [];
  const gross = pnl.grossIncome;
  if (gross > 0 && pnl.netProfit < 0) alerts.push({ level: "danger", text: `Hoy va en pérdida de $${Math.abs(pnl.netProfit).toLocaleString("es-CL")}: los costos superan lo que ha entrado.` });
  else if (gross > 0 && pnl.marginPercent != null && pnl.marginPercent < marginGoal) alerts.push({ level: "warning", text: `El margen va en ${pnl.marginPercent}%, bajo la meta de ${marginGoal}%.` });
  for (const d of diffs) alerts.push({ level: "warning", text: `Caja descuadrada (${d.name}): ${d.diff > 0 ? "sobran" : "faltan"} $${Math.abs(d.diff).toLocaleString("es-CL")}.` });
  const event = await db.getEventById(eventId);
  // "En vivo" = desde 6 h antes de la hora del evento hasta 14 h después (la
  // fiesta cruza la medianoche, así que no basta con comparar el día).
  const startMs = event ? new Date((event as any).eventDate).getTime() : NaN;
  const live = Number.isFinite(startMs) && nowMs >= startMs - 6 * 60 * MIN && nowMs <= startMs + 14 * 60 * MIN;
  if (live && last && nowMs - last.at > 20 * MIN) alerts.push({ level: "info", text: `Sin ventas hace ${Math.round((nowMs - last.at) / MIN)} minutos.` });
  if (live && !last) alerts.push({ level: "info", text: "Todavía no hay ventas registradas hoy." });
  if (pnl.warnings?.length) alerts.push({ level: "info", text: `${pnl.warnings.length} aviso(s) sobre los números: revisa la pestaña Evento.` });

  return {
    asOf: now.toISOString(), windowMinutes: win, isLive: live,
    tax: await getEventTaxReserve(eventId, pnl),
    totals: { gross, netProfit: pnl.netProfit, marginPercent: pnl.marginPercent, sales: sales.length },
    pace: { last5: since(5), last15: since(15), last60: since(60), perHourNow: since(60) },
    lastSaleAt: last ? new Date(last.at).toISOString() : null,
    perMinute, perHour, feed, alerts,
  };
}
