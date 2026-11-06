/* Cross check (shared/crossCheck.ts): las automatizaciones que salen solas (avisos de venta, carritos abandonados) y
 * los pasos del piloto del evento ya no mandan nada por su cuenta: dejan un pedido acá, le llega un push al dueño y
 * recién cuando toca «Reportar» se ejecuta. Si la tabla no se puede crear, la automatización NO sale (el lado seguro). */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { crossCheckConfig, crossChecks } from "../drizzle/schema";
import { getDb } from "./db";
import { sendPushToAdminsAlways } from "./push";
import { startOfChileDay } from "../shared/chileDate";
import { CROSS_CHECK_AUTOMATIONS, describeRunResult, type CrossCheckAutomation, type CrossCheckItem, type CrossCheckStatus } from "../shared/crossCheck";

let tablesOk = false;
async function ensureTables(): Promise<boolean> {
  if (tablesOk) return true;
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS \`crossChecks\` (\`id\` int AUTO_INCREMENT NOT NULL, \`kind\` varchar(40) NOT NULL, \`dedupeKey\` varchar(160) NOT NULL, \`eventId\` int, \`title\` varchar(200) NOT NULL, \`summary\` varchar(1000) NOT NULL, \`payload\` json, \`status\` varchar(12) NOT NULL DEFAULT 'pending', \`expiresAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`decidedAt\` timestamp NULL, \`result\` varchar(1000), CONSTRAINT \`crossChecks_id\` PRIMARY KEY(\`id\`), UNIQUE KEY \`cross_checks_dedupe_idx\` (\`dedupeKey\`), KEY \`cross_checks_status_idx\` (\`status\`))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS \`crossCheckConfig\` (\`kind\` varchar(40) NOT NULL, \`auto\` int NOT NULL DEFAULT 0, \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`crossCheckConfig_kind\` PRIMARY KEY(\`kind\`))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS \`eventPilots\` (\`eventId\` int NOT NULL, \`status\` varchar(8) NOT NULL DEFAULT 'on', \`startedAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`eventPilots_eventId\` PRIMARY KEY(\`eventId\`))`);
  tablesOk = true;
  return true;
}

/** La base lista (con las tablas del cross check y del piloto) o un error claro. */
export async function crossCheckDb() {
  if (!(await ensureTables())) throw new Error("Base de datos no disponible");
  return (await getDb())!;
}

/** Fin del día de Chile de `now`: hasta ahí vale un aviso del día. */
export function endOfChileDay(now: Date = new Date()): Date {
  return new Date(startOfChileDay(new Date(startOfChileDay(now).getTime() + 30 * 3600_000)).getTime());
}

const toItem = (r: typeof crossChecks.$inferSelect): CrossCheckItem => ({
  id: r.id, kind: r.kind, eventId: r.eventId ?? null, title: r.title, summary: r.summary, status: r.status as CrossCheckStatus,
  createdAt: new Date(r.createdAt).toISOString(), expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
  decidedAt: r.decidedAt ? new Date(r.decidedAt).toISOString() : null, result: r.result ?? null,
});

/* ── Configuración: qué sale solo ─────────────────────────────────────── */

export async function getCrossCheckConfig(): Promise<Record<CrossCheckAutomation, { auto: boolean }>> {
  const out = Object.fromEntries(CROSS_CHECK_AUTOMATIONS.map((k) => [k, { auto: false }])) as Record<CrossCheckAutomation, { auto: boolean }>;
  const db = await crossCheckDb();
  const rows = await db.select().from(crossCheckConfig);
  for (const r of rows) if (r.kind in out) out[r.kind as CrossCheckAutomation].auto = r.auto === 1;
  return out;
}

export async function setCrossCheckAuto(kind: CrossCheckAutomation, auto: boolean): Promise<void> {
  const db = await crossCheckDb();
  await db.insert(crossCheckConfig).values({ kind, auto: auto ? 1 : 0 }).onDuplicateKeyUpdate({ set: { auto: auto ? 1 : 0 } });
}

/* ── Pedir un cross check ─────────────────────────────────────────────── */

export interface CrossCheckRequest {
  kind: string;
  /** Mismo pedido = misma clave (ej. `sales-drip:2026-11-06`): no se pide dos veces. */
  dedupeKey: string;
  title: string;
  summary: string;
  eventId?: number | null;
  payload?: unknown;
  expiresAt?: Date | null;
  /** Texto del push; sin él va el título. */
  pushBody?: string;
}

/** Deja el pedido y avisa por push la primera vez. Devuelve si se creó (false = ya existía). */
export async function requestCrossCheck(req: CrossCheckRequest): Promise<boolean> {
  const db = await crossCheckDb();
  const res = await db.insert(crossChecks).ignore().values({
    kind: req.kind, dedupeKey: req.dedupeKey.slice(0, 160), title: req.title.slice(0, 200), summary: req.summary.slice(0, 1000),
    eventId: req.eventId ?? null, payload: (req.payload ?? null) as any, expiresAt: req.expiresAt ?? null,
  });
  const created = Number((Array.isArray(res) ? (res[0] as any)?.affectedRows : (res as any)?.affectedRows) ?? 0) > 0;
  if (created) await sendPushToAdminsAlways({ title: 'Cross check ✅', body: req.pushBody ?? req.title, url: '/admin?section=cross-check' });
  return created;
}

