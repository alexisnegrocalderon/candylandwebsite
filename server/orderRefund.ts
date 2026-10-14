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
import { buildOrderRefundEmail, sendEmail } from './email';
import { isPastRefundDeadline, refundAmountForPercent, refundPercentForAmount, REFUND_DEADLINE_DAYS } from '../shared/orderRefund';

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
