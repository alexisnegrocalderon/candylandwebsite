/* Resumen de Inicio del admin: un endpoint por bloque (evento, plata, gente).
 * Casi todo sale de funciones que ya existen en cada sección; acá solo se
 * juntan. Cada parte se pide con `part()`: si una falla (columna que falta,
 * tabla vacía, lo que sea) devuelve `null` y el cliente oculta ese widget, así
 * un dato roto no deja Inicio en blanco. */
import { and, eq, gt, gte, isNull, like, sql } from "drizzle-orm";
import {
  agentHandoffLog, customers, events, eventSurveys, orders, partyGifts, partyReports, ambassadorApplications,
} from "../drizzle/schema";
import * as db from "./db";
import { getEventLive } from "./finance";
import { getCashSummary } from "./cash";
import { getPayables, getCompanyYear } from "./financeCompany";
import { getTaxCalendar, chileToday } from "./sii";
import { listCajaAlerts } from "./caja/alerts";
import { countPendingApplications } from "./birthdayApplications";
import { getAmbassadorAdminSummary } from "./ambassadorProgram";
import { getSalesDripStatus } from "./salesDrip";
import { expensesByCategory } from "../shared/expenses";
import { billingPeriodStart, RESEND_DAILY_DEFAULT, RESEND_MONTHLY_LIMIT } from "../shared/emailQuota";
import { monthKeyFor } from "../shared/ambassadorProgram";

async function part<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

const count = async (rows: Promise<{ n: number }[]>) => Number((await rows)[0]?.n ?? 0);

/** "En vivo" = desde 6 h antes de la hora del evento hasta 14 h después
 * (misma ventana que usa finance.live). */
export function isEventLive(eventDate: Date | string, now: Date = new Date()): boolean {
  const start = new Date(eventDate).getTime();
  if (!Number.isFinite(start)) return false;
  return now.getTime() >= start - 6 * 3_600_000 && now.getTime() <= start + 14 * 3_600_000;
}

/* ─── Evento ─────────────────────────────────────────────── */

export async function getHomeEvento(eventId: number) {
  const conn = await db.getDb();
  const event = await db.getEventById(eventId);
  const live = event ? isEventLive((event as any).eventDate) : false;

  const [pulse, caja, tickets, parking, manual, shifts, alerts] = await Promise.all([
    part(async () => (await getEventLive(eventId, 60))),
    part(async () => db.getCajaDashboard(eventId)),
    part(async () => {
      const types = ((await db.getTicketTypesByEventId(eventId)) as any[]).filter((t) => t.category === "acceso");
      const out: { id: number; name: string; price: number; total: number; sold: number; remaining: number; status: string | null; stockPoolId: number | null }[] = [];
      for (const t of types) {
        let total = Number(t.totalStock), sold = Number(t.soldCount);
        if (t.stockPoolId) {
          const pool = await db.getStockPoolRemaining(t.stockPoolId);
          if (pool) { total = Number(pool.pool.totalCap); sold = pool.sold; }
        }
        out.push({ id: t.id, name: t.name, price: Number(t.price), total, sold, remaining: Math.max(0, total - sold), status: t.status ?? null, stockPoolId: t.stockPoolId ?? null });
      }
      return out;
    }),
    part(async () => db.getParkingReport(eventId)),
    part(async () => {
      if (!conn) return null;
      const rows = await conn.select({ pm: orders.paymentMethod, n: sql<number>`COUNT(*)` }).from(orders)
        .where(and(eq(orders.eventId, eventId), like(orders.paymentMethod, "Manual: %"))).groupBy(orders.paymentMethod);
      const total = (rows as any[]).reduce((s, r) => s + Number(r.n), 0);
      const staff = Number((rows as any[]).find((r) => r.pm === "Manual: Consumo Staff")?.n ?? 0);
      const invitations = Number((rows as any[]).find((r) => r.pm === "Manual: Invitación")?.n ?? 0);
      return { total, staffConsumption: staff, invitations };
    }),
    part(async () => ((await db.listOpenShifts(eventId)) as any[]).map((s) => ({ id: s.id, register: s.registerName ?? s.register ?? null, operator: s.operatorName ?? s.operator ?? null, openedAt: s.openedAt }))),
    part(async () => ((await listCajaAlerts(eventId, 10)) as any[])
      .filter((a) => Date.now() - new Date(a.createdAt).getTime() < 6 * 3_600_000)
      .map((a) => ({ severity: a.severity as "info" | "warning" | "critical", title: a.title as string, createdAt: a.createdAt }))),
  ]);

  return {
    eventId, live,
    pulse: pulse ? { totals: pulse.totals, pace: pulse.pace, lastSaleAt: pulse.lastSaleAt, isLive: pulse.isLive, alerts: pulse.alerts } : null,
    caja: caja ? { totalSales: caja.totalSales, salesCount: caja.salesCount, insideCount: caja.insideCount, staffInside: caja.staffInside, expectedCount: caja.expectedCount, redeemedCount: caja.redeemedCount, topProducts: caja.topProducts, salesByHour: caja.salesByHour } : null,
    tickets, parking, manual, shifts, cajaAlerts: alerts,
  };
}

