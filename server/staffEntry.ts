/* La entrada «Staff» y el «Llegué» desde la app (docs/ARQUITECTURA-CAJA.md §17b). Quien trabaja en la fiesta (y el
 * administrador) tiene una entrada oficial gratis en «Mis entradas»; al marcar su llegada queda adentro, contado,
 * con Playmatch abierto y, si vino en auto, con su estacionamiento sin cobro. Todo idempotente. */
import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { orderItems, orders, ticketTypes, tickets } from "../drizzle/schema";
import { ensureCustomerIdForEmail, getDb, getEventById } from "./db";
import { generateTicketQR } from "./qr";
import { generateDisplayCode, fallbackInternalCode } from "./caja/displayCode";
import { activatePlaymatchForTicket } from "./partyActivation";
import { findStaffByEmail, getEventStaffInfo, setStaffArrival, staffDosierEventId } from "./staffPortal";
import { isAdminEmail } from "./adminEmail";
import { isParkingTicketType } from "../shared/parking";
import {
  STAFF_PAYMENT_METHOD, STAFF_TICKET_TYPE_NAME, arrivalWindow, canUndoArrival, staffEntryPaymentId, staffParkingPaymentId,
} from "../shared/staffEntry";
import { staffShifts } from "../drizzle/schema";

async function need() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/** La persona y el evento de su «Llegué»: el de su próximo turno o la noche activa. El administrador no necesita
 * turno. `null` si el correo no es del equipo ni del dueño, o si no hay evento. */
export async function staffEventContext(email: string) {
  const staff = await findStaffByEmail(email);
  if (!staff) return null;
  const admin = isAdminEmail(email);
  const eventId = await staffDosierEventId(staff.id);
  if (!eventId) return null;
  const event = await getEventById(eventId);
  if (!event) return null;
  const db = await need();
  const [shift] = await db.select({ id: staffShifts.id }).from(staffShifts).where(and(eq(staffShifts.staffId, staff.id), eq(staffShifts.eventId, eventId))).limit(1);
  if (!shift && !admin) return null;
  return { staff, event, admin };
}

async function getOrCreateStaffTicketType(eventId: number) {
  const db = await need();
  const [existing] = await db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.name, STAFF_TICKET_TYPE_NAME))).limit(1);
  if (existing) return existing;
  const [res] = await db.insert(ticketTypes).values({
    eventId, name: STAFF_TICKET_TYPE_NAME, category: "acceso", accesoSlug: null, price: "0", totalStock: 999999, status: "hidden", emoji: "⭐",
  }) as any;
  const [created] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, Number(res.insertId))).limit(1);
  return created;
}

/** La entrada oficial «Staff» de esta persona para el evento: se crea una sola vez, a su correo real, sin correo de
 * confirmación. Así aparece en «Mis entradas» y puede inscribirse en Playmatch antes de llegar. */
