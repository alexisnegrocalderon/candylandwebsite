/** Personal de las fiestas: catálogo de personas y pagos por evento. */
import { and, desc, eq } from "drizzle-orm";
import { events, staffMembers, staffShifts } from "../drizzle/schema";
import { monthKeyFor } from "../shared/ambassadorProgram";
import { honorariosBreakdown, staffTotals, type StaffAmountMode, type StaffPaymentType } from "../shared/honorarios";
import { getDb } from "./db";

async function need() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export type StaffInput = { name: string; role?: string | null; defaultRateClp?: number; phone?: string | null; rut?: string | null; notes?: string | null; active?: boolean };

export async function listStaff() {
  const db = await need();
  return db.select().from(staffMembers).orderBy(desc(staffMembers.active), staffMembers.name);
}

export async function saveStaff(input: StaffInput, id?: number) {
  const db = await need();
  const values = {
    name: input.name.trim(),
    role: input.role?.trim() || null,
    defaultRateClp: input.defaultRateClp ?? 0,
    phone: input.phone?.trim() || null,
    rut: input.rut?.trim() || null,
    notes: input.notes?.trim() || null,
    ...(input.active === undefined ? {} : { active: input.active ? 1 : 0 }),
  };
  if (id) { await db.update(staffMembers).set(values).where(eq(staffMembers.id, id)); return { id }; }
  const [res] = await db.insert(staffMembers).values(values) as any;
  return { id: Number(res.insertId) };
}

export async function deleteStaff(id: number) {
  const db = await need();
  const used = await db.select({ id: staffShifts.id }).from(staffShifts).where(eq(staffShifts.staffId, id)).limit(1);
  // Con historial no se borra: se archiva, para no perder lo que ya se pagó.
  if ((used as any[]).length > 0) { await db.update(staffMembers).set({ active: 0 }).where(eq(staffMembers.id, id)); return { archived: true }; }
  await db.delete(staffMembers).where(eq(staffMembers.id, id));
  return { archived: false };
}

/** Turnos de un evento con el cálculo de la boleta (bruto, retención, líquido, costo). */
export async function listShifts(eventId: number) {
  const db = await need();
  const [event] = await db.select({ eventDate: events.eventDate }).from(events).where(eq(events.id, eventId)).limit(1);
  const year = event?.eventDate ? Number(monthKeyFor(event.eventDate as any).slice(0, 4)) : new Date().getFullYear();
  const rows = await db.select({
    id: staffShifts.id, staffId: staffShifts.staffId, name: staffMembers.name, role: staffMembers.role,
    amountClp: staffShifts.amountClp, paymentType: staffShifts.paymentType, amountMode: staffShifts.amountMode,
    hours: staffShifts.hours, paid: staffShifts.paid, paidAt: staffShifts.paidAt, note: staffShifts.note,
  }).from(staffShifts).innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(eq(staffShifts.eventId, eventId)).orderBy(staffMembers.name);
  const shifts = (rows as any[]).map((r) => ({
    ...r, paid: !!r.paid, hours: r.hours == null ? null : Number(r.hours),
    pay: honorariosBreakdown({ amount: Number(r.amountClp), paymentType: r.paymentType, amountMode: r.amountMode, year }),
  }));
  const totals = staffTotals(rows as any[], year);
  return {
    year,
    ratePercent: honorariosBreakdown({ amount: 1, paymentType: 'boleta_honorarios', amountMode: 'bruto', year }).ratePercent,
    shifts,
    totals: { gross: totals.gross, retention: totals.retention, net: totals.net, cost: totals.cost },
  };
}

export async function addShift(input: { eventId: number; staffId: number; amountClp: number; paymentType?: StaffPaymentType; amountMode?: StaffAmountMode; hours?: number | null; note?: string | null }) {
  const db = await need();
  const dup = await db.select({ id: staffShifts.id }).from(staffShifts)
    .where(and(eq(staffShifts.eventId, input.eventId), eq(staffShifts.staffId, input.staffId))).limit(1);
  if ((dup as any[]).length > 0) throw new Error("Esa persona ya está asignada a este evento");
  const [res] = await db.insert(staffShifts).values({
    eventId: input.eventId, staffId: input.staffId, amountClp: input.amountClp,
    paymentType: input.paymentType ?? 'transferencia', amountMode: input.amountMode ?? 'liquido',
    hours: input.hours == null ? null : String(input.hours), note: input.note?.trim() || null,
  }) as any;
  return { id: Number(res.insertId) };
}

export async function updateShift(id: number, input: { amountClp?: number; paymentType?: StaffPaymentType; amountMode?: StaffAmountMode; hours?: number | null; note?: string | null; paid?: boolean }) {
  const db = await need();
  const set: Record<string, unknown> = {};
  if (input.amountClp !== undefined) set.amountClp = input.amountClp;
  if (input.paymentType !== undefined) set.paymentType = input.paymentType;
  if (input.amountMode !== undefined) set.amountMode = input.amountMode;
  if (input.hours !== undefined) set.hours = input.hours == null ? null : String(input.hours);
  if (input.note !== undefined) set.note = input.note?.trim() || null;
  if (input.paid !== undefined) { set.paid = input.paid ? 1 : 0; set.paidAt = input.paid ? new Date() : null; }
  if (Object.keys(set).length) await db.update(staffShifts).set(set).where(eq(staffShifts.id, id));
  return { success: true };
}

export async function removeShift(id: number) {
  const db = await need();
  await db.delete(staffShifts).where(eq(staffShifts.id, id));
  return { success: true };
}
