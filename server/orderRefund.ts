/* Devolución de una compra web desde Admin → Ventas Web (política de
 * reembolso: 50% del valor pagado hasta 5 días antes del evento; las reglas
 * puras viven en shared/orderRefund.ts).
 *
 * Solo REGISTRA la devolución: la plata la devuelve el dueño a mano por
 * Mercado Pago. La orden pasa a `refunded` con refundAmount/refundPercent, de
 * modo que el ingreso que cuenta es lo retenido (total - refundAmount), ver
 * cashCollectedFromOrders en shared/expenses.ts. Una anulación de caja
 * (server/caja/voidSale.ts) también deja la orden en `refunded`, pero sin
 * refundAmount: ahí no se retiene nada. */
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  accessCredits, ambassadorCommissions, communityCodes, customers, discountCodes, events, orderItems, orders,
  playcoinsLedger, prepaidLedger, ticketTypes, tickets,
} from '../drizzle/schema';
import { adjustPlaycoinsManually, getDb, recordAdminAudit } from './db';
import { buildExtrasRefundEmail, buildOrderRefundEmail, sendEmail } from './email';
import { isPastRefundDeadline, planExtrasRefund, refundAmountForPercent, refundPercentForAmount, REFUND_DEADLINE_DAYS } from '../shared/orderRefund';

export interface RefundOrderInput {
  orderId: number;
  /** Porcentaje del total pagado. Se ignora si viene `amount`. */
  percent?: number;
  /** Monto en pesos corregido a mano (el dueño decide la base). */
  amount?: number;
  reason?: string;
  /** Saltarse el plazo de la política (requiere clave de admin en el router). */
  overrideDeadline?: boolean;
  ip?: string | null;
}

/** Lo que el cliente pagó de verdad: `total` más el copago de Misión 300. */
function paidOf(order: { total: unknown; missionTopupStatus: string; missionTopupAmount: unknown }): number {
  return Number(order.total) + (order.missionTopupStatus === 'paid' ? Number(order.missionTopupAmount ?? 0) : 0);
}

