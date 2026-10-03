/** Agregar un extra (estacionamiento, piscolas...) a una compra YA hecha, con su
 * propio link de pago (Ventas Web).
 *
 * Flujo: se crea una solicitud (`createAddonRequest`) con el extra y la cantidad;
 * el monto sale SIEMPRE del precio de la base de datos y, si alcanza para un link
 * de Mercado Pago, se genera. Cuando el pago llega (webhook) o el admin aprueba
 * "Marcar como pagado", `settleAddon` pasa la solicitud a `paid` y recién ahí
 * `applyAddon` agrega el extra a la orden: una línea nueva, sus tickets con QR y
 * código de canje, el stock y el total.
 *
 * Este archivo NO importa de ./webhooks (webhooks importa de acá): la confirmación
 * posterior la manda quien llama, ver `settleAddonAndNotify`. Tampoco reutiliza
 * `processApprovedOrder`: esa función también reparte Playcoins, comisiones y
 * puntos de embajador, que no deben repetirse por un extra suelto. */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { customers, events, orderAddons, orderItems, orders, ticketTypes, tickets, type OrderAddon } from '../drizzle/schema';
import { getDb, getStockPoolRemaining, recordAdminAudit } from './db';
import { createAddonPreference } from './mercadopago';
import { buildAddonEmail, sendEmail } from './email';
import { generateTicketQR } from './qr';
import { generateDisplayCode, fallbackInternalCode } from './caja/displayCode';
import { checkAndAdvanceTandaIfNeeded } from './tandaAutoAdvance';
import { formatChileDate } from '../shared/chileDate';
import { isAnyParkingTicketType } from '../shared/parking';
import {
  MIN_ADDON_PAYMENT,
  addonAmount,
  buildAddonReference,
  isSellableAddon,
  maxAddonQuantity,
} from '../shared/addon';

const MISSING_SCHEMA_MESSAGE =
  'Falta aplicar una migración de la base de datos (tabla orderAddons). Avísale a quien administra el sistema.';

/** La tabla `orderAddons` todavía no existe en la base: pasa si se despliega el
 * código antes de aplicar la migración. */
function isMissingSchemaError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  return code === 'ER_NO_SUCH_TABLE'
    || code === 'ER_BAD_FIELD_ERROR'
    || /doesn't exist|unknown column/i.test(String(e?.cause?.message ?? e?.message ?? ''));
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  return db;
}

export type PendingAddonsSummary = { count: number; amount: number; names: string[] };

/** Solicitudes pendientes de varias órdenes de una vez, para la lista de Ventas
 * Web. Nunca rompe la lista: si la tabla todavía no existe devuelve vacío. */
export async function getPendingAddonsByOrderIds(orderIds: number[]): Promise<Map<number, PendingAddonsSummary>> {
  const result = new Map<number, PendingAddonsSummary>();
  if (orderIds.length === 0) return result;
  try {
    const db = await requireDb();
    const rows = await db.select({
      orderId: orderAddons.orderId,
      amount: orderAddons.amount,
      name: ticketTypes.name,
    }).from(orderAddons)
      .leftJoin(ticketTypes, eq(orderAddons.ticketTypeId, ticketTypes.id))
      .where(and(inArray(orderAddons.orderId, orderIds), eq(orderAddons.status, 'pending')));
    for (const row of rows) {
      const entry = result.get(row.orderId) ?? { count: 0, amount: 0, names: [] };
      entry.count += 1;
      entry.amount += Number(row.amount);
      if (row.name) entry.names.push(row.name);
      result.set(row.orderId, entry);
    }
  } catch (error) {
    if (!isMissingSchemaError(error)) console.error('[OrderAddon] No se pudo leer los extras pendientes:', error);
  }
  return result;
}

export async function getAddonById(addonId: number): Promise<OrderAddon | null> {
  const db = await requireDb();
  try {
    const [row] = await db.select().from(orderAddons).where(eq(orderAddons.id, addonId)).limit(1);
    return row ?? null;
  } catch (error) {
    if (isMissingSchemaError(error)) throw new Error(MISSING_SCHEMA_MESSAGE);
    throw error;
  }
}

