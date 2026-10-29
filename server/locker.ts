import { and, eq, ne } from "drizzle-orm";
import { getDb } from "./db";
import { lockerItems } from "../drizzle/schema";
import { applyOp } from "./caja/ops";
import { canTransitionLockerItem, mergePartialNote, type LockerItemStatus } from "../shared/locker";
import { ensureLockerSchema } from "./lockerSchema";

/** Todas las prendas del evento -- volumen esperado (unos pocos cientos
 * por noche) entra cómodo en un solo fetch, así que a diferencia de
 * cocina no hace falta separar "activas"/"recientes" en el servidor: el
 * cliente arma la cola de "recién llegadas" (`pendiente`) y el buscador
 * localmente sobre esta misma lista. */
export async function listLockerItems(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureLockerSchema(db);
  // Las perchas de ventas anuladas (server/caja/voidSale.ts) no se muestran:
  // esa prenda nunca debería estar en el mostrador.
  return db.select().from(lockerItems).where(and(eq(lockerItems.eventId, eventId), ne(lockerItems.status, "anulado")));
}

/** Cambia el estado de una prenda (Recibido / Entregado). Se busca por
 * `(eventId, tagNumber)` -- el dato que la pantalla tiene a mano -- y las
 * transiciones inválidas devuelven `conflict` con el estado real, nunca
 * un error genérico. */
export async function updateLockerItem(
  rawDb: any,
  params: { opId: string; eventId: number; tagNumber: string; operatorId: number; registerId?: number | null; clientAt: Date; to: LockerItemStatus; /** Qué sacaron (solo con `to: 'parcial'`). */ note?: string | null }
) {
  await ensureLockerSchema(rawDb);
  const { result, conflictNote } = await applyOp(
    rawDb,
    {
      id: params.opId,
      type: "locker_return",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "lockerItem",
      targetId: params.tagNumber,
      payload: { tagNumber: params.tagNumber, to: params.to, note: params.note ?? null },
      clientAt: params.clientAt,
    },
    async () => {
      const [item] = await rawDb.select().from(lockerItems)
        .where(and(eq(lockerItems.eventId, params.eventId), eq(lockerItems.tagNumber, params.tagNumber))).limit(1);
      if (!item) return { result: "rejected" as const, conflictNote: "No existe esa percha" };

      if (!canTransitionLockerItem(item.status as LockerItemStatus, params.to)) {
        return { result: "conflict" as const, conflictNote: `Esa percha ya está en estado "${item.status}"` };
      }

      const now = new Date();
      const patch: Record<string, unknown> = { status: params.to };
      if (params.to === "guardado") { patch.receivedAt = now; patch.receivedByOperatorId = params.operatorId; patch.partialNote = null; }
      if (params.to === "retirado") { patch.retrievedAt = now; patch.retrievedByOperatorId = params.operatorId; patch.partialNote = null; }
      // Retiro parcial: anota qué sacaron (se va sumando si sacan más) y cuándo fue lo último.
      if (params.to === "parcial") {
        if (!mergePartialNote(null, params.note)) return { result: "rejected" as const, conflictNote: "Anota qué retiró" };
        patch.partialNote = mergePartialNote(item.partialNote, params.note);
        patch.retrievedAt = now; patch.retrievedByOperatorId = params.operatorId;
      }
      // "Deshacer" un Recibido: vuelve a la cola de por recibir, sin quién ni
      // cuándo la recibió.
      if (params.to === "pendiente") { patch.receivedAt = null; patch.receivedByOperatorId = null; }

      await rawDb.update(lockerItems).set(patch).where(eq(lockerItems.id, item.id));

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
