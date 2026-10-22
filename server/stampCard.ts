import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from './db';
import { accessCredits, customers, events, orders, tickets, ticketTypes } from '../drizzle/schema';
import { PLACEHOLDER_BUYER_EMAILS } from '../shared/parking';
import { creditAvailability } from '../shared/accessCredit';
import {
  STAMP_REWARD_NAME,
  STAMP_REWARD_SLUG,
  stampCardState,
  stampRewardCode,
  visitCompletingCard,
  type StampVisit,
} from '../shared/stampCard';
import { pushToEmail } from './customerPush';

/* Tarjeta de sellos de «Mi cuenta» (reglas en shared/stampCard.ts).
 *
 * Una fiesta cuenta si la persona ENTRÓ: un acceso de una compra web
 * aprobada a su correo, escaneado en la puerta (`used`). Mismo criterio que
 * la ficha del cliente (server/customerProfile.ts). Los acompañantes no
 * tienen correo propio: suma solo quien compró.
 *
 * El premio es un crédito de acceso (tabla accessCredits): vale 1 Acceso Dúo
 * en cualquier fiesta y se canjea escribiendo su código al comprar. Su
 * código es fijo por cliente y premio (SELLOS-<id>-<n>), así nunca se
 * entrega dos veces. `originOrderId = 0`: no sale de ninguna compra, y así
 * no se mezcla con los créditos de una orden (reembolsos, «dejar para otra
 * fecha»). */

/** Fiestas distintas a las que entró, de la más antigua a la más nueva. */
export async function attendedEvents(email: string): Promise<StampVisit[]> {
  const db = await getDb();
  const key = (email ?? '').trim().toLowerCase();
  if (!db || !key || PLACEHOLDER_BUYER_EMAILS.has(key)) return [];
  const rows = await db.select({ eventId: tickets.eventId, title: events.title, eventDate: events.eventDate, usedAt: tickets.usedAt })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .innerJoin(events, eq(events.id, tickets.eventId))
    .where(and(
      sql`lower(${orders.buyerEmail}) = ${key}`,
      eq(orders.paymentStatus, 'approved'),
      ne(orders.channel, 'caja'),
      eq(tickets.status, 'used'),
      eq(ticketTypes.category, 'acceso'),
    ))
    .orderBy(asc(events.eventDate));
  const seen = new Set<number>();
  const visits: StampVisit[] = [];
  for (const r of rows) {
    if (seen.has(r.eventId)) continue;
    seen.add(r.eventId);
    visits.push({ eventId: r.eventId, title: r.title, date: r.eventDate ?? r.usedAt });
  }
  return visits;
}

export interface StampReward {
  n: number;
  code: string;
  available: boolean;
  /** La fiesta con la que se completó la tarjeta. */
  eventTitle: string | null;
}

/** Entrega los premios que falten (idempotente) y devuelve todos los de la persona. */
async function ensureRewards(customer: { id: number; email: string; fullName: string | null }, visits: StampVisit[], completedCards: number): Promise<{ rewards: StampReward[]; created: number }> {
  const db = await getDb();
  if (!db || completedCards === 0) return { rewards: [], created: 0 };
  const codes = Array.from({ length: completedCards }, (_, i) => stampRewardCode(customer.id, i + 1));
  const existing = await db.select().from(accessCredits).where(inArray(accessCredits.code, codes));
  const byCode = new Map(existing.map((c) => [c.code, c]));
  let created = 0;
  for (let n = 1; n <= completedCards; n++) {
    const code = stampRewardCode(customer.id, n);
    if (byCode.has(code)) continue;
    const visit = visitCompletingCard(visits, n);
    try {
      await db.insert(accessCredits).values({
        code,
        accesoSlug: STAMP_REWARD_SLUG,
        accesoName: STAMP_REWARD_NAME,
        buyerEmail: customer.email.toLowerCase(),
        buyerName: customer.fullName,
        originOrderId: 0,
        originEventId: visit?.eventId ?? 0,
        note: `Premio tarjeta de sellos #${n}`,
      });
      created++;
    } catch {
      // Dos pedidos a la vez: el otro ya lo creó (el código es único).
    }
  }
  const all = created > 0 ? await db.select().from(accessCredits).where(inArray(accessCredits.code, codes)) : existing;
  const usedOrderIds = all.map((c) => c.usedOrderId).filter((id): id is number => id != null);
  const usedOrders = usedOrderIds.length
    ? await db.select({ id: orders.id, paymentStatus: orders.paymentStatus, createdAt: orders.createdAt }).from(orders).where(inArray(orders.id, usedOrderIds))
    : [];
  const orderById = new Map(usedOrders.map((o) => [o.id, o]));
  const rewards = codes.flatMap((code, i): StampReward[] => {
    const c = all.find((x) => x.code === code);
    if (!c) return [];
    const availability = creditAvailability(c, c.usedOrderId ? orderById.get(c.usedOrderId) ?? null : null);
    return [{ n: i + 1, code, available: availability === 'available', eventTitle: visitCompletingCard(visits, i + 1)?.title ?? null }];
  });
  return { rewards, created };
}

/** Lo que muestra la pestaña «Sellos»: la tarjeta actual, los premios y el historial. */
export async function getStampCard(email: string) {
  const db = await getDb();
  const key = (email ?? '').trim().toLowerCase();
  if (!db || !key) return null;
  const [customer] = await db.select({ id: customers.id, email: customers.email, fullName: customers.fullName }).from(customers).where(eq(customers.email, key)).limit(1);
  if (!customer) return null;
  const visits = await attendedEvents(key);
  const state = stampCardState(visits);
  const { rewards, created } = await ensureRewards(customer, visits, state.completedCards);
  if (created > 0) {
    void pushToEmail(key, {
      title: '🎉 ¡Completaste tu tarjeta de sellos!',
      body: 'Tienes un Acceso Dúo gratis para tu próxima fiesta. Míralo en tu app.',
      url: '/cuenta',
    }).catch(() => {});
  }
  return { ...state, rewards, history: [...visits].reverse() };
}

/** Después de escanear una entrada en la puerta: si con esa fiesta se completa la tarjeta, el premio
 * queda listo y llega el aviso al teléfono. Nunca frena la puerta. */
export async function refreshStampsForTicket(ticketCode: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [row] = await db.select({ email: orders.buyerEmail }).from(tickets).innerJoin(orders, eq(orders.id, tickets.orderId)).where(eq(tickets.ticketCode, ticketCode)).limit(1);
    if (row?.email) await getStampCard(row.email);
  } catch (err) {
    console.error('[sellos] No se pudo actualizar la tarjeta tras el check-in:', err);
  }
}
