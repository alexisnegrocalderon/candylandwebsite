/** Pasar un acceso Dúo a Trío cobrando la diferencia (Ventas Web).
 *
 * Flujo: el admin crea una solicitud (`createUpgradeRequest`) con el monto a
 * cobrar y, si el monto alcanza para un link de Mercado Pago, se genera. Cuando
 * el pago llega (webhook) o el admin aprueba "Marcar como pagado",
 * `settleUpgrade` cambia la solicitud a `paid` y recién ahí `applyUpgrade`
 * convierte el acceso en Trío.
 *
 * Este archivo NO importa de ./webhooks (webhooks importa de acá): el correo de
 * confirmación posterior lo manda quien llama, ver `settleUpgradeAndNotify`. */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { events, orderItems, orders, orderUpgrades, ticketTypes, tickets, type OrderUpgrade } from '../drizzle/schema';
import { getDb, getStockPoolRemaining, recordAdminAudit } from './db';
import { createUpgradePreference } from './mercadopago';
import { buildUpgradeEmail, sendEmail } from './email';
import { checkAndAdvanceTandaIfNeeded } from './tandaAutoAdvance';
import { formatChileDate } from '../shared/chileDate';
import {
  MIN_UPGRADE_PAYMENT,
  addThirdAttendee,
  buildUpgradeReference,
  canUpgradeToTrio,
  computeUpgradeQuote,
} from '../shared/upgrade';

const MISSING_TABLE_MESSAGE =
  'Falta aplicar la migración de la base de datos (tabla orderUpgrades). Avísale a quien administra el sistema.';

function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  return e?.code === 'ER_NO_SUCH_TABLE'
    || e?.cause?.code === 'ER_NO_SUCH_TABLE'
    || /doesn't exist/i.test(String(e?.cause?.message ?? e?.message ?? ''));
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  return db;
}

export type PendingUpgradeSummary = { id: number; amount: number; createdAt: Date };

/** Solicitudes pendientes de varias órdenes de una vez, para la lista de
 * Ventas Web. Nunca rompe la lista: si la tabla todavía no existe en
 * producción (migración sin aplicar) devuelve vacío. */
export async function getPendingUpgradesByOrderIds(orderIds: number[]): Promise<Map<number, PendingUpgradeSummary>> {
  const result = new Map<number, PendingUpgradeSummary>();
  if (orderIds.length === 0) return result;
  try {
    const db = await requireDb();
    const rows = await db.select({
      id: orderUpgrades.id,
      orderId: orderUpgrades.orderId,
      amount: orderUpgrades.amount,
      createdAt: orderUpgrades.createdAt,
    }).from(orderUpgrades)
      .where(and(inArray(orderUpgrades.orderId, orderIds), eq(orderUpgrades.status, 'pending')))
      .orderBy(desc(orderUpgrades.id));
    for (const row of rows) {
      if (!result.has(row.orderId)) result.set(row.orderId, { id: row.id, amount: Number(row.amount), createdAt: row.createdAt });
    }
  } catch (error) {
    if (!isMissingTableError(error)) console.error('[OrderUpgrade] No se pudo leer las solicitudes pendientes:', error);
  }
  return result;
}

async function findPendingUpgrade(orderId: number): Promise<OrderUpgrade | null> {
  const db = await requireDb();
  try {
    const [row] = await db.select().from(orderUpgrades)
      .where(and(eq(orderUpgrades.orderId, orderId), eq(orderUpgrades.status, 'pending')))
      .orderBy(desc(orderUpgrades.id)).limit(1);
    return row ?? null;
  } catch (error) {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
  }
}

export async function getUpgradeById(upgradeId: number): Promise<OrderUpgrade | null> {
  const db = await requireDb();
  try {
    const [row] = await db.select().from(orderUpgrades).where(eq(orderUpgrades.id, upgradeId)).limit(1);
    return row ?? null;
  } catch (error) {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
  }
}

/** Todo lo que hay que saber de una orden para decidir si se puede pasar a
 * Trío. `blocked` trae el motivo en español cuando NO se puede. */
