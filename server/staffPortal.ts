/* La app del staff (shared/staffPortal.ts). Lo que no tiene columna propia
 * se guarda en la tabla del Estudio (`contentDesigns`) con `kind = 'staff'`,
 * igual que el contenido de embajadores, para no tener que migrar la base:
 * - una fila sin evento con el correo de cada persona del equipo;
 * - una fila por evento con la información para el staff (general, por rol,
 *   vestimenta, contactos), la hora de citación y la llegada de cada uno. */
import { createHmac, timingSafeEqual } from 'crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import QRCode from 'qrcode';
import { contentDesigns, events, staffMembers, staffShifts } from '../drizzle/schema';
import { ENV } from './_core/env';
import { getDb } from './db';
import { buildStaffWelcomeEmail, sendEmail } from './email';
import { honorariosBreakdown } from '../shared/honorarios';
import { monthKeyFor } from '../shared/ambassadorProgram';
import {
  isValidCallTime,
  normalizeStaffEventInfo,
  noteForRole,
  parseStaffCode,
  roleKey,
  staffToolsForRole,
  type StaffContact,
  type StaffEventInfo,
} from '../shared/staffPortal';

export const STAFF_KIND = 'staff';

async function need() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  return db;
}

function normEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/* --- Almacenamiento ------------------------------------------------------- */

async function readRow(eventId: number | null): Promise<{ id: number; data: Record<string, unknown> } | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ id: contentDesigns.id, data: contentDesigns.data }).from(contentDesigns)
    .where(and(eq(contentDesigns.kind, STAFF_KIND), eventId == null ? isNull(contentDesigns.eventId) : eq(contentDesigns.eventId, eventId)))
    .orderBy(desc(contentDesigns.id)).limit(1);
  return row ? { id: row.id, data: (row.data ?? {}) as Record<string, unknown> } : null;
}

async function writeRow(eventId: number | null, data: Record<string, unknown>): Promise<void> {
  const db = await need();
  const existing = await readRow(eventId);
  if (existing) {
    await db.update(contentDesigns).set({ data }).where(eq(contentDesigns.id, existing.id));
    return;
  }
  await db.insert(contentDesigns).values({ kind: STAFF_KIND, eventId, title: eventId == null ? 'Staff · correos' : `Staff · evento ${eventId}`, format: 'post', theme: STAFF_KIND, data });
}

/* --- Correos del equipo --------------------------------------------------- */

export async function getStaffEmails(): Promise<Record<number, string>> {
  const row = await readRow(null);
  const raw = (row?.data.emails ?? {}) as Record<string, unknown>;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const email = normEmail(typeof v === 'string' ? v : '');
    if (/^\d+$/.test(k) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out[Number(k)] = email;
  }
  return out;
}

/** Guarda (o borra, con null/vacío) el correo con que esa persona entra a la app.
 * Devuelve el correo si es nuevo (para mandarle la bienvenida), o null. */
export async function setStaffEmail(staffId: number, email: string | null | undefined): Promise<string | null> {
  const row = await readRow(null);
  const emails = { ...((row?.data.emails ?? {}) as Record<string, string>) };
  const clean = normEmail(email);
  const before = emails[String(staffId)] ?? null;
  if (clean) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Ese correo no es válido.');
    const taken = Object.entries(emails).find(([k, v]) => v === clean && Number(k) !== staffId);
    if (taken) throw new Error('Ese correo ya es de otra persona del equipo.');
    emails[String(staffId)] = clean;
  } else {
    delete emails[String(staffId)];
  }
  await writeRow(null, { ...(row?.data ?? {}), emails });
  return clean && clean !== before ? clean : null;
}

/** Correo de bienvenida a la app del staff (botón a «Mi cuenta»). */
export async function sendStaffWelcome(staffId: number): Promise<boolean> {
  const email = (await getStaffEmails())[staffId];
  const db = await getDb();
  if (!email || !db) return false;
  const [staff] = await db.select({ name: staffMembers.name, role: staffMembers.role, active: staffMembers.active }).from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
  if (!staff?.active) return false;
  const r = await sendEmail({ to: email, subject: '🪩 Tu app de staff de PlayRoom', html: buildStaffWelcomeEmail({ name: staff.name, role: staff.role, email }) });
  return r.success;
}

