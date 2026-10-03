/** Subir un acceso ya comprado a otro más caro, cobrando la diferencia (Ventas
 * Web).
 *
 * Flujo: el admin elige el acceso nuevo y crea una solicitud
 * (`createUpgradeRequest`) con el monto a cobrar y, si alcanza para un link de
 * Mercado Pago, se genera. Cuando el pago llega (webhook) o el admin aprueba
 * "Marcar como pagado", `settleUpgrade` cambia la solicitud a `paid` y recién ahí
 * `applyUpgrade` convierte el acceso en el nuevo.
 *
 * Este archivo NO importa de ./webhooks (webhooks importa de acá): el correo de
 * confirmación posterior lo manda quien llama, ver `settleUpgradeAndNotify`. */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { customers, events, orderItems, orders, orderUpgrades, ticketTypes, tickets, type OrderUpgrade } from '../drizzle/schema';
import { getDb, getStockPoolRemaining, recordAdminAudit } from './db';
import { createUpgradePreference } from './mercadopago';
import { buildUpgradeEmail, sendEmail } from './email';
import { checkAndAdvanceTandaIfNeeded } from './tandaAutoAdvance';
import { formatChileDate } from '../shared/chileDate';
import { personasForAccesoSlug } from '../shared/mission300';
import {
  MIN_UPGRADE_PAYMENT,
  UPGRADE_BLOCKED_SOURCE_SLUGS,
  applyAttendeePatch,
  buildUpgradeReference,
  computeUpgradeQuote,
  isEligibleUpgradeTarget,
  legacyThirdToPeople,
  missingAttendeeSlots,
  sanitizeUpgradePeople,
  type MissingSlot,
  type NewPerson,
  type NewPersonInput,
} from '../shared/upgrade';

type TicketTypeRow = typeof ticketTypes.$inferSelect;

const MISSING_SCHEMA_MESSAGE =
  'Falta aplicar una migración de la base de datos (tabla orderUpgrades). Avísale a quien administra el sistema.';

/** La tabla `orderUpgrades` (o su columna `extraData`) todavía no existe en la
 * base: pasa si se despliega el código antes de aplicar la migración. */
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

/** Una columna JSON llega como objeto con MySQL/TiDB, pero como texto en las
 * bases que la guardan como LONGTEXT (MariaDB): se acepta cualquiera de las dos. */
function jsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function camposOf(attendeeData: string | null | undefined): Record<string, unknown> {
  try {
    const campos = attendeeData ? JSON.parse(attendeeData)?.campos : null;
    return campos && typeof campos === 'object' && !Array.isArray(campos) ? campos : {};
  } catch {
    return {};
  }
}

/** Personas nuevas de una solicitud: `extraData.people`, o -- en las solicitudes
 * viejas de Dúo→Trío -- `thirdName`/`thirdRut`. */
function peopleOf(upgrade: OrderUpgrade): NewPerson[] {
  const extra = jsonValue(upgrade.extraData) as { people?: unknown } | null;
  if (extra && Array.isArray(extra.people)) return extra.people as NewPerson[];
  return legacyThirdToPeople(upgrade.thirdName, upgrade.thirdRut);
}

export type PendingUpgradeSummary = { id: number; amount: number; createdAt: Date; toName: string | null };

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
      toName: ticketTypes.name,
    }).from(orderUpgrades)
      .leftJoin(ticketTypes, eq(orderUpgrades.toTicketTypeId, ticketTypes.id))
      .where(and(inArray(orderUpgrades.orderId, orderIds), eq(orderUpgrades.status, 'pending')))
      .orderBy(desc(orderUpgrades.id));
    for (const row of rows) {
      if (!result.has(row.orderId)) {
        result.set(row.orderId, { id: row.id, amount: Number(row.amount), createdAt: row.createdAt, toName: row.toName ?? null });
      }
    }
  } catch (error) {
    if (!isMissingSchemaError(error)) console.error('[OrderUpgrade] No se pudo leer las solicitudes pendientes:', error);
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
    if (isMissingSchemaError(error)) throw new Error(MISSING_SCHEMA_MESSAGE);
    throw error;
  }
}