async function loadUpgradeContext(orderId: number) {
  const db = await requireDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error('Orden no encontrada');
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  const blockedWith = (blocked: string) => ({ order, event, blocked, item: null, fromType: null, toType: null, ticket: null } as const);

  if (order.paymentStatus !== 'approved') return blockedWith('La orden todavía no está aprobada.');
  if (order.missionDeposit === 1) return blockedWith('Esta compra viene de Misión 300 (abono): no se puede pasar a Trío desde acá.');

  const rows = await db.select({ item: orderItems, type: ticketTypes }).from(orderItems)
    .innerJoin(ticketTypes, eq(orderItems.ticketTypeId, ticketTypes.id))
    .where(and(eq(orderItems.orderId, order.id), eq(ticketTypes.category, 'acceso')));
  if (rows.length === 0) return blockedWith('La orden no tiene un acceso.');
  if (rows.length > 1 || rows[0].item.quantity !== 1) {
    return blockedWith('Esta orden tiene más de un acceso. Por ahora solo se puede pasar a Trío una orden con un único Dúo.');
  }
  const { item, type: fromType } = rows[0];
  if (fromType.accesoSlug === 'trio') return blockedWith('Esta orden ya es Trío.');
  if (!canUpgradeToTrio(fromType.accesoSlug)) return blockedWith('Solo se puede pasar de Dúo a Trío.');

  const [ticket] = await db.select().from(tickets).where(eq(tickets.orderItemId, item.id)).limit(1);
  if (!ticket) return blockedWith('La orden todavía no tiene ticket generado.');
  if (ticket.status !== 'valid') {
    return blockedWith(ticket.status === 'used' ? 'El ticket de esta orden ya fue usado en la puerta.' : 'El ticket de esta orden está anulado.');
  }

  // Cada tanda es una fila nueva con el mismo accesoSlug (advanceTanda): el Trío
  // destino es el que está ACTIVO hoy en este evento.
  const [toType] = await db.select().from(ticketTypes)
    .where(and(
      eq(ticketTypes.eventId, order.eventId),
      eq(ticketTypes.accesoSlug, 'trio'),
      eq(ticketTypes.category, 'acceso'),
      eq(ticketTypes.status, 'active'),
    ))
    .orderBy(desc(ticketTypes.id)).limit(1);
  if (!toType) return blockedWith('No hay un acceso Trío activo en este evento.');

  const noStock = 'No queda cupo de Trío.';
  if (toType.totalStock - toType.soldCount < 1) return blockedWith(noStock);
  // Si Dúo y Trío comparten cupo, el cambio es neutro para el pozo.
  if (toType.stockPoolId && toType.stockPoolId !== fromType.stockPoolId) {
    const pool = await getStockPoolRemaining(toType.stockPoolId);
    if (pool && pool.remaining < 1) return blockedWith(noStock);
  }

  return { order, event, blocked: null, item, fromType, toType, ticket } as const;
}

export type UpgradePreview = {
  orderId: number;
  orderNumber: string;
  buyerName: string;
  eventTitle: string;
  blockedReason: string | null;
  tableMissing: boolean;
  from: { name: string; paidUnitPrice: number } | null;
  to: { name: string; price: number } | null;
  suggestedAmount: number;
  minPayment: number;
  pending: {
    id: number;
    amount: number;
    paymentUrl: string | null;
    thirdName: string | null;
    thirdRut: string | null;
    createdAt: Date;
  } | null;
};

