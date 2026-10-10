/**
 * Finanzas de la empresa: resultado mes a mes y lo que hay que pagar.
 *
 * El resultado de un mes = la ganancia de sus eventos (que ya incluye la parte
 * que les toca de los gastos fijos prorrateados) MENOS los gastos generales que
 * ningún evento absorbió: los marcados "no prorratear" y los de meses sin
 * eventos. Sin esa resta, esa plata no aparecía en ningún resultado.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ambassadorCommissions, events, exclusiveAmbassadors, expenses, staffMembers, staffShifts, customers } from "../drizzle/schema";
import { sql } from "drizzle-orm";
import * as db from "./db";
import { expenseCostForPnl } from "../shared/expenses";
import { monthKeyFor } from "../shared/ambassadorProgram";

export type MonthRow = {
  monthKey: string;
  events: { id: number; title: string; netProfit: number; grossIncome: number }[];
  grossIncome: number;
  eventsProfit: number;
  unassignedExpenses: number;
  result: number;
};

export function buildMonthRows(p: {
  year: number;
  events: { id: number; title: string; monthKey: string; grossIncome: number; netProfit: number }[];
  /** Gastos generales con su costo ya calculado y si algún evento los absorbe. */
  generalExpenses: { monthKey: string; cost: number; prorate: boolean }[];
}): MonthRow[] {
  const rows: MonthRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthKey = `${p.year}-${String(m).padStart(2, "0")}`;
    const evs = p.events.filter((e) => e.monthKey === monthKey);
    const hasEvents = evs.length > 0;
    // Con eventos, solo lo "no prorratear" queda afuera; sin eventos, todo.
    const unassigned = p.generalExpenses
      .filter((g) => g.monthKey === monthKey && (!hasEvents || !g.prorate))
      .reduce((s, g) => s + g.cost, 0);
    const eventsProfit = evs.reduce((s, e) => s + e.netProfit, 0);
    rows.push({
      monthKey,
      events: evs.map(({ id, title, netProfit, grossIncome }) => ({ id, title, netProfit, grossIncome })),
      grossIncome: evs.reduce((s, e) => s + e.grossIncome, 0),
      eventsProfit,
      unassignedExpenses: unassigned,
      result: eventsProfit - unassigned,
    });
  }
  return rows;
}

export async function getCompanyYear(year: number) {
  const conn = await db.getDb();
  if (!conn) return null;
  const comparison = await db.getPnlComparison();
  const evs = (comparison as any[]).map((e) => ({
    id: e.eventId as number, title: e.title as string, monthKey: e.monthKey as string,
    grossIncome: e.grossIncome as number, netProfit: e.netProfit as number,
  }));
  const general = await conn.select().from(expenses).where(and(
    eq(expenses.scope, "general"), eq(expenses.excludeFromPnl, 0), eq(expenses.recurrence, "none"),
  ));
  const generalExpenses = (general as any[])
    .filter((e) => typeof e.periodMonth === "string" && e.periodMonth.startsWith(`${year}-`))
    .map((e) => ({
      monthKey: e.periodMonth as string,
      cost: expenseCostForPnl({ amountTotal: Number(e.amountTotal), netAmount: Number(e.netAmount), documentType: e.documentType, ivaExempt: e.ivaExempt }, false),
      prorate: e.prorate === 1,
    }));
  const months = buildMonthRows({ year, events: evs, generalExpenses });
  const withData = months.filter((m) => m.events.length > 0 || m.unassignedExpenses > 0);
  const best = withData.length ? withData.reduce((a, b) => (b.result > a.result ? b : a)) : null;
  const worst = withData.length ? withData.reduce((a, b) => (b.result < a.result ? b : a)) : null;
  return {
    year,
    months,
    totals: {
      grossIncome: months.reduce((s, m) => s + m.grossIncome, 0),
      eventsProfit: months.reduce((s, m) => s + m.eventsProfit, 0),
      unassignedExpenses: months.reduce((s, m) => s + m.unassignedExpenses, 0),
      result: months.reduce((s, m) => s + m.result, 0),
      events: months.reduce((s, m) => s + m.events.length, 0),
    },
    bestMonth: best?.monthKey ?? null,
    worstMonth: worst?.monthKey ?? null,
  };
}

/** Todo lo que hay que pagar o que se le debe a terceros. */
export async function getPayables() {
  const conn = await db.getDb();
  if (!conn) return null;

  const comm = await conn.select({
    ambassadorId: ambassadorCommissions.ambassadorId, name: exclusiveAmbassadors.name,
    amount: ambassadorCommissions.commissionAmount, paidAt: ambassadorCommissions.paidAt,
    eventId: ambassadorCommissions.eventId,
  }).from(ambassadorCommissions).leftJoin(exclusiveAmbassadors, eq(exclusiveAmbassadors.id, ambassadorCommissions.ambassadorId));
  const byAmb = new Map<number, { ambassadorId: number; name: string; pending: number; paid: number; pendingCount: number }>();
  for (const c of comm as any[]) {
    const cur = byAmb.get(c.ambassadorId) ?? { ambassadorId: c.ambassadorId, name: c.name ?? `Embajador #${c.ambassadorId}`, pending: 0, paid: 0, pendingCount: 0 };
    if (c.paidAt) cur.paid += Number(c.amount);
    else { cur.pending += Number(c.amount); cur.pendingCount += 1; }
    byAmb.set(c.ambassadorId, cur);
  }
  const ambassadors = Array.from(byAmb.values()).sort((a, b) => b.pending - a.pending);

  const staffRows = await conn.select({
    eventId: staffShifts.eventId, title: events.title, name: staffMembers.name, amountClp: staffShifts.amountClp,
  }).from(staffShifts)
    .innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .innerJoin(events, eq(events.id, staffShifts.eventId))
    .where(eq(staffShifts.paid, 0));
  const staffUnpaid = (staffRows as any[]).map((r) => ({ eventId: r.eventId, eventTitle: r.title, name: r.name, amountClp: Number(r.amountClp) }));

  // Estacionamiento al local: de los eventos más recientes.
  const recent = await conn.select({ id: events.id, title: events.title }).from(events).orderBy(desc(events.eventDate)).limit(6);
  const parking: { eventId: number; eventTitle: string; amount: number }[] = [];
  for (const e of recent as any[]) {
    const r = await db.getParkingReport(e.id);
    if (r && r.amountOwedToVenueClp > 0) parking.push({ eventId: e.id, eventTitle: e.title, amount: r.amountOwedToVenueClp });
  }

  const [{ saldo }] = (await conn.select({ saldo: sql<number>`COALESCE(SUM(${customers.prepaidBalance}), 0)` }).from(customers)) as any[];

  return {
    ambassadors,
    ambassadorsPending: ambassadors.reduce((s, a) => s + a.pending, 0),
    staffUnpaid,
    staffUnpaidTotal: staffUnpaid.reduce((s, r) => s + r.amountClp, 0),
    parking,
    parkingTotal: parking.reduce((s, r) => s + r.amount, 0),
    playcardSaldoClientes: Number(saldo ?? 0),
  };
}

/** Marca como pagadas las comisiones pendientes de un embajador. */
export async function markCommissionsPaid(ambassadorId: number, paid: boolean) {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  if (paid) {
    await conn.update(ambassadorCommissions).set({ paidAt: new Date() })
      .where(and(eq(ambassadorCommissions.ambassadorId, ambassadorId), isNull(ambassadorCommissions.paidAt)));
  } else {
    await conn.update(ambassadorCommissions).set({ paidAt: null }).where(eq(ambassadorCommissions.ambassadorId, ambassadorId));
  }
  return { success: true };
}
