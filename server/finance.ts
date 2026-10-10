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
import { computeBudgetResult, type BudgetSimulationInput, type BudgetResult } from "../shared/eventBudget";
import {
  buildRecommendations, buildScenarios, buildSensitivity, profitCurve, verdictFor,
} from "../shared/budgetInsights";

const DEFAULT_MARGIN_TARGET = 30;

export type RealPnl = NonNullable<Awaited<ReturnType<typeof db.getEventPnl>>>;

export type IncomeLine = { label: string; qty: number; amount: number; group: "entradas" | "consumo" | "extras" | "saldo" | "otros" };

export type EventFinanceData = {
  pnl: RealPnl;
  eventTitle: string;
  ticketsSold: number;
  incomeLines: IncomeLine[];
  byChannel: { web: number; caja: number; import: number; saldoGastado: number };
  byMethod: { method: string; amount: number }[];
  staff: { id: number; shiftId: number; name: string; role: string | null; amountClp: number; paid: boolean }[];
  payables: {
    parkingVenue: number;
    staffUnpaid: number;
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
    marginTargetPercent: DEFAULT_MARGIN_TARGET,
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
    amountClp: staffShifts.amountClp, paid: staffShifts.paid,
  }).from(staffShifts).innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(eq(staffShifts.eventId, eventId));
  const staff = (shifts as any[]).map((s) => ({ ...s, paid: !!s.paid })) as EventFinanceData["staff"];

  const expenseRows = await db.getEventExpenseLines(eventId);
  const expenseLines = [
    ...expenseRows,
    ...(pnl.generalExpensesAssigned > 0 ? [{ category: "otros", label: "Gastos fijos del mes (parte del evento)", amount: pnl.generalExpensesAssigned }] : []),
    ...(pnl.staffCostsTotal > 0 ? [{ category: "staff", label: "Pagos al staff", amount: pnl.staffCostsTotal }] : []),
  ];

  const settings = await db.getSiteSettings();
  const input = realToSimulationInput({
    pnl, cardFeePercent: Number(settings.cardFeePercent ?? 3.5), tiers, extraIncomes, expenseLines,
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
      staffUnpaid: staff.filter((s) => !s.paid).reduce((s, x) => s + x.amountClp, 0),
      ambassadorCommissions: pnl.ambassadorCommissions,
      ivaAPagar: pnl.iva.ivaAPagar,
      playcardSaldoClientes: Number(saldo ?? 0),
    },
    input,
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
    result,
    verdict: verdictFor(result),
    recommendations: buildRecommendations(data.input),
    scenarios: buildScenarios(data.input),
    sensitivity: buildSensitivity(data.input),
    curve: profitCurve(data.input),
    categoryLabels: Object.fromEntries(data.pnl.directByCategory.map((c) => [c.category, categoryLabel(c.category)])),
  };
}