/** La persona del equipo (activa) dueña de ese correo, o null. */
export async function findStaffByEmail(email: string) {
  const key = normEmail(email);
  if (!key) return null;
  const emails = await getStaffEmails();
  const id = Object.entries(emails).find(([, v]) => v === key)?.[0];
  if (!id) return null;
  const db = await getDb();
  if (!db) return null;
  const [staff] = await db.select().from(staffMembers).where(and(eq(staffMembers.id, Number(id)), eq(staffMembers.active, 1))).limit(1);
  return staff ?? null;
}

/* --- Información por evento ----------------------------------------------- */

export async function getEventStaffInfo(eventId: number): Promise<StaffEventInfo> {
  return normalizeStaffEventInfo((await readRow(eventId))?.data);
}

/** Cambia la información para el staff de un evento (lo general, la vestimenta, los contactos y las notas por rol). */
export async function saveEventStaffInfo(eventId: number, patch: { general?: string; dressCode?: string; contacts?: StaffContact[]; byRole?: Record<string, string> }): Promise<StaffEventInfo> {
  const current = await getEventStaffInfo(eventId);
  const byRole: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch.byRole ?? current.byRole)) {
    const key = roleKey(k);
    if (key && v?.trim()) byRole[key] = v;
  }
  const next = normalizeStaffEventInfo({ ...current, ...patch, byRole });
  await writeRow(eventId, next as unknown as Record<string, unknown>);
  return next;
}

/** Hora de citación de una persona en un evento («21:30», o vacío para quitarla). */
export async function setStaffCallTime(eventId: number, staffId: number, time: string | null): Promise<void> {
  if (time && !isValidCallTime(time)) throw new Error('La hora va como 21:30.');
  const info = await getEventStaffInfo(eventId);
  const callTimes = { ...info.callTimes };
  if (time) callTimes[String(staffId)] = time; else delete callTimes[String(staffId)];
  await writeRow(eventId, { ...info, callTimes });
}

/* --- Credencial ----------------------------------------------------------- */

function signature(staffId: number, eventId: number): string {
  if (!ENV.cookieSecret) throw new Error('JWT_SECRET no configurado');
  return createHmac('sha256', ENV.cookieSecret).update(`staff-credential:${staffId}:${eventId}`).digest('hex').slice(0, 6).toUpperCase();
}

/** El código del QR de la credencial de una persona para un evento. */
export function staffCredentialCode(staffId: number, eventId: number): string {
  return `STAFF-${staffId}-${eventId}-${signature(staffId, eventId)}`;
}

/** ¿Es una credencial de verdad (firmada por nosotros) para este evento? */
export function verifyStaffCode(code: string, eventId: number): { staffId: number } | null {
  const parsed = parseStaffCode(code);
  if (!parsed || parsed.eventId !== eventId) return null;
  const expected = Buffer.from(signature(parsed.staffId, parsed.eventId));
  const got = Buffer.from(parsed.sig);
  return expected.length === got.length && timingSafeEqual(expected, got) ? { staffId: parsed.staffId } : null;
}

/** El equipo asignado a un evento, para la puerta (funciona sin señal: va en su snapshot). */
export async function staffForDoor(eventId: number): Promise<{ code: string; name: string; role: string | null }[]> {
  const db = await getDb();
  if (!db || !ENV.cookieSecret) return [];
  const rows = await db.select({ staffId: staffShifts.staffId, name: staffMembers.name, role: staffMembers.role })
    .from(staffShifts).innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(eq(staffShifts.eventId, eventId));
  return rows.map((r) => ({ code: staffCredentialCode(r.staffId, eventId), name: r.name, role: r.role }));
}

