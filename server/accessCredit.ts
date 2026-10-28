/* Crédito de acceso: dejar el acceso de una fiesta que no pueden usar vigente
 * para un evento futuro (shared/accessCredit.ts explica el modelo). Acá vive la
 * parte con base de datos del lado del admin: emitir, listar y recordar. El
 * canje en el checkout está en server/db.ts (createOrder). */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { accessCredits, customers, events, orderItems, orders, ticketTypes, tickets, type AccessCredit } from '../drizzle/schema';
import { addCustomerTag, getDb, recordAdminAudit } from './db';
import { buildAccessCreditEmail, buildGiftPassEmail, sendEmail } from './email';
import { pushToEmail } from './customerPush';
import { ANY_ACCESS_SLUG, creditAvailability, generateCreditCode, giftNote, parseGiftNote, type CreditAvailability } from '../shared/accessCredit';
import { ensureCustomerIdForEmail } from './db';

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
  // Solo los de esa misma persona: los premios de la tarjeta de sellos comparten `originOrderId = 0`.
  const mine = await withAvailability(await db.select().from(accessCredits).where(and(eq(accessCredits.originOrderId, credit.originOrderId), eq(accessCredits.buyerEmail, credit.buyerEmail))));
  const available = mine.filter((c) => c.availability === 'available');
  if (available.length === 0) throw new Error('Ese crédito ya fue usado o cancelado.');
  const sent = await sendCreditEmail(credit.buyerEmail, credit.buyerName ?? 'hola', available[0].originEventTitle ?? 'la fiesta', available.map((c) => ({ code: c.code, accesoName: c.accesoName })), true);
  return { sent };
}

/* ── Pases de entrada regalados ─────────────────────────────────────────── */

/** Regala un pase de entrada: UN acceso fijo (`accesoSlug`) o «a elección» (`'*'`), solo para un evento y con vencimiento
 * opcional. Es un crédito de acceso (mismo canje del checkout, con todos sus pasos) con los datos del regalo en `note`.
 * Aparece en la zona Cupones de la persona y le llega un aviso al celular y por correo. */
export async function issueGiftPass(params: {
  email: string; name?: string | null; eventId: number; accesoSlug: string; accesoName?: string; validUntil: Date | null; reason?: string | null; actor: string; ip?: string | null;
}): Promise<{ code: string; creditId: number; emailSent: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const [event] = await db.select().from(events).where(eq(events.id, params.eventId)).limit(1);
  if (!event) throw new Error('Evento no encontrado');
  const email = params.email.trim().toLowerCase();

  let accesoName = 'Acceso a tu elección';
  if (params.accesoSlug !== ANY_ACCESS_SLUG) {
    const [tt] = await db.select({ name: ticketTypes.name }).from(ticketTypes)
      .where(and(eq(ticketTypes.eventId, event.id), eq(ticketTypes.category, 'acceso'), eq(ticketTypes.accesoSlug, params.accesoSlug))).limit(1);
    if (!tt) throw new Error('Ese acceso no existe en este evento.');
    accesoName = params.accesoName ?? tt.name;
  }

  const customerId = await ensureCustomerIdForEmail(email, params.name ?? null);
  const code = await insertCreditWithUniqueCode(db, {
    accesoSlug: params.accesoSlug,
    accesoName,
    buyerEmail: email,
    buyerName: params.name ?? null,
    originOrderId: 0,
    originEventId: event.id,
    note: giftNote({ eventId: event.id, eventTitle: event.title, validUntil: params.validUntil ? params.validUntil.toISOString() : null, reason: params.reason ?? null, by: params.actor }),
  });
  const [row] = await db.select({ id: accessCredits.id }).from(accessCredits).where(eq(accessCredits.code, code)).limit(1);
  void customerId;
  await recordAdminAudit({
    action: 'accessCredit.gift', targetType: 'event', targetId: event.id, eventId: event.id, ip: params.ip ?? null,
    payload: { by: params.actor, email, code, accesoSlug: params.accesoSlug, validUntil: params.validUntil, reason: params.reason ?? null },
  });

  const base = process.env.PUBLIC_SITE_URL || 'https://mansionplayroom.cl';
  const url = `${base.replace(/\/$/, '')}/checkout/${event.slug}?code=${encodeURIComponent(code)}`;
  void pushToEmail(email, { title: '🎁 ¡Te regalaron un pase!', body: `${accesoName} para ${event.title}. Míralo en tu cuenta, en Cupones.`, url: '/cuenta' }).catch(() => {});
  let emailSent = false;
  try {
    const result = await sendEmail({
      to: email,
      subject: `🎁 Te regalaron un pase para ${event.title}`,
      html: buildGiftPassEmail({
        buyerName: params.name?.trim() || email.split('@')[0], eventTitle: event.title, accesoName, code, url,
        validUntilText: params.validUntil ? params.validUntil.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long' }) : null,
        reason: params.reason ?? null,
      }),
    });
    emailSent = Boolean(result?.success);
  } catch (err) {
    console.error('[accessCredit] no se pudo mandar el correo del pase', err);
  }
  return { code, creditId: row?.id ?? 0, emailSent };
}

