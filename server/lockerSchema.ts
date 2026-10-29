/* La migración de guardarropía «retiro parcial» (drizzle/0138_guardarropia_parcial.sql), aplicada sola: la primera vez que
 * el servidor abre la base mira si a `lockerItems` le falta la columna `partialNote` o el valor 'parcial' del estado y los
 * agrega. Solo agrega (no borra ni cambia datos) y mira antes si ya está hecho, así que correr la migración a mano también
 * sirve. Nunca lanza: si falla, reintenta al minuto y las prendas siguen funcionando con los tres estados de siempre. */
import { sql } from "drizzle-orm";

export interface LockerSchemaState { hasPartialNote: boolean; statusType: string }

/** Los pasos que faltan, en orden (primero el valor del estado, después la columna). Puro: se prueba sin base. */
export function lockerSchemaSteps(state: LockerSchemaState): { label: string; statement: string }[] {
  const steps: { label: string; statement: string }[] = [];
  if (!state.statusType.toLowerCase().includes("'parcial'")) {
    steps.push({ label: "estado «parcial» de las prendas", statement: "ALTER TABLE `lockerItems` MODIFY `status` enum('pendiente','guardado','parcial','retirado','anulado') NOT NULL DEFAULT 'pendiente'" });
  }
  if (!state.hasPartialNote) steps.push({ label: "lockerItems.partialNote", statement: "ALTER TABLE `lockerItems` ADD `partialNote` varchar(255)" });
  return steps;
}

let ready: Promise<void> | null = null;
let failedAt = 0;
const RETRY_MS = 60_000;

export function ensureLockerSchema(db: { execute: (q: any) => Promise<any> }): Promise<void> {
  if (ready) return ready;
  if (failedAt && Date.now() - failedAt < RETRY_MS) return Promise.resolve();
  ready = (async () => {
    try {
      const [rows] = (await db.execute(sql`SELECT COLUMN_NAME AS c, COLUMN_TYPE AS ty FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lockerItems' AND COLUMN_NAME IN ('status', 'partialNote')`)) as unknown as [{ c: string; ty: string }[]];
      if (!rows || rows.length === 0) return; // base sin la tabla: nada que hacer
      const state: LockerSchemaState = { hasPartialNote: rows.some((r) => r.c === "partialNote"), statusType: String(rows.find((r) => r.c === "status")?.ty ?? "") };
      for (const step of lockerSchemaSteps(state)) {
        await db.execute(sql.raw(step.statement));
        console.log(`[lockerSchema] aplicado: ${step.label}`);
      }
    } catch (error) {
      console.warn("[lockerSchema] no se pudo completar:", error);
      ready = null;
      failedAt = Date.now();
    }
  })();
  return ready;
}
