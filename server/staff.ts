/** Personal de las fiestas: catálogo de personas y pagos por evento. */
import { and, desc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import { events, operators, staffMembers, staffShifts } from "../drizzle/schema";
import { cargoFromRole, operatorRoleForCargo, type StaffCargo } from "../shared/staffCargos";
import { monthKeyFor } from "../shared/ambassadorProgram";
import { honorariosBreakdown, staffTotals, type StaffAmountMode, type StaffPaymentType } from "../shared/honorarios";
import { getDb } from "./db";

async function need() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

export type StaffInput = { name: string; role?: string | null; cargo?: StaffCargo | null; defaultRateClp?: number; phone?: string | null; rut?: string | null; notes?: string | null; active?: boolean };

/** Lo que se le muestra al admin: nunca el hash del PIN, solo si ya lo creó. */
export async function listStaff() {
  const db = await need();
  const rows = await db.select().from(staffMembers).orderBy(desc(staffMembers.active), staffMembers.name);
  return rows.map(({ pinHash, ...m }) => ({ ...m, hasPin: !!pinHash }));
}

export async function saveStaff(input: StaffInput, id?: number) {
  const db = await need();
  const values = {
    name: input.name.trim(),
    role: input.role?.trim() || null,
    ...(input.cargo === undefined ? {} : { cargo: input.cargo }),
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
  const access = await db.select({ id: operators.id }).from(operators).where(eq(operators.staffId, id)).limit(1);
  // Con historial (pagos o accesos) no se borra: se archiva, para no perder lo que ya se pagó ni quién vendió.
  if ((used as any[]).length > 0 || (access as any[]).length > 0) {
    await db.update(staffMembers).set({ active: 0 }).where(eq(staffMembers.id, id));
    await db.update(operators).set({ active: 0 }).where(eq(operators.staffId, id));
    return { archived: true };
  }
  await db.delete(staffMembers).where(eq(staffMembers.id, id));
  return { archived: false };
}

/** Turnos de un evento con el cálculo de la boleta (bruto, retención, líquido, costo). */
export async function listShifts(eventId: number) {
  const db = await need();
  const [event] = await db.select({ eventDate: events.eventDate }).from(events).where(eq(events.id, eventId)).limit(1);
  const year = event?.eventDate ? Number(monthKeyFor(event.eventDate as any).slice(0, 4)) : new Date().getFullYear();
  const rows = await db.select({
    id: staffShifts.id, staffId: staffShifts.staffId, name: staffMembers.name, role: staffMembers.role, cargo: staffMembers.cargo,
    amountClp: staffShifts.amountClp, paymentType: staffShifts.paymentType, amountMode: staffShifts.amountMode,
    hours: staffShifts.hours, paid: staffShifts.paid, paidAt: staffShifts.paidAt, note: staffShifts.note,
  }).from(staffShifts).innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(eq(staffShifts.eventId, eventId)).orderBy(staffMembers.name);
  // Acceso a su pantalla esa noche: «on» (entra con su PIN), «pin» (falta que cree su PIN) o null (su cargo no usa pantalla).
  const ids = (rows as any[]).map((r) => r.staffId);
  const ops = ids.length ? await db.select({ staffId: operators.staffId, active: operators.active }).from(operators)
    .where(and(eq(operators.eventId, eventId), inArray(operators.staffId, ids))) : [];
  const accessOf = (r: any): 'on' | 'pin' | null => {
    if (!operatorRoleForCargo(r.cargo)) return null;
    return (ops as any[]).some((o) => o.staffId === r.staffId && o.active) ? 'on' : 'pin';
  };
  const shifts = (rows as any[]).map((r) => ({
    ...r, access: accessOf(r), paid: !!r.paid, hours: r.hours == null ? null : Number(r.hours),
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
  const [shift] = await db.select({ eventId: staffShifts.eventId, staffId: staffShifts.staffId }).from(staffShifts).where(eq(staffShifts.id, id)).limit(1);
  await db.delete(staffShifts).where(eq(staffShifts.id, id));
  // Ya no trabaja esa noche: su acceso a la pantalla se apaga (no se borra, por el historial).
  if (shift) await db.update(operators).set({ active: 0 }).where(and(eq(operators.staffId, shift.staffId), eq(operators.eventId, shift.eventId)));
  return { success: true, eventId: shift?.eventId ?? null, staffId: shift?.staffId ?? null };
}

/** Un evento cuenta como «por venir» hasta un día después de su fecha (la noche puede pasar de las 00:00). */
const UPCOMING_GRACE_MS = 24 * 3_600_000;

/** Los accesos de una persona salen de su ficha y de sus turnos: para cada noche por venir en que está
 * asignada y con un cargo con pantalla, tiene un operador con su cargo y su PIN; activo solo si la
 * persona está activa y ya tiene PIN. Lo que hay que apagar:
 * - si se archiva, todos sus accesos;
 * - si su cargo ya no usa pantalla, los de las noches por venir.
 * Los operadores enlazados de antes (con el PIN que puso el admin) siguen funcionando hasta que la
 * persona cree el suyo: sin PIN propio no se les toca el PIN. Idempotente. */
export async function syncStaffAccess(staffId: number, now: Date = new Date()) {
  const db = await need();
  const [m] = await db.select({ name: staffMembers.name, email: staffMembers.email, cargo: staffMembers.cargo, pinHash: staffMembers.pinHash, active: staffMembers.active })
    .from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
  if (!m) return { created: 0, updated: 0 };
  if (!m.active) {
    await db.update(operators).set({ active: 0 }).where(eq(operators.staffId, staffId));
    return { created: 0, updated: 0 };
  }
  const role = operatorRoleForCargo(m.cargo);
  const cutoff = new Date(now.getTime() - UPCOMING_GRACE_MS);
  const upcoming = await db.select({ eventId: staffShifts.eventId }).from(staffShifts)
    .innerJoin(events, eq(events.id, staffShifts.eventId))
    .where(and(eq(staffShifts.staffId, staffId), gte(events.eventDate, cutoff)));
  const upcomingIds = upcoming.map((r) => r.eventId);
  const mine = await db.select({ id: operators.id, eventId: operators.eventId, pinHash: operators.pinHash, active: operators.active }).from(operators).where(eq(operators.staffId, staffId));
  let created = 0;
  let updated = 0;

  if (!role) {
    // Su cargo no usa pantalla: se apagan sus accesos de las noches que vienen.
    const off = mine.filter((o) => upcomingIds.includes(o.eventId) && o.active);
    if (off.length) await db.update(operators).set({ active: 0 }).where(inArray(operators.id, off.map((o) => o.id)));
    return { created: 0, updated: off.length };
  }

  for (const eventId of upcomingIds) {
    const op = mine.find((o) => o.eventId === eventId);
    const pinHash = m.pinHash ?? op?.pinHash ?? NO_PIN;
    const active = pinHash !== NO_PIN ? 1 : 0;
    const values = { name: m.name, email: m.email, role, pinHash, active };
    if (op) { await db.update(operators).set(values).where(eq(operators.id, op.id)); updated++; }
    else { await db.insert(operators).values({ ...values, eventId, staffId }); created++; }
  }
  // El PIN propio vale también en sus accesos de antes (noches pasadas o enlazados a mano).
  if (m.pinHash) {
    const others = mine.filter((o) => !upcomingIds.includes(o.eventId)).map((o) => o.id);
    if (others.length) await db.update(operators).set({ pinHash: m.pinHash, name: m.name }).where(inArray(operators.id, others));
  }
  return { created, updated };
}

/** El evento anterior a este que tiene staff asignado (para «Copiar equipo del evento anterior»). */
export async function previousEventWithShifts(eventId: number) {
  const db = await need();
  const [event] = await db.select({ eventDate: events.eventDate }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event?.eventDate) return null;
  const [prev] = await db.select({ id: events.id, title: events.title, eventDate: events.eventDate }).from(events)
    .innerJoin(staffShifts, eq(staffShifts.eventId, events.id))
    .where(and(ne(events.id, eventId), lt(events.eventDate, event.eventDate)))
    .orderBy(desc(events.eventDate)).limit(1);
  return prev ?? null;
}

/** Copia el equipo (y lo pactado) de otro evento a este, sin repetir a quien ya está ni a los archivados.
 * Devuelve a quiénes agregó, para sincronizar sus accesos y avisarles. */
export async function copyShifts(fromEventId: number, toEventId: number) {
  const db = await need();
  const from = await db.select({ staffId: staffShifts.staffId, amountClp: staffShifts.amountClp, paymentType: staffShifts.paymentType, amountMode: staffShifts.amountMode, hours: staffShifts.hours })
    .from(staffShifts).innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(and(eq(staffShifts.eventId, fromEventId), eq(staffMembers.active, 1)));
  const already = new Set((await db.select({ staffId: staffShifts.staffId }).from(staffShifts).where(eq(staffShifts.eventId, toEventId))).map((r) => r.staffId));
  const added: number[] = [];
  for (const s of from) {
    if (already.has(s.staffId)) continue;
    await db.insert(staffShifts).values({ eventId: toEventId, staffId: s.staffId, amountClp: s.amountClp, paymentType: s.paymentType, amountMode: s.amountMode, hours: s.hours });
    added.push(s.staffId);
  }
  return { added };
}

function normName(name: string | null | undefined): string {
  return (name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Ficha única (drizzle/0129): completa lo que antes vivía aparte, sin pisar nada ya cargado.
 * - `cargo` sale del texto libre del rol (shared/staffCargos.ts `cargoFromRole`).
 * - `email` sale del JSON viejo de correos (lo pasa `legacyEmails`).
 * - Los operadores sin `staffId` se enlazan por correo, o por nombre si hay una sola persona con ese nombre.
 * Es idempotente: se puede correr cada vez que se abre la lista. */
export async function backfillStaffUnify(legacyEmails: Record<number, string>) {
  const db = await need();
  const staff = await db.select({ id: staffMembers.id, name: staffMembers.name, role: staffMembers.role, cargo: staffMembers.cargo, email: staffMembers.email, pinHash: staffMembers.pinHash }).from(staffMembers);
  const taken = new Set(staff.map((m) => m.email).filter(Boolean) as string[]);
  for (const m of staff) {
    const set: Record<string, unknown> = {};
    if (!m.cargo && m.role) set.cargo = cargoFromRole(m.role);
    const legacy = legacyEmails[m.id];
    if (!m.email && legacy && !taken.has(legacy)) { set.email = legacy; taken.add(legacy); m.email = legacy; }
    if (Object.keys(set).length) await db.update(staffMembers).set(set).where(eq(staffMembers.id, m.id));
  }
  const loose = await db.select({ id: operators.id, name: operators.name, email: operators.email }).from(operators).where(isNull(operators.staffId));
  if (loose.length === 0) return { linked: 0 };
  const byEmail = new Map(staff.filter((m) => m.email).map((m) => [m.email!, m]));
  const byName = new Map<string, typeof staff>();
  for (const m of staff) { const k = normName(m.name); byName.set(k, [...(byName.get(k) ?? []), m]); }
  let linked = 0;
  for (const op of loose) {
    const email = (op.email ?? '').trim().toLowerCase();
    const sameName = byName.get(normName(op.name)) ?? [];
    const match = (email && byEmail.get(email)) || (sameName.length === 1 ? sameName[0] : null);
    if (!match) continue;
    await db.update(operators).set({ staffId: match.id }).where(eq(operators.id, op.id));
    linked++;
  }
  return { linked };
}

/** Los operadores sueltos (sin persona del staff) de estos eventos: el admin los enlaza a mano. */
export async function unlinkedOperators(eventIds: number[]) {
  if (eventIds.length === 0) return [];
  const db = await need();
  return db.select({ id: operators.id, eventId: operators.eventId, name: operators.name, role: operators.role, email: operators.email })
    .from(operators).where(and(isNull(operators.staffId), eq(operators.active, 1), inArray(operators.eventId, eventIds)));
}

export async function linkOperator(operatorId: number, staffId: number | null) {
  const db = await need();
  if (staffId != null) {
    const [m] = await db.select({ pinHash: staffMembers.pinHash }).from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
    if (!m) throw new Error('Esa persona no existe');
    // Si ya creó su PIN, el operador pasa a usar ese.
    await db.update(operators).set({ staffId, ...(m.pinHash ? { pinHash: m.pinHash } : {}) }).where(eq(operators.id, operatorId));
    return { success: true };
  }
  await db.update(operators).set({ staffId: null }).where(eq(operators.id, operatorId));
  return { success: true };
}

export const NO_PIN = '!';

/** La persona eligió (o cambió) su PIN: queda en su ficha y en todos sus accesos. */
export async function setStaffPinHash(staffId: number, pinHash: string | null) {
  const db = await need();
  await db.update(staffMembers).set({ pinHash, pinSetAt: pinHash ? new Date() : null }).where(eq(staffMembers.id, staffId));
  // Sin PIN, sus accesos quedan con un hash que no calza con ningún PIN (server/caja/auth.ts verifyPin).
  await db.update(operators).set({ pinHash: pinHash ?? NO_PIN, failedPinAttempts: 0, lockedUntil: null }).where(eq(operators.staffId, staffId));
  // Con PIN nuevo se encienden los accesos de las noches en que ya está asignada.
  if (pinHash) await syncStaffAccess(staffId);
  return { success: true };
}
