/* Las migraciones de Playmatch (drizzle/0136_playmatch_identidad.sql y 0137_playmatch_mercado.sql), aplicadas solas: la
 * primera vez que el servidor abre la base mira qué le falta y lo agrega. Playmatch lee todas las columnas del perfil,
 * así que sin ellas no funcionaría nada; por eso no espera a un botón como Staff o Insumos. Cada paso mira antes si ya
 * está hecho: si la migración ya se corrió no hace nada, y solo agrega columnas, tablas, índices o valores nuevos de un
 * enum (no borra ni cambia datos).
 *
 * Los pasos van en grupos que se aplican por separado: si falla el de las billeteras (valores nuevos en los libros de
 * Playcoins y saldo), el perfil y las tablas igual quedan listos, y los cobros simplemente no se habilitan hasta que
 * se pueda (`playmatchWalletReady`): nunca se descuenta plata sin poder anotarla. */
import { sql } from "drizzle-orm";

export interface PartyColumn {
  name: string;
  /** COLUMN_TYPE de information_schema, p. ej. «enum('hombre','mujer','pareja')» o «varchar(32)». */
  type: string;
}

/** Lo que hay hoy en la base, de las tablas que tocan estos pasos. */
export interface PartySnapshot {
  /** tabla → (columna → tipo, en minúsculas). */
  columns: Map<string, Map<string, string>>;
  tables: Set<string>;
  /** «tabla.índice». */
  indexes: Set<string>;
}

type Group = 'profile' | 'tables' | 'wallet' | 'staff';

interface Step {
  group: Group;
  label: string;
  done: (s: PartySnapshot) => boolean;
  statement: string;
}

const colType = (s: PartySnapshot, table: string, column: string) => s.columns.get(table)?.get(column) ?? '';
const hasCol = (table: string, column: string) => (s: PartySnapshot) => s.columns.get(table)?.has(column) ?? false;
const hasValue = (table: string, column: string, value: string) => (s: PartySnapshot) => colType(s, table, column).includes(`'${value}'`);

const CHARGES_SQL = [
  'CREATE TABLE `partyCharges` (',
  '\t`id` int AUTO_INCREMENT NOT NULL,',
  '\t`eventId` int NOT NULL,',
  '\t`profileId` int NOT NULL,',
  "\t`kind` enum('superlike','likes_unlock','gift','return','cap') NOT NULL,",
  '\t`quantity` int NOT NULL DEFAULT 1,',
  '\t`amountClp` int NOT NULL DEFAULT 0,',
  '\t`coins` int NOT NULL DEFAULT 0,',
  '\t`saldo` int NOT NULL DEFAULT 0,',
  '\t`opId` varchar(40),',
  '\t`note` varchar(200),',
  '\t`actor` varchar(100),',
  '\t`createdAt` timestamp NOT NULL DEFAULT (now()),',
  '\tCONSTRAINT `partyCharges_id` PRIMARY KEY(`id`)',
  ')',
].join('\n');

const CONFIG_SQL = [
  'CREATE TABLE `partyEventConfig` (',
  '\t`eventId` int NOT NULL,',
  '\t`config` json NOT NULL,',
  '\t`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,',
  '\tCONSTRAINT `partyEventConfig_eventId` PRIMARY KEY(`eventId`)',
  ')',
].join('\n');

