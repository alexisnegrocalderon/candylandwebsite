/** Ficha de cliente (Admin → Clientes): validación de lo que el dueño edita a
 * mano y armado del detalle con lo calculado (historial por evento, valor,
 * consumo, próxima acción). Las reglas puras viven en shared/customerInsights.ts;
 * acá solo se cruzan las tablas. `customers` es una proyección: la fuente de
 * verdad del historial siguen siendo `orders`/`tickets`/`orderItems`. */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  birthdayApplications, customers, events, orderItems, orders, partyProfiles, playcoinsLedger, ticketTypes, tickets,
} from "../drizzle/schema";
import { getDb, skipPendingMailingForCustomer } from "./db";
import { isValidRut, normalizeRut } from "../shared/rut";
import {
  ageFromBirthDate, computeCustomerLevel, customerDeleteBlocker, daysBetween, daysUntilBirthday, GENDER_OPTIONS, LOCKABLE_FIELDS, normalizeInstagram, normalizePhone,
  parseBirthDateInput, parseLockedFields, recencyTone, SOURCE_OPTIONS, suggestNextAction, type CustomerGender, type LockableField,
} from "../shared/customerInsights";

/* ─── Validación de la edición ─────────────────────────────── */

export type CustomerEditInput = {
  fullName?: string | null;
  phone?: string | null;
  rut?: string | null;
  instagram?: string | null;
  /** "DD/MM/AAAA" o "DD/MM" tal como lo escribe el dueño. */
  birthDate?: string | null;
  gender?: string | null;
  city?: string | null;
  source?: string | null;
  ambassadorCode?: string | null;
  levelOverride?: string | null;
  emailOptOut?: boolean;
  whatsappOptOut?: boolean;
  optOutReason?: string | null;
  notes?: string | null;
};

export type CustomerPatch = {
  fullName?: string | null; phone?: string | null; rut?: string | null; instagram?: string | null;
  birthDate?: string | null; gender?: CustomerGender | null; city?: string | null; source?: string | null;
  ambassadorCode?: string | null; levelOverride?: 'vip' | 'inactivo' | null;
  emailOptOut?: number; whatsappOptOut?: number; optOutReason?: string | null; notes?: string | null;
};

const blankToNull = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** Valida y normaliza lo que llega del formulario. Devuelve los errores todos
 * juntos (en español, uno por campo) en vez de fallar en el primero. Los campos
 * ausentes (`undefined`) no se tocan; los vacíos (`''`/`null`) sí se borran. */
export function validateCustomerEdit(input: CustomerEditInput, now: Date = new Date()): { patch: CustomerPatch; errors: Record<string, string> } {
  const patch: CustomerPatch = {};
  const errors: Record<string, string> = {};

  if (input.fullName !== undefined) {
    const name = blankToNull(input.fullName);
    if (name && name.length > 255) errors.fullName = 'El nombre es demasiado largo.';
    else patch.fullName = name;
  }
  if (input.phone !== undefined) {
    const r = normalizePhone(input.phone);
    if (r.error) errors.phone = r.error; else patch.phone = r.value;
  }
  if (input.rut !== undefined) {
    const raw = blankToNull(input.rut);
    if (raw && !isValidRut(raw)) errors.rut = 'El RUT no es válido.';
    else patch.rut = raw ? normalizeRut(raw) : null;
  }
  if (input.instagram !== undefined) {
    const r = normalizeInstagram(input.instagram);
    if (r.error) errors.instagram = r.error; else patch.instagram = r.value;
  }
  if (input.birthDate !== undefined) {
    const r = parseBirthDateInput(input.birthDate, now);
    if (r.error) errors.birthDate = r.error; else patch.birthDate = r.value;
  }
  if (input.gender !== undefined) {
    const g = blankToNull(input.gender);
    if (g && !GENDER_OPTIONS.some((o) => o.value === g)) errors.gender = 'Género no válido.';
    else patch.gender = (g as CustomerGender | null);
  }
  if (input.city !== undefined) {
    const city = blankToNull(input.city);
    if (city && city.length > 100) errors.city = 'La ciudad es demasiado larga.'; else patch.city = city;
  }
  if (input.source !== undefined) {
    const s = blankToNull(input.source);
    if (s && !SOURCE_OPTIONS.some((o) => o.value === s)) errors.source = 'Origen no válido.'; else patch.source = s;
  }
  if (input.ambassadorCode !== undefined) {
    const code = blankToNull(input.ambassadorCode)?.toUpperCase() ?? null;
    if (code && !/^[A-Z0-9_-]{2,32}$/.test(code)) errors.ambassadorCode = 'Código de embajador no válido.'; else patch.ambassadorCode = code;
  }
  if (input.levelOverride !== undefined) {
    const l = blankToNull(input.levelOverride);
    if (l && l !== 'vip' && l !== 'inactivo') errors.levelOverride = 'Nivel no válido.'; else patch.levelOverride = (l as 'vip' | 'inactivo' | null);
  }
  if (input.emailOptOut !== undefined) patch.emailOptOut = input.emailOptOut ? 1 : 0;
  if (input.whatsappOptOut !== undefined) patch.whatsappOptOut = input.whatsappOptOut ? 1 : 0;
  if (input.optOutReason !== undefined) {
    const reason = blankToNull(input.optOutReason);
    if (reason && reason.length > 200) errors.optOutReason = 'El motivo es demasiado largo.'; else patch.optOutReason = reason;
  }
  if (input.notes !== undefined) {
    const notes = (input.notes ?? '').trim();
    if (notes.length > 5000) errors.notes = 'Las notas son demasiado largas.'; else patch.notes = notes || null;
  }
  return { patch, errors };
}

