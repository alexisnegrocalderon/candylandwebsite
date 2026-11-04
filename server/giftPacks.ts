/* Paquetes de regalo guardados en la cuenta del dueño (Barra, Puerta, Invitado VIP…): antes vivían solo en el
 * navegador de cada celular. La tabla se crea sola la primera vez (CREATE TABLE IF NOT EXISTS, igual que
 * drizzle/0147_gift_packs.sql): no hace falta migrar a mano. */
import { eq, sql } from "drizzle-orm";
import { giftPacks } from "../drizzle/schema";
import { getDb } from "./db";
import type { GiftPackData } from "../shared/giftFlow";

let tableOk = false;
async function ensureTable(): Promise<boolean> {
  if (tableOk) return true;
  try {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`giftPacks\` (\`id\` int AUTO_INCREMENT NOT NULL, \`name\` varchar(60) NOT NULL, \`data\` json NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`giftPacks_id\` PRIMARY KEY(\`id\`), UNIQUE KEY \`gift_packs_name_idx\` (\`name\`))`);
    tableOk = true;
    return true;
  } catch (err) {
    console.error("[giftPacks] tabla:", err);
    return false;
  }
}

export interface GiftPackRow extends GiftPackData { id: number; name: string }

/** Los paquetes guardados, en orden alfabético. Nunca lanza: sin tabla, lista vacía. */
export async function listPacks(): Promise<GiftPackRow[]> {
  if (!(await ensureTable())) return [];
  try {
    const db = await getDb();
    const rows = await db!.select().from(giftPacks);
    return rows
      .map((r) => ({ id: r.id, name: r.name, ...(r.data as GiftPackData) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  } catch (err) {
    console.error("[giftPacks] lista:", err);
    return [];
  }
}

/** Guarda un paquete; si ya hay uno con ese nombre, lo reemplaza. */
export async function savePack(name: string, data: GiftPackData): Promise<void> {
  if (!(await ensureTable())) throw new Error("No se pudo guardar el paquete. Intenta de nuevo.");
  const db = await getDb();
  await db!.insert(giftPacks).values({ name: name.trim().slice(0, 60), data }).onDuplicateKeyUpdate({ set: { data } });
}

export async function deletePack(id: number): Promise<void> {
  if (!(await ensureTable())) return;
  const db = await getDb();
  await db!.delete(giftPacks).where(eq(giftPacks.id, id));
}