export async function refundOrder(input: RefundOrderInput) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');

  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new Error('No encontré esa orden.');
  if (order.paymentStatus !== 'approved') throw new Error('Solo se puede devolver una compra aprobada.');
  if (order.channel !== 'web') throw new Error('Solo las compras web se devuelven acá; las de caja se anulan desde la caja.');
  if (order.missionDeposit === 1 && order.missionTopupStatus !== 'paid') {
    throw new Error('Esta compra es un abono de la Misión 300 con diferencia pendiente; resuélvela primero.');
  }

  const [event] = await db.select({ title: events.title, eventDate: events.eventDate }).from(events).where(eq(events.id, order.eventId)).limit(1);
  if (!event) throw new Error('No encontré el evento de esta compra.');
  if (!input.overrideDeadline && isPastRefundDeadline(event.eventDate)) {
    throw new Error(`Faltan menos de ${REFUND_DEADLINE_DAYS} días para el evento: fuera del plazo de devolución. Puedes saltarte el plazo marcando la casilla.`);
  }

  if (Number(order.refundAmount ?? 0) > 0) throw new Error('A esta compra ya se le devolvieron algunos extras; no se puede devolver también completa desde acá.');
  const paid = paidOf(order);
  if (paid <= 0) throw new Error('Esta compra no tiene monto pagado para devolver.');
  const refundAmount = input.amount != null ? Math.round(input.amount) : refundAmountForPercent(paid, input.percent ?? 0);
  if (!(refundAmount > 0)) throw new Error('El monto a devolver debe ser mayor a $0.');
  if (refundAmount > paid) throw new Error('No puedes devolver más de lo que pagó el cliente.');
  const refundPercent = input.amount != null ? refundPercentForAmount(paid, refundAmount) : Math.min(100, Math.max(0, input.percent ?? 0));

  const orderTickets = await db.select({ id: tickets.id, status: tickets.status }).from(tickets).where(eq(tickets.orderId, order.id));
  if (orderTickets.some((t) => t.status === 'used')) throw new Error('Una de las entradas ya se usó en la puerta; no se puede devolver.');

  const [credit] = await db.select({ id: accessCredits.id }).from(accessCredits)
    .where(and(eq(accessCredits.originOrderId, order.id), sql`${accessCredits.status} != 'cancelled'`)).limit(1);
  if (credit) throw new Error('A esta compra ya se le dejó un crédito para otra fecha; no se puede devolver también.');

  const [prepaid] = await db.select({ id: prepaidLedger.id }).from(prepaidLedger).where(eq(prepaidLedger.orderId, order.id)).limit(1);
  if (prepaid) throw new Error('Esta compra movió saldo PlayCard (recarga); no se devuelve desde acá.');

  const reason = (input.reason ?? '').trim().slice(0, 500) || null;

  // UPDATE condicional: si se aprieta dos veces (o desde dos pantallas) solo
  // una pasa de approved a refunded y las demás no revierten nada.
  const [updateResult] = await db.update(orders).set({
    paymentStatus: 'refunded',
    refundAmount: String(refundAmount),
    refundPercent: String(refundPercent),
    refundReason: reason,
    refundedAt: new Date(),
  }).where(and(eq(orders.id, order.id), eq(orders.paymentStatus, 'approved')));
  if ((updateResult as { affectedRows?: number } | undefined)?.affectedRows === 0) {
    throw new Error('Esta compra ya había sido devuelta.');
  }

  // Entradas: ya no sirven en la puerta. El cupo vuelve a la venta.
  await db.update(tickets).set({ status: 'cancelled' }).where(and(eq(tickets.orderId, order.id), eq(tickets.status, 'valid')));
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  for (const item of items) {
    await db.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - ${item.quantity}, 0)` }).where(eq(ticketTypes.id, item.ticketTypeId));
  }

  // Comisión de embajador: la venta se devolvió, no se paga.
  const commissions = await db.select({ id: ambassadorCommissions.id, amount: ambassadorCommissions.commissionAmount })
    .from(ambassadorCommissions).where(eq(ambassadorCommissions.orderId, order.id));
  if (commissions.length > 0) await db.delete(ambassadorCommissions).where(eq(ambassadorCommissions.orderId, order.id));

  // Los códigos usados vuelven a quedar disponibles.
  if (order.discountCodeId) {
    await db.update(discountCodes).set({ usedCount: sql`GREATEST(usedCount - 1, 0)` }).where(eq(discountCodes.id, order.discountCodeId));
  }
  if (order.communityCodeId) {
    await db.update(communityCodes).set({ usedCount: sql`GREATEST(usedCount - 1, 0)` }).where(eq(communityCodes.id, order.communityCodeId));
  }

  // Playcoins ganados con esta compra se revierten con un ajuste nuevo.
  try {
    const earned = await db.select().from(playcoinsLedger).where(eq(playcoinsLedger.orderId, order.id));
    for (const row of earned) {
      if (row.delta !== 0) await adjustPlaycoinsManually(row.customerId, -row.delta, `Orden #${order.orderNumber} devuelta`);
    }
    const email = order.buyerEmail.trim().toLowerCase();
    const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (customer) {
      await db.update(customers).set({
        totalSpent: String(Math.max(0, Number(customer.totalSpent) - refundAmount)),
      }).where(eq(customers.id, customer.id));
    }
  } catch (err) {
    console.error('[orderRefund] no se pudieron ajustar playcoins/cliente', err);
  }

  await recordAdminAudit({
    action: 'order.refund', targetType: 'order', targetId: order.id, eventId: order.eventId, ip: input.ip,
    payload: {
      orderNumber: order.orderNumber, paid, refundAmount, refundPercent, reason,
      overrideDeadline: Boolean(input.overrideDeadline),
      commissionRemoved: commissions.map((c) => Number(c.amount)),
    },
  });

  const emailSent = await sendRefundEmail({
    to: order.buyerEmail, buyerName: order.buyerName, eventTitle: event.title, orderNumber: order.orderNumber, paid, refundAmount, refundPercent,
  });
  return { refundAmount, refundPercent, retained: paid - refundAmount, emailSent };
}

async function sendRefundEmail(data: Parameters<typeof buildOrderRefundEmail>[0] & { to: string }): Promise<boolean> {
  try {
    const { to, ...rest } = data;
    const result = await sendEmail({ to, subject: 'Registramos la devolución de tu compra 💸', html: buildOrderRefundEmail(rest) });
    return Boolean(result?.success);
  } catch (err) {
    console.error('[orderRefund] no se pudo mandar el correo', err);
    return false;
  }
}

/* ─── Devolver solo los EXTRAS de una compra (el acceso no se toca) ─────────── */

/** Los extras canjeables de la compra (ticket con código legible), con lo que se pagó por cada uno. */
export async function listOrderExtras(orderId: number) {
  const db = await getDb();
  if (!db) return { order: null, extras: [] as { id: number; displayCode: string | null; name: string; status: string; unitPrice: number }[] };
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { order: null, extras: [] };
  const rows = await db.select({
    id: tickets.id, displayCode: tickets.displayCode, status: tickets.status,
    name: ticketTypes.name, unitPrice: orderItems.unitPrice,
  }).from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .leftJoin(orderItems, eq(tickets.orderItemId, orderItems.id))
    .where(eq(tickets.orderId, orderId));
  const extras = rows
    .filter((r) => !!r.displayCode)
    .map((r) => ({ id: r.id, displayCode: r.displayCode, name: r.name, status: r.status, unitPrice: Number(r.unitPrice ?? 0) }));
  const paid = paidOf(order);
  return {
    order: { orderNumber: order.orderNumber, buyerName: order.buyerName, paymentStatus: order.paymentStatus, paid, alreadyRefunded: Number(order.refundAmount ?? 0) },
    extras,
  };
}

