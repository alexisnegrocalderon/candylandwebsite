import { and, eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './db';
import {
  birthdayPeople, discountCodes, events, orderItems, orders, ticketTypes, tickets,
} from '../drizzle/schema';
import { generateTicketQR } from './qr';
import { generateDisplayCode, fallbackInternalCode } from './caja/displayCode';
import { BIRTHDAY_TIERS, tierForCount, type BirthdayTier } from '../shared/birthdayTiers';

/* Motor del programa Cumpleañeros: cuenta cuántas entradas se vendieron con
 * el código de cada cumpleañero (para SU evento) y materializa el premio del
 * tramo alcanzado como ítems $0 canjeables en caja, calcando el mecanismo de
 * `discountCodes.giftTicketTypeId` en server/webhooks.ts. Va aparte de ese
 * archivo porque la lógica de "reemplazar en vez de acumular" tramos es
 * propia de este programa. */

/** Cuántas entradas (categoría 'acceso') se vendieron para `eventId` usando
 * el código de descuento `discountCodeId`, contando solo órdenes aprobadas. */
export async function countAccesoTicketsForCode(discountCodeId: number, eventId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ total: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(ticketTypes, eq(orderItems.ticketTypeId, ticketTypes.id))
    .where(and(
      eq(orders.discountCodeId, discountCodeId),
      eq(orders.eventId, eventId),
      eq(orders.paymentStatus, 'approved'),
      eq(ticketTypes.category, 'acceso'),
    ));
  return Number(row?.total ?? 0);
}

/** Busca el ticketType del tramo dentro del evento del cumpleañero --
 * ticketTypes es por-evento, así que 'duo'/'BDESP'/etc. hay que resolverlos
 * cada vez contra el eventId correcto, no contra un id fijo. */
async function findTierTicketType(eventId: number, matchBy: 'accesoSlug' | 'internalCode', value: string) {
  const db = await getDb();
  if (!db) return null;
  const condition = matchBy === 'accesoSlug' ? eq(ticketTypes.accesoSlug, value) : eq(ticketTypes.internalCode, value);
  const [row] = await db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), condition)).limit(1);
  return row ?? null;
}

/** Anula (sin borrar) los tickets $0 todavía sin canjear de la orden-premio
 * del cumpleañero -- así el tramo anterior deja de ser válido en caja sin
 * tocar lo que la persona ya retiró. */
/** Anula solo los ítems "extra"/"consumo" (espumante, botella, covers,
 * bebidas) -- NUNCA los de categoría 'acceso' (el Acceso Dúo del tramo 1).
 * Vender más entradas jamás le quita al cumpleañero la entrada a SU fiesta:
 * "reemplazar en vez de acumular" aplica a los regalos, no al acceso ya
 * otorgado. */
async function cancelUnredeemedRewardTickets(rewardOrderId: number) {
  const db = await getDb();
  if (!db) return;
  const rewardTickets = await db.select({ id: tickets.id, ticketTypeId: tickets.ticketTypeId })
    .from(tickets)
    .where(and(eq(tickets.orderId, rewardOrderId), eq(tickets.status, 'valid')));
  if (!rewardTickets.length) return;

  const ticketTypeIds = Array.from(new Set(rewardTickets.map((t) => t.ticketTypeId)));
  const types = await db.select({ id: ticketTypes.id, category: ticketTypes.category })
    .from(ticketTypes).where(inArray(ticketTypes.id, ticketTypeIds));
  const categoryById = new Map(types.map((t) => [t.id, t.category]));

  const idsToCancel = rewardTickets
    .filter((t) => categoryById.get(t.ticketTypeId) !== 'acceso')
    .map((t) => t.id);
  if (!idsToCancel.length) return;

  await db.update(tickets).set({ status: 'cancelled' }).where(inArray(tickets.id, idsToCancel));
}

/** Crea (si no existe) la orden $0 donde viven los premios vigentes del
 * cumpleañero, y la deja guardada en birthdayPeople.rewardOrderId. */
