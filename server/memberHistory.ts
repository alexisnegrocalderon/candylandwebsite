/* «Mis movimientos» (member.history): todo lo que una persona hizo y gastó, leído de las tablas que ya existen
 * (órdenes, saldo, Playcoins, canjes, guardarropía y cocina). Una consulta por fuente, cada una con su tope, y
 * `mergeHistory` (shared/memberHistory.ts) las mezcla, filtra y pagina. Nada se guarda: no hay migración.
 *
 * Solo lee lo del correo de la sesión. Se leen únicamente columnas pensadas para el cliente: nunca costos, ids de
 * operadores, el id de pago ni las notas de los ajustes. */
import { and, desc, eq, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { events, kitchenTickets, lockerItems, orderItems, orders, playcoinsLedger, prepaidLedger, tickets, ticketTypes } from '../drizzle/schema';
import { PLACEHOLDER_BUYER_EMAILS } from '../shared/parking';
import { ticketKind } from '../shared/ticketKind';
import {
  HISTORY_PAGE_SIZE, decodeCursor, mergeHistory, playcoinsTitle, prepaidTitle, sourcesFor, summarizeItems,
  type HistoryFilter, type HistoryItem,
} from '../shared/memberHistory';
import { getDb } from './db';
import { cajaOpIsMine } from './memberCajaOps';
import { findCustomer } from './members';

const iso = (d: Date | string) => new Date(d).toISOString();
const isDoorParking = sql<number>`(${orders.paymentId} LIKE 'PUERTA-PARKING-%')`;

function parseKitchenItems(raw: unknown): { name: string; quantity: number }[] {
  let value = raw;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  if (!Array.isArray(value)) return [];
  return value.map((i: any) => ({ name: String(i?.name ?? ''), quantity: Number(i?.quantity) || 0 }));
}

export async function getMemberHistory(email: string, opts: { filter?: HistoryFilter; cursor?: string | null; limit?: number } = {}): Promise<{ items: HistoryItem[]; next: string | null }> {
  const empty = { items: [] as HistoryItem[], next: null };
  const db = await getDb();
  const customer = await findCustomer(email);
  if (!db || !customer) return empty;
  const key = customer.email.toLowerCase();
  if (PLACEHOLDER_BUYER_EMAILS.has(key)) return empty;

  const filter = opts.filter ?? 'todo';
  const limit = opts.limit ?? HISTORY_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  const upTo = cursor ? new Date(cursor.at) : null;
  const per = limit + 10;
  const src = sourcesFor(filter);
  const mine = sql`LOWER(${orders.buyerEmail}) = ${key}`;
  const sources: HistoryItem[][] = [];

  /** Ítems («2× Dúo») de un grupo de órdenes. */
  const itemsOf = async (orderIds: number[]) => {
    const byOrder = new Map<number, { name: string; quantity: number }[]>();
    if (orderIds.length === 0) return byOrder;
    const rows = await db.select({ orderId: orderItems.orderId, name: ticketTypes.name, quantity: orderItems.quantity })
      .from(orderItems).innerJoin(ticketTypes, eq(orderItems.ticketTypeId, ticketTypes.id)).where(inArray(orderItems.orderId, orderIds));
    for (const r of rows) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), { name: r.name, quantity: r.quantity }]);
    return byOrder;
  };

  /* Compras. Las pagadas con saldo y las cargas de saldo salen en su fila de saldo (con el detalle), no repetidas aquí. */
  if (src.orders) {
    const rows = await db.select({
      id: orders.id, orderNumber: orders.orderNumber, total: orders.total, channel: orders.channel, status: orders.paymentStatus,
      createdAt: orders.createdAt, eventTitle: events.title, door: isDoorParking,
    }).from(orders).leftJoin(events, eq(orders.eventId, events.id))
      .where(and(
        mine, inArray(orders.paymentStatus, ['approved', 'refunded']), upTo ? lte(orders.createdAt, upTo) : undefined,
        sql`NOT EXISTS (SELECT 1 FROM ${prepaidLedger} p WHERE p.customerId = ${customer.id} AND ((p.reason = 'spend_caja' AND CONCAT('CAJA-', p.opId) = ${orders.paymentId}) OR (p.reason = 'topup_web' AND p.orderId = ${orders.id})))`,
      ))
      .orderBy(desc(orders.createdAt), desc(orders.id)).limit(per);
    const items = await itemsOf(rows.map((r) => r.id));
    sources.push(rows.map((r) => ({
      id: `o${r.id}`, kind: 'compra' as const, at: iso(r.createdAt),
      title: r.status === 'refunded' ? 'Compra reembolsada' : r.door ? 'Estacionamiento pagado en la puerta' : r.channel === 'caja' ? 'Compra en caja' : 'Compra online',
      detail: summarizeItems(items.get(r.id) ?? []) || null,
      amount: r.status === 'refunded' ? null : -Number(r.total), unit: 'clp' as const, orderNumber: r.orderNumber, eventTitle: r.eventTitle ?? null,
      status: r.status === 'refunded' ? 'reembolsada' : null,
    })));
  }

  /* Saldo en plata (recargas, cobros, devoluciones), con el saldo que quedó y, si se puede, la compra de origen. */
  if (src.prepaid) {
    const rows = await db.select({ id: prepaidLedger.id, delta: prepaidLedger.delta, reason: prepaidLedger.reason, orderId: prepaidLedger.orderId, opId: prepaidLedger.opId, balanceAfter: prepaidLedger.balanceAfter, createdAt: prepaidLedger.createdAt })
      .from(prepaidLedger).where(and(eq(prepaidLedger.customerId, customer.id), upTo ? lte(prepaidLedger.createdAt, upTo) : undefined))
      .orderBy(desc(prepaidLedger.createdAt), desc(prepaidLedger.id)).limit(per);
    const payIds = rows.filter((r) => r.reason === 'spend_caja' && r.opId).map((r) => `CAJA-${r.opId}`);
    const topupIds = rows.filter((r) => r.reason === 'topup_web' && r.orderId).map((r) => r.orderId as number);
    const linked = payIds.length || topupIds.length
      ? await db.select({ id: orders.id, orderNumber: orders.orderNumber, paymentId: orders.paymentId, eventTitle: events.title })
        .from(orders).leftJoin(events, eq(orders.eventId, events.id))
        .where(or(payIds.length ? inArray(orders.paymentId, payIds) : undefined, topupIds.length ? inArray(orders.id, topupIds) : undefined))
      : [];
    const items = await itemsOf(linked.map((o) => o.id));
    sources.push(rows.map((r) => {
      const order = r.reason === 'spend_caja' ? linked.find((o) => o.paymentId === `CAJA-${r.opId}`) : r.reason === 'topup_web' ? linked.find((o) => o.id === r.orderId) : undefined;
      return {
        id: `s${r.id}`, kind: 'saldo' as const, alsoIn: order ? ['compra' as const] : undefined, at: iso(r.createdAt),
        title: prepaidTitle(r.reason), detail: order ? summarizeItems(items.get(order.id) ?? []) || null : null,
        amount: r.delta, unit: 'clp' as const, balanceAfter: r.balanceAfter, orderNumber: order?.orderNumber ?? null, eventTitle: order?.eventTitle ?? null,
      };
    }));
  }

  /* Playcoins ganados y canjeados. */
  if (src.playcoins) {
    const rows = await db.select({ id: playcoinsLedger.id, delta: playcoinsLedger.delta, reason: playcoinsLedger.reason, orderId: playcoinsLedger.orderId, balanceAfter: playcoinsLedger.balanceAfter, createdAt: playcoinsLedger.createdAt })
      .from(playcoinsLedger).where(and(eq(playcoinsLedger.customerId, customer.id), upTo ? lte(playcoinsLedger.createdAt, upTo) : undefined))
      .orderBy(desc(playcoinsLedger.createdAt), desc(playcoinsLedger.id)).limit(per);
    const orderIds = rows.map((r) => r.orderId).filter((id): id is number => id != null);
    const numbers = orderIds.length ? await db.select({ id: orders.id, orderNumber: orders.orderNumber }).from(orders).where(inArray(orders.id, orderIds)) : [];
    sources.push(rows.map((r) => ({
      id: `c${r.id}`, kind: 'playcoins' as const, at: iso(r.createdAt), title: playcoinsTitle(r.reason, r.delta),
      amount: r.delta, unit: 'pc' as const, balanceAfter: r.balanceAfter, orderNumber: numbers.find((n) => n.id === r.orderId)?.orderNumber ?? null,
    })));
  }

  /* Entradas escaneadas y extras canjeados. */
  if (src.uses) {
    const rows = await db.select({ id: tickets.id, usedAt: tickets.usedAt, category: ticketTypes.category, typeName: ticketTypes.name, eventTitle: events.title, door: isDoorParking })
      .from(tickets).innerJoin(orders, eq(tickets.orderId, orders.id)).innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id)).innerJoin(events, eq(tickets.eventId, events.id))
      .where(and(mine, eq(orders.paymentStatus, 'approved'), eq(tickets.status, 'used'), isNotNull(tickets.usedAt), upTo ? lte(tickets.usedAt, upTo) : undefined))
      .orderBy(desc(tickets.usedAt), desc(tickets.id)).limit(per);
    // El estacionamiento que se paga en la puerta ya sale como compra: no se repite como canje.
    sources.push(rows.filter((r) => !r.door).map((r) => {
      const kind = ticketKind(r.category, r.typeName);
      const title = kind === 'acceso' ? 'Entraste a la fiesta'
        : kind === 'estacionamiento' ? 'Usaste tu estacionamiento'
          : kind === 'guardarropia' ? 'Usaste tu guardarropía' : `Canjeaste ${r.typeName}`;
      return { id: `t${r.id}`, kind: kind === 'acceso' ? ('ingreso' as const) : ('canje' as const), at: iso(r.usedAt as Date), title, eventTitle: r.eventTitle };
    }));
  }

  /* Guardarropía y cocina de la caja: solo guardan el último ciclo (hora de «guardado» y de «retirado»). */
  if (src.onSite) {
    const lockers = await db.select({ id: lockerItems.id, tag: lockerItems.tagNumber, receivedAt: lockerItems.receivedAt, retrievedAt: lockerItems.retrievedAt, eventTitle: events.title })
      .from(lockerItems).innerJoin(orders, eq(lockerItems.orderId, orders.id)).innerJoin(events, eq(lockerItems.eventId, events.id))
      .where(and(or(mine, cajaOpIsMine(customer.id, lockerItems.opId)), ne(lockerItems.status, 'anulado'))).orderBy(desc(lockerItems.chargedAt)).limit(50);
    const kitchen = await db.select({ id: kitchenTickets.id, number: kitchenTickets.ticketNumber, items: kitchenTickets.items, createdAt: kitchenTickets.createdAt, deliveredAt: kitchenTickets.deliveredAt, eventTitle: events.title })
      .from(kitchenTickets).innerJoin(orders, eq(kitchenTickets.orderId, orders.id)).innerJoin(events, eq(kitchenTickets.eventId, events.id))
      .where(and(or(mine, cajaOpIsMine(customer.id, kitchenTickets.opId)), ne(kitchenTickets.status, 'anulado'))).orderBy(desc(kitchenTickets.createdAt)).limit(50);
    const rows: HistoryItem[] = [];
    for (const l of lockers) {
      if (l.receivedAt) rows.push({ id: `l${l.id}a`, kind: 'guardarropia', at: iso(l.receivedAt), title: 'Guardaste tu abrigo', detail: `Percha N° ${l.tag}`, eventTitle: l.eventTitle });
      if (l.retrievedAt) rows.push({ id: `l${l.id}b`, kind: 'guardarropia', at: iso(l.retrievedAt), title: 'Retiraste tu abrigo', detail: `Percha N° ${l.tag}`, eventTitle: l.eventTitle });
    }
    for (const k of kitchen) {
      rows.push({ id: `k${k.id}a`, kind: 'cocina', at: iso(k.createdAt), title: 'Pediste en cocina', detail: [summarizeItems(parseKitchenItems(k.items)), `Comanda ${k.number}`].filter(Boolean).join(' · '), eventTitle: k.eventTitle });
      if (k.deliveredAt) rows.push({ id: `k${k.id}b`, kind: 'cocina', at: iso(k.deliveredAt), title: 'Retiraste tu pedido', detail: `Comanda ${k.number}`, eventTitle: k.eventTitle });
    }
    sources.push(rows);
  }

  return mergeHistory(sources, { filter, cursor: opts.cursor, limit });
}