export async function getUpgradeById(upgradeId: number): Promise<OrderUpgrade | null> {
  const db = await requireDb();
  try {
    const [row] = await db.select().from(orderUpgrades).where(eq(orderUpgrades.id, upgradeId)).limit(1);
    return row ?? null;
  } catch (error) {
    if (isMissingSchemaError(error)) throw new Error(MISSING_SCHEMA_MESSAGE);
    throw error;
  }
}

type UpgradeTarget = {
  type: TicketTypeRow;
  personas: number;
  suggestedAmount: number;
  missing: MissingSlot[];
};

/** Todo lo que hay que saber de una orden para decidir si se puede subir de
 * acceso, y a cuáles. `blocked` trae el motivo en español cuando NO se puede. */
async function loadUpgradeContext(orderId: number) {
  const db = await requireDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error('Orden no encontrada');
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  const blockedWith = (blocked: string) =>
    ({ order, event, blocked, item: null, fromType: null, ticket: null, targets: [] as UpgradeTarget[] } as const);

  if (order.paymentStatus !== 'approved') return blockedWith('La orden todavía no está aprobada.');
  if (order.missionDeposit === 1) return blockedWith('Esta compra viene de Misión 300 (abono): no se puede subir de acceso desde acá.');
  if (event && (event.status === 'past' || event.status === 'cancelled')) return blockedWith('El evento ya pasó o fue cancelado.');

  const rows = await db.select({ item: orderItems, type: ticketTypes }).from(orderItems)
    .innerJoin(ticketTypes, eq(orderItems.ticketTypeId, ticketTypes.id))
    .where(and(eq(orderItems.orderId, order.id), eq(ticketTypes.category, 'acceso')));
  if (rows.length === 0) return blockedWith('La orden no tiene un acceso.');
  if (rows.length > 1 || rows[0].item.quantity !== 1) {
    return blockedWith('Esta orden tiene más de un acceso. Por ahora solo se puede subir de acceso una orden con un único acceso.');
  }
  const { item, type: fromType } = rows[0];
  const fromSlug = fromType.accesoSlug;
  if (!fromSlug || UPGRADE_BLOCKED_SOURCE_SLUGS.includes(fromSlug)) {
    return blockedWith('Este tipo de acceso no se puede cambiar por otro.');
  }

  const [ticket] = await db.select().from(tickets).where(eq(tickets.orderItemId, item.id)).limit(1);
  if (!ticket) return blockedWith('La orden todavía no tiene ticket generado.');
  if (ticket.status !== 'valid') {
    return blockedWith(ticket.status === 'used' ? 'El ticket de esta orden ya fue usado en la puerta.' : 'El ticket de esta orden está anulado.');
  }
  // Las invitaciones instantáneas llevan un `groupSize` fijo en vez de un
  // acceso con personas definidas: cambiarles el tipo las dejaría descuadradas.
  if (ticket.groupSize != null) return blockedWith('Esta entrada es una invitación especial: no se puede subir de acceso.');

  // Cada tanda es una fila nueva con el mismo accesoSlug (advanceTanda): de cada
  // tipo de acceso el destino es la fila ACTIVA de hoy en este evento.
  const active = await db.select().from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, order.eventId), eq(ticketTypes.category, 'acceso'), eq(ticketTypes.status, 'active')))
    .orderBy(desc(ticketTypes.id));
  const newestBySlug = new Map<string, TicketTypeRow>();
  for (const t of active) if (t.accesoSlug && !newestBySlug.has(t.accesoSlug)) newestBySlug.set(t.accesoSlug, t);

  const campos = camposOf(order.attendeeData);
  const poolRemaining = new Map<number, number>();
  const targets: UpgradeTarget[] = [];
  for (const t of Array.from(newestBySlug.values())) {
    if (!isEligibleUpgradeTarget({ slug: fromSlug, paidUnitPrice: Number(item.unitPrice) }, { slug: t.accesoSlug, price: Number(t.price) })) continue;
    if (t.totalStock - t.soldCount < 1) continue;
    // Si origen y destino comparten cupo, el cambio es neutro para el pozo.
    if (t.stockPoolId && t.stockPoolId !== fromType.stockPoolId) {
      if (!poolRemaining.has(t.stockPoolId)) {
        const pool = await getStockPoolRemaining(t.stockPoolId);
        poolRemaining.set(t.stockPoolId, pool ? pool.remaining : Number.POSITIVE_INFINITY);
      }
      if ((poolRemaining.get(t.stockPoolId) ?? 0) < 1) continue;
    }
    targets.push({
      type: t,
      personas: personasForAccesoSlug(t.accesoSlug),
      suggestedAmount: computeUpgradeQuote({ paidUnitPrice: Number(item.unitPrice), targetPrice: Number(t.price) }),
      missing: missingAttendeeSlots(t.accesoSlug, campos),
    });
  }
  targets.sort((a, b) => Number(a.type.price) - Number(b.type.price));
  if (targets.length === 0) return { ...blockedWith('No hay un acceso superior disponible para esta compra (más caro, con cupo y con igual o más personas).'), item, fromType, ticket };

  return { order, event, blocked: null, item, fromType, ticket, targets } as const;
}