const STEPS: Step[] = [
  // 0136: quién soy, a quién busco, orientación, cómo me relaciono y qué busco esta noche.
  {
    group: 'profile', label: 'partyProfiles.gender no_binario', done: hasValue('partyProfiles', 'gender', 'no_binario'),
    statement: "ALTER TABLE `partyProfiles` MODIFY `gender` enum('hombre','mujer','pareja','no_binario') NOT NULL",
  },
  { group: 'profile', label: 'partyProfiles.pairType', done: hasCol('partyProfiles', 'pairType'), statement: "ALTER TABLE `partyProfiles` ADD `pairType` enum('mixta','chicas','chicos')" },
  {
    group: 'profile', label: 'partyProfiles.lookingFor 128',
    done: (s) => Number(/varchar\((\d+)\)/.exec(colType(s, 'partyProfiles', 'lookingFor'))?.[1] ?? 0) >= 128,
    statement: "ALTER TABLE `partyProfiles` MODIFY `lookingFor` varchar(128) NOT NULL DEFAULT 'hombre,mujer,pareja'",
  },
  { group: 'profile', label: 'partyProfiles.orientation', done: hasCol('partyProfiles', 'orientation'), statement: "ALTER TABLE `partyProfiles` ADD `orientation` varchar(16)" },
  { group: 'profile', label: 'partyProfiles.relationStyle', done: hasCol('partyProfiles', 'relationStyle'), statement: "ALTER TABLE `partyProfiles` ADD `relationStyle` varchar(16)" },
  { group: 'profile', label: 'partyProfiles.intents', done: hasCol('partyProfiles', 'intents'), statement: "ALTER TABLE `partyProfiles` ADD `intents` varchar(160)" },

  // 0137: Super Likes, «Ver quién me dio ♥» y el control del administrador.
  { group: 'profile', label: 'partyProfiles.superLikeCredits', done: hasCol('partyProfiles', 'superLikeCredits'), statement: "ALTER TABLE `partyProfiles` ADD `superLikeCredits` int DEFAULT 0 NOT NULL" },
  { group: 'profile', label: 'partyProfiles.superLikeBought', done: hasCol('partyProfiles', 'superLikeBought'), statement: "ALTER TABLE `partyProfiles` ADD `superLikeBought` int DEFAULT 0 NOT NULL" },
  { group: 'profile', label: 'partyProfiles.superLikeCap', done: hasCol('partyProfiles', 'superLikeCap'), statement: "ALTER TABLE `partyProfiles` ADD `superLikeCap` int" },
  { group: 'profile', label: 'partyProfiles.likesUnlocked', done: hasCol('partyProfiles', 'likesUnlocked'), statement: "ALTER TABLE `partyProfiles` ADD `likesUnlocked` int DEFAULT 0 NOT NULL" },
  { group: 'profile', label: 'partyProfiles.affinityAlerts', done: hasCol('partyProfiles', 'affinityAlerts'), statement: "ALTER TABLE `partyProfiles` ADD `affinityAlerts` int DEFAULT 0 NOT NULL" },
  { group: 'tables', label: 'tabla partyCharges', done: (s) => s.tables.has('partyCharges'), statement: CHARGES_SQL },
  {
    group: 'tables', label: 'índice partyCharges.opId', done: (s) => s.indexes.has('partyCharges.party_charges_op_idx'),
    statement: "CREATE UNIQUE INDEX `party_charges_op_idx` ON `partyCharges` (`opId`)",
  },
  {
    group: 'tables', label: 'índice partyCharges.evento', done: (s) => s.indexes.has('partyCharges.party_charges_event_idx'),
    statement: "CREATE INDEX `party_charges_event_idx` ON `partyCharges` (`eventId`,`createdAt`)",
  },
  {
    group: 'tables', label: 'índice partyCharges.perfil', done: (s) => s.indexes.has('partyCharges.party_charges_profile_idx'),
    statement: "CREATE INDEX `party_charges_profile_idx` ON `partyCharges` (`profileId`)",
  },
  { group: 'tables', label: 'tabla partyEventConfig', done: (s) => s.tables.has('partyEventConfig'), statement: CONFIG_SQL },
  {
    group: 'wallet', label: 'playcoinsLedger spend_playmatch', done: hasValue('playcoinsLedger', 'reason', 'spend_playmatch'),
    statement: "ALTER TABLE `playcoinsLedger` MODIFY `reason` enum('earn_web','earn_caja','redeem_caja','manual_adjust','spend_playmatch') NOT NULL",
  },
  {
    group: 'wallet', label: 'prepaidLedger spend_playmatch', done: hasValue('prepaidLedger', 'reason', 'spend_playmatch'),
    statement: "ALTER TABLE `prepaidLedger` MODIFY `reason` enum('topup_web','spend_caja','spend_puerta','refund','manual_adjust','spend_playmatch') NOT NULL",
  },
  {
    group: 'staff', label: 'staffMembers.cargo anfitrion_playmatch', done: hasValue('staffMembers', 'cargo', 'anfitrion_playmatch'),
    statement: "ALTER TABLE `staffMembers` MODIFY `cargo` enum('caja','barra','puerta','cocina','guardarropia','supervisor','dj','rrpp','produccion','otro','anfitrion_playmatch')",
  },
];

const TABLES = ['partyProfiles', 'playcoinsLedger', 'prepaidLedger', 'staffMembers'];
const NEW_TABLES = ['partyCharges', 'partyEventConfig'];