async function findPendingAddon(orderId: number, ticketTypeId: number): Promise<OrderAddon | null> {
  const db = await requireDb();
  try {
    const [row] = await db.select().from(orderAddons)
      .where(and(eq(orderAddons.orderId, orderId), eq(orderAddons.ticketTypeId, ticketTypeId), eq(orderAddons.status, 'pending')))
      .orderBy(desc(orderAddons.id)).limit(1);
    return row ?? null;
  } catch (error) {
    if (isMissingSchemaError(error)) throw new Error(MISSING_SCHEMA_MESSAGE);
    throw error;
  }
}

export type AddonOption = {
  ticketTypeId: number;
  name: string;
  price: number;
  /** Cuántas unidades quedan a la venta (el menor entre el tipo y su cupo compartido). */
  remaining: number;
  /** Cuántas se pueden pedir en una solicitud (el estacionamiento, una). */
  maxQuantity: number;
  /** Si no se puede pedir, el motivo en español. */
  disabledReason: string | null;
};

/** Todo lo que hay que saber de una orden para decidir si se le puede agregar un
 * extra, y cuáles. `blocked` trae el motivo en español cuando NO se puede. */
async function loadAddonContext(orderId: number) {
  const db = await requireDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error('Orden no encontrada');
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  const blockedWith = (blocked: string) => ({ order, event, blocked, options: [] as AddonOption[] } as const);

  if (order.channel === 'caja') return blockedWith('Solo se pueden agregar extras a compras web.');
  if (order.paymentStatus !== 'approved') return blockedWith('La orden todavía no está aprobada.');
  if (order.missionDeposit === 1) return blockedWith('Esta compra viene de Misión 300 (abono): no se le pueden agregar extras desde acá.');
  if (event && (event.status === 'past' || event.status === 'cancelled')) return blockedWith('El evento ya pasó o fue cancelado.');

  const extras = (await db.select().from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, order.eventId), eq(ticketTypes.category, 'extra'), eq(ticketTypes.status, 'active')))
    .orderBy(ticketTypes.price))
    .filter((t) => isSellableAddon(t));
  if (extras.length === 0) return blockedWith('Este evento no tiene extras a la venta.');

  // ¿La orden ya tiene un auto? Un auto es un auto (VIP incluido).
  const owned = await db.select({ name: ticketTypes.name }).from(tickets)
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .where(and(eq(tickets.orderId, order.id), eq(ticketTypes.category, 'extra'), inArray(tickets.status, ['valid', 'used'])));
  const hasParking = owned.some((o) => isAnyParkingTicketType(o.name));

  const poolRemaining = new Map<number, number>();
  const options: AddonOption[] = [];
  for (const t of extras) {
    let remaining = t.totalStock - t.soldCount;
    if (t.stockPoolId) {
      if (!poolRemaining.has(t.stockPoolId)) {
        const pool = await getStockPoolRemaining(t.stockPoolId);
        poolRemaining.set(t.stockPoolId, pool ? pool.remaining : Number.POSITIVE_INFINITY);
      }
      remaining = Math.min(remaining, poolRemaining.get(t.stockPoolId)!);
    }
    remaining = Math.max(0, remaining);
    const maxQuantity = maxAddonQuantity(t.name, remaining);
    const disabledReason = isAnyParkingTicketType(t.name) && hasParking
      ? 'Esta compra ya tiene estacionamiento.'
      : maxQuantity === 0
        ? 'Sin cupo.'
        : Number(t.price) <= 0
          ? 'Este extra no tiene precio.'
          : null;
    options.push({ ticketTypeId: t.id, name: t.name, price: Number(t.price), remaining, maxQuantity, disabledReason });
  }
  return { order, event, blocked: null, options } as const;
}

export type PendingAddonView = {
  id: number;
  ticketTypeId: number;
  name: string;
  quantity: number;
  amount: number;
  paymentUrl: string | null;
  createdAt: Date;
};

