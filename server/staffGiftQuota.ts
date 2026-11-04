/* Cupo de entradas del staff: cuántas entradas puede regalar cada persona del equipo desde su app. Parte en 0 y solo
 * el dueño lo cambia (Admin → Noche → Staff). Cada entrada que regala es un pase «a elección» válido para cualquier
 * evento (server/accessCredit.ts): queda en los Cupones de quien lo recibe y lo usa cuando quiera.
 *
 * La tabla se crea sola la primera vez (CREATE TABLE IF NOT EXISTS, igual que drizzle/0146_staff_gift_quota.sql): no
 * hace falta migrar a mano para usarla. */
import { and, eq, gt, sql } from "drizzle-orm";
import { staffGiftQuota } from "../drizzle/schema";
import { getDb, recordAdminAudit } from "./db";
import { issueGiftPass } from "./accessCredit";
import { ANY_ACCESS_SLUG } from "../shared/accessCredit";
import { cleanGiftMessage } from "../shared/giftFlow";

export const STAFF_QUOTA_MAX = 500;

let tableOk = false;
async function ensureTable(): Promise<boolean> {
  if (tableOk) return true;
  try {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`staffGiftQuota\` (\`staffId\` int NOT NULL, \`entradas\` int NOT NULL DEFAULT 0, \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`staffGiftQuota_staffId\` PRIMARY KEY(\`staffId\`))`);
    tableOk = true;
    return true;
  } catch (err) {
    console.error("[staffGiftQuota] tabla:", err);
    return false;
  }
}

/** El cupo de cada persona del equipo que tiene uno guardado (el resto es 0). */
export async function getQuotas(): Promise<Record<number, number>> {
  if (!(await ensureTable())) return {};
  const db = await getDb();
  const rows = await db!.select().from(staffGiftQuota);
  return Object.fromEntries(rows.map((r) => [r.staffId, r.entradas]));
}

export async function getQuota(staffId: number): Promise<number> {
  if (!(await ensureTable())) return 0;
  const db = await getDb();
  const [row] = await db!.select().from(staffGiftQuota).where(eq(staffGiftQuota.staffId, staffId)).limit(1);
  return row?.entradas ?? 0;
}

/** El dueño deja el cupo de una persona en `entradas` (0 = no puede regalar). */
export async function setQuota(staffId: number, entradas: number, actor: { by: string; ip?: string | null }): Promise<number> {
  if (!(await ensureTable())) throw new Error("No se pudo preparar el cupo de entradas. Intenta de nuevo.");
  const value = Math.max(0, Math.min(STAFF_QUOTA_MAX, Math.round(entradas)));
  const db = await getDb();
  const before = await getQuota(staffId);
  await db!.insert(staffGiftQuota).values({ staffId, entradas: value }).onDuplicateKeyUpdate({ set: { entradas: value } });
  await recordAdminAudit({ action: "staff.giftQuotaSet", targetType: "staffMember", targetId: staffId, ip: actor.ip ?? null, payload: { by: actor.by, before, after: value } });
  return value;
}

/** Descuenta una entrada solo si queda alguna (una sola consulta: dos toques seguidos no pasan del cupo). */
async function takeOne(staffId: number): Promise<boolean> {
  const db = await getDb();
  const res = await db!.update(staffGiftQuota).set({ entradas: sql`${staffGiftQuota.entradas} - 1` }).where(and(eq(staffGiftQuota.staffId, staffId), gt(staffGiftQuota.entradas, 0)));
  const header = (Array.isArray(res) ? res[0] : res) as { affectedRows?: number } | undefined;
  return (header?.affectedRows ?? 0) > 0;
}

async function giveBack(staffId: number): Promise<void> {
  const db = await getDb();
  await db!.update(staffGiftQuota).set({ entradas: sql`${staffGiftQuota.entradas} + 1` }).where(eq(staffGiftQuota.staffId, staffId));
}

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Una persona del equipo regala UNA entrada de su cupo: un pase a elección válido para cualquier evento, sin vencimiento,
 * que queda en los Cupones de quien lo recibe. Si el pase no se puede crear, la entrada vuelve al cupo. */
export async function sendStaffEntrada(params: {
  staff: { id: number; name: string; email: string | null };
  to: { email: string; name?: string | null };
  message?: string | null;
}): Promise<{ code: string; quedan: number; emailSent: boolean }> {
  const email = params.to.email.trim().toLowerCase();
  if (!looksLikeEmail(email)) throw new Error("Escribe un correo válido.");
  if (params.staff.email && email === params.staff.email.trim().toLowerCase()) throw new Error("No puedes regalarte una entrada a ti.");
  if (!(await ensureTable())) throw new Error("No se pudo revisar tu cupo. Intenta de nuevo.");
  if (!(await takeOne(params.staff.id))) throw new Error("No te quedan entradas para regalar.");
  try {
    const pass = await issueGiftPass({
      email, name: params.to.name?.trim() || null, eventId: null, accesoSlug: ANY_ACCESS_SLUG, validUntil: null,
      reason: `Cupo de ${params.staff.name}`.slice(0, 40), actor: `staff:${params.staff.name}`, message: cleanGiftMessage(params.message ?? undefined),
    });
    const quedan = await getQuota(params.staff.id);
    await recordAdminAudit({ action: "staff.giftQuotaUse", targetType: "staffMember", targetId: params.staff.id, payload: { to: email, code: pass.code, quedan } });
    return { code: pass.code, quedan, emailSent: pass.emailSent };
  } catch (err) {
    await giveBack(params.staff.id).catch((e) => console.error("[staffGiftQuota] no se pudo devolver la entrada", e));
    throw err;
  }
}