export async function ensureStaffEntry(event: { id: number; title: string }, staff: { id: number; name: string }, email: string) {
  const db = await need();
  const paymentId = staffEntryPaymentId(event.id, staff.id);
  const [existingOrder] = await db.select().from(orders).where(and(eq(orders.eventId, event.id), eq(orders.paymentId, paymentId))).limit(1);
  if (existingOrder) {
    const [t] = await db.select().from(tickets).where(eq(tickets.orderId, existingOrder.id)).limit(1);
    if (t) return t;
  }
  const key = email.trim().toLowerCase();
  const tt = await getOrCreateStaffTicketType(event.id);
  const orderNumber = `MP-STAFF-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const [orderRes] = await db.insert(orders).values({
    orderNumber, buyerName: staff.name, buyerEmail: key, customerId: await ensureCustomerIdForEmail(key, staff.name), eventId: event.id,
    subtotal: "0", discount: "0", serviceFee: "0", total: "0", paymentStatus: "approved", paymentId, paymentMethod: STAFF_PAYMENT_METHOD, emailSent: 1,
  }) as any;
  const orderId = Number(orderRes.insertId);
  const [itemRes] = await db.insert(orderItems).values({ orderId, ticketTypeId: tt.id, quantity: 1, unitPrice: "0", totalPrice: "0" }) as any;
  await db.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, tt.id));
  const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
  const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
  await db.insert(tickets).values({
    ticketCode, orderId, orderItemId: Number(itemRes.insertId), eventId: event.id, ticketTypeId: tt.id, holderName: staff.name, qrData, qrImageUrl, status: "valid",
  });
  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketCode, ticketCode)).limit(1);
  return ticket;
}

/** El estacionamiento sin cobro del staff (origen «staff»: no cuenta como deuda con el local). `null` si el evento
 * no tiene un producto «Estacionamiento» configurado. */
async function ensureStaffParking(event: { id: number }, staff: { id: number; name: string }, email: string): Promise<{ ticketCode: string } | null> {
  const db = await need();
  const paymentId = staffParkingPaymentId(event.id, staff.id);
  const [existing] = await db.select().from(orders).where(and(eq(orders.eventId, event.id), eq(orders.paymentId, paymentId))).limit(1);
  if (existing) {
    const [t] = await db.select().from(tickets).where(eq(tickets.orderId, existing.id)).limit(1);
    if (t && t.status !== "cancelled") return { ticketCode: t.ticketCode };
    if (t) { // Venía anulado (un «Deshacer»): se reactiva.
      await db.update(tickets).set({ status: "used", usedAt: new Date() }).where(eq(tickets.id, t.id));
      await db.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, t.ticketTypeId));
      return { ticketCode: t.ticketCode };
    }
  }
  const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
  const parking = (types as any[]).filter((t) => t.category === "extra" && isParkingTicketType(t.name) && t.status !== "hidden")
    .sort((a, b) => Number(a.price) - Number(b.price))[0];
  if (!parking) return null;
  const key = email.trim().toLowerCase();
  const [orderRes] = await db.insert(orders).values({
    orderNumber: `MP-STAFF-PK-${Date.now().toString(36).toUpperCase()}`, buyerName: staff.name, buyerEmail: key, customerId: await ensureCustomerIdForEmail(key, staff.name),
    eventId: event.id, subtotal: "0", total: "0", paymentStatus: "approved", paymentId, paymentMethod: STAFF_PAYMENT_METHOD, emailSent: 1,
  }) as any;
  const orderId = Number(orderRes.insertId);
  const [itemRes] = await db.insert(orderItems).values({ orderId, ticketTypeId: parking.id, quantity: 1, unitPrice: "0", totalPrice: "0" }) as any;
  const ticketCode = `PK-STAFF-${event.id}-${staff.id}`;
  await db.insert(tickets).values({
    ticketCode, orderId, orderItemId: Number(itemRes.insertId), eventId: event.id, ticketTypeId: parking.id, holderName: staff.name, status: "used", usedAt: new Date(),
    displayCode: generateDisplayCode(parking.internalCode || fallbackInternalCode(parking.name)),
  });
  await db.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, parking.id));
  return { ticketCode };
}

/** Lo que muestra la tarjeta «Llegada» de la app. Al consultar se asegura la entrada «Staff» (sin marcar nada). */
export async function staffArrivalState(email: string, now = new Date()) {
  const ctx = await staffEventContext(email);
  if (!ctx) return null;
  const { staff, event } = ctx;
  const win = arrivalWindow(event as any, now);
  // Después del fin de la fiesta ya no se crea nada nuevo.
  const entry = win.phase === "cerrado" ? null : await ensureStaffEntry(event, staff, email);
  const info = await getEventStaffInfo(event.id);
  const arrivedAt = info.arrivals[String(staff.id)] ?? null;
  const db = await need();
  const [pk] = await db.select({ id: tickets.id, status: tickets.status }).from(tickets).where(eq(tickets.ticketCode, `PK-STAFF-${event.id}-${staff.id}`)).limit(1);
  const types = await db.select({ name: ticketTypes.name, category: ticketTypes.category, status: ticketTypes.status }).from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
  return {
    eventId: event.id, eventTitle: event.title, phase: win.phase, opensAt: win.opensAt, arrivedAt,
    canUndo: canUndoArrival(arrivedAt, now), withCar: !!pk && pk.status !== "cancelled",
    parkingAvailable: (types as any[]).some((t) => t.category === "extra" && isParkingTicketType(t.name) && t.status !== "hidden"),
    entry: entry ? { ticketCode: entry.ticketCode, used: entry.status === "used" } : null,
  };
}

/** «Llegué»: la entrada queda usada (adentro y contado), se anota la hora, se abre Playmatch y, si vino en auto, se
 * le da su estacionamiento sin cobro. Repetirlo no duplica nada. */
export async function staffCheckIn(email: string, enAuto: boolean, now = new Date()) {
  const ctx = await staffEventContext(email);
  if (!ctx) throw new Error("Esta cuenta no tiene un turno en la fiesta de hoy.");
  const { staff, event } = ctx;
  const win = arrivalWindow(event as any, now);
  if (win.phase === "antes") throw new Error("Todavía no se puede marcar la llegada: se abre más cerca de la hora de la fiesta.");
  if (win.phase === "cerrado") throw new Error("La fiesta ya terminó.");
  const db = await need();
  const entry = await ensureStaffEntry(event, staff, email);
  if (entry.status !== "used") {
    await db.update(tickets).set({ status: "used", usedAt: now }).where(eq(tickets.id, entry.id));
  }
  await setStaffArrival(event.id, staff.id, now);
  // Playmatch se abre al instante (si ya se había inscrito, queda activo y le llega el aviso).
  await activatePlaymatchForTicket(entry.ticketCode);
  const parking = enAuto ? await ensureStaffParking(event, staff, email) : null;
  return { ok: true as const, parking: enAuto ? (parking ? "dado" as const : "sin_producto" as const) : "no" as const };
}

/** «Deshacer» un «Llegué» marcado por error (solo unos minutos): la entrada vuelve a quedar sin usar. */
export async function staffUndoCheckIn(email: string, now = new Date()) {
  const ctx = await staffEventContext(email);
  if (!ctx) throw new Error("Esta cuenta no tiene un turno en la fiesta de hoy.");
  const { staff, event } = ctx;
  const info = await getEventStaffInfo(event.id);
  const arrivedAt = info.arrivals[String(staff.id)] ?? null;
  if (!canUndoArrival(arrivedAt, now)) throw new Error("Ya pasó el tiempo para deshacerlo. Avísale al administrador.");
  const db = await need();
  const [order] = await db.select().from(orders).where(and(eq(orders.eventId, event.id), eq(orders.paymentId, staffEntryPaymentId(event.id, staff.id)))).limit(1);
  if (order) await db.update(tickets).set({ status: "valid", usedAt: null }).where(eq(tickets.orderId, order.id));
  const [pk] = await db.select().from(tickets).where(eq(tickets.ticketCode, `PK-STAFF-${event.id}-${staff.id}`)).limit(1);
  if (pk && pk.status !== "cancelled") {
    await db.update(tickets).set({ status: "cancelled" }).where(eq(tickets.id, pk.id));
    await db.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - 1, 0)` }).where(eq(ticketTypes.id, pk.ticketTypeId));
  }
  await setStaffArrival(event.id, staff.id, null);
  return { ok: true as const };
}