/** La puerta escaneó una credencial: queda anotada la llegada (la primera vez). */
export async function recordStaffArrival(eventId: number, code: string) {
  const ok = verifyStaffCode(code, eventId);
  if (!ok) return { ok: false as const, reason: 'Esa credencial no es de este evento.' };
  const db = await need();
  const [row] = await db.select({ name: staffMembers.name, role: staffMembers.role }).from(staffShifts)
    .innerJoin(staffMembers, eq(staffMembers.id, staffShifts.staffId))
    .where(and(eq(staffShifts.eventId, eventId), eq(staffShifts.staffId, ok.staffId))).limit(1);
  if (!row) return { ok: false as const, reason: 'Esa persona no está asignada a este evento.' };
  const info = await getEventStaffInfo(eventId);
  const before = info.arrivals[String(ok.staffId)] ?? null;
  if (!before) await writeRow(eventId, { ...info, arrivals: { ...info.arrivals, [String(ok.staffId)]: new Date().toISOString() } });
  return { ok: true as const, name: row.name, role: row.role, alreadyArrivedAt: before };
}

/* --- Lo que ve la persona en su app --------------------------------------- */

export async function getStaffPortal(email: string, now: Date = new Date()) {
  const staff = await findStaffByEmail(email);
  if (!staff) return null;
  const db = await need();
  const rows = await db.select({
    shiftId: staffShifts.id, eventId: events.id, title: events.title, eventDate: events.eventDate, doorsOpen: events.doorsOpen,
    venue: events.venue, address: events.address, amountClp: staffShifts.amountClp, paymentType: staffShifts.paymentType,
    amountMode: staffShifts.amountMode, paid: staffShifts.paid,
  }).from(staffShifts).innerJoin(events, eq(events.id, staffShifts.eventId))
    .where(eq(staffShifts.staffId, staff.id)).orderBy(desc(events.eventDate)).limit(20);

  const cutoff = now.getTime() - 12 * 3_600_000;
  const upcomingIds = rows.filter((r) => r.eventDate && new Date(r.eventDate).getTime() >= cutoff).map((r) => r.eventId);
  const infos = new Map<number, StaffEventInfo>();
  if (upcomingIds.length > 0) {
    const infoRows = await db.select({ eventId: contentDesigns.eventId, data: contentDesigns.data }).from(contentDesigns)
      .where(and(eq(contentDesigns.kind, STAFF_KIND), inArray(contentDesigns.eventId, upcomingIds)));
    for (const r of infoRows) if (r.eventId != null) infos.set(r.eventId, normalizeStaffEventInfo(r.data));
  }

  const shifts = rows.map((r) => {
    const upcoming = upcomingIds.includes(r.eventId);
    const info = infos.get(r.eventId) ?? normalizeStaffEventInfo(null);
    const year = r.eventDate ? Number(monthKeyFor(r.eventDate as any).slice(0, 4)) : now.getFullYear();
    const pay = honorariosBreakdown({ amount: Number(r.amountClp), paymentType: r.paymentType, amountMode: r.amountMode, year });
    return {
      eventId: r.eventId,
      title: r.title,
      eventDate: r.eventDate,
      doorsOpen: r.doorsOpen,
      upcoming,
      paid: !!r.paid,
      netClp: pay.net,
      // Solo de los que vienen: dirección, citación y lo que dejó escrito el dueño.
      ...(upcoming ? {
        venue: r.venue ?? null,
        address: r.address ?? null,
        callTime: info.callTimes[String(staff.id)] ?? null,
        arrivedAt: info.arrivals[String(staff.id)] ?? null,
        general: info.general,
        dressCode: info.dressCode,
        roleNote: noteForRole(info, staff.role),
        contacts: info.contacts,
      } : {}),
    };
  });

  // La credencial es la del próximo evento (o el de esta noche).
  const next = [...shifts].filter((s) => s.upcoming).sort((a, b) => new Date(a.eventDate as any).getTime() - new Date(b.eventDate as any).getTime())[0] ?? null;
  const credential = next && ENV.cookieSecret
    ? { eventId: next.eventId, code: staffCredentialCode(staff.id, next.eventId) }
    : null;
  const qrImageUrl = credential ? await QRCode.toDataURL(credential.code, { type: 'image/png', width: 400, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#FFFFFF' } }) : null;

  return {
    name: staff.name,
    role: staff.role,
    tools: staffToolsForRole(staff.role),
    credential: credential ? { ...credential, qrImageUrl } : null,
    shifts,
  };
}