/** Anula un pase regalado que nadie ha usado (deja de aparecer en Cupones y no se puede canjear). */
export async function cancelGiftPass(creditId: number, actor: { by: string; ip?: string | null }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const [credit] = await db.select().from(accessCredits).where(eq(accessCredits.id, creditId)).limit(1);
  if (!credit || !parseGiftNote(credit.note)) throw new Error('No encontré ese pase.');
  const order = credit.usedOrderId ? (await db.select({ paymentStatus: orders.paymentStatus, createdAt: orders.createdAt }).from(orders).where(eq(orders.id, credit.usedOrderId)).limit(1))[0] ?? null : null;
  const state = creditAvailability(credit, order);
  if (state === 'used') throw new Error('Este pase ya se usó: no se puede anular.');
  if (state === 'cancelled') return;
  await db.update(accessCredits).set({ status: 'cancelled' }).where(eq(accessCredits.id, creditId));
  await recordAdminAudit({ action: 'accessCredit.giftCancel', targetType: 'accessCredit', targetId: creditId, eventId: credit.originEventId, ip: actor.ip ?? null, payload: { by: actor.by, code: credit.code } });
}

export interface GiftPassRow extends AccessCreditRow { eventId: number; eventTitle: string | null; validUntil: string | null; reason: string | null; by: string | null }

/** Los pases regalados de un evento (más nuevos primero), con su estado. */
export async function listGiftPasses(eventId: number): Promise<GiftPassRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(accessCredits).where(and(eq(accessCredits.originEventId, eventId), eq(accessCredits.originOrderId, 0))).orderBy(desc(accessCredits.createdAt)).limit(300);
    const gifts = rows.filter((r) => parseGiftNote(r.note));
    const base = await withAvailability(gifts);
    return base.map((b) => {
      const meta = parseGiftNote(gifts.find((g) => g.id === b.id)?.note)!;
      return { ...b, eventId: meta.eventId, eventTitle: meta.eventTitle, validUntil: meta.validUntil, reason: meta.reason, by: meta.by };
    });
  } catch {
    return [];
  }
}

export interface MyGiftPass { id: number; code: string; accesoName: string; anyAccess: boolean; eventId: number; eventTitle: string | null; eventSlug: string | null; validUntil: string | null; reason: string | null }

/** Los pases regalados que esta persona todavía puede canjear (para su zona Cupones). */
export async function listMyGiftPasses(email: string): Promise<MyGiftPass[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(accessCredits)
      .where(and(eq(accessCredits.buyerEmail, email.trim().toLowerCase()), eq(accessCredits.originOrderId, 0), inArray(accessCredits.status, ['available', 'reserved'])))
      .orderBy(desc(accessCredits.createdAt)).limit(40);
    const gifts = rows.filter((r) => parseGiftNote(r.note));
    if (gifts.length === 0) return [];
    const withState = await withAvailability(gifts);
    const eventIds = Array.from(new Set(gifts.map((g) => parseGiftNote(g.note)!.eventId)));
    const eventRows = await db.select({ id: events.id, slug: events.slug, title: events.title }).from(events).where(inArray(events.id, eventIds));
    const eventById = new Map(eventRows.map((e) => [e.id, e]));
    return withState.filter((w) => w.availability === 'available').map((w) => {
      const meta = parseGiftNote(gifts.find((g) => g.id === w.id)?.note)!;
      const ev = eventById.get(meta.eventId);
      return { id: w.id, code: w.code, accesoName: w.accesoName, anyAccess: gifts.find((g) => g.id === w.id)?.accesoSlug === ANY_ACCESS_SLUG, eventId: meta.eventId, eventTitle: ev?.title ?? meta.eventTitle, eventSlug: ev?.slug ?? null, validUntil: meta.validUntil, reason: meta.reason };
    });
  } catch {
    return [];
  }
}
