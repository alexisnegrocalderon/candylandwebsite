/* Actualizaciones de esquema que el admin puede aplicar desde el panel (botón «Actualizar base de datos»)
 * cuando la migración todavía no se corrió a mano. Es la misma `drizzle/0129_staff_unificado.sql`, pero
 * idempotente: cada paso mira primero si la columna o el índice ya existen, así que se puede apretar
 * más de una vez, o después de correr la migración, sin romper nada. Solo agrega columnas nulas e índices:
 * no borra ni cambia datos. */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

interface Step {
  /** Qué se ve en el aviso si falta. */
  label: string;
  /** ¿Ya está aplicado este paso? */
  done: (have: Have) => boolean;
  statement: string;
}

interface Have {
  columns: Set<string>; // «tabla.columna»
  indexes: Set<string>; // «tabla.índice»
}

const col = (table: string, column: string) => `${table}.${column}`;

const STAFF_STEPS: Step[] = [
  { label: 'staffMembers.email', done: (h) => h.columns.has(col('staffMembers', 'email')), statement: "ALTER TABLE `staffMembers` ADD `email` varchar(320)" },
  {
    label: 'staffMembers.cargo', done: (h) => h.columns.has(col('staffMembers', 'cargo')),
    statement: "ALTER TABLE `staffMembers` ADD `cargo` enum('caja','barra','puerta','cocina','guardarropia','supervisor','dj','rrpp','produccion','otro')",
  },
  { label: 'staffMembers.pinHash', done: (h) => h.columns.has(col('staffMembers', 'pinHash')), statement: "ALTER TABLE `staffMembers` ADD `pinHash` varchar(255)" },
  { label: 'staffMembers.pinSetAt', done: (h) => h.columns.has(col('staffMembers', 'pinSetAt')), statement: "ALTER TABLE `staffMembers` ADD `pinSetAt` timestamp NULL" },
  {
    label: 'índice de correos del staff', done: (h) => h.indexes.has(col('staffMembers', 'staff_members_email_idx')),
    statement: "CREATE UNIQUE INDEX `staff_members_email_idx` ON `staffMembers` (`email`)",
  },
  { label: 'operators.staffId', done: (h) => h.columns.has(col('operators', 'staffId')), statement: "ALTER TABLE `operators` ADD `staffId` int" },
  {
    label: 'índice de accesos por persona', done: (h) => h.indexes.has(col('operators', 'operators_staff_idx')),
    statement: "CREATE INDEX `operators_staff_idx` ON `operators` (`staffId`)",
  },
];

async function readHave(): Promise<Have | null> {
  const db = await getDb();
  if (!db) return null;
  const [cols] = (await db.execute(sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('staffMembers', 'operators')`)) as unknown as [{ t: string; c: string }[]];
  const [idx] = (await db.execute(sql`SELECT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('staffMembers', 'operators')`)) as unknown as [{ t: string; i: string }[]];
  return {
    columns: new Set(cols.map((r) => col(r.t, r.c))),
    indexes: new Set(idx.map((r) => col(r.t, r.i))),
  };
}

// Una vez completa no vuelve a faltar: se deja de consultar information_schema en cada pedido.
let staffSchemaReady = false;

/** Qué le falta a la base para el staff unificado. `ready: true` = no falta nada. */
export async function staffSchemaStatus(): Promise<{ ready: boolean; missing: string[] }> {
  if (staffSchemaReady) return { ready: true, missing: [] };
  const have = await readHave();
  if (!have) return { ready: true, missing: [] };
  const missing = STAFF_STEPS.filter((s) => !s.done(have)).map((s) => s.label);
  staffSchemaReady = missing.length === 0;
  return { ready: staffSchemaReady, missing };
}

/** Aplica lo que falte, en orden y parando en el primer error (cada paso es independiente y se puede reintentar). */
export async function applyStaffSchema(): Promise<{ applied: string[] }> {
  const db = await getDb();
  const have = await readHave();
  if (!db || !have) throw new Error('No hay conexión con la base de datos.');
  const applied: string[] = [];
  for (const step of STAFF_STEPS) {
    if (step.done(have)) continue;
    await db.execute(sql.raw(step.statement));
    applied.push(step.label);
  }
  staffSchemaReady = false; // se vuelve a comprobar en la próxima consulta
  return { applied };
}