/* ─── Plata ──────────────────────────────────────────────── */

export async function getHomePlata(now: Date = new Date()) {
  const monthKey = monthKeyFor(now);
  const year = Number(monthKey.slice(0, 4));
  const [cash, payables, sii, company, spend] = await Promise.all([
    part(async () => {
      const c = await getCashSummary(monthKey);
      return { balances: c.balances, position: c.position, pendingCount: c.pending.length, pendingAmount: c.pending.reduce((s, m) => s + Math.abs(m.amount), 0), monthWithdrawals: c.position.monthWithdrawals };
    }),
    part(async () => {
      const p = await getPayables();
      if (!p) return null;
      return {
        ambassadorsPending: p.ambassadorsPending, ambassadorsPendingFuture: p.ambassadorsPendingFuture, staffUnpaidTotal: p.staffUnpaidTotal, staffUnpaidCount: p.staffUnpaid.length,
        retentionSiiTotal: p.retentionSiiTotal, parkingTotal: p.parkingTotal, playcardSaldoClientes: p.playcardSaldoClientes,
        total: p.ambassadorsPending + p.staffUnpaidTotal + p.retentionSiiTotal + p.parkingTotal,
      };
    }),
    part(async () => {
      const cal = await getTaxCalendar(year);
      const today = chileToday(now);
      const open = cal.filter((o: any) => o.status !== "pagado" && o.status !== "declarado" && o.dueDate >= today.slice(0, 7) + "-01").sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate));
      const next = open[0] ?? null;
      const toReview = await part(async () => {
        const conn = await db.getDb();
        if (!conn) return 0;
        return count(conn.select({ n: sql<number>`COUNT(*)` }).from(events).where(eq(events.taxIssuer, "por_revisar")));
      });
      return { next: next ? { title: next.title as string, dueDate: next.dueDate as string, daysLeft: next.daysLeft as number, status: (next.status ?? null) as string | null, kind: next.kind as string } : null, eventsToReview: toReview ?? 0 };
    }),
    part(async () => {
      const y = await getCompanyYear(year);
      if (!y) return null;
      const m = y.months.find((x) => x.monthKey === monthKey);
      return { monthKey, result: m?.result ?? 0, eventsProfit: m?.eventsProfit ?? 0, unassignedExpenses: m?.unassignedExpenses ?? 0, bestMonth: y.bestMonth, worstMonth: y.worstMonth, yearResult: y.totals.result };
    }),
    part(async () => {
      const rows = (await db.listExpenses({ monthKey })) as any[];
      return { total: rows.reduce((s, r) => s + Number(r.amountTotal), 0), count: rows.length, byCategory: expensesByCategory(rows).slice(0, 6), latest: rows.slice(0, 5).map((r) => ({ description: r.description as string, amount: Number(r.amountTotal), category: r.category as string, date: r.expenseDate })) };
    }),
  ]);
  return { monthKey, cash, payables, sii, company, spend };
}

/* ─── Gente ──────────────────────────────────────────────── */

