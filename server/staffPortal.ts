/* La app del staff (shared/staffPortal.ts). El correo, el cargo y el PIN
 * viven en `staffMembers` (ficha única, drizzle/0129). Lo que no tiene columna
 * propia se guarda en la tabla del Estudio (`contentDesigns`) con
 * `kind = 'staff'`, igual que el contenido de embajadores:
 * - una fila sin evento con los correos de antes de la ficha única (solo se lee para migrarlos);
 * - una fila por evento con la información para el staff (general, por rol,
 *   vestimenta, contactos), la hora de citación y la llegada de cada uno. */
import { createHmac, timingSafeEqual } from 'crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import QRCode from 'qrcode';
import { contentDesigns, events, operators, staffMembers, staffShifts } from '../drizzle/schema';
import { ENV } from './_core/env';
import { getActiveEventForCaja, getDb, listOperatorsForStaff } from './db';
import { hashPin } from './caja/auth';
import { NO_PIN, setStaffPinHash } from './staff';
import { isAdminEmail } from './adminEmail';
import { cargoDef, cargoTitle, operatorRoleForCargo, pinProblem } from '../shared/staffCargos';
import { staffSystemsFor } from '../shared/cajaRoles';
import { buildStaffShiftEmail, buildStaffWelcomeEmail, sendEmail } from './email';
import { formatChileDate } from '../shared/chileDate';
import { pushToEmail } from './customerPush';
import { honorariosBreakdown } from '../shared/honorarios';
import { monthKeyFor } from '../shared/ambassadorProgram';
import {
  isValidCallTime,
  normalizeStaffEventInfo,
  noteForRole,
  parseStaffCode,
  roleKey,
  linkStaffTools,
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Los correos del JSON viejo (antes de la columna `staffMembers.email`). Solo para la migración
 * (server/staff.ts `backfillStaffUnify`) y de respaldo mientras no se haya corrido. */
export async function getLegacyStaffEmails(): Promise<Record<number, string>> {
  const row = await readRow(null);
  const raw = (row?.data.emails ?? {}) as Record<string, unknown>;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const email = normEmail(typeof v === 'string' ? v : '');
    if (/^\d+$/.test(k) && EMAIL_RE.test(email)) out[Number(k)] = email;
  }
  return out;
}

/** Guarda (o borra, con null/vacío) el correo con que esa persona entra a la app.
 * Devuelve el correo si es nuevo (para mandarle la bienvenida), o null. */
export async function setStaffEmail(staffId: number, email: string | null | undefined): Promise<string | null> {
  const db = await need();
  const clean = normEmail(email);
  const [current] = await db.select({ email: staffMembers.email }).from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
  const before = current?.email ?? null;
  if (clean) {
    if (!EMAIL_RE.test(clean)) throw new Error('Ese correo no es válido.');
    const [taken] = await db.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.email, clean)).limit(1);
    if (taken && taken.id !== staffId) throw new Error('Ese correo ya es de otra persona del equipo.');
  }
  await db.update(staffMembers).set({ email: clean || null }).where(eq(staffMembers.id, staffId));
  return clean && clean !== before ? clean : null;
}

/** Correo de bienvenida a la app del staff (botón a «Mi cuenta», donde crea su PIN). */
export async function sendStaffWelcome(staffId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [staff] = await db.select({ name: staffMembers.name, role: staffMembers.role, cargo: staffMembers.cargo, email: staffMembers.email, active: staffMembers.active, pinHash: staffMembers.pinHash }).from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
  if (!staff?.active || !staff.email) return false;
  const needsPin = !!operatorRoleForCargo(staff.cargo) && !staff.pinHash;
  // Si ya tiene la app con avisos, también le llega al celular (nunca lanza).
  void pushToEmail(staff.email, {
    title: '🪩 Ya eres parte del staff',
    body: needsPin ? 'Entra a tu app y crea tu PIN para la noche del evento.' : 'Tu credencial y tus turnos ya están en tu app.',
    url: '/cuenta?staff=1',
  });
  const r = await sendEmail({
    to: staff.email,
    subject: '🪩 Tu app de staff de PlayRoom',
    html: buildStaffWelcomeEmail({ name: staff.name, role: cargoTitle(staff.cargo, staff.role), email: staff.email, needsPin }),
  });
  return r.success;
}

/** Aviso (correo y push) de que la asignaron a una noche. Sin correo o archivada: no se manda. Nunca lanza. */
export async function notifyStaffShift(staffId: number, eventId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const [staff] = await db.select({ name: staffMembers.name, role: staffMembers.role, cargo: staffMembers.cargo, email: staffMembers.email, active: staffMembers.active, pinHash: staffMembers.pinHash }).from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
    const [event] = await db.select({ title: events.title, eventDate: events.eventDate }).from(events).where(eq(events.id, eventId)).limit(1);
    if (!staff?.active || !staff.email || !event) return false;
    const callTime = (await getEventStaffInfo(eventId)).callTimes[String(staffId)] ?? null;
    const needsPin = !!operatorRoleForCargo(staff.cargo) && !staff.pinHash;
    const role = cargoTitle(staff.cargo, staff.role);
    const dateLabel = event.eventDate ? formatChileDate(event.eventDate, { withWeekday: true }) : 'Fecha por confirmar';
    void pushToEmail(staff.email, {
      title: `🪩 Trabajas en ${event.title}`,
      body: [role, dateLabel, callTime ? `citación ${callTime}` : null].filter(Boolean).join(' · '),
      url: '/cuenta?staff=1',
    });
    const r = await sendEmail({
      to: staff.email,
      subject: `🪩 Estás en el staff de ${event.title}`,
      html: buildStaffShiftEmail({ name: staff.name, role, eventTitle: event.title, eventDateLabel: dateLabel, callTime, needsPin }),
    });
    return r.success;
  } catch (e) {
    console.warn('[staff] aviso de turno', e);
    return false;
  }
}