/** Qué pasos faltan, según lo que hay hoy en la base. Una tabla que no existe (base nueva, sin migrar) no se toca: la crean las migraciones. */
export function missingPartySteps(snapshot: PartySnapshot, groups?: readonly Group[]): { group: Group; label: string; statement: string }[] {
  return STEPS
    .filter((s) => !groups || groups.includes(s.group))
    // Los pasos de una tabla existente solo corren si esa tabla ya está (ALTER sobre una que falta no tiene sentido).
    .filter((s) => s.group === 'tables' || snapshotHasTable(snapshot, tableOf(s)))
    .filter((s) => !s.done(snapshot))
    .map(({ group, label, statement }) => ({ group, label, statement }));
}

function tableOf(step: Step): string {
  return step.statement.match(/ALTER TABLE `(\w+)`/)?.[1] ?? '';
}
function snapshotHasTable(snapshot: PartySnapshot, table: string): boolean {
  return (snapshot.columns.get(table)?.size ?? 0) > 0;
}

/** Compat: solo las columnas del perfil (la forma que tenía el primer paso de la 0136). */
export function missingPartyIdentitySteps(columns: readonly PartyColumn[]): { label: string; statement: string }[] {
  if (columns.length === 0) return [];
  const snapshot: PartySnapshot = { columns: new Map([['partyProfiles', new Map(columns.map((c) => [c.name, c.type.toLowerCase()]))]]), tables: new Set(), indexes: new Set() };
  return missingPartySteps(snapshot, ['profile']).filter((s) => !/superLike|likesUnlocked|affinityAlerts/.test(s.label)).map(({ label, statement }) => ({ label, statement }));
}

async function readSnapshot(db: { execute: (q: any) => Promise<any> }): Promise<PartySnapshot> {
  const list = (names: string[]) => sql.raw(names.map((n) => `'${n}'`).join(', '));
  const [cols] = (await db.execute(sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${list(TABLES)}, ${list(NEW_TABLES)})`)) as unknown as [{ t: string; c: string; ty: string }[]];
  const [idx] = (await db.execute(sql`SELECT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${list(NEW_TABLES)})`)) as unknown as [{ t: string; i: string }[]];
  const columns = new Map<string, Map<string, string>>();
  for (const r of cols ?? []) {
    if (!columns.has(r.t)) columns.set(r.t, new Map());
    columns.get(r.t)!.set(r.c, String(r.ty).toLowerCase());
  }
  return {
    columns,
    tables: new Set(Array.from(columns.keys()).filter((t) => NEW_TABLES.includes(t))),
    indexes: new Set((idx ?? []).map((r) => `${r.t}.${r.i}`)),
  };
}

let ready: Promise<void> | null = null;
let failedAt = 0;
const RETRY_MS = 60_000;
let walletReady = false;

/** ¿Están los valores nuevos en los libros de Playcoins y saldo? Sin ellos no se cobra (no se podría anotar el cobro). */
export function playmatchWalletReady(): boolean {
  return walletReady;
}

/** Se llama al abrir la base (getDb). Una vez por instancia; si algo falla lo reintenta al minuto y nunca tira error. */
export function ensurePartyIdentitySchema(db: { execute: (q: any) => Promise<any> }): Promise<void> {
  if (ready) return ready;
  if (failedAt && Date.now() - failedAt < RETRY_MS) return Promise.resolve();
  ready = (async () => {
    let allDone = true;
    try {
      const snapshot = await readSnapshot(db);
      for (const group of ['profile', 'tables', 'wallet', 'staff'] as const) {
        const steps = missingPartySteps(snapshot, [group]);
        try {
          for (const step of steps) {
            await db.execute(sql.raw(step.statement));
            console.log(`[partySchema] aplicado: ${step.label}`);
          }
          if (group === 'wallet') walletReady = true;
        } catch (error) {
          allDone = false;
          console.warn(`[partySchema] no se pudo completar el grupo «${group}»:`, error);
        }
      }
      // Sin la tabla de billeteras (base nueva) no hay nada que cobrar: lo dejamos apagado hasta migrar.
      if (!snapshot.columns.has('playcoinsLedger')) walletReady = false;
    } catch (error) {
      allDone = false;
      console.warn("[partySchema] no se pudo leer el estado de la base:", error);
    }
    if (!allDone) { ready = null; failedAt = Date.now(); }
  })();
  return ready;
}
