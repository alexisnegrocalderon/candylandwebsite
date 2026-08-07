import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { lockerItems } from "../drizzle/schema";
import { applyOp } from "./caja/ops";
import { canTransitionLockerItem, type LockerItemStatus } from "../shared/locker";

/** Todas las prendas del evento -- volumen esperado (unos pocos cientos
 * por noche) entra cómodo en un solo fetch, así que a diferencia de
 * cocina no hace falta separar "activas"/"recientes" en el servidor: el
 * cliente arma la cola de "recién llegadas" (`pendiente`) y el buscador
 * localmente sobre esta misma lista. */
export async function listLockerItems(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lockerItems).where(eq(lockerItems.eventId, eventId));
}

/** Cambia el estado de una prenda (Recibido / Entregado). Se busca por
 * `(eventId, tagNumber)` -- el dato que la pantalla tiene a mano -- y las
 * transiciones inválidas devuelven `conflict` con el estado real, nunca
 * un error genérico. */
export async function updateLockerItem(
  rawDb: any,
  params: { opId: string; eventId: number; tagNumber: string; operatorId: number; registerId?: number | null; clientAt: Date; to: LockerItemStatus }
) {
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
      payload: { tagNumber: params.tagNumber, to: params.to },
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
      if (params.to === "guardado") { patch.receivedAt = now; patch.receivedByOperatorId = params.operatorId; }
      if (params.to === "retirado") { patch.retrievedAt = now; patch.retrievedByOperatorId = params.operatorId; }

      await rawDb.update(lockerItems).set(patch).where(eq(lockerItems.id, item.id));

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