/** La persona del equipo (activa) dueña de ese correo, o null. */
/** El dueño (correo en ADMIN_EMAILS) entra a caja, puerta, cocina y guardarropía desde su app: se le prepara una
 * ficha de equipo («Administración», cargo supervisor) y un acceso de administrador en la noche activa. Entra con
 * el PIN que crea en la app. Idempotente; con cualquier otro correo no hace nada. */
export async function ensureAdminStaffAccess(email: string): Promise<void> {
  if (!isAdminEmail(email)) return;
  try {
    const db = await getDb();
    if (!db) return;
    const key = normEmail(email);
    let staff = await findStaffByEmail(key);
    if (!staff) {
      const [res] = await db.insert(staffMembers).values({ name: 'Administración', role: 'Administración', cargo: 'supervisor', email: key, defaultRateClp: 0, notes: 'Acceso del dueño a las pantallas de trabajo (creado desde la app).' }) as any;
      staff = await findStaffByEmail(key) ?? { id: Number(res.insertId), name: 'Administración', pinHash: null } as any;
    }
    const event = await getActiveEventForCaja();
    if (!event || !staff) return;
    const pinHash = staff.pinHash ?? NO_PIN;
    const values = { name: staff.name, email: key, role: 'admin' as const, pinHash, active: pinHash !== NO_PIN ? 1 : 0 };
    const [mine] = await db.select({ id: operators.id }).from(operators).where(and(eq(operators.staffId, staff.id), eq(operators.eventId, event.id))).limit(1);
    if (mine) await db.update(operators).set(values).where(eq(operators.id, mine.id));
    else await db.insert(operators).values({ ...values, eventId: event.id, staffId: staff.id });
  } catch (e) {
    console.warn('[staff] no se pudo preparar el acceso del administrador', e);
  }
}

export async function findStaffByEmail(email: string) {
  const key = normEmail(email);
  if (!key) return null;
  const db = await getDb();
  if (!db) return null;
  // Esto corre para cualquiera que entra a «Mi cuenta» o pide un código: si la base todavía no tiene las
  // columnas del staff (migración 0129), no puede tumbar el login de los clientes.
  try { return await findStaffRow(db, key); }
  catch (e) { console.warn('[staff] no se pudo buscar al staff por correo (¿falta la migración 0129?)', e); return null; }
}

async function findStaffRow(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, key: string) {
  const [staff] = await db.select().from(staffMembers).where(and(eq(staffMembers.email, key), eq(staffMembers.active, 1))).limit(1);
  if (staff) return staff;
  // Respaldo: el correo todavía está solo en el JSON viejo (no se ha abierto la lista del staff desde la migración).
  const id = Object.entries(await getLegacyStaffEmails()).find(([, v]) => v === key)?.[0];
  if (!id) return null;
  const [legacy] = await db.select().from(staffMembers).where(and(eq(staffMembers.id, Number(id)), eq(staffMembers.active, 1), isNull(staffMembers.email))).limit(1);
  return legacy ? { ...legacy, email: key } : null;
}

/** La persona del staff con sesión en la app crea o cambia su PIN de las pantallas de trabajo. */
export async function setOwnStaffPin(email: string, pin: string) {
  await ensureAdminStaffAccess(email);
  const staff = await findStaffByEmail(email);
  if (!staff) throw new Error('Tu correo no está en el equipo.');
  const problem = pinProblem(pin);
  if (problem) throw new Error(problem);
  if (!staff.email || staff.email !== normEmail(email)) await setStaffEmail(staff.id, email);
  await setStaffPinHash(staff.id, hashPin(pin));
  return { success: true };
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

/** Los sistemas en que esta persona tiene acceso en el evento activo (Caja → Accesos). Sin evento o
 * sin base: ninguno (las herramientas del cargo igual se muestran). */
async function operatorSystems(staffId: number, email: string) {
  try {
    const event = await getActiveEventForCaja();
    if (!event) return [];
    const ops = await listOperatorsForStaff(event.id, staffId, email);
    return staffSystemsFor(ops.map((o: any) => ({ id: o.id as number, role: o.role as string })));
  } catch {
    return [];
  }
}

export async function getStaffPortal(email: string, now: Date = new Date()) {
  await ensureAdminStaffAccess(email);
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
        roleNote: noteForRole(info, cargoTitle(staff.cargo, staff.role)),
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

  const cargo = cargoDef(staff.cargo);
  return {
    name: staff.name,
    role: cargoTitle(staff.cargo, staff.role),
    cargo: cargo ? { key: cargo.key, label: cargo.label, emoji: cargo.emoji } : null,
    // PIN de las pantallas de trabajo: solo para los cargos que usan una.
    pin: cargo?.operatorRole || staff.pinHash ? { set: !!staff.pinHash, setAt: staff.pinSetAt ?? null } : null,
    // Solo las pantallas donde de verdad tiene acceso esta noche (nada de botones que llevan a un login sin su nombre).
    tools: linkStaffTools([], await operatorSystems(staff.id, staff.email ?? email)),
    credential: credential ? { ...credential, qrImageUrl } : null,
    shifts,
  };
}
