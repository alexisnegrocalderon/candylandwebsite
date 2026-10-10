/**
 * Finanzas de la empresa: resultado mes a mes y lo que hay que pagar.
 *
 * El resultado de un mes = la ganancia de sus eventos (que ya incluye la parte
 * que les toca de los gastos fijos prorrateados) MENOS los gastos generales que
 * ningún evento absorbió: los marcados "no prorratear" y los de meses sin
 * eventos. Sin esa resta, esa plata no aparecía en ningún resultado.
 */
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { ambassadorCommissions, events, exclusiveAmbassadors, expenses, staffMembers, staffShifts, customers } from "../drizzle/schema";
import { sql } from "drizzle-orm";
import * as db from "./db";
import { expenseCostForPnl } from "../shared/expenses";
import { monthKeyFor } from "../shared/ambassadorProgram";
import { honorariosBreakdown } from "../shared/honorarios";

/** El F29 de lo retenido vence el día 12 del mes siguiente al del evento (hora de Chile). */
export function f29DueDate(eventDate: Date | string): string {
  const [y, m] = monthKeyFor(eventDate).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-12`;
}

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

export type EventCommissionGroup = {
  eventId: number;
  eventTitle: string;
  eventDate: string | null;
  /** El evento todavía no ocurre: sus comisiones no se deben aún. */
  isFuture: boolean;
  pending: number;
  paid: number;
  ambassadors: { ambassadorId: number; name: string; pending: number; paid: number; pendingCount: number; salesCount: number }[];
};

/** Agrupa comisiones por evento y por embajador. Pura (testeable). */
export function groupCommissionsByEvent(
  rows: { ambassadorId: number; name: string | null; amount: string | number; paidAt: Date | null; eventId: number; eventTitle: string | null; eventDate: Date | string | null }[],
  now: Date,
): EventCommissionGroup[] {
  const byEvent = new Map<number, EventCommissionGroup>();
  for (const r of rows) {
    const date = r.eventDate ? new Date(r.eventDate) : null;
    const g = byEvent.get(r.eventId) ?? {
      eventId: r.eventId, eventTitle: r.eventTitle ?? `Evento #${r.eventId}`, eventDate: date ? date.toISOString() : null,
      isFuture: !!date && date.getTime() > now.getTime(), pending: 0, paid: 0, ambassadors: [],
    };
    let a = g.ambassadors.find((x) => x.ambassadorId === r.ambassadorId);
    if (!a) {
      a = { ambassadorId: r.ambassadorId, name: r.name ?? `Embajador #${r.ambassadorId}`, pending: 0, paid: 0, pendingCount: 0, salesCount: 0 };
      g.ambassadors.push(a);
    }
    const amount = Number(r.amount);
    a.salesCount += 1;
    if (r.paidAt) { a.paid += amount; g.paid += amount; } else { a.pending += amount; a.pendingCount += 1; g.pending += amount; }
    byEvent.set(r.eventId, g);
  }
  const groups = Array.from(byEvent.values());
  for (const g of groups) g.ambassadors.sort((x, y) => y.pending - x.pending || x.name.localeCompare(y.name));
  // Primero los próximos/futuros más cercanos y luego los pasados, del más reciente al más viejo.
  return groups.sort((x, y) => new Date(y.eventDate ?? 0).getTime() - new Date(x.eventDate ?? 0).getTime());
}