export type AddonPreview = {
  orderId: number;
  orderNumber: string;
  buyerName: string;
  eventTitle: string;
  blockedReason: string | null;
  tableMissing: boolean;
  options: AddonOption[];
  minPayment: number;
  pending: PendingAddonView[];
};

export async function previewAddons(orderId: number): Promise<AddonPreview> {
  const ctx = await loadAddonContext(orderId);
  const db = await requireDb();
  let pending: PendingAddonView[] = [];
  let tableMissing = false;
  try {
    const rows = await db.select({
      id: orderAddons.id,
      ticketTypeId: orderAddons.ticketTypeId,
      name: ticketTypes.name,
      quantity: orderAddons.quantity,
      amount: orderAddons.amount,
      paymentUrl: orderAddons.paymentUrl,
      createdAt: orderAddons.createdAt,
    }).from(orderAddons)
      .leftJoin(ticketTypes, eq(orderAddons.ticketTypeId, ticketTypes.id))
      .where(and(eq(orderAddons.orderId, orderId), eq(orderAddons.status, 'pending')))
      .orderBy(desc(orderAddons.id));
    pending = rows.map((r) => ({
      id: r.id, ticketTypeId: r.ticketTypeId, name: r.name ?? 'Extra', quantity: r.quantity,
      amount: Number(r.amount), paymentUrl: r.paymentUrl, createdAt: r.createdAt,
    }));
  } catch (error) {
    if (isMissingSchemaError(error)) tableMissing = true;
    else throw error;
  }
  return {
    orderId,
    orderNumber: ctx.order.orderNumber,
    buyerName: ctx.order.buyerName,
    eventTitle: ctx.event?.title ?? '',
    blockedReason: ctx.blocked,
    tableMissing,
    options: ctx.options,
    minPayment: MIN_ADDON_PAYMENT,
    pending,
  };
}

/** Autoservicio: de qué orden es un ticket. El código del ticket (el del link
 * del QR) ya es la prueba de posesión, igual que en la recarga de la PlayCard.
 * Un ticket anulado no sirve; que la orden esté aprobada lo revisa
 * `loadAddonContext`. */
export async function orderIdFromTicketCode(ticketCode: string): Promise<number | null> {
  const db = await requireDb();
  const [ticket] = await db.select({ orderId: tickets.orderId, status: tickets.status }).from(tickets)
    .where(eq(tickets.ticketCode, ticketCode)).limit(1);
  if (!ticket || ticket.status === 'cancelled') return null;
  return ticket.orderId;
}

export type CustomerAddonView = {
  available: boolean;
  eventTitle: string;
  options: { ticketTypeId: number; name: string; price: number; maxQuantity: number; disabledReason: string | null }[];
  pending: { id: number; name: string; quantity: number; amount: number; paymentUrl: string }[];
};

/** Lo que ve el cliente en su ticket: los extras que puede agregar y sus pagos
 * pendientes (para retomarlos). Nunca expone cuánto stock queda, y si por
 * cualquier motivo no se puede (evento pasado, compra de caja, migración sin
 * aplicar...) responde `available: false` sin dar el motivo interno. */
export async function customerAddonView(orderId: number): Promise<CustomerAddonView> {
  const p = await previewAddons(orderId);
  if (p.tableMissing || p.blockedReason) return { available: false, eventTitle: p.eventTitle, options: [], pending: [] };
  return {
    available: true,
    eventTitle: p.eventTitle,
    options: p.options.map((o) => ({
      ticketTypeId: o.ticketTypeId, name: o.name, price: o.price, maxQuantity: o.maxQuantity, disabledReason: o.disabledReason,
    })),
    pending: p.pending
      .filter((a): a is typeof a & { paymentUrl: string } => !!a.paymentUrl)
      .map((a) => ({ id: a.id, name: a.name, quantity: a.quantity, amount: a.amount, paymentUrl: a.paymentUrl })),
  };
}

/** Crea la solicitud de agregar un extra (y el link de Mercado Pago si el monto
 * lo permite). El extra y la cantidad se validan contra lo que esa orden
 * realmente puede pedir, y el monto es SIEMPRE precio de la base de datos por
 * cantidad: lo que mande el cliente nunca decide cuánto se cobra. Si ya hay una
 * solicitud pendiente del mismo extra en la orden, devuelve esa en vez de crear
 * otra (evita el doble cobro). */
