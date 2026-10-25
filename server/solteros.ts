/* Aprobación de solteros por persona (tabla `solteroApprovals`, drizzle/0130):
 * la persona la pide desde su app, el admin aprueba o rechaza desde el panel, y
 * aprobada compra «Soltero» sin código con su sesión de
 * «Mi cuenta» (la regla está en server/db.ts createOrder). Es permanente hasta
 * que el admin la revoque.
 *
 * Si la tabla todavía no existe (falta aplicar la migración), las lecturas
 * devuelven «sin aprobación» en vez de fallar: la compra sigue funcionando con
 * el código de comunidad de siempre. */
import { desc, eq } from 'drizzle-orm';
import { solteroApprovals, type SolteroApproval } from '../drizzle/schema';
import { getDb } from './db';
import { normalizeMemberEmail } from './memberAuth';
import { normalizeRut } from '../shared/rut';
import { normalizeIgHandle } from '../shared/igCustomerLink';
import { solteroRequestProblem, type SolteroStatus } from '../shared/soltero';
import { pushToEmail } from './customerPush';
import { sendPushToAdminsAlways } from './push';
import { buildSolteroApprovedEmail, sendEmail } from './email';

export interface SolteroRequestInput {
  fullName: string;
  rut: string;
  instagram: string;
  phone: string;
  referredBy?: string | null;
  message?: string | null;
}

/** La solicitud de este correo, o null (también si la tabla no existe todavía). */
export async function getSolteroApproval(email: string | null | undefined): Promise<SolteroApproval | null> {
  const key = normalizeMemberEmail(email ?? '');
  if (!key) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(solteroApprovals).where(eq(solteroApprovals.email, key)).limit(1);
    return row ?? null;
  } catch (e) {
    console.warn('[solteros] no se pudo leer la aprobación (¿falta la migración 0130?)', e);
    return null;
  }
}

export async function isSolteroApproved(email: string | null | undefined): Promise<boolean> {
  return (await getSolteroApproval(email))?.status === 'aprobado';
}

const clean = (input: SolteroRequestInput) => ({
  fullName: input.fullName.trim().slice(0, 255),
  rut: normalizeRut(input.rut).slice(0, 20),
  instagram: normalizeIgHandle(input.instagram).slice(0, 100),
  phone: input.phone.trim().slice(0, 40),
  referredBy: input.referredBy?.trim().slice(0, 160) || null,
  message: input.message?.trim().slice(0, 500) || null,
});

/** La persona pide la aprobación desde su app. Si ya está aprobada no cambia nada; si estaba rechazada o
 * revocada, vuelve a quedar en revisión con los datos nuevos. */
export async function requestSolteroApproval(email: string, input: SolteroRequestInput): Promise<{ status: SolteroStatus }> {
  const problem = solteroRequestProblem(input);
  if (problem) throw new Error(problem);
  const db = await getDb();
  if (!db) throw new Error('Servicio no disponible, intenta en un rato.');
  const key = normalizeMemberEmail(email);
  const current = await getSolteroApproval(key);
  if (current?.status === 'aprobado') return { status: 'aprobado' };
  const values = { ...clean(input), status: 'pendiente' as const, requestedAt: new Date(), reviewedAt: null, adminNote: null };
  if (current) await db.update(solteroApprovals).set(values).where(eq(solteroApprovals.id, current.id));
  else await db.insert(solteroApprovals).values({ ...values, email: key });
  void sendPushToAdminsAlways({ title: '🕺 Nueva solicitud de soltero', body: `${values.fullName} (@${values.instagram}) pide acceso Soltero.`, url: '/admin?section=solteros' });
  return { status: 'pendiente' };
}

/** Todas las solicitudes, las más nuevas primero. Sin la tabla (falta la migración) devuelve vacío: el panel
 * muestra el aviso de «Actualizar base de datos». */
export async function listSolteroApprovals(): Promise<SolteroApproval[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(solteroApprovals).orderBy(desc(solteroApprovals.requestedAt));
  } catch (e) {
    console.warn('[solteros] no se pudo listar (¿falta la migración 0130?)', e);
    return [];
  }
}

export type SolteroDecision = 'aprobar' | 'rechazar' | 'revocar';
const STATUS_FOR: Record<SolteroDecision, SolteroStatus> = { aprobar: 'aprobado', rechazar: 'rechazado', revocar: 'revocado' };

/** El admin decide. Al aprobar le llega el aviso (push y correo); rechazar y revocar no le avisan nada. */
export async function reviewSoltero(id: number, decision: SolteroDecision, note?: string | null) {
  const db = await getDb();
  if (!db) throw new Error('Servicio no disponible');
  const [row] = await db.select().from(solteroApprovals).where(eq(solteroApprovals.id, id)).limit(1);
  if (!row) throw new Error('Esa solicitud no existe');
  const { status: before, email, fullName } = row;
  const status = STATUS_FOR[decision];
  await db.update(solteroApprovals).set({ status, reviewedAt: new Date(), adminNote: note?.trim().slice(0, 500) || null }).where(eq(solteroApprovals.id, id));
  if (decision === 'aprobar' && before !== 'aprobado') await notifyApproved(email, fullName);
  return { id, status };
}

/** El admin aprueba directo a alguien que ya validó por otro lado (por ejemplo, por WhatsApp). */
export async function approveSolteroDirect(email: string, fullName?: string | null) {
  const db = await getDb();
  if (!db) throw new Error('Servicio no disponible');
  const key = normalizeMemberEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) throw new Error('Ese correo no es válido.');
  const current = await getSolteroApproval(key);
  const before = current?.status ?? null;
  const name = fullName ?? current?.fullName ?? null;
  const values = { status: 'aprobado' as const, reviewedAt: new Date(), ...(fullName?.trim() ? { fullName: fullName.trim().slice(0, 255) } : {}) };
  if (current) await db.update(solteroApprovals).set(values).where(eq(solteroApprovals.id, current.id));
  else await db.insert(solteroApprovals).values({ ...values, email: key });
  if (before !== 'aprobado') await notifyApproved(key, name);
  return { email: key, status: 'aprobado' as const };
}

async function notifyApproved(email: string, name: string | null) {
  void pushToEmail(email, { title: '✅ Quedaste aprobado', body: 'Ya puedes comprar tu acceso Soltero desde tu app, sin código.', url: '/cuenta' });
  await sendEmail({ to: email, subject: '✅ Ya puedes comprar tu acceso Soltero', html: buildSolteroApprovedEmail({ name }) }).catch(() => undefined);
}