/** Todo lo que hay que pagar o que se le debe a terceros. */
export async function getPayables() {
  const conn = await db.getDb();
  if (!conn) return null;

  // Comisiones de embajadores, agrupadas por EVENTO: cada evento es su propia
  // campaña y se paga por separado (un evento que aún no ocurre no se debe).
  const comm = await conn.select({
    ambassadorId: ambassadorCommissions.ambassadorId, name: exclusiveAmbassadors.name,
    amount: ambassadorCommissions.commissionAmount, paidAt: ambassadorCommissions.paidAt,
    eventId: ambassadorCommissions.eventId, eventTitle: events.title, eventDate: events.eventDate,
  }).from(ambassadorCommissions)
    .leftJoin(exclusiveAmbassadors, eq(exclusiveAmbassadors.id, ambassadorCommissions.ambassadorId))
    .leftJoin(events, eq(events.id, ambassadorCommissions.eventId));
  const ambassadorEvents = groupCommissionsByEvent(comm as any[], new Date());
  const ambassadorsPending = ambassadorEvents.filter((e) => !e.isFuture).reduce((sum, e) => sum + e.pending, 0);
  const ambassadorsPendingFuture = ambassadorEvents.filter((e) => e.isFuture).reduce((sum, e) => sum + e.pending, 0);

  // Staff: a la persona se le transfiere el líquido; la retención de las boletas
  // de honorarios se declara y paga al SII (F29, hasta el día 12 del mes siguiente).
  const staffRows = await conn.select({
    eventId: staffShifts.eventId, title: events.title, eventDate: events.eventDate, name: staffMembers.name,
    amountClp: staffShifts.amountClp, paymentType: staffShifts.paymentType, amountMode: staffShifts.amountMode, paid: staffShifts.paid,
  }).from(staffShifts)
    .innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .innerJoin(events, eq(events.id, staffShifts.eventId));
  const staffUnpaid: { eventId: number; eventTitle: string; name: string; amountClp: number }[] = [];
  const retentionByEvent = new Map<number, { eventId: number; eventTitle: string; eventDate: string | null; retention: number; boletas: number; dueDate: string | null }>();
  for (const r of staffRows as any[]) {
    const year = Number(monthKeyFor(r.eventDate).slice(0, 4));
    const pay = honorariosBreakdown({ amount: Number(r.amountClp), paymentType: r.paymentType, amountMode: r.amountMode, year });
    if (!r.paid) staffUnpaid.push({ eventId: r.eventId, eventTitle: r.title, name: r.name, amountClp: pay.net });
    if (pay.retention > 0) {
      const cur = retentionByEvent.get(r.eventId) ?? { eventId: r.eventId, eventTitle: r.title, eventDate: new Date(r.eventDate).toISOString(), retention: 0, boletas: 0, dueDate: f29DueDate(r.eventDate) };
      cur.retention += pay.retention; cur.boletas += 1;
      retentionByEvent.set(r.eventId, cur);
    }
  }
  // Solo lo reciente: la retención de eventos viejos ya se declaró (no hay registro de pago del F29).
  const cutoff = Date.now() - 75 * 86_400_000;
  const retentionSii = Array.from(retentionByEvent.values())
    .filter((r) => r.eventDate && new Date(r.eventDate).getTime() >= cutoff)
    .sort((a, b) => new Date(b.eventDate ?? 0).getTime() - new Date(a.eventDate ?? 0).getTime());

  // Estacionamiento al local: de los eventos más recientes.
  const recent = await conn.select({ id: events.id, title: events.title }).from(events).orderBy(desc(events.eventDate)).limit(6);
  const parking: { eventId: number; eventTitle: string; amount: number }[] = [];
  for (const e of recent as any[]) {
    const r = await db.getParkingReport(e.id);
    if (r && r.amountOwedToVenueClp > 0) parking.push({ eventId: e.id, eventTitle: e.title, amount: r.amountOwedToVenueClp });
  }

  const [{ saldo }] = (await conn.select({ saldo: sql<number>`COALESCE(SUM(${customers.prepaidBalance}), 0)` }).from(customers)) as any[];

  return {
    ambassadorEvents,
    ambassadorsPending,
    ambassadorsPendingFuture,
    staffUnpaid,
    staffUnpaidTotal: staffUnpaid.reduce((s, r) => s + r.amountClp, 0),
    retentionSii,
    retentionSiiTotal: retentionSii.reduce((s, r) => s + r.retention, 0),
    parking,
    parkingTotal: parking.reduce((s, r) => s + r.amount, 0),
    playcardSaldoClientes: Number(saldo ?? 0),
  };
}

/** Marca como pagadas (o pendientes) las comisiones de UN embajador en UN evento.
 * Nunca toca otros eventos. Un evento que aún no ocurre exige `confirmFuture`. */
export async function markCommissionsPaid(p: { ambassadorId: number; eventId: number; paid: boolean; confirmFuture?: boolean }) {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const [event] = await conn.select({ eventDate: events.eventDate, title: events.title }).from(events).where(eq(events.id, p.eventId)).limit(1);
  if (!event) throw new Error("Evento no encontrado");
  if (p.paid && new Date(event.eventDate as any).getTime() > Date.now() && !p.confirmFuture) {
    throw new Error(`«${event.title}» todavía no ocurre: sus comisiones aún no se deben. Confirma si de verdad ya las pagaste.`);
  }
  const scope = and(eq(ambassadorCommissions.ambassadorId, p.ambassadorId), eq(ambassadorCommissions.eventId, p.eventId));
  if (p.paid) {
    await conn.update(ambassadorCommissions).set({ paidAt: new Date() }).where(and(scope, isNull(ambassadorCommissions.paidAt)));
  } else {
    await conn.update(ambassadorCommissions).set({ paidAt: null }).where(scope);
  }
  return { success: true };
}

/** Vuelve a "pendiente" TODAS las comisiones marcadas como pagadas. El estado
 * "pagado" nació en Finanzas (antes no existía), y se marcó sin separar por
 * evento: se reinicia para volver a marcarlo evento por evento. */
export async function resetCommissionPayments() {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const [{ n }] = (await conn.select({ n: sql<number>`COUNT(*)` }).from(ambassadorCommissions).where(isNotNull(ambassadorCommissions.paidAt))) as any[];
  await conn.update(ambassadorCommissions).set({ paidAt: null }).where(isNotNull(ambassadorCommissions.paidAt));
  return { reset: Number(n ?? 0) };
}