/** Campos que el dueño tocó y que las compras nuevas NO deben volver a pisar. */
export function fieldsToLock(patch: CustomerPatch): LockableField[] {
  return LOCKABLE_FIELDS.filter((f) => f in patch);
}

/* ─── Edición ──────────────────────────────────────────────── */

export async function updateCustomerProfile(customerId: number, input: CustomerEditInput) {
  const { patch, errors } = validateCustomerEdit(input);
  if (Object.keys(errors).length > 0) {
    const err = new Error(Object.values(errors).join(' ')) as Error & { fieldErrors?: Record<string, string> };
    err.fieldErrors = errors;
    throw err;
  }
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const [before] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!before) throw new Error('No encontré a ese cliente.');

  const locked = Array.from(new Set([...parseLockedFields(before.lockedFields), ...fieldsToLock(patch)]));
  const set: Record<string, unknown> = { ...patch, lockedFields: locked };
  // La fecha de la baja se guarda cuando pasa de "acepta todo" a "tiene alguna
  // baja", y se limpia (con su motivo) cuando vuelve a aceptar todo.
  const emailOut = patch.emailOptOut ?? before.emailOptOut;
  const whatsappOut = patch.whatsappOptOut ?? before.whatsappOptOut;
  const wasOptedOut = !!(before.emailOptOut || before.whatsappOptOut);
  const isOptedOut = !!(emailOut || whatsappOut);
  if (isOptedOut && !wasOptedOut) set.optOutAt = new Date();
  if (!isOptedOut) { set.optOutAt = null; set.optOutReason = null; }
  await db.update(customers).set(set).where(eq(customers.id, customerId));

  // Foto de lo que cambió, para la bitácora de admin.
  const changed: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const [key, value] of Object.entries(patch)) {
    const prev = (before as any)[key] ?? null;
    if (JSON.stringify(prev) !== JSON.stringify(value)) changed[key] = { antes: prev, despues: value };
  }
  return { changed };
}

/* ─── Detalle calculado ────────────────────────────────────── */

export type CustomerEventRow = {
  eventId: number;
  title: string;
  eventDate: Date | null;
  bought: boolean;
  attended: boolean;
  ticketsSpent: number;
  barSpent: number;
};