async function ensureRewardOrder(person: typeof birthdayPeople.$inferSelect): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (person.rewardOrderId) return person.rewardOrderId;

  const orderNumber = `BDAY-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const inserted = await db.insert(orders).values({
    orderNumber,
    buyerName: person.name,
    buyerEmail: person.email,
    buyerPhone: person.whatsapp,
    eventId: person.eventId,
    subtotal: '0',
    total: '0',
    paymentStatus: 'approved',
    paymentId: `BDAY-${orderNumber}`,
    channel: 'import',
  });
  const rewardOrderId = (inserted as unknown as { insertId: number }).insertId;
  await db.update(birthdayPeople).set({ rewardOrderId }).where(eq(birthdayPeople.id, person.id));
  return rewardOrderId;
}

/** Materializa el premio de `tier` para el cumpleañero: anula lo que quedó
 * sin canjear del tramo anterior (si había orden-premio) e inserta los
 * orderItems/tickets $0 del nuevo tramo -- cada ítem canjeable en /caja
 * exactamente igual que cualquier extra comprado. Idempotente por diseño de
 * quien la llama: solo se invoca cuando `tier.tier > currentTier` (ver
 * server/webhooks.ts). */
export async function materializeTierReward(birthdayPersonId: number, tier: BirthdayTier) {
  const db = await getDb();
  if (!db) return;

  const [person] = await db.select().from(birthdayPeople).where(eq(birthdayPeople.id, birthdayPersonId)).limit(1);
  if (!person) return;
  const [event] = await db.select().from(events).where(eq(events.id, person.eventId)).limit(1);
  if (!event) return;

  const hadRewardOrder = !!person.rewardOrderId;
  const rewardOrderId = await ensureRewardOrder(person);
  if (hadRewardOrder) await cancelUnredeemedRewardTickets(rewardOrderId);

  for (const item of tier.items) {
    const tt = await findTierTicketType(person.eventId, item.matchBy, item.value);
    if (!tt) {
      console.error(`[Cumpleañeros] Falta crear el producto "${item.value}" (${item.matchBy}) para el evento ${person.eventId} -- premio del tramo ${tier.tier} incompleto`);
      continue;
    }

    const [insertedItem] = await db.insert(orderItems).values({
      orderId: rewardOrderId,
      ticketTypeId: tt.id,
      quantity: item.quantity,
      unitPrice: '0',
      totalPrice: '0',
      unitCost: tt.costPrice ?? undefined,
    });
    const orderItemId = (insertedItem as unknown as { insertId: number }).insertId;

    // Igual que processApprovedOrder: solo los 'extra'/'consumo' llevan
    // displayCode canjeable en caja -- el acceso (Dúo) se valida por su QR.
    const isRedeemable = tt.category !== 'acceso';
    const prefix = tt.internalCode || fallbackInternalCode(tt.name);

    for (let i = 0; i < item.quantity; i++) {
      const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
      const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
      const displayCode = isRedeemable ? generateDisplayCode(prefix) : null;
      await db.insert(tickets).values({
        ticketCode,
        orderId: rewardOrderId,
        orderItemId,
        eventId: person.eventId,
        ticketTypeId: tt.id,
        holderName: person.name,
        qrData,
        qrImageUrl,
        status: 'valid',
        displayCode,
      });
    }

    await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, tt.id));
  }

  await db.update(birthdayPeople).set({
    currentTier: tier.tier,
    pendingNextEventCredit: tier.includesNextEventCredit ? 1 : 0,
  }).where(eq(birthdayPeople.id, birthdayPersonId));
}

/** Punto de entrada desde server/webhooks.ts: recalcula el conteo real de
 * entradas vendidas con el código de este cumpleañero para su evento, y si
 * eso cruza a un tramo mayor al que ya tenía, materializa el premio nuevo.
 * Devuelve el tramo alcanzado (para poder mandar el correo) o `null` si no
 * hubo cambio. */
export async function checkAndApplyBirthdayTier(discountCodeId: number): Promise<
  { person: typeof birthdayPeople.$inferSelect; tier: BirthdayTier } | null
> {
  const db = await getDb();
  if (!db) return null;

  const [person] = await db.select().from(birthdayPeople)
    .where(and(eq(birthdayPeople.discountCodeId, discountCodeId), eq(birthdayPeople.active, 1)))
    .limit(1);
  if (!person) return null;

  const count = await countAccesoTicketsForCode(discountCodeId, person.eventId);
  const tier = tierForCount(count);
  if (!tier || tier.tier <= person.currentTier) return null;

  await materializeTierReward(person.id, tier);
  const [updated] = await db.select().from(birthdayPeople).where(eq(birthdayPeople.id, person.id)).limit(1);
  return { person: updated ?? person, tier };
}

export async function getBirthdayPeopleForEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const people = await db.select().from(birthdayPeople).where(eq(birthdayPeople.eventId, eventId));
  if (!people.length) return [];

  const codeIds = people.map(p => p.discountCodeId);
  const codes = await db.select().from(discountCodes).where(inArray(discountCodes.id, codeIds));
  const codeById = new Map(codes.map(c => [c.id, c]));

  const rows = await Promise.all(people.map(async p => {
    const ticketsSold = await countAccesoTicketsForCode(p.discountCodeId, p.eventId);
    return {
      ...p,
      code: codeById.get(p.discountCodeId)?.code ?? null,
      discountPercent: codeById.get(p.discountCodeId)?.discountValue ?? null,
      ticketsSold,
      nextTier: tierForCount(ticketsSold + 1) ?? null,
    };
  }));
  return rows;
}

/** Acción del admin: le asigna al cumpleañero con crédito pendiente una
 * entrada gratis del ticketType elegido, en el evento futuro que ya se
 * publicó (que no existía cuando se generó el crédito). Usa la misma orden
 * $0 de siempre -- si ya tenía premios vigentes de OTRO evento, no los toca
 * (createOrder queda ligado al evento del ticketType, no al de la orden
 * original). */
export async function assignNextEventCredit(params: { birthdayPersonId: number; targetEventId: number; ticketTypeId: number }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [person] = await db.select().from(birthdayPeople).where(eq(birthdayPeople.id, params.birthdayPersonId)).limit(1);
  if (!person) throw new Error('No encontramos ese cumpleañero');
  if (!person.pendingNextEventCredit) throw new Error('Ese cumpleañero no tiene un crédito pendiente');

  const [tt] = await db.select().from(ticketTypes)
    .where(and(eq(ticketTypes.id, params.ticketTypeId), eq(ticketTypes.eventId, params.targetEventId)))
    .limit(1);
  if (!tt) throw new Error('Ese producto no pertenece al evento elegido');

  const [event] = await db.select().from(events).where(eq(events.id, params.targetEventId)).limit(1);
  if (!event) throw new Error('Evento no encontrado');

  const orderNumber = `BDAY-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const insertedOrder = await db.insert(orders).values({
    orderNumber,
    buyerName: person.name,
    buyerEmail: person.email,
    buyerPhone: person.whatsapp,
    eventId: params.targetEventId,
    subtotal: '0',
    total: '0',
    paymentStatus: 'approved',
    paymentId: `BDAY-${orderNumber}`,
    channel: 'import',
  });
  const creditOrderId = (insertedOrder as unknown as { insertId: number }).insertId;

  const [insertedItem] = await db.insert(orderItems).values({
    orderId: creditOrderId,
    ticketTypeId: tt.id,
    quantity: 1,
    unitPrice: '0',
    totalPrice: '0',
    unitCost: tt.costPrice ?? undefined,
  });
  const orderItemId = (insertedItem as unknown as { insertId: number }).insertId;

  const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
  const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
  await db.insert(tickets).values({
    ticketCode,
    orderId: creditOrderId,
    orderItemId,
    eventId: params.targetEventId,
    ticketTypeId: tt.id,
    holderName: person.name,
    qrData,
    qrImageUrl,
    status: 'valid',
    displayCode: tt.category !== 'acceso' ? generateDisplayCode(tt.internalCode || fallbackInternalCode(tt.name)) : null,
  });

  await db.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, tt.id));
  await db.update(birthdayPeople).set({
    pendingNextEventCredit: 0,
    pendingCreditRedeemedEventId: params.targetEventId,
  }).where(eq(birthdayPeople.id, person.id));

  return { success: true, orderId: creditOrderId };
}

export { BIRTHDAY_TIERS };