export async function getHomeGente(eventId: number | null, now: Date = new Date()) {
  const conn = await db.getDb();
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const [clientes, embajadores, mensajes, concursos, comunidad] = await Promise.all([
    part(async () => {
      if (!conn) return null;
      const [total, nuevos, recurrentes, inactivos, birthdays] = await Promise.all([
        count(conn.select({ n: sql<number>`COUNT(*)` }).from(customers)),
        count(conn.select({ n: sql<number>`COUNT(*)` }).from(customers).where(gte(customers.createdAt, week))),
        count(conn.select({ n: sql<number>`COUNT(*)` }).from(customers).where(gt(customers.totalOrders, 1))),
        // Compraron alguna vez pero no en los últimos 120 días de órdenes aprobadas.
        count(conn.select({ n: sql<number>`COUNT(*)` }).from(customers).where(and(
          gt(customers.totalOrders, 0),
          sql`NOT EXISTS (SELECT 1 FROM ${orders} WHERE ${orders.buyerEmail} = ${customers.email} AND ${orders.paymentStatus} = 'approved' AND ${orders.createdAt} > ${new Date(now.getTime() - 120 * 86_400_000)})`,
        ))),
        part(async () => countPendingApplications()),
      ]);
      return { total, nuevos7d: nuevos, recurrentes, inactivos, birthdaysPending: birthdays ?? 0 };
    }),
    part(async () => {
      const id = eventId ?? (await db.getFeaturedEvent())?.id;
      const [summary, pending] = await Promise.all([
        id ? getAmbassadorAdminSummary(id) : Promise.resolve(null),
        conn ? count(conn.select({ n: sql<number>`COUNT(*)` }).from(ambassadorApplications).where(eq(ambassadorApplications.status, "pendiente"))) : Promise.resolve(0),
      ]);
      return summary ? { ...summary, pendingApplications: pending } : null;
    }),
    part(async () => {
      if (!conn) return null;
      const [handoffs, usageToday, drip] = await Promise.all([
        count(conn.select({ n: sql<number>`COUNT(*)` }).from(agentHandoffLog).where(isNull(agentHandoffLog.resolvedAt))),
        db.countEmailsSentToday(now),
        part(async () => getSalesDripStatus(now)),
      ]);
      const cap = Number(process.env.RESEND_DAILY_EMAIL_CAP) || RESEND_DAILY_DEFAULT;
      const sentMonth = await db.countEmailsSentSince(billingPeriodStart());
      return {
        handoffsPending: handoffs,
        email: { sentToday: usageToday, dailyCap: cap, remaining: Math.max(0, cap - usageToday), sentMonth, monthlyLimit: RESEND_MONTHLY_LIMIT },
        drip: drip ? { enabled: drip.enabled, dueToday: drip.dueToday, sentToday: drip.sentToday, audienceSize: drip.audienceSize } : null,
      };
    }),
    part(async () => {
      if (!conn) return null;
      const { listContests } = await import("./contests");
      const list = await listContests();
      return list.filter((c) => (c.status === "active" || c.status === "paused") && !c.drawnAt).slice(0, 5)
        .map((c) => ({ id: c.id, title: c.title, status: c.status, participants: c.participants }));
    }),
    part(async () => {
      if (!conn) return null;
      const [reports, gifts, surveyRows] = await Promise.all([
        count(conn.select({ n: sql<number>`COUNT(*)` }).from(partyReports).where(isNull(partyReports.resolvedAt))),
        count(conn.select({ n: sql<number>`COUNT(*)` }).from(partyGifts).where(eq(partyGifts.status, "paid"))),
        eventId
          ? conn.select({ sent: sql<number>`SUM(CASE WHEN ${eventSurveys.sentAt} IS NOT NULL THEN 1 ELSE 0 END)`, answered: sql<number>`SUM(CASE WHEN ${eventSurveys.respondedAt} IS NOT NULL THEN 1 ELSE 0 END)`, avg: sql<number>`AVG(${eventSurveys.rating})` })
            .from(eventSurveys).where(eq(eventSurveys.eventId, eventId))
          : Promise.resolve([] as any[]),
      ]);
      const s: any = surveyRows[0];
      return { reportsOpen: reports, giftsUnclaimed: gifts, survey: s && Number(s.sent) > 0 ? { sent: Number(s.sent), answered: Number(s.answered), avgRating: s.avg != null ? Math.round(Number(s.avg) * 10) / 10 : null } : null };
    }),
  ]);
  return { clientes, embajadores, mensajes, concursos, comunidad };
}
