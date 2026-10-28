/* La migración drizzle/0136_playmatch_identidad.sql, aplicada sola: la primera vez que el servidor abre la base
 * mira qué le falta a `partyProfiles` y lo agrega. Playmatch lee todas las columnas del perfil, así que sin ellas
 * no funcionaría nada; por eso no espera a un botón como Staff o Insumos. Cada paso mira antes si ya está hecho:
 * si la migración ya se corrió no hace nada, y solo agrega columnas nulas o valores nuevos (no borra datos). */
import { sql } from "drizzle-orm";

export interface PartyColumn {
  name: string;
  /** COLUMN_TYPE de information_schema, p. ej. «enum('hombre','mujer','pareja')» o «varchar(32)». */
  type: string;
}

interface Step {
  label: string;
  done: (cols: Map<string, string>) => boolean;
  statement: string;
}

const PARTY_IDENTITY_STEPS: Step[] = [
  {
    label: "partyProfiles.gender no_binario",
    done: (c) => (c.get("gender") ?? "").includes("'no_binario'"),
    statement: "ALTER TABLE `partyProfiles` MODIFY `gender` enum('hombre','mujer','pareja','no_binario') NOT NULL",
  },
  { label: "partyProfiles.pairType", done: (c) => c.has("pairType"), statement: "ALTER TABLE `partyProfiles` ADD `pairType` enum('mixta','chicas','chicos')" },
  {
    label: "partyProfiles.lookingFor 128",
    done: (c) => Number(/varchar\((\d+)\)/.exec(c.get("lookingFor") ?? "")?.[1] ?? 0) >= 128,
    statement: "ALTER TABLE `partyProfiles` MODIFY `lookingFor` varchar(128) NOT NULL DEFAULT 'hombre,mujer,pareja'",
  },
  { label: "partyProfiles.orientation", done: (c) => c.has("orientation"), statement: "ALTER TABLE `partyProfiles` ADD `orientation` varchar(16)" },
  { label: "partyProfiles.relationStyle", done: (c) => c.has("relationStyle"), statement: "ALTER TABLE `partyProfiles` ADD `relationStyle` varchar(16)" },
  { label: "partyProfiles.intents", done: (c) => c.has("intents"), statement: "ALTER TABLE `partyProfiles` ADD `intents` varchar(160)" },
];

/** Qué sentencias faltan, según las columnas que tiene hoy la tabla. Sin la tabla (base nueva) no hace nada: la crean las migraciones. */
export function missingPartyIdentitySteps(columns: readonly PartyColumn[]): { label: string; statement: string }[] {
  if (columns.length === 0) return [];
  const cols = new Map(columns.map((c) => [c.name, c.type.toLowerCase()]));
  return PARTY_IDENTITY_STEPS.filter((s) => !s.done(cols)).map(({ label, statement }) => ({ label, statement }));
}

let ready: Promise<void> | null = null;
let failedAt = 0;
const RETRY_MS = 60_000;

/** Se llama al abrir la base (getDb). Una vez por instancia; si falla, lo reintenta al minuto y nunca tira error. */
export function ensurePartyIdentitySchema(db: { execute: (q: any) => Promise<any> }): Promise<void> {
  if (ready) return ready;
  if (failedAt && Date.now() - failedAt < RETRY_MS) return Promise.resolve();
  ready = (async () => {
    try {
      const [rows] = (await db.execute(sql`SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'partyProfiles'`)) as unknown as [PartyColumn[]];
      for (const step of missingPartyIdentitySteps(rows ?? [])) {
        await db.execute(sql.raw(step.statement));
        console.log(`[partySchema] aplicado: ${step.label}`);
      }
    } catch (error) {
      console.warn("[partySchema] no se pudo completar partyProfiles:", error);
      ready = null;
      failedAt = Date.now();
    }
  })();
  return ready;
}
