/* Avisos de las pantallas de trabajo a los organizadores: llegan al celular del administrador y de los supervisores (Belén y
 * quien tenga ese cargo). Lo usan el botón «Llamar a los organizadores» de todas las pantallas y el aviso de la puerta. */
import { and, eq, isNotNull } from 'drizzle-orm';
import { operators, staffMembers } from '../drizzle/schema';
import { getDb } from './db';
import { sendPushToAdminsAlways } from './push';
import { pushToEmail } from './customerPush';
import { applyOp } from './caja/ops';
import { buildStaffCallPush, cleanCallNote, type StaffCallReason } from '../shared/staffCall';

/** Los correos de los supervisores de la noche: operadores de ese evento con rol supervisor y las personas del staff con cargo
 * supervisor. Sin repetir, en minúsculas. Nunca lanza. */
export async function supervisorEmails(eventId: number | null | undefined): Promise<string[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const fromOperators = eventId
      ? await db.select({ email: operators.email }).from(operators).where(and(eq(operators.eventId, eventId), eq(operators.role, 'supervisor'), eq(operators.active, 1), isNotNull(operators.email)))
      : [];
    const fromStaff = await db.select({ email: staffMembers.email }).from(staffMembers).where(and(eq(staffMembers.cargo, 'supervisor'), eq(staffMembers.active, 1), isNotNull(staffMembers.email)));
    const all = [...fromOperators, ...fromStaff].map((r: { email: string | null }) => (r.email ?? '').trim().toLowerCase()).filter((e) => e.includes('@'));
    return Array.from(new Set(all));
  } catch (err) {
    console.error('[staffCall] correos de supervisores:', err);
    return [];
  }
}

/** Manda el aviso al administrador (todos sus dispositivos) y a cada supervisor. Devuelve a cuántos supervisores les llegó. */
export async function notifyOrganizers(eventId: number | null | undefined, push: { title: string; body: string; url: string }): Promise<{ supervisors: number }> {
  const emails = await supervisorEmails(eventId);
  const [, sent] = await Promise.all([
    sendPushToAdminsAlways(push),
    Promise.all(emails.map((e) => pushToEmail(e, push))),
  ]);
  return { supervisors: sent.filter((n) => n > 0).length };
}

/** El botón «Llamar a los organizadores»: queda anotado en el registro de la noche y avisa a los organizadores. */
export async function callOrganizers(db: any, params: {
  eventId: number | null; area: string; reason: StaffCallReason; note?: string | null; operatorId: number; operatorName: string;
}) {
  const note = cleanCallNote(params.note);
  const push = buildStaffCallPush({ area: params.area, reason: params.reason, note, operatorName: params.operatorName });
  if (params.eventId) {
    try {
      await applyOp(db, {
        id: `call-${params.operatorId}-${Date.now()}`, type: 'note', eventId: params.eventId, operatorId: params.operatorId,
        targetType: 'terminal', targetId: params.area,
        payload: { kind: 'staff_call', area: params.area, reason: params.reason, note: note || null },
        clientAt: new Date(),
      }, async () => ({ result: 'applied' as const }));
    } catch (err) {
      console.error('[staffCall] no se pudo anotar el aviso:', err); // el aviso sale igual
    }
  }
  return notifyOrganizers(params.eventId, push);
}