export async function previewUpgrade(orderId: number): Promise<UpgradePreview> {
  const ctx = await loadUpgradeContext(orderId);
  let pending: OrderUpgrade | null = null;
  let tableMissing = false;
  try {
    pending = await findPendingUpgrade(orderId);
  } catch (error) {
    if (error instanceof Error && error.message === MISSING_TABLE_MESSAGE) tableMissing = true;
    else throw error;
  }

  const from = ctx.fromType && ctx.item ? { name: ctx.fromType.name, paidUnitPrice: Number(ctx.item.unitPrice) } : null;
  const to = ctx.toType ? { name: ctx.toType.name, price: Number(ctx.toType.price) } : null;
  return {
    orderId,
    orderNumber: ctx.order.orderNumber,
    buyerName: ctx.order.buyerName,
    eventTitle: ctx.event?.title ?? '',
    blockedReason: ctx.blocked,
    tableMissing,
    from,
    to,
    suggestedAmount: from && to ? computeUpgradeQuote({ paidUnitPrice: from.paidUnitPrice, targetPrice: to.price }) : 0,
    minPayment: MIN_UPGRADE_PAYMENT,
    pending: pending ? {
      id: pending.id,
      amount: Number(pending.amount),
      paymentUrl: pending.paymentUrl,
      thirdName: pending.thirdName,
      thirdRut: pending.thirdRut,
      createdAt: pending.createdAt,
    } : null,
  };
}

/** Crea la solicitud de upgrade (y el link de Mercado Pago si el monto lo
 * permite). Si la orden ya tiene una pendiente, devuelve esa en vez de crear
 * otra: para cambiar el monto hay que cancelarla primero. */
export async function createUpgradeRequest(input: {
  orderId: number;
  amount: number;
  thirdName?: string | null;
  thirdRut?: string | null;
}): Promise<{ upgrade: OrderUpgrade; created: boolean }> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 0) throw new Error('El monto no es válido.');

  const ctx = await loadUpgradeContext(input.orderId);
  if (ctx.blocked || !ctx.fromType || !ctx.toType) throw new Error(ctx.blocked ?? 'No se puede pasar a Trío.');

  const existing = await findPendingUpgrade(input.orderId);
  if (existing) return { upgrade: existing, created: false };

  const db = await requireDb();
  const [inserted] = await db.insert(orderUpgrades).values({
    orderId: input.orderId,
    fromTicketTypeId: ctx.fromType.id,
    toTicketTypeId: ctx.toType.id,
    amount: String(amount),
    status: 'pending',
    thirdName: input.thirdName?.trim() || null,
    thirdRut: input.thirdRut?.trim() || null,
  });
  const upgradeId = (inserted as unknown as { insertId: number }).insertId;

  if (amount >= MIN_UPGRADE_PAYMENT) {
    try {
      const pref = await createUpgradePreference({
        reference: buildUpgradeReference(upgradeId),
        eventTitle: ctx.event?.title ?? '',
        amount,
        buyerEmail: ctx.order.buyerEmail,
        buyerName: ctx.order.buyerName,
        orderNumber: ctx.order.orderNumber,
      });
      await db.update(orderUpgrades)
        .set({ preferenceId: pref.id ? String(pref.id) : null, paymentUrl: pref.initPoint ?? null })
        .where(eq(orderUpgrades.id, upgradeId));
    } catch (error) {
      await db.update(orderUpgrades).set({ status: 'cancelled' }).where(eq(orderUpgrades.id, upgradeId));
      console.error('[OrderUpgrade] No se pudo crear el link de Mercado Pago:', error);
      throw new Error('No se pudo crear el link de pago de Mercado Pago. Intenta de nuevo en un momento.');
    }
  }

  const upgrade = await getUpgradeById(upgradeId);
  if (!upgrade) throw new Error('No se pudo guardar la solicitud.');
  return { upgrade, created: true };
}

export async function cancelUpgrade(upgradeId: number): Promise<{ cancelled: boolean }> {
  const db = await requireDb();
  const [res] = await db.update(orderUpgrades).set({ status: 'cancelled' })
    .where(and(eq(orderUpgrades.id, upgradeId), eq(orderUpgrades.status, 'pending')));
  return { cancelled: Number((res as unknown as { affectedRows?: number }).affectedRows ?? 0) > 0 };
}

