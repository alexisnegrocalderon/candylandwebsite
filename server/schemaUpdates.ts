/* Actualizaciones de esquema que el admin puede aplicar desde el panel (botón «Actualizar base de datos»)
 * cuando la migración todavía no se corrió a mano: las mismas `drizzle/0129_staff_unificado.sql` y
 * `drizzle/0130_soltero_approvals.sql`, pero idempotentes: cada paso mira primero si la columna o el índice ya existen, así que se puede apretar
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
  tables: Set<string>;
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

/** drizzle/0130_soltero_approvals.sql: aprobación de solteros (server/solteros.ts). */
const SOLTERO_STEPS: Step[] = [
  {
    label: 'tabla de aprobación de solteros', done: (h) => h.tables.has('solteroApprovals'),
    statement: [
      'CREATE TABLE `solteroApprovals` (',
      '\t`id` int AUTO_INCREMENT NOT NULL,',
      '\t`email` varchar(320) NOT NULL,',
      "\t`status` enum('pendiente','aprobado','rechazado','revocado') NOT NULL DEFAULT 'pendiente',",
      '\t`fullName` varchar(255),',
      '\t`rut` varchar(20),',
      '\t`instagram` varchar(100),',
      '\t`phone` varchar(40),',
      '\t`referredBy` varchar(160),',
      '\t`message` varchar(500),',
      '\t`adminNote` varchar(500),',
      '\t`requestedAt` timestamp NOT NULL DEFAULT (now()),',
      '\t`reviewedAt` timestamp NULL,',
      '\t`createdAt` timestamp NOT NULL DEFAULT (now()),',
      '\t`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,',
      '\tCONSTRAINT `solteroApprovals_id` PRIMARY KEY(`id`)',
      ')',
    ].join('\n'),
  },
  {
    label: 'índice de correos de solteros', done: (h) => h.indexes.has(col('solteroApprovals', 'soltero_approvals_email_idx')),
    statement: "CREATE UNIQUE INDEX `soltero_approvals_email_idx` ON `solteroApprovals` (`email`)",
  },
  {
    label: 'índice de estado de solteros', done: (h) => h.indexes.has(col('solteroApprovals', 'soltero_approvals_status_idx')),
    statement: "CREATE INDEX `soltero_approvals_status_idx` ON `solteroApprovals` (`status`)",
  },
];

/** drizzle/0131_staff_manuals.sql: manual del staff. Va aparte (MANUAL_STEPS): si falta, solo el manual avisa; la lista de staff sigue andando. */
const MANUAL_STEPS: Step[] = [
  {
    label: 'tabla de manuales del staff', done: (h) => h.tables.has('staffManuals'),
    statement: [
      'CREATE TABLE `staffManuals` (', '\t`id` int AUTO_INCREMENT NOT NULL,', '\t`manualKey` varchar(24) NOT NULL,', '\t`version` int NOT NULL,',
      '\t`title` varchar(120) NOT NULL,', '\t`sections` json NOT NULL,', '\t`changeNote` varchar(255),', '\t`publishedAt` timestamp NOT NULL DEFAULT (now()),',
      '\tCONSTRAINT `staffManuals_id` PRIMARY KEY(`id`)', ')',
    ].join('\n'),
  },
  {
    label: 'índice de versiones del manual', done: (h) => h.indexes.has(col('staffManuals', 'staff_manuals_key_version_idx')),
    statement: "CREATE UNIQUE INDEX `staff_manuals_key_version_idx` ON `staffManuals` (`manualKey`,`version`)",
  },
  {
    label: 'tabla de aceptaciones del manual', done: (h) => h.tables.has('staffManualAcceptances'),
    statement: [
      'CREATE TABLE `staffManualAcceptances` (', '\t`id` int AUTO_INCREMENT NOT NULL,', '\t`staffId` int NOT NULL,', '\t`manualKey` varchar(24) NOT NULL,', '\t`version` int NOT NULL,',
      '\t`fullName` varchar(120) NOT NULL,', '\t`rut` varchar(20),', '\t`userAgent` varchar(255),', '\t`ip` varchar(64),', '\t`acceptedAt` timestamp NOT NULL DEFAULT (now()),',
      '\tCONSTRAINT `staffManualAcceptances_id` PRIMARY KEY(`id`)', ')',
    ].join('\n'),
  },
  {
    label: 'índice único de aceptaciones', done: (h) => h.indexes.has(col('staffManualAcceptances', 'staff_manual_accept_idx')),
    statement: "CREATE UNIQUE INDEX `staff_manual_accept_idx` ON `staffManualAcceptances` (`staffId`,`manualKey`,`version`)",
  },
  {
    label: 'índice de aceptaciones por persona', done: (h) => h.indexes.has(col('staffManualAcceptances', 'staff_manual_accept_staff_idx')),
    statement: "CREATE INDEX `staff_manual_accept_staff_idx` ON `staffManualAcceptances` (`staffId`)",
  },
];

