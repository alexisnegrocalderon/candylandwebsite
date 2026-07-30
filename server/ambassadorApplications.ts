import { and, desc, eq } from 'drizzle-orm';
import { getDb, createExclusiveAmbassador } from './db';
import { ambassadorApplications, exclusiveAmbassadors } from '../drizzle/schema';

/* Postulaciones para ser embajador VIP, desde la página pública
 * /embajadores. La validación de los datos es pura y vive en
 * shared/ambassadorApplication.ts; acá está solo lo que toca la base. */

export type ApplicationStatus = 'pendiente' | 'aprobada' | 'rechazada';

export type CreateApplicationResult =
  | { ok: true; id: number }
  | { ok: false; reason: 'ya_pendiente' | 'sin_base' };

/** Guarda una postulación. Si esa persona ya tiene una pendiente, no se
 * duplica: se responde para que la página se lo diga amablemente en vez de
 * acumular filas iguales cada vez que aprieta enviar. Alguien ya rechazado SÍ
 * puede volver a postular -- por eso no hay único en `email`. */
export async function createApplication(data: {
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  followers: number | null;
  message: string;
  acceptedTerms: boolean;
}): Promise<CreateApplicationResult> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'sin_base' };

  const email = data.email.trim().toLowerCase();

  const [pendiente] = await db.select({ id: ambassadorApplications.id })
    .from(ambassadorApplications)
    .where(and(
      eq(ambassadorApplications.email, email),
      eq(ambassadorApplications.status, 'pendiente'),
    ))
    .limit(1);
  if (pendiente) return { ok: false, reason: 'ya_pendiente' };

  const inserted = await db.insert(ambassadorApplications).values({
    name: data.name,
    email,
    whatsapp: data.whatsapp,
    instagram: data.instagram,
    followers: data.followers,
    message: data.message || null,
    acceptedTerms: data.acceptedTerms ? 1 : 0,
  });

  const id = (inserted as unknown as { insertId: number }).insertId;
  console.log(`[Postulaciones] Nueva postulación de ${data.name} (@${data.instagram}, ${email})`);
  return { ok: true, id };
}

export async function listApplications(status?: ApplicationStatus) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ambassadorApplications)
    .where(status ? eq(ambassadorApplications.status, status) : undefined)
    .orderBy(desc(ambassadorApplications.createdAt));
}

export async function getApplication(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(ambassadorApplications).where(eq(ambassadorApplications.id, id)).limit(1);
  return row ?? null;
}

/** Rechaza (o vuelve a dejar pendiente) una postulación, con nota opcional. */
export async function reviewApplication(params: { id: number; status: ApplicationStatus; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(ambassadorApplications).set({
    status: params.status,
    reviewNote: params.note ?? null,
    reviewedAt: new Date(),
  }).where(eq(ambassadorApplications.id, params.id));
  return { success: true };
}

/** Aprueba la postulación Y crea al embajador en un solo paso, con el código
 * que escribió el admin.
 *
 * Reusa `createExclusiveAmbassador` (server/db.ts) en vez de insertar a mano,
 * así el alta pasa por la misma validación de código repetido y la misma
 * normalización a mayúsculas que el formulario del admin. El WhatsApp va al
 * campo `contact`, que el schema ya documenta como texto libre para teléfono
 * o Instagram.
 *
 * Si el código ya está en uso, `createExclusiveAmbassador` lanza y la
 * postulación queda INTACTA en pendiente -- se marca como aprobada solo
 * después de que el embajador existe de verdad. */
export async function approveApplication(params: { id: number; code: string; commissionPercent?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const application = await getApplication(params.id);
  if (!application) throw new Error('No encontramos esa postulación');
  if (application.status === 'aprobada' && application.createdAmbassadorId) {
    throw new Error('Esa postulación ya fue aprobada');
  }

  await createExclusiveAmbassador({
    name: application.name,
    code: params.code,
    commissionPercent: params.commissionPercent ?? null,
    contact: application.whatsapp,
    email: application.email,
    instagram: application.instagram,
  });

  const [created] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors)
    .where(eq(exclusiveAmbassadors.code, params.code.trim().toUpperCase())).limit(1);

  await db.update(ambassadorApplications).set({
    status: 'aprobada',
    reviewedAt: new Date(),
    createdAmbassadorId: created?.id ?? null,
  }).where(eq(ambassadorApplications.id, params.id));

  console.log(`[Postulaciones] ${application.name} aprobado como embajador con el código ${params.code.trim().toUpperCase()}`);

  return {
    success: true,
    ambassadorId: created?.id ?? null,
    code: params.code.trim().toUpperCase(),
    name: application.name,
    email: application.email,
  };
}

/** Cuántas hay sin revisar, para el contador del admin. */
export async function countPendingApplications(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: ambassadorApplications.id }).from(ambassadorApplications)
    .where(eq(ambassadorApplications.status, 'pendiente'));
  return rows.length;
}