/** Correo con el link de pago de la diferencia. */
export async function sendUpgradeRequestEmail(upgradeId: number): Promise<{ success: boolean }> {
  const upgrade = await getUpgradeById(upgradeId);
  if (!upgrade) throw new Error('Solicitud no encontrada');
  if (upgrade.status !== 'pending') throw new Error('Esta solicitud ya no está pendiente.');
  if (!upgrade.paymentUrl) throw new Error('Esta solicitud no tiene link de pago (el monto es menor al mínimo de Mercado Pago).');

  const db = await requireDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, upgrade.orderId)).limit(1);
  if (!order) throw new Error('Orden no encontrada');
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);

  // Un link relativo (modo sin token de Mercado Pago) no sirve en un correo.
  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';
  const paymentUrl = upgrade.paymentUrl.startsWith('http') ? upgrade.paymentUrl : `${baseUrl}${upgrade.paymentUrl}`;

  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `Suma a una tercera persona a tu acceso - ${event?.title ?? ''}`,
    html: buildUpgradeEmail({
      buyerName: order.buyerName,
      eventTitle: event?.title ?? '',
      eventDate: event ? formatChileDate(new Date(event.eventDate), { withYear: true }) : '',
      orderNumber: order.orderNumber,
      amount: Number(upgrade.amount),
      paymentUrl,
    }),
  });
  return { success: !!result?.success };
}

/** Convierte el acceso en Trío. SOLO lo corre quien ganó el paso de la
 * solicitud a `paid` (ver settleUpgrade), así nunca se aplica dos veces.
 *
 * Todo lo que toca plata, stock y tickets va en UNA transacción: o se aplica
 * entero o no se aplica nada. El QR no cambia (solo lleva el código del
 * ticket): se cambia el tipo del ticket y de su línea de la orden, no se
 * genera ninguno nuevo. Si al llegar el pago ya no queda cupo de Trío igual se
 * aplica -- ya está cobrado, y es mejor sobrevender uno que dejar a alguien
 * pagado sin su tercera entrada. */