/** Todo lo que el botón sabe aplicar, en orden. */
export const SCHEMA_STEPS: Step[] = [...STAFF_STEPS, ...SOLTERO_STEPS];

async function readHave(): Promise<Have | null> {
  const db = await getDb();
  if (!db) return null;
  const [cols] = (await db.execute(sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('staffMembers', 'operators')`)) as unknown as [{ t: string; c: string }[]];
  const [idx] = (await db.execute(sql`SELECT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('staffMembers', 'operators', 'solteroApprovals', 'staffManuals', 'staffManualAcceptances')`)) as unknown as [{ t: string; i: string }[]];
  const [tbl] = (await db.execute(sql`SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('solteroApprovals', 'staffManuals', 'staffManualAcceptances')`)) as unknown as [{ t: string }[]];
  return {
    tables: new Set(tbl.map((r) => r.t)),
    columns: new Set(cols.map((r) => col(r.t, r.c))),
    indexes: new Set(idx.map((r) => col(r.t, r.i))),
  };
}

// Una vez completa no vuelve a faltar: se deja de consultar information_schema en cada pedido.
let staffSchemaReady = false;

/** Qué le falta a la base (staff unificado y solteros). `ready: true` = no falta nada. */
export async function staffSchemaStatus(): Promise<{ ready: boolean; missing: string[] }> {
  if (staffSchemaReady) return { ready: true, missing: [] };
  const have = await readHave();
  if (!have) return { ready: true, missing: [] };
  const missing = SCHEMA_STEPS.filter((s) => !s.done(have)).map((s) => s.label);
  staffSchemaReady = missing.length === 0;
  return { ready: staffSchemaReady, missing };
}

/** Aplica lo que falte, en orden y parando en el primer error (cada paso es independiente y se puede reintentar). */
export async function applyStaffSchema(): Promise<{ applied: string[] }> {
  const db = await getDb();
  const have = await readHave();
  if (!db || !have) throw new Error('No hay conexión con la base de datos.');
  const applied: string[] = [];
  for (const step of SCHEMA_STEPS) {
    if (step.done(have)) continue;
    await db.execute(sql.raw(step.statement));
    applied.push(step.label);
  }
  staffSchemaReady = false; // se vuelve a comprobar en la próxima consulta
  return { applied };
}

let manualSchemaReady = false;

/** ¿Existen las tablas del manual del staff? */
export async function manualSchemaStatus(): Promise<{ ready: boolean; missing: string[] }> {
  if (manualSchemaReady) return { ready: true, missing: [] };
  const have = await readHave();
  if (!have) return { ready: true, missing: [] };
  const missing = MANUAL_STEPS.filter((s) => !s.done(have)).map((s) => s.label);
  manualSchemaReady = missing.length === 0;
  return { ready: manualSchemaReady, missing };
}

export async function applyManualSchema(): Promise<{ applied: string[] }> {
  const db = await getDb();
  const have = await readHave();
  if (!db || !have) throw new Error('No hay conexión con la base de datos.');
  const applied: string[] = [];
  for (const step of MANUAL_STEPS) {
    if (step.done(have)) continue;
    await db.execute(sql.raw(step.statement));
    applied.push(step.label);
  }
  manualSchemaReady = false;
  return { applied };
}