/** Para un cron: si esta automatización pide cross check, deja el pedido (si hay algo que mandar) y devuelve
 * `true` para que el cron NO mande nada. `false` = sale sola como siempre. Si algo falla, no sale (lado seguro). */
export async function gateAutomation(
  kind: CrossCheckAutomation,
  build: () => Promise<Omit<CrossCheckRequest, 'kind'> | null>,
): Promise<{ gated: boolean; requested?: boolean; error?: string }> {
  try {
    const config = await getCrossCheckConfig();
    if (config[kind].auto) return { gated: false };
    const req = await build();
    if (!req) return { gated: true, requested: false };
    return { gated: true, requested: await requestCrossCheck({ kind, ...req }) };
  } catch (err) {
    console.error(`[CrossCheck] ${kind}: no se pudo pedir el cross check, no sale nada:`, err);
    return { gated: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ── Lista, Reportar, Descartar ───────────────────────────────────────── */

/** Los vencidos pasan a «expired» (un aviso de ayer ya no se manda hoy). */
async function expireOld(db: Awaited<ReturnType<typeof crossCheckDb>>) {
  await db.update(crossChecks).set({ status: 'expired', decidedAt: new Date() })
    .where(and(eq(crossChecks.status, 'pending'), lt(crossChecks.expiresAt, new Date())));
}

export async function listCrossChecks(): Promise<{ pending: CrossCheckItem[]; recent: CrossCheckItem[] }> {
  const db = await crossCheckDb();
  await expireOld(db);
  const pending = await db.select().from(crossChecks).where(eq(crossChecks.status, 'pending')).orderBy(desc(crossChecks.createdAt)).limit(50);
  const recent = await db.select().from(crossChecks)
    .where(inArray(crossChecks.status, ['running', 'done', 'failed', 'discarded', 'expired'])).orderBy(desc(crossChecks.createdAt)).limit(30);
  return { pending: pending.map(toItem), recent: recent.map(toItem) };
}

/** Para las burbujas del panel: nunca falla (sin tabla = 0). */
export async function countPendingCrossChecks(): Promise<number> {
  try {
    const db = await crossCheckDb();
    const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(crossChecks)
      .where(and(eq(crossChecks.status, 'pending'), sql`(${crossChecks.expiresAt} IS NULL OR ${crossChecks.expiresAt} > NOW())`));
    return Number(row?.n ?? 0);
  } catch { return 0; }
}

/** Ejecuta lo pedido. Cada tipo sabe qué correr; los imports van adentro para no cruzar módulos al cargar. */
async function execute(item: typeof crossChecks.$inferSelect): Promise<string> {
  switch (item.kind) {
    case 'founders-promo': return describeRunResult(await (await import('./foundersPromo')).runFoundersPromoDaily());
    case 'tanda2-promo': return describeRunResult(await (await import('./tanda2Promo')).runTanda2PromoDaily());
    case 'sales-drip': return describeRunResult(await (await import('./salesDrip')).runSalesDripDaily());
    case 'abandoned-cart': return describeRunResult(await (await import('./orderReminders')).runAbandonedCartCron());
    default:
      if (item.kind.startsWith('pilot:')) return (await import('./eventPilot')).runPilotStep(item.kind.slice(6), item.eventId, item.payload);
      throw new Error(`No sé ejecutar «${item.kind}».`);
  }
}

/** «Reportar»: lo ejecuta una sola vez (dos toques seguidos no lo mandan dos veces). */
export async function reportCrossCheck(id: number): Promise<CrossCheckItem> {
  const db = await crossCheckDb();
  await expireOld(db);
  const claim = await db.update(crossChecks).set({ status: 'running', decidedAt: new Date() })
    .where(and(eq(crossChecks.id, id), eq(crossChecks.status, 'pending')));
  const claimed = Number((Array.isArray(claim) ? (claim[0] as any)?.affectedRows : (claim as any)?.affectedRows) ?? 0) > 0;
  const [row] = await db.select().from(crossChecks).where(eq(crossChecks.id, id)).limit(1);
  if (!row) throw new Error('Ese cross check ya no existe.');
  if (!claimed) throw new Error(row.status === 'expired' ? 'Venció: era para otro día.' : 'Ya se había decidido.');
  try {
    const result = await execute(row);
    await db.update(crossChecks).set({ status: 'done', result: result.slice(0, 1000) }).where(eq(crossChecks.id, id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(crossChecks).set({ status: 'failed', result: msg.slice(0, 1000) }).where(eq(crossChecks.id, id));
  }
  const [after] = await db.select().from(crossChecks).where(eq(crossChecks.id, id)).limit(1);
  return toItem(after);
}

export async function discardCrossCheck(id: number): Promise<void> {
  const db = await crossCheckDb();
  await db.update(crossChecks).set({ status: 'discarded', decidedAt: new Date() })
    .where(and(eq(crossChecks.id, id), eq(crossChecks.status, 'pending')));
}