export async function createAddonRequest(input: {
  orderId: number;
  ticketTypeId: number;
  quantity: number;
  source?: 'admin' | 'customer';
  /** Ruta a la que vuelve el cliente tras pagar (solo autoservicio). */
  returnPath?: string;
}): Promise<{ addon: OrderAddon; created: boolean }> {
  const quantity = Math.floor(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 1) throw new Error('La cantidad no es válida.');

  const ctx = await loadAddonContext(input.orderId);
  if (ctx.blocked) throw new Error(ctx.blocked);
  const option = ctx.options.find((o) => o.ticketTypeId === input.ticketTypeId);
  if (!option) throw new Error('Ese extra no está disponible para esta compra.');
  if (option.disabledReason) throw new Error(option.disabledReason);
  if (quantity > option.maxQuantity) {
    throw new Error(option.maxQuantity === 1 ? 'Solo se puede pedir una unidad de este extra.' : `Máximo ${option.maxQuantity} unidades de este extra.`);
  }

  const amount = addonAmount(option.price, quantity);
  if (amount <= 0) throw new Error('Este extra no tiene precio.');
  // El cliente solo puede pagar con link: sin él la solicitud no sirve de nada.
  if (input.source === 'customer' && amount < MIN_ADDON_PAYMENT) {
    throw new Error('Este extra no se puede pagar por acá. Escríbenos por WhatsApp o Instagram y te ayudamos.');
  }

  // Ya hay una solicitud pendiente del mismo extra: si pide lo mismo se devuelve
  // esa (evita el doble cobro); si cambió la cantidad, la nueva reemplaza a la
  // vieja -- la vieja queda cancelada, y si igual se paga con su link, el pago se
  // aplica (la plata entró).
  const existing = await findPendingAddon(input.orderId, option.ticketTypeId);
  if (existing) {
    if (existing.quantity === quantity) return { addon: existing, created: false };
    await cancelAddon(existing.id);
  }

  const db = await requireDb();
  const [inserted] = await db.insert(orderAddons).values({
    orderId: input.orderId,
    ticketTypeId: option.ticketTypeId,
    quantity,
    amount: String(amount),
    status: 'pending',
    source: input.source ?? 'admin',
  });
  const addonId = (inserted as unknown as { insertId: number }).insertId;

  if (amount >= MIN_ADDON_PAYMENT) {
    try {
      const pref = await createAddonPreference({
        reference: buildAddonReference(addonId),
        eventTitle: ctx.event?.title ?? '',
        itemName: option.name,
        quantity,
        amount,
        buyerEmail: ctx.order.buyerEmail,
        buyerName: ctx.order.buyerName,
        orderNumber: ctx.order.orderNumber,
        returnPath: input.returnPath,
      });
      await db.update(orderAddons)
        .set({ preferenceId: pref.id ? String(pref.id) : null, paymentUrl: pref.initPoint ?? null })
        .where(eq(orderAddons.id, addonId));
    } catch (error) {
      await db.update(orderAddons).set({ status: 'cancelled' }).where(eq(orderAddons.id, addonId));
      console.error('[OrderAddon] No se pudo crear el link de Mercado Pago:', error);
      throw new Error('No se pudo crear el link de pago de Mercado Pago. Intenta de nuevo en un momento.');
    }
  }

  const addon = await getAddonById(addonId);
  if (!addon) throw new Error('No se pudo guardar la solicitud.');
  return { addon, created: true };
}

export async function cancelAddon(addonId: number): Promise<{ cancelled: boolean }> {
  const db = await requireDb();
  const [res] = await db.update(orderAddons).set({ status: 'cancelled' })
    .where(and(eq(orderAddons.id, addonId), eq(orderAddons.status, 'pending')));
  return { cancelled: Number((res as unknown as { affectedRows?: number }).affectedRows ?? 0) > 0 };
}