export type UpgradeOption = {
  ticketTypeId: number;
  name: string;
  slug: string;
  price: number;
  personas: number;
  suggestedAmount: number;
  missing: MissingSlot[];
};

export type UpgradePreview = {
  orderId: number;
  orderNumber: string;
  buyerName: string;
  eventTitle: string;
  blockedReason: string | null;
  tableMissing: boolean;
  from: { name: string; slug: string | null; personas: number; paidUnitPrice: number } | null;
  options: UpgradeOption[];
  minPayment: number;
  pending: {
    id: number;
    amount: number;
    paymentUrl: string | null;
    fromName: string | null;
    toName: string | null;
    people: NewPerson[];
    /** Datos de personas que seguirían faltando después del cambio. */
    stillMissing: MissingSlot[];
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
    if (error instanceof Error && error.message === MISSING_SCHEMA_MESSAGE) tableMissing = true;
    else throw error;
  }

  let pendingView: UpgradePreview['pending'] = null;
  if (pending) {
    const db = await requireDb();
    const types = await db.select().from(ticketTypes).where(inArray(ticketTypes.id, [pending.fromTicketTypeId, pending.toTicketTypeId]));
    const fromT = types.find((t) => t.id === pending!.fromTicketTypeId);
    const toT = types.find((t) => t.id === pending!.toTicketTypeId);
    const people = peopleOf(pending);
    const patched = toT?.accesoSlug
      ? camposOf(applyAttendeePatch(ctx.order.attendeeData, people, { name: toT.name, slug: toT.accesoSlug }))
      : camposOf(ctx.order.attendeeData);
    pendingView = {
      id: pending.id,
      amount: Number(pending.amount),
      paymentUrl: pending.paymentUrl,
      fromName: fromT?.name ?? null,
      toName: toT?.name ?? null,
      people,
      stillMissing: missingAttendeeSlots(toT?.accesoSlug, patched),
      createdAt: pending.createdAt,
    };
  }

  return {
    orderId,
    orderNumber: ctx.order.orderNumber,
    buyerName: ctx.order.buyerName,
    eventTitle: ctx.event?.title ?? '',
    blockedReason: ctx.blocked,
    tableMissing,
    from: ctx.fromType && ctx.item
      ? { name: ctx.fromType.name, slug: ctx.fromType.accesoSlug, personas: personasForAccesoSlug(ctx.fromType.accesoSlug), paidUnitPrice: Number(ctx.item.unitPrice) }
      : null,
    options: ctx.targets.map((t) => ({
      ticketTypeId: t.type.id,
      name: t.type.name,
      slug: t.type.accesoSlug ?? '',
      price: Number(t.type.price),
      personas: t.personas,
      suggestedAmount: t.suggestedAmount,
      missing: t.missing,
    })),
    minPayment: MIN_UPGRADE_PAYMENT,
    pending: pendingView,
  };
}

/** Crea la solicitud de subir de acceso (y el link de Mercado Pago si el monto
 * lo permite). Si la orden ya tiene una pendiente, devuelve esa en vez de crear
 * otra: para cambiar el monto o el destino hay que cancelarla primero. Todo se
 * valida acá: el destino debe estar entre los elegibles de esta orden. */
