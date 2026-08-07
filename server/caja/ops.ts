import { ops } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type OpType = "redeem" | "checkin" | "sale" | "void_code" | "note" | "shift_open" | "shift_close" | "manual_adjust" | "locker_return" | "kitchen_update";
export type OpResult = "applied" | "conflict" | "rejected";

export type OpParams = {
  id: string; // UUID generado en el cliente -- clave de idempotencia (docs/ARQUITECTURA-CAJA.md §7)
  type: OpType;
  eventId: number;
  operatorId: number;
  registerId?: number | null;
  targetType: string;
  targetId: string;
  payload?: unknown;
  clientAt: Date;
};

/** Toda mutación de /caja pasa por acá (docs/ARQUITECTURA-CAJA.md §0.3, §7):
 * apenda una fila inmutable al ledger `ops` Y ejecuta la mutación real de
 * estado, en la misma llamada -- nunca una sin la otra. Reenviar el mismo
 * `id` (timeout, reintento) nunca duplica nada: si ya existe, se devuelve el
 * resultado guardado sin volver a ejecutar `mutate`. */
export async function applyOp(
  db: any,
  params: OpParams,
  mutate: () => Promise<{ result: OpResult; conflictNote?: string }>
): Promise<{ result: OpResult; conflictNote?: string }> {
  const [existing] = await db.select().from(ops).where(eq(ops.id, params.id)).limit(1);
  if (existing) return { result: existing.result, conflictNote: existing.conflictNote ?? undefined };

  const { result, conflictNote } = await mutate();

  try {
    await db.insert(ops).values({
      id: params.id,
      type: params.type,
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId ?? null,
      targetType: params.targetType,
      targetId: params.targetId,
      payload: params.payload ?? null,
      clientAt: params.clientAt,
      result,
      conflictNote: conflictNote ?? null,
    });
  } catch (err) {
    // El chequeo de arriba y este INSERT no son atómicos: si el mismo
    // `opId` llega dos veces casi al mismo tiempo (dos pestañas/tablets
    // sincronizando la misma operación encolada), las dos pueden pasar el
    // SELECT antes de que cualquiera termine de insertar -- la segunda
    // choca contra la primary key de `ops`. En vez de propagar ese error
    // crudo (que además esconde que `mutate()` ya corrió dos veces), se
    // relee la fila que ganó la carrera y se devuelve ESE resultado, igual
    // que si el opId ya hubiera existido desde el principio.
    const [raceWinner] = await db.select().from(ops).where(eq(ops.id, params.id)).limit(1);
    if (raceWinner) return { result: raceWinner.result, conflictNote: raceWinner.conflictNote ?? undefined };
    throw err;
  }

  return { result, conflictNote };
}

/** Los `throw new Error("...")` de validación de negocio (`sale.ts`,
 * `checkin.ts`, etc. -- ej. "Falta el número de la percha") caen en el
 * mismo `catch` genérico que un fallo real de SQL, así que no se pueden
 * distinguir por tipo. Se distinguen por forma: un error de driver/DB
 * queda envuelto por drizzle-orm con el prefijo "Failed query:" (consulta
 * + params) -- ese es justo el que no hay que mostrarle a la cajera tal
 * cual. Todo lo demás (los mensajes de validación, cortos y en español) se
 * deja pasar sin tocar. El detalle real siempre queda en el log del
 * servidor para poder investigar. */
export function friendlySyncErrorMessage(err: unknown, opId: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("Failed query")) {
    console.error(`[sync] op ${opId} rechazado por un error inesperado:`, err);
    return "No se pudo procesar en el servidor -- hay que rehacerla";
  }
  return message || "Error al sincronizar";
}