/** Correo con el link de pago del extra. */
export async function sendAddonRequestEmail(addonId: number): Promise<{ success: boolean }> {
  const addon = await getAddonById(addonId);
  if (!addon) throw new Error('Solicitud no encontrada');
  if (addon.status !== 'pending') throw new Error('Esta solicitud ya no está pendiente.');
  if (!addon.paymentUrl) throw new Error('Esta solicitud no tiene link de pago (el monto es menor al mínimo de Mercado Pago).');

  const db = await requireDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, addon.orderId)).limit(1);
  if (!order) throw new Error('Orden no encontrada');
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, addon.ticketTypeId)).limit(1);

  // Un link relativo (modo sin token de Mercado Pago) no sirve en un correo.
  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';
  const paymentUrl = addon.paymentUrl.startsWith('http') ? addon.paymentUrl : `${baseUrl}${addon.paymentUrl}`;

  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `Agrega ${type?.name ?? 'un extra'} a tu compra - ${event?.title ?? ''}`,
    html: buildAddonEmail({
      buyerName: order.buyerName,
      eventTitle: event?.title ?? '',
      eventDate: event ? formatChileDate(new Date(event.eventDate), { withYear: true }) : '',
      orderNumber: order.orderNumber,
      itemName: type?.name ?? 'Extra',
      quantity: addon.quantity,
      amount: Number(addon.amount),
      paymentUrl,
    }),
  });
  return { success: !!result?.success };
}

/** Agrega el extra a la orden. SOLO lo corre quien ganó el paso de la solicitud a
 * `paid` (ver settleAddon), así nunca se aplica dos veces.
 *
 * Lo que toca plata, stock y tickets va en UNA transacción: o se aplica entero o
 * no se aplica nada. Los QR se preparan ANTES de abrirla (no necesitan la base).
 * Si al llegar el pago ya no queda cupo igual se aplica -- ya está cobrado, y es
 * mejor sobrevender una unidad que dejar a alguien pagado sin su extra. */
async function applyAddon(addonId: number, ctx: { method: string; ip?: string | null }) {
  const db = await requireDb();
  const addon = await getAddonById(addonId);
  if (!addon) throw new Error('Solicitud no encontrada');
  const amount = Number(addon.amount);

  const [order] = await db.select().from(orders).where(eq(orders.id, addon.orderId)).limit(1);
  if (!order) throw new Error('Orden no encontrada');
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  const [type] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, addon.ticketTypeId)).limit(1);
  if (!event || !type) throw new Error('El evento o el extra de esta solicitud ya no existe.');

  const prefix = type.internalCode || fallbackInternalCode(type.name);
  const newTickets: { ticketCode: string; qrData: string; qrImageUrl: string; displayCode: string }[] = [];
  for (let i = 0; i < addon.quantity; i++) {
    const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
    const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
    newTickets.push({ ticketCode, qrData, qrImageUrl, displayCode: generateDisplayCode(prefix) });
  }

  const unitPrice = Math.round(amount / addon.quantity);
  await db.transaction(async (tx) => {
    const [orderNow] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (!orderNow) throw new Error('Orden no encontrada');

    const [item] = await tx.insert(orderItems).values({
      orderId: order.id,
      ticketTypeId: type.id,
      quantity: addon.quantity,
      unitPrice: String(unitPrice),
      totalPrice: String(amount),
      // La utilidad de la venta se calcula con el costo del producto vendido.
      ...(type.costPrice != null ? { unitCost: type.costPrice } : {}),
    });
    const orderItemId = (item as unknown as { insertId: number }).insertId;

    for (const t of newTickets) {
      await tx.insert(tickets).values({
        ticketCode: t.ticketCode,
        orderId: order.id,
        orderItemId,
        eventId: order.eventId,
        ticketTypeId: type.id,
        holderName: order.buyerName,
        qrData: t.qrData,
        qrImageUrl: t.qrImageUrl,
        status: 'valid',
        displayCode: t.displayCode,
      });
    }

    await tx.update(ticketTypes).set({ soldCount: sql`soldCount + ${addon.quantity}` }).where(eq(ticketTypes.id, type.id));
    await tx.update(orders).set({
      subtotal: String(Number(orderNow.subtotal) + amount),
      total: String(Number(orderNow.total) + amount),
    }).where(eq(orders.id, order.id));

    if (type.totalStock - type.soldCount < addon.quantity) {
      console.warn(`[OrderAddon] Extra ${addonId} aplicado sin cupo suficiente (orden ${order.orderNumber}): ya estaba cobrado.`);
    }
  });

  await recordAdminAudit({
    action: 'orders.addAddon',
    targetType: 'order',
    targetId: order.id,
    eventId: order.eventId,
    payload: {
      addonId,
      orderNumber: order.orderNumber,
      ticketTypeId: type.id,
      name: type.name,
      quantity: addon.quantity,
      amount,
      method: ctx.method,
      paymentId: addon.paymentId,
      source: addon.source,
      ticketCodes: newTickets.map((t) => t.ticketCode),
    },
    ip: ctx.ip ?? null,
  });

  // La ficha del cliente lleva cuánto ha gastado: se actualiza, pero un fallo acá
  // nunca deshace el extra ya aplicado.
  try {
    const email = order.buyerEmail.trim().toLowerCase();
    const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (customer) {
      await db.update(customers).set({ totalSpent: String(Number(customer.totalSpent) + amount) }).where(eq(customers.id, customer.id));
    }
  } catch (error) {
    console.error('[OrderAddon] No se pudo actualizar la ficha del cliente:', error);
  }

  // Puede ser justo el extra que agota un cupo ligado a la tanda vigente.
  await checkAndAdvanceTandaIfNeeded(order.eventId);
  return { orderNumber: order.orderNumber, orderId: order.id };
}