async function applyUpgrade(upgradeId: number, ctx: { method: string; ip?: string | null }) {
  const db = await requireDb();
  const upgrade = await getUpgradeById(upgradeId);
  if (!upgrade) throw new Error('Solicitud no encontrada');
  const amount = Number(upgrade.amount);

  const applied = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, upgrade.orderId)).limit(1);
    if (!order) throw new Error('Orden no encontrada');

    const [item] = await tx.select().from(orderItems)
      .where(and(eq(orderItems.orderId, order.id), eq(orderItems.ticketTypeId, upgrade.fromTicketTypeId))).limit(1);
    if (!item) {
      const [already] = await tx.select({ id: orderItems.id }).from(orderItems)
        .where(and(eq(orderItems.orderId, order.id), eq(orderItems.ticketTypeId, upgrade.toTicketTypeId))).limit(1);
      if (already) return { order, already: true as const };
      throw new Error('No se encontró el acceso Dúo de esta orden.');
    }

    const [toType] = await tx.select().from(ticketTypes).where(eq(ticketTypes.id, upgrade.toTicketTypeId)).limit(1);
    if (!toType) throw new Error('El acceso Trío de destino ya no existe.');
    const [ticket] = await tx.select().from(tickets).where(eq(tickets.orderItemId, item.id)).limit(1);
    if (!ticket) throw new Error('No se encontró el ticket de esta orden.');

    const newUnitPrice = Number(item.unitPrice) + amount;
    await tx.update(orderItems).set({
      ticketTypeId: toType.id,
      unitPrice: String(newUnitPrice),
      totalPrice: String(Number(item.totalPrice) + amount),
      // La utilidad de la venta se calcula con el costo del producto vendido.
      ...(toType.costPrice != null ? { unitCost: toType.costPrice } : {}),
    }).where(eq(orderItems.id, item.id));

    await tx.update(tickets).set({
      ticketTypeId: toType.id,
      ...(ticket.groupSize != null ? { groupSize: 3 } : {}),
    }).where(eq(tickets.id, ticket.id));

    await tx.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - 1, 0)` }).where(eq(ticketTypes.id, upgrade.fromTicketTypeId));
    await tx.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, toType.id));

    await tx.update(orders).set({
      subtotal: String(Number(order.subtotal) + amount),
      total: String(Number(order.total) + amount),
      attendeeData: addThirdAttendee(order.attendeeData, { name: upgrade.thirdName, rut: upgrade.thirdRut }),
    }).where(eq(orders.id, order.id));

    if (toType.totalStock - toType.soldCount < 1) {
      console.warn(`[OrderUpgrade] Upgrade ${upgradeId} aplicado sin cupo de Trío (orden ${order.orderNumber}): ya estaba cobrado.`);
    }
    return { order, already: false as const, fromTicketTypeId: upgrade.fromTicketTypeId, toTicketTypeId: toType.id, ticketCode: ticket.ticketCode };
  });

  if (!applied.already) {
    await recordAdminAudit({
      action: 'orders.upgradeToTrio',
      targetType: 'order',
      targetId: upgrade.orderId,
      eventId: applied.order.eventId,
      payload: {
        upgradeId,
        orderNumber: applied.order.orderNumber,
        amount,
        method: ctx.method,
        paymentId: upgrade.paymentId,
        fromTicketTypeId: applied.fromTicketTypeId,
        toTicketTypeId: applied.toTicketTypeId,
        ticketCode: applied.ticketCode,
      },
      ip: ctx.ip ?? null,
    });
    // Puede ser justo el Trío que agota el cupo de la tanda vigente.
    await checkAndAdvanceTandaIfNeeded(applied.order.eventId);
  }
  return { orderNumber: applied.order.orderNumber, orderId: applied.order.id };
}

/** Marca la solicitud como pagada y aplica el upgrade, exactamente una vez:
 * el `UPDATE ... WHERE status IN (...)` solo cambia la fila para UNA llamada,
 * así que dos webhooks repetidos, o "Marcar como pagado" a la vez que llega el
 * pago real, no duplican plata ni stock.
 *
 * `allowFromCancelled`: un pago aprobado de Mercado Pago SIEMPRE se aplica,
 * aunque el admin haya cancelado la solicitud (el cliente pudo pagar con el
 * link viejo): la plata ya entró. "Marcar como pagado" a mano solo parte de
 * `pending`. */
export async function settleUpgrade(upgradeId: number, opts: {
  method: 'mercadopago' | 'manual';
  paymentId?: string | null;
  allowFromCancelled?: boolean;
  ip?: string | null;
}): Promise<{ applied: false; reason: 'already-settled' } | { applied: true; orderNumber: string; orderId: number }> {
  const db = await requireDb();
  const allowedFrom: ('pending' | 'cancelled')[] = opts.allowFromCancelled ? ['pending', 'cancelled'] : ['pending'];
  let affected = 0;
  try {
    const [res] = await db.update(orderUpgrades).set({
      status: 'paid',
      method: opts.method,
      paymentId: opts.paymentId ?? null,
      paidAt: new Date(),
    }).where(and(eq(orderUpgrades.id, upgradeId), inArray(orderUpgrades.status, allowedFrom)));
    affected = Number((res as unknown as { affectedRows?: number }).affectedRows ?? 0);
  } catch (error) {
    if (isMissingTableError(error)) throw new Error(MISSING_TABLE_MESSAGE);
    throw error;
  }
  if (affected === 0) return { applied: false, reason: 'already-settled' };

  try {
    const out = await applyUpgrade(upgradeId, { method: opts.method, ip: opts.ip });
    return { applied: true, ...out };
  } catch (error) {
    // La transacción se deshizo entera: vuelve a pendiente (conservando el
    // paymentId como evidencia) para que se pueda reintentar con "Marcar como
    // pagado" sin que el cliente tenga que pagar otra vez.
    console.error(`[OrderUpgrade] Falló aplicar el upgrade ${upgradeId}; vuelve a pendiente:`, error);
    await db.update(orderUpgrades).set({ status: 'pending', method: null, paidAt: null }).where(eq(orderUpgrades.id, upgradeId));
    throw error;
  }
}