export async function refundOrderExtras(input: { orderId: number; ticketIds: number[]; amount?: number; reason?: string; ip?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');

  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new Error('No encontré esa orden.');
  if (order.paymentStatus !== 'approved') throw new Error('Solo se pueden devolver extras de una compra aprobada.');
  if (order.channel !== 'web') throw new Error('Solo las compras web se devuelven acá; las de caja se anulan desde la caja.');

  const { extras } = await listOrderExtras(order.id);
  const paid = paidOf(order);
  const plan = planExtrasRefund({
    paid,
    alreadyRefunded: Number(order.refundAmount ?? 0),
    tickets: extras.map((e) => ({ id: e.id, status: e.status, displayCode: e.displayCode, unitPrice: e.unitPrice })),
    selectedIds: input.ticketIds,
    amount: input.amount,
  });
  if (!plan.ok) throw new Error(plan.error);

  // Se anula de a uno con UPDATE condicional: si alguien canjea ese trago en la
  // caja justo ahora, se deshace lo anulado y no se devuelve nada.
  const cancelled: number[] = [];
  for (const id of plan.ticketIds) {
    const [res] = await db.update(tickets).set({ status: 'cancelled' }).where(and(eq(tickets.id, id), eq(tickets.status, 'valid')));
    if ((res as { affectedRows?: number } | undefined)?.affectedRows === 0) {
      if (cancelled.length > 0) await db.update(tickets).set({ status: 'valid' }).where(inArray(tickets.id, cancelled));
      throw new Error('Uno de los extras se canjeó o anuló mientras tanto; no se devolvió nada. Recarga y revisa.');
    }
    cancelled.push(id);
  }

  // El cupo de esos extras vuelve a la venta.
  const chosen = extras.filter((e) => cancelled.includes(e.id));
  const typeRows = await db.select({ id: tickets.id, ticketTypeId: tickets.ticketTypeId }).from(tickets).where(inArray(tickets.id, cancelled));
  const perType = new Map<number, number>();
  for (const t of typeRows) perType.set(t.ticketTypeId, (perType.get(t.ticketTypeId) ?? 0) + 1);
  for (const [ticketTypeId, qty] of Array.from(perType.entries())) {
    await db.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - ${qty}, 0)` }).where(eq(ticketTypes.id, ticketTypeId));
  }

  const names = chosen.map((e) => e.name);
  const reasonText = (input.reason ?? '').trim().slice(0, 300);
  const note = `Extras devueltos: ${names.join(', ')}${reasonText ? ` — ${reasonText}` : ''}`;
  const previousReason = (order.refundReason ?? '').trim();
  await db.update(orders).set({
    refundAmount: String(plan.newRefundTotal),
    refundPercent: String(plan.percent),
    refundReason: (previousReason ? `${previousReason} | ${note}` : note).slice(0, 500),
    refundedAt: new Date(),
  }).where(eq(orders.id, order.id));

  // El gasto acumulado del cliente y los Playcoins que esa parte generó.
  try {
    const email = order.buyerEmail.trim().toLowerCase();
    const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (customer) {
      await db.update(customers).set({ totalSpent: String(Math.max(0, Number(customer.totalSpent) - plan.amount)) }).where(eq(customers.id, customer.id));
      const earned = await db.select().from(playcoinsLedger).where(and(eq(playcoinsLedger.orderId, order.id), eq(playcoinsLedger.reason, 'earn_web')));
      const share = paid > 0 ? plan.amount / paid : 0;
      for (const row of earned) {
        const back = Math.round(row.delta * share);
        if (back > 0) await adjustPlaycoinsManually(row.customerId, -back, `Extras de la orden #${order.orderNumber} devueltos`);
      }
    }
  } catch (err) {
    console.error('[orderRefund] no se pudieron ajustar playcoins/cliente (extras)', err);
  }

  const [event] = await db.select({ title: events.title }).from(events).where(eq(events.id, order.eventId)).limit(1);
  await recordAdminAudit({
    action: 'order.refundExtras', targetType: 'order', targetId: order.id, eventId: order.eventId, ip: input.ip,
    payload: { orderNumber: order.orderNumber, tickets: chosen.map((e) => ({ id: e.id, code: e.displayCode, name: e.name })), refundAmount: plan.amount, computed: plan.computed, reason: reasonText || null },
  });

  let emailSent = false;
  try {
    const result = await sendEmail({
      to: order.buyerEmail,
      subject: 'Registramos la devolución de tus extras 💸',
      html: buildExtrasRefundEmail({ buyerName: order.buyerName, eventTitle: event?.title ?? 'tu evento', orderNumber: order.orderNumber, extras: names, refundAmount: plan.amount }),
    });
    emailSent = Boolean(result?.success);
  } catch (err) {
    console.error('[orderRefund] no se pudo mandar el correo de extras', err);
  }
  return { refundAmount: plan.amount, cancelled: cancelled.length, totalRefunded: plan.newRefundTotal, emailSent };
}
