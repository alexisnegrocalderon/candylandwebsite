/* Dónde se guardan las conversaciones del Asistente IA. Las tablas se crean solas la primera vez (igual que
 * drizzle/0148_assistant.sql). Aparte de server/assistant/run.ts para poder probar el ciclo sin base de datos. */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { assistantMessages, assistantThreads } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AssistantMessageView, AssistantProposal, AssistantUi } from "../../shared/assistant";

let tablesOk = false;
async function ensureTables(): Promise<boolean> {
  if (tablesOk) return true;
  const db = await getDb();
  if (!db) return false;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS \`assistantThreads\` (\`id\` int AUTO_INCREMENT NOT NULL, \`title\` varchar(160) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`assistantThreads_id\` PRIMARY KEY(\`id\`))`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS \`assistantMessages\` (\`id\` int AUTO_INCREMENT NOT NULL, \`threadId\` int NOT NULL, \`role\` varchar(12) NOT NULL, \`api\` json NOT NULL, \`ui\` json NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`assistantMessages_id\` PRIMARY KEY(\`id\`), KEY \`assistant_messages_thread_idx\` (\`threadId\`,\`id\`))`);
  tablesOk = true;
  return true;
}
async function needDb() {
  if (!(await ensureTables())) throw new Error("Base de datos no disponible");
  return (await getDb())!;
}
const insertId = (res: unknown) => Number((Array.isArray(res) ? (res[0] as any)?.insertId : (res as any)?.insertId) ?? 0);

export async function listThreads(limit = 40) {
  const db = await needDb();
  const rows = await db.select().from(assistantThreads).orderBy(desc(assistantThreads.updatedAt)).limit(limit);
  return rows.map((t) => ({ id: t.id, title: t.title, updatedAt: new Date(t.updatedAt).toISOString() }));
}

export async function getThread(threadId: number): Promise<{ id: number; title: string; messages: AssistantMessageView[] } | null> {
  const db = await needDb();
  const [t] = await db.select().from(assistantThreads).where(eq(assistantThreads.id, threadId)).limit(1);
  if (!t) return null;
  const rows = await db.select().from(assistantMessages).where(eq(assistantMessages.threadId, threadId)).orderBy(asc(assistantMessages.id));
  return { id: t.id, title: t.title, messages: rows.map((r) => ({ id: r.id, role: r.role as "user" | "assistant", ui: r.ui as AssistantUi, createdAt: new Date(r.createdAt).toISOString() })) };
}

export async function deleteThread(threadId: number) {
  const db = await needDb();
  await db.delete(assistantMessages).where(eq(assistantMessages.threadId, threadId));
  await db.delete(assistantThreads).where(eq(assistantThreads.id, threadId));
}

/** La propuesta guardada en un mensaje (para confirmarla). */
export async function getProposal(messageId: number, proposalId: string): Promise<{ proposal: AssistantProposal; ui: AssistantUi } | null> {
  const db = await needDb();
  const [row] = await db.select().from(assistantMessages).where(and(eq(assistantMessages.id, messageId), eq(assistantMessages.role, "assistant"))).limit(1);
  if (!row) return null;
  const ui = row.ui as AssistantUi;
  const proposal = (ui.proposals ?? []).find((p) => p.id === proposalId);
  return proposal ? { proposal, ui } : null;
}

/** Marca cómo terminó una propuesta (hecha, cancelada o fallida) en lo que muestra la pantalla. */
export async function setProposalState(messageId: number, proposalId: string, estado: AssistantProposal["estado"], resultado?: string) {
  const db = await needDb();
  const [row] = await db.select().from(assistantMessages).where(eq(assistantMessages.id, messageId)).limit(1);
  if (!row) return;
  const ui = row.ui as AssistantUi;
  const proposals = (ui.proposals ?? []).map((p) => (p.id === proposalId ? { ...p, estado, resultado } : p));
  await db.update(assistantMessages).set({ ui: { ...ui, proposals } }).where(eq(assistantMessages.id, messageId));
}

// Dos toques seguidos en «Confirmar» no la ejecutan dos veces: se reserva aquí antes de correrla.
const claiming = new Set<string>();

/** Reserva una propuesta pendiente para ejecutarla (una sola vez aunque se toque dos veces). */
export async function claimProposal(messageId: number, proposalId: string): Promise<AssistantProposal | null> {
  const key = `${messageId}:${proposalId}`;
  if (claiming.has(key)) return null;
  claiming.add(key);
  try {
    const found = await getProposal(messageId, proposalId);
    if (!found || found.proposal.estado !== "pendiente") return null;
    await setProposalState(messageId, proposalId, "hecha", "Ejecutando…");
    return found.proposal;
  } finally {
    claiming.delete(key);
  }
}

export async function threadExists(id: number): Promise<boolean> {
  const db = await needDb();
  const [t] = await db.select({ id: assistantThreads.id }).from(assistantThreads).where(eq(assistantThreads.id, id)).limit(1);
  return !!t;
}

export async function createThread(title: string): Promise<number> {
  const db = await needDb();
  return insertId(await db.insert(assistantThreads).values({ title }));
}

/** Los mensajes de la API de una conversación, en orden, y cuántas preguntas tiene. */
export async function loadHistory(threadId: number): Promise<{ api: unknown[]; exchanges: number }> {
  const db = await needDb();
  const rows = await db.select().from(assistantMessages).where(eq(assistantMessages.threadId, threadId)).orderBy(asc(assistantMessages.id));
  return { api: rows.flatMap((m) => (m.api as unknown[]) ?? []), exchanges: rows.filter((m) => m.role === "user").length };
}

export async function insertMessage(threadId: number, role: "user" | "assistant", api: unknown[], ui: AssistantUi): Promise<number> {
  const db = await needDb();
  return insertId(await db.insert(assistantMessages).values({ threadId, role, api, ui }));
}

export async function clearApi(messageId: number): Promise<void> {
  const db = await needDb();
  await db.update(assistantMessages).set({ api: [] }).where(eq(assistantMessages.id, messageId));
}

export async function touchThread(threadId: number): Promise<void> {
  const db = await needDb();
  await db.update(assistantThreads).set({ updatedAt: new Date() }).where(eq(assistantThreads.id, threadId));
}
