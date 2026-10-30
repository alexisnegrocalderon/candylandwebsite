/** Cuentas de supervisora para el panel de admin (ver shared/panelSupervisor.ts).
 * Mismo esquema de clave + segundo factor que el socio de co-producción. */
import { randomInt } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import { panelSupervisors } from '../drizzle/schema';
import type { InferSelectModel } from 'drizzle-orm';
type PanelSupervisorRow = InferSelectModel<typeof panelSupervisors>;
import { getDb } from './db';
import { hashPin, verifyPin } from './caja/auth';
import { generatePartnerPassword } from '../shared/coproduction';

const isMissingTable = (err: unknown) => /doesn't exist|no such table|unknown table/i.test(String((err as any)?.message ?? (err as any)?.cause?.message ?? err));

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (err) {
    if (isMissingTable(err)) return fallback;
    throw err;
  }
}

export async function getSupervisorById(id: number): Promise<PanelSupervisorRow | null> {
  const db = await getDb();
  if (!db) return null;
  return safe(async () => (await db.select().from(panelSupervisors).where(eq(panelSupervisors.id, id)).limit(1))[0] ?? null, null);
}

export async function listSupervisors(): Promise<PanelSupervisorRow[]> {
  const db = await getDb();
  if (!db) return [];
  return safe(() => db.select().from(panelSupervisors).orderBy(desc(panelSupervisors.createdAt)), []);
}

/** La supervisora cuya clave es esta (para el login). */
export async function findSupervisorByPassword(password: string): Promise<PanelSupervisorRow | null> {
  if (!password) return null;
  for (const s of await listSupervisors()) {
    if (s.passwordHash && verifyPin(password, s.passwordHash)) return s;
  }
  return null;
}

/** Crea la cuenta y devuelve la clave legible UNA sola vez. */
export async function createSupervisor(name: string): Promise<{ id: number; password: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const password = generatePartnerPassword((max) => randomInt(max));
  const [res] = await db.insert(panelSupervisors).values({ name: name.trim(), passwordHash: hashPin(password) });
  return { id: Number((res as any).insertId), password };
}

/** Clave nueva: cierra sus sesiones abiertas y reinicia su segundo factor. */
export async function resetSupervisorPassword(id: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const s = await getSupervisorById(id);
  if (!s) throw new Error('Supervisora no encontrada');
  const password = generatePartnerPassword((max) => randomInt(max));
  await db.update(panelSupervisors).set({
    passwordHash: hashPin(password), sessionVersion: s.sessionVersion + 1,
    totpSecret: null, totpConfirmedAt: null, totpBackupCodes: null, totpLastUsedStep: null,
  }).where(eq(panelSupervisors.id, id));
  return password;
}

/** Quita el acceso: sin clave y con todas sus sesiones cerradas. */
export async function revokeSupervisor(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const s = await getSupervisorById(id);
  if (!s) throw new Error('Supervisora no encontrada');
  await db.update(panelSupervisors).set({
    passwordHash: null, sessionVersion: s.sessionVersion + 1,
    totpSecret: null, totpConfirmedAt: null, totpBackupCodes: null, totpLastUsedStep: null,
  }).where(eq(panelSupervisors.id, id));
}

export async function setSupervisorTotp(id: number, patch: Partial<Pick<PanelSupervisorRow, 'totpSecret' | 'totpConfirmedAt' | 'totpBackupCodes' | 'totpLastUsedStep'>>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(panelSupervisors).set(patch).where(eq(panelSupervisors.id, id));
}