export async function getCustomerProfile(customerId: number, now: Date = new Date()) {
  const db = await getDb();
  if (!db) return null;
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) return null;
  const email = c.email.toLowerCase();

  const orderRows = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, eventId: orders.eventId, channel: orders.channel, total: orders.total,
    paymentMethod: orders.paymentMethod, createdAt: orders.createdAt, utmSource: orders.utmSource, referredByCode: orders.referredByCode,
    buyerName: orders.buyerName,
  }).from(orders).where(and(sql`lower(${orders.buyerEmail}) = ${email}`, eq(orders.paymentStatus, 'approved'))).orderBy(desc(orders.createdAt));

  const orderIds = orderRows.map((o) => o.id);
  const eventIds = Array.from(new Set(orderRows.map((o) => o.eventId)));
  const itemRows = orderIds.length
    ? await db.select({
        orderId: orderItems.orderId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice,
        name: ticketTypes.name, category: ticketTypes.category,
      }).from(orderItems).innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId)).where(inArray(orderItems.orderId, orderIds))
    : [];
  const eventRows = eventIds.length
    ? await db.select({ id: events.id, title: events.title, eventDate: events.eventDate }).from(events).where(inArray(events.id, eventIds))
    : [];
  const eventById = new Map<number, { title: string; eventDate: Date | null }>(eventRows.map((e) => [e.id, { title: e.title, eventDate: e.eventDate as Date | null }]));

  // Asistencia: un acceso cuya entrada se escaneó en la puerta (`used`).
  const webOrderIds = orderRows.filter((o) => o.channel !== 'caja').map((o) => o.id);
  const attendedRows = webOrderIds.length
    ? await db.select({ eventId: tickets.eventId, ticketId: tickets.id }).from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .where(and(inArray(tickets.orderId, webOrderIds), eq(tickets.status, 'used'), eq(ticketTypes.category, 'acceso')))
    : [];
  const attendedEvents = new Set(attendedRows.map((t) => t.eventId));

  // Historial por evento: entradas vs barra (ventas de caja con su email).
  const ordersById = new Map(orderRows.map((o) => [o.id, o]));
  const perEvent = new Map<number, CustomerEventRow>();
  const rowFor = (eventId: number): CustomerEventRow => {
    let r = perEvent.get(eventId);
    if (!r) {
      const e = eventById.get(eventId);
      r = { eventId, title: e?.title ?? `Evento #${eventId}`, eventDate: e?.eventDate ?? null, bought: false, attended: attendedEvents.has(eventId), ticketsSpent: 0, barSpent: 0 };
      perEvent.set(eventId, r);
    }
    return r;
  };
  for (const o of orderRows) {
    const r = rowFor(o.eventId);
    if (o.channel === 'caja') r.barSpent += Number(o.total);
    else { r.bought = true; r.ticketsSpent += Number(o.total); }
  }
  const eventHistory = Array.from(perEvent.values()).sort((a, b) => (b.eventDate?.getTime() ?? 0) - (a.eventDate?.getTime() ?? 0));

  // Qué consume: productos de caja por cantidad.
  const byProduct = new Map<string, { name: string; quantity: number; spent: number }>();
  for (const i of itemRows) {
    const order = ordersById.get(i.orderId);
    if (!order || order.channel !== 'caja') continue;
    const entry = byProduct.get(i.name) ?? { name: i.name, quantity: 0, spent: 0 };
    entry.quantity += i.quantity;
    entry.spent += Number(i.totalPrice);
    byProduct.set(i.name, entry);
  }
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 8);

  // Compras con su detalle (las 30 más recientes).
  const itemsByOrder = new Map<number, string[]>();
  for (const i of itemRows) {
    const list = itemsByOrder.get(i.orderId) ?? [];
    list.push(`${i.quantity}× ${i.name}`);
    itemsByOrder.set(i.orderId, list);
  }
  const purchases = orderRows.slice(0, 30).map((o) => ({
    orderNumber: o.orderNumber, channel: o.channel as string, eventTitle: eventById.get(o.eventId)?.title ?? `Evento #${o.eventId}`,
    total: Number(o.total), paymentMethod: o.paymentMethod, createdAt: o.createdAt as Date, items: itemsByOrder.get(o.id) ?? [],
  }));

  // Valor y recencia.
  const ticketsSpent = eventHistory.reduce((s, e) => s + e.ticketsSpent, 0);
  const barSpent = eventHistory.reduce((s, e) => s + e.barSpent, 0);
  const webOrders = orderRows.filter((o) => o.channel !== 'caja');
  const lastAttendedEvent = eventHistory.find((e) => e.attended) ?? null;
  const lastAttendedAt = lastAttendedEvent?.eventDate ?? null;
  const lastPurchaseAt = orderRows[0]?.createdAt ?? null;
  const lastActivityAt = [lastAttendedAt, lastPurchaseAt, c.lastSeenAt]
    .filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const daysSinceLastActivity = lastActivityAt ? Math.max(0, daysBetween(lastActivityAt, now)) : null;
  const daysSinceLastAttended = lastAttendedAt ? Math.max(0, daysBetween(lastAttendedAt, now)) : null;

  const totalSpentAll = Number(c.totalSpent);
  const level = computeCustomerLevel({ totalOrders: c.totalOrders, totalSpent: totalSpentAll, lastActivityAt, levelOverride: c.levelOverride, now });

  // Compró la última fiesta que ya pasó y no se escaneó su entrada.
  const pastBoughtEvents = eventHistory.filter((e) => e.bought && e.eventDate && e.eventDate.getTime() < now.getTime());
  const boughtLastEventButMissed = pastBoughtEvents.length > 0 ? !pastBoughtEvents[0].attended : null;

  // Datos que se pueden rellenar solos (se muestran como sugerencia, no se guardan).
  const suggestions: { birthDate?: string; gender?: CustomerGender; source?: string; ambassadorCode?: string } = {};
  if (!c.birthDate) {
    const [b] = await db.select({ birthDate: birthdayApplications.birthDate }).from(birthdayApplications)
      .where(sql`lower(${birthdayApplications.email}) = ${email}`).orderBy(desc(birthdayApplications.createdAt)).limit(1);
    if (b?.birthDate) suggestions.birthDate = b.birthDate;
  }
  if (!c.gender && webOrderIds.length) {
    const [p] = await db.select({ gender: partyProfiles.gender }).from(partyProfiles)
      .innerJoin(tickets, eq(tickets.id, partyProfiles.ticketId)).where(inArray(tickets.orderId, webOrderIds)).limit(1);
    if (p?.gender) suggestions.gender = p.gender as CustomerGender;
  }
  const firstWeb = webOrders[webOrders.length - 1];
  if (!c.source && firstWeb) {
    if (firstWeb.referredByCode) { suggestions.source = 'embajador'; suggestions.ambassadorCode = firstWeb.referredByCode.toUpperCase(); }
    else if (firstWeb.utmSource?.toLowerCase().includes('instagram') || firstWeb.utmSource?.toLowerCase() === 'ig') suggestions.source = 'instagram';
    else suggestions.source = 'web';
  }

  const playcoinHistory = await db.select({
    delta: playcoinsLedger.delta, reason: playcoinsLedger.reason, balanceAfter: playcoinsLedger.balanceAfter, createdAt: playcoinsLedger.createdAt, note: playcoinsLedger.note,
  }).from(playcoinsLedger).where(eq(playcoinsLedger.customerId, c.id)).orderBy(desc(playcoinsLedger.createdAt)).limit(10);

  const nextAction = suggestNextAction({
    level, totalOrders: c.totalOrders, daysSinceLastActivity, birthDate: c.birthDate, phone: c.phone, instagram: c.instagram,
    emailOptOut: !!c.emailOptOut, whatsappOptOut: !!c.whatsappOptOut, prepaidBalance: c.prepaidBalance, boughtLastEventButMissed, now,
  });

  const { cardPinHash: _hash, ...safe } = c as any;
  return {
    customer: { ...safe, lockedFields: parseLockedFields(c.lockedFields) },
    level,
    recency: { daysSinceLastActivity, daysSinceLastAttended, tone: recencyTone(daysSinceLastActivity) },
    kpis: {
      totalSpent: totalSpentAll,
      totalOrders: c.totalOrders,
      attendances: attendedEvents.size,
      eventsBought: eventHistory.filter((e) => e.bought).length,
      ticketsSpent,
      barSpent,
      averageTicket: webOrders.length ? Math.round(ticketsSpent / webOrders.length) : null,
      lastAttendedEvent: lastAttendedEvent ? { title: lastAttendedEvent.title, eventDate: lastAttendedEvent.eventDate } : null,
    },
    birthday: { daysUntil: daysUntilBirthday(c.birthDate, now), age: ageFromBirthDate(c.birthDate, now) },
    eventHistory,
    topProducts,
    purchases,
    playcoinHistory,
    suggestions,
    nextAction,
  };
}

/* ─── Borrado ──────────────────────────────────────────────── */

/** Borra la ficha de un cliente. Las COMPRAS, entradas y los ledgers de
 * Playcoins/saldo no se tocan (son historial y plata: ver comentarios del
 * schema); solo desaparece la ficha, y si el cliente vuelve a comprar se crea
 * una ficha nueva desde cero. Los envíos pendientes de la cola de mailing se
 * marcan como saltados. Devuelve una foto de lo borrado para la bitácora. */
export async function deleteCustomerProfile(customerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) throw new Error('No encontré a ese cliente (quizás ya lo borraste).');
  const blocker = customerDeleteBlocker(c);
  if (blocker) throw new Error(blocker);

  const skippedMailings = await skipPendingMailingForCustomer(customerId, 'Cliente eliminado');
  await db.delete(customers).where(eq(customers.id, customerId));

  const { cardPinHash: _hash, ...snapshot } = c as any;
  return { snapshot, skippedMailings };
}