/** Marca la solicitud como pagada y agrega el extra, exactamente una vez: el
 * `UPDATE ... WHERE status IN (...)` solo cambia la fila para UNA llamada, así que
 * dos webhooks repetidos, o "Marcar como pagado" a la vez que llega el pago real,
 * no duplican plata, stock ni tickets.
 *
 * `allowFromCancelled`: un pago aprobado de Mercado Pago SIEMPRE se aplica, aunque
 * el admin haya cancelado la solicitud (el cliente pudo pagar con el link viejo):
 * la plata ya entró. "Marcar como pagado" a mano solo parte de `pending`. */
export async function settleAddon(addonId: number, opts: {
  method: 'mercadopago' | 'manual';
  paymentId?: string | null;
  allowFromCancelled?: boolean;
  ip?: string | null;
}): Promise<{ applied: false; reason: 'already-settled' } | { applied: true; orderNumber: string; orderId: number }> {
  const db = await requireDb();
  const allowedFrom: ('pending' | 'cancelled')[] = opts.allowFromCancelled ? ['pending', 'cancelled'] : ['pending'];
  let affected = 0;
  try {
    const [res] = await db.update(orderAddons).set({
      status: 'paid',
      method: opts.method,
      paymentId: opts.paymentId ?? null,
      paidAt: new Date(),
    }).where(and(eq(orderAddons.id, addonId), inArray(orderAddons.status, allowedFrom)));
    affected = Number((res as unknown as { affectedRows?: number }).affectedRows ?? 0);
  } catch (error) {
    if (isMissingSchemaError(error)) throw new Error(MISSING_SCHEMA_MESSAGE);
    throw error;
  }
  if (affected === 0) return { applied: false, reason: 'already-settled' };

  try {
    const out = await applyAddon(addonId, { method: opts.method, ip: opts.ip });
    return { applied: true, ...out };
  } catch (error) {
    // La transacción se deshizo entera: vuelve a pendiente (conservando el
    // paymentId como evidencia) para poder reintentar con "Marcar como pagado" sin
    // que el cliente tenga que pagar otra vez.
    console.error(`[OrderAddon] Falló agregar el extra ${addonId}; vuelve a pendiente:`, error);
    await db.update(orderAddons).set({ status: 'pending', method: null, paidAt: null }).where(eq(orderAddons.id, addonId));
    throw error;
  }
}
