/* Crédito de acceso: dejar el acceso de una fiesta que no pueden usar vigente
 * para un evento futuro (shared/accessCredit.ts explica el modelo). Acá vive la
 * parte con base de datos del lado del admin: emitir, listar y recordar. El
 * canje en el checkout está en server/db.ts (createOrder). */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { accessCredits, customers, events, orderItems, orders, ticketTypes, tickets, type AccessCredit } from '../drizzle/schema';
import { addCustomerTag, getDb, recordAdminAudit } from './db';
import { buildAccessCreditEmail, sendEmail } from './email';
import { creditAvailability, generateCreditCode, type CreditAvailability } from '../shared/accessCredit';

export const CREDIT_CUSTOMER_TAG = 'Crédito de acceso';

async function insertCreditWithUniqueCode(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, values: Omit<typeof accessCredits.$inferInsert, 'code'>): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCreditCode();
    try {
      await db.insert(accessCredits).values({ ...values, code });
      return code;
    } catch (err: any) {
      const duplicate = err?.code === 'ER_DUP_ENTRY' || /duplicate entry/i.test(String(err?.message ?? ''));
      if (!duplicate) throw err;
    }
  }
  throw new Error('No se pudo generar un código único, intenta de nuevo.');
}

/** Deja el/los acceso(s) de una orden como crédito para un evento futuro.
 * Reglas: orden web aprobada, con acceso, sin entradas ya usadas en la puerta
 * y sin crédito emitido antes. Qué hace: crea un crédito por unidad de acceso,
 * cancela esas entradas (no sirven en la puerta), devuelve el cupo al evento
 * original, etiqueta al cliente y le manda el aviso por correo. Los extras
 * (ej. Piscolón) no se tocan: siguen pendientes. */