export async function createUpgradeRequest(input: {
  orderId: number;
  toTicketTypeId: number;
  amount: number;
  people?: NewPersonInput[];
}): Promise<{ upgrade: OrderUpgrade; created: boolean }> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 0) throw new Error('El monto no es válido.');

  const ctx = await loadUpgradeContext(input.orderId);
  if (ctx.blocked || !ctx.fromType) throw new Error(ctx.blocked ?? 'No se puede subir de acceso.');
  const target = ctx.targets.find((t) => t.type.id === input.toTicketTypeId);
  if (!target) throw new Error('Ese acceso no está disponible para esta compra.');

  const existing = await findPendingUpgrade(input.orderId);
  if (existing) return { upgrade: existing, created: false };

  const { people, errors } = sanitizeUpgradePeople(input.people, target.missing);
  if (errors.length > 0) throw new Error(errors.join(' '));

  const db = await requireDb();
  const [inserted] = await db.insert(orderUpgrades).values({
    orderId: input.orderId,
    fromTicketTypeId: ctx.fromType.id,
    toTicketTypeId: target.type.id,
    amount: String(amount),
    status: 'pending',
    extraData: { people },
  });
  const upgradeId = (inserted as unknown as { insertId: number }).insertId;

  if (amount >= MIN_UPGRADE_PAYMENT) {
    try {
      const pref = await createUpgradePreference({
        reference: buildUpgradeReference(upgradeId),
        eventTitle: ctx.event?.title ?? '',
        toName: target.type.name,
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
  const types = await db.select().from(ticketTypes).where(inArray(ticketTypes.id, [upgrade.fromTicketTypeId, upgrade.toTicketTypeId]));
  const fromT = types.find((t) => t.id === upgrade.fromTicketTypeId);
  const toT = types.find((t) => t.id === upgrade.toTicketTypeId);

  const patched = toT?.accesoSlug
    ? camposOf(applyAttendeePatch(order.attendeeData, peopleOf(upgrade), { name: toT.name, slug: toT.accesoSlug }))
    : camposOf(order.attendeeData);
  const needsData = missingAttendeeSlots(toT?.accesoSlug, patched).length > 0;

  // Un link relativo (modo sin token de Mercado Pago) no sirve en un correo.
  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';
  const paymentUrl = upgrade.paymentUrl.startsWith('http') ? upgrade.paymentUrl : `${baseUrl}${upgrade.paymentUrl}`;

  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `Sube tu acceso a ${toT?.name ?? 'un acceso mayor'} - ${event?.title ?? ''}`,
    html: buildUpgradeEmail({
      buyerName: order.buyerName,
      eventTitle: event?.title ?? '',
      eventDate: event ? formatChileDate(new Date(event.eventDate), { withYear: true }) : '',
      orderNumber: order.orderNumber,
      amount: Number(upgrade.amount),
      paymentUrl,
      fromName: fromT?.name ?? 'tu acceso',
      toName: toT?.name ?? 'un acceso mayor',
      needsData,
    }),
  });
  return { success: !!result?.success };
}

/** Convierte el acceso en el nuevo. SOLO lo corre quien ganó el paso de la
 * solicitud a `paid` (ver settleUpgrade), así nunca se aplica dos veces.
 *
 * Todo lo que toca plata, stock y tickets va en UNA transacción: o se aplica
 * entero o no se aplica nada. El QR no cambia (solo lleva el código del
 * ticket): se cambia el tipo del ticket y de su línea de la orden, no se
 * genera ninguno nuevo. Si al llegar el pago ya no queda cupo igual se aplica
 * -- ya está cobrado, y es mejor sobrevender uno que dejar a alguien pagado
 * sin su acceso. */
async function applyUpgrade(upgradeId: number, ctx: { method: string; ip?: string | null }) {
  const db = await requireDb();
  const upgrade = await getUpgradeById(upgradeId);
  if (!upgrade) throw new Error('Solicitud no encontrada');
  const amount = Number(upgrade.amount);
  const people = peopleOf(upgrade);

  const applied = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, upgrade.orderId)).limit(1);
    if (!order) throw new Error('Orden no encontrada');

    const [item] = await tx.select().from(orderItems)
      .where(and(eq(orderItems.orderId, order.id), eq(orderItems.ticketTypeId, upgrade.fromTicketTypeId))).limit(1);
    if (!item) {
      const [already] = await tx.select({ id: orderItems.id }).from(orderItems)
        .where(and(eq(orderItems.orderId, order.id), eq(orderItems.ticketTypeId, upgrade.toTicketTypeId))).limit(1);
      if (already) return { order, already: true as const };
      throw new Error('No se encontró el acceso original de esta orden.');
    }

    const [toType] = await tx.select().from(ticketTypes).where(eq(ticketTypes.id, upgrade.toTicketTypeId)).limit(1);
    if (!toType) throw new Error('El acceso de destino ya no existe.');
    const [fromType] = await tx.select().from(ticketTypes).where(eq(ticketTypes.id, upgrade.fromTicketTypeId)).limit(1);
    const [ticket] = await tx.select().from(tickets).where(eq(tickets.orderItemId, item.id)).limit(1);
    if (!ticket) throw new Error('No se encontró el ticket de esta orden.');

    await tx.update(orderItems).set({
      ticketTypeId: toType.id,
      unitPrice: String(Number(item.unitPrice) + amount),
      totalPrice: String(Number(item.totalPrice) + amount),
      // La utilidad de la venta se calcula con el costo del producto vendido.
      ...(toType.costPrice != null ? { unitCost: toType.costPrice } : {}),
    }).where(eq(orderItems.id, item.id));

    await tx.update(tickets).set({ ticketTypeId: toType.id }).where(eq(tickets.id, ticket.id));

    await tx.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - 1, 0)` }).where(eq(ticketTypes.id, upgrade.fromTicketTypeId));
    await tx.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, toType.id));

    await tx.update(orders).set({
      subtotal: String(Number(order.subtotal) + amount),
      total: String(Number(order.total) + amount),
      attendeeData: applyAttendeePatch(order.attendeeData, people, { name: toType.name, slug: toType.accesoSlug ?? '' }),
    }).where(eq(orders.id, order.id));

    if (toType.totalStock - toType.soldCount < 1) {
      console.warn(`[OrderUpgrade] Upgrade ${upgradeId} aplicado sin cupo (orden ${order.orderNumber}): ya estaba cobrado.`);
    }
    return {
      order,
      already: false as const,
      fromName: fromType?.name ?? null,
      toName: toType.name,
      toSlug: toType.accesoSlug,
      ticketCode: ticket.ticketCode,
    };
  });

  if (!applied.already) {
    await recordAdminAudit({
      action: 'orders.upgradeAccess',
      targetType: 'order',
      targetId: upgrade.orderId,
      eventId: applied.order.eventId,
      payload: {
        upgradeId,
        orderNumber: applied.order.orderNumber,
        amount,
        method: ctx.method,
        paymentId: upgrade.paymentId,
        fromTicketTypeId: upgrade.fromTicketTypeId,
        toTicketTypeId: upgrade.toTicketTypeId,
        fromName: applied.fromName,
        toName: applied.toName,
        ticketCode: applied.ticketCode,
      },
      ip: ctx.ip ?? null,
    });

    // La ficha del cliente guarda los tipos de acceso que ha tenido y cuánto ha
    // gastado: se actualiza, pero un fallo acá nunca deshace el upgrade.
    try {
      const email = applied.order.buyerEmail.trim().toLowerCase();
      const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
      if (customer) {
        const stored = jsonValue(customer.accessTypes);
        const existing = Array.isArray(stored) ? (stored as string[]) : [];
        await db.update(customers).set({
          accessTypes: applied.toSlug ? Array.from(new Set([...existing, applied.toSlug])) : existing,
          totalSpent: String(Number(customer.totalSpent) + amount),
        }).where(eq(customers.id, customer.id));
      }
    } catch (error) {
      console.error('[OrderUpgrade] No se pudo actualizar la ficha del cliente:', error);
    }

    // Puede ser justo el acceso que agota el cupo de la tanda vigente.
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
    if (isMissingSchemaError(error)) throw new Error(MISSING_SCHEMA_MESSAGE);
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
