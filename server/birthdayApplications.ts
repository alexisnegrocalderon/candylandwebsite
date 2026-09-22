import { and, desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { birthdayApplications, birthdayPeople, discountCodes, events } from '../drizzle/schema';
import { isBirthdayEligible } from '../shared/birthdayApplication';

/* Postulaciones al programa Cumpleañeros, desde la página pública
 * /beneficios-cumpleaneros. La validación de datos y la ventana de
 * elegibilidad (±5 días del evento) son puras y viven en
 * shared/birthdayApplication.ts; acá está solo lo que toca la base -- mismo
 * split que server/ambassadorApplications.ts. */

export type ApplicationStatus = 'pendiente' | 'aprobada' | 'rechazada';

export type CreateApplicationResult =
  | { ok: true; id: number }
  | { ok: false; reason: 'ya_pendiente' | 'sin_base' | 'evento_no_existe' | 'fuera_de_ventana' };

/** Guarda una postulación para un evento puntual. Revalida la ventana de
 * fecha en el servidor (nunca confiar solo en el chequeo del formulario) y
 * evita duplicar una postulación pendiente del mismo correo para el mismo
 * evento -- alguien rechazado SÍ puede volver a postular, por eso no hay
 * único en (email, eventId). */
export async function createApplication(data: {
  eventId: number;
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  birthDate: string;
  message: string;
  acceptedTerms: boolean;
}): Promise<CreateApplicationResult> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'sin_base' };

  const [event] = await db.select({ id: events.id, eventDate: events.eventDate })
    .from(events).where(eq(events.id, data.eventId)).limit(1);
  if (!event) return { ok: false, reason: 'evento_no_existe' };
  if (!isBirthdayEligible(event.eventDate, data.birthDate)) return { ok: false, reason: 'fuera_de_ventana' };

  const email = data.email.trim().toLowerCase();

  const [pendiente] = await db.select({ id: birthdayApplications.id })
    .from(birthdayApplications)
    .where(and(
      eq(birthdayApplications.email, email),
      eq(birthdayApplications.eventId, data.eventId),
      eq(birthdayApplications.status, 'pendiente'),
    ))
    .limit(1);
  if (pendiente) return { ok: false, reason: 'ya_pendiente' };

  const inserted = await db.insert(birthdayApplications).values({
    eventId: data.eventId,
    name: data.name,
    email,
    whatsapp: data.whatsapp,
    instagram: data.instagram || null,
    birthDate: data.birthDate,
    message: data.message || null,
    acceptedTerms: data.acceptedTerms ? 1 : 0,
  });

  const id = (inserted as unknown as { insertId: number }).insertId;
  console.log(`[Cumpleañeros] Nueva postulación de ${data.name} (${email}) para el evento ${data.eventId}`);
  return { ok: true, id };
}

export async function listApplications(status?: ApplicationStatus, eventId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    status ? eq(birthdayApplications.status, status) : undefined,
    eventId ? eq(birthdayApplications.eventId, eventId) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  return db.select().from(birthdayApplications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(birthdayApplications.createdAt));
}

export async function getApplication(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(birthdayApplications).where(eq(birthdayApplications.id, id)).limit(1);
  return row ?? null;
}

/** Rechaza (o vuelve a dejar pendiente) una postulación, con nota opcional. */
export async function reviewApplication(params: { id: number; status: ApplicationStatus; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(birthdayApplications).set({
    status: params.status,
    reviewNote: params.note ?? null,
    reviewedAt: new Date(),
  }).where(eq(birthdayApplications.id, params.id));
  return { success: true };
}

/** Aprueba la postulación Y crea al cumpleañero en un solo paso: genera un
 * código de descuento normal (`discountCodes`, percentage, atado al evento
 * de la postulación) con el código y el % que escribió el admin, y lo liga
 * en `birthdayPeople`. El checkout no necesita saber nada de este programa
 * -- valida este código exactamente igual que cualquier otro.
 *
 * Si el código ya está en uso, se corta ANTES de tocar la postulación --
 * queda intacta en pendiente hasta que el cumpleañero exista de verdad. */
export async function approveApplication(params: { id: number; code: string; discountPercent: number }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const application = await getApplication(params.id);
  if (!application) throw new Error('No encontramos esa postulación');
  if (application.status === 'aprobada' && application.createdBirthdayPersonId) {
    throw new Error('Esa postulación ya fue aprobada');
  }

  const code = params.code.trim().toUpperCase();
  const [existingCode] = await db.select({ id: discountCodes.id }).from(discountCodes)
    .where(eq(discountCodes.code, code)).limit(1);
  if (existingCode) throw new Error(`El código ${code} ya está en uso por otro código de descuento`);

  await db.insert(discountCodes).values({
    code,
    description: `Cumpleañero: ${application.name}`,
    discountType: 'percentage',
    discountValue: String(params.discountPercent),
    eventId: application.eventId,
    isActive: 1,
    // El % siempre es sobre el precio general (originalPrice), no sobre el
    // precio vigente de la tanda -- así no cambia según qué tan avanzada
    // esté la venta cuando el invitado compre. Ver drizzle/schema.ts.
    basedOnOriginalPrice: 1,
  });
  const [discountRow] = await db.select({ id: discountCodes.id }).from(discountCodes)
    .where(eq(discountCodes.code, code)).limit(1);
  if (!discountRow) throw new Error('No se pudo crear el código de descuento');

  const insertedPerson = await db.insert(birthdayPeople).values({
    applicationId: application.id,
    eventId: application.eventId,
    name: application.name,
    email: application.email,
    whatsapp: application.whatsapp,
    birthDate: application.birthDate,
    discountCodeId: discountRow.id,
  });
  const birthdayPersonId = (insertedPerson as unknown as { insertId: number }).insertId;

  await db.update(birthdayApplications).set({
    status: 'aprobada',
    reviewedAt: new Date(),
    createdBirthdayPersonId: birthdayPersonId,
  }).where(eq(birthdayApplications.id, params.id));

  console.log(`[Cumpleañeros] ${application.name} aprobado con el código ${code} (${params.discountPercent}% para sus invitados)`);

  return {
    success: true,
    birthdayPersonId,
    code,
    name: application.name,
    email: application.email,
  };
}

/** Cuántas hay sin revisar, para el contador del admin. */
export async function countPendingApplications(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: birthdayApplications.id }).from(birthdayApplications)
    .where(eq(birthdayApplications.status, 'pendiente'));
  return rows.length;
}
