import { ops } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type OpType = "redeem" | "sale" | "void_code" | "note" | "shift_open" | "shift_close" | "manual_adjust";
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

  return { result, conflictNote };
}