export async function issueAccessCreditsForOrder(orderId: number, actor: { ip?: string | null } = {}) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error('No encontré esa orden.');
  if (order.paymentStatus !== 'approved') throw new Error('Solo se puede dejar crédito de una compra aprobada.');
  if (order.channel === 'caja') throw new Error('Las ventas de caja no tienen crédito de acceso.');
  if (order.missionDeposit === 1 && order.missionTopupStatus !== 'paid') {
    throw new Error('Esta compra es un abono de la Misión 300 con diferencia pendiente; resuélvela primero.');
  }

  const accessItems = await db.select({
    ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, accesoSlug: ticketTypes.accesoSlug, name: ticketTypes.name,
  }).from(orderItems).innerJoin(ticketTypes, eq(orderItems.ticketTypeId, ticketTypes.id))
    .where(and(eq(orderItems.orderId, orderId), eq(ticketTypes.category, 'acceso')));
  const usable = accessItems.filter((i) => i.accesoSlug);
  if (usable.length === 0) throw new Error('Esta orden no tiene un acceso al que dejarle crédito.');

  const accessTypeIds = usable.map((i) => i.ticketTypeId);
  const orderTickets = await db.select({ id: tickets.id, status: tickets.status }).from(tickets)
    .where(and(eq(tickets.orderId, orderId), inArray(tickets.ticketTypeId, accessTypeIds)));
  if (orderTickets.some((t) => t.status === 'used')) throw new Error('Una de las entradas ya se usó en la puerta; no se puede dejar crédito.');

  const [existing] = await db.select({ id: accessCredits.id }).from(accessCredits)
    .where(and(eq(accessCredits.originOrderId, orderId), sql`${accessCredits.status} != 'cancelled'`)).limit(1);
  if (existing) throw new Error('Ya se dejó crédito para esta orden.');

  // 1. Créditos (uno por unidad de acceso).
  const issued: Array<{ code: string; accesoName: string }> = [];
  for (const item of usable) {
    for (let i = 0; i < item.quantity; i++) {
      const code = await insertCreditWithUniqueCode(db, {
        accesoSlug: item.accesoSlug!,
        accesoName: item.name,
        buyerEmail: order.buyerEmail.trim().toLowerCase(),
        buyerName: order.buyerName,
        originOrderId: orderId,
        originEventId: order.eventId,
        note: `Dejado para otra fecha (orden ${order.orderNumber})`,
      });
      issued.push({ code, accesoName: item.name });
    }
  }

  // 2. Las entradas del acceso dejan de servir en la puerta.
  await db.update(tickets).set({ status: 'cancelled' })
    .where(and(eq(tickets.orderId, orderId), inArray(tickets.ticketTypeId, accessTypeIds), eq(tickets.status, 'valid')));

  // 3. El cupo vuelve a quedar a la venta en el evento original.
  for (const item of usable) {
    await db.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - ${item.quantity}, 0)` }).where(eq(ticketTypes.id, item.ticketTypeId));
  }

  // 4. Etiqueta en la ficha del cliente + bitácora (nunca bloquean lo anterior).
  try {
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, order.buyerEmail.trim().toLowerCase())).limit(1);
    if (customer) await addCustomerTag(customer.id, CREDIT_CUSTOMER_TAG);
  } catch (err) {
    console.error('[accessCredit] no se pudo etiquetar al cliente', err);
  }
  await recordAdminAudit({
    action: 'accessCredit.issue', targetType: 'order', targetId: orderId, eventId: order.eventId, ip: actor.ip,
    payload: { orderNumber: order.orderNumber, codes: issued.map((c) => c.code) },
  });

  // 5. Aviso por correo.
  const [event] = await db.select({ title: events.title }).from(events).where(eq(events.id, order.eventId)).limit(1);
  const emailSent = await sendCreditEmail(order.buyerEmail, order.buyerName, event?.title ?? 'la fiesta', issued, false);
  return { codes: issued, emailSent };
}

async function sendCreditEmail(to: string, buyerName: string, originEventTitle: string, credits: Array<{ code: string; accesoName: string }>, reminder: boolean): Promise<boolean> {
  try {
    const result = await sendEmail({
      to,
      subject: reminder ? 'Recuerda: tu acceso guardado te espera 🎟️' : 'Tu acceso quedó guardado para un próximo evento 🎟️',
      html: buildAccessCreditEmail({ buyerName, originEventTitle, credits, reminder }),
    });
    return Boolean(result?.success);
  } catch (err) {
    console.error('[accessCredit] no se pudo mandar el correo', err);
    return false;
  }
}

export interface AccessCreditRow {
  id: number;
  code: string;
  accesoName: string;
  buyerName: string | null;
  buyerEmail: string;
  originOrderId: number;
  originEventTitle: string | null;
  availability: CreditAvailability;
  createdAt: Date;
}

async function withAvailability(credits: AccessCredit[]): Promise<AccessCreditRow[]> {
  const db = await getDb();
  if (!db || credits.length === 0) return [];
  const orderIds = Array.from(new Set(credits.map((c) => c.usedOrderId).filter((id): id is number => id != null)));
  const eventIds = Array.from(new Set(credits.map((c) => c.originEventId)));
  const [usedOrders, eventRows] = await Promise.all([
    orderIds.length ? db.select({ id: orders.id, paymentStatus: orders.paymentStatus, createdAt: orders.createdAt }).from(orders).where(inArray(orders.id, orderIds)) : [],
    db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds)),
  ]);
  const orderById = new Map(usedOrders.map((o) => [o.id, o]));
  const eventTitle = new Map(eventRows.map((e) => [e.id, e.title]));
  return credits.map((c) => ({
    id: c.id, code: c.code, accesoName: c.accesoName, buyerName: c.buyerName, buyerEmail: c.buyerEmail,
    originOrderId: c.originOrderId, originEventTitle: eventTitle.get(c.originEventId) ?? null,
    availability: creditAvailability(c, c.usedOrderId ? orderById.get(c.usedOrderId) ?? null : null),
    createdAt: c.createdAt,
  }));
}

/** Créditos de las órdenes dadas (etiqueta en cada tarjeta de Ventas Web). Tolerante a que la tabla no exista. */
export async function listCreditsByOrderIds(orderIds: number[]): Promise<AccessCreditRow[]> {
  try {
    const db = await getDb();
    if (!db || orderIds.length === 0) return [];
    return withAvailability(await db.select().from(accessCredits).where(inArray(accessCredits.originOrderId, orderIds)).orderBy(desc(accessCredits.createdAt)));
  } catch {
    return [];
  }
}

/** Todos los créditos (disponibles primero), para la lista "Créditos pendientes". */
export async function listAccessCredits(): Promise<AccessCreditRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await withAvailability(await db.select().from(accessCredits).orderBy(desc(accessCredits.createdAt)).limit(200));
    return rows.sort((a, b) => Number(b.availability === 'available') - Number(a.availability === 'available'));
  } catch {
    return [];
  }
}

/** Reenvía el aviso (con recordatorio de la preventa) de todos los créditos aún disponibles de esa persona. */
export async function remindAccessCredit(creditId: number): Promise<{ sent: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const [credit] = await db.select().from(accessCredits).where(eq(accessCredits.id, creditId)).limit(1);
  if (!credit) throw new Error('No encontré ese crédito.');
  const mine = await withAvailability(await db.select().from(accessCredits).where(eq(accessCredits.originOrderId, credit.originOrderId)));
  const available = mine.filter((c) => c.availability === 'available');
  if (available.length === 0) throw new Error('Ese crédito ya fue usado o cancelado.');
  const sent = await sendCreditEmail(credit.buyerEmail, credit.buyerName ?? 'hola', available[0].originEventTitle ?? 'la fiesta', available.map((c) => ({ code: c.code, accesoName: c.accesoName })), true);
  return { sent };
}
