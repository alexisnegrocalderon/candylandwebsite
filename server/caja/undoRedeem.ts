import { and, desc, eq } from "drizzle-orm";
import { ops, partyGifts, tickets } from "../../drizzle/schema";
import { undoWithinWindow } from "../../shared/cajaExtras";
import { applyOp } from "./ops";

/** Deshace un canje de /caja hecho hace instantes (el «Deshacer» de 60 segundos): el código vuelve a quedar por canjear.
 *
 * Es deliberadamente estrecho, porque canjear mueve un derecho de la persona:
 * - solo si ya está canjeado y lo canjeó ESTE mismo operador (para otras correcciones, el supervisor anula);
 * - solo dentro de la ventana, medida entre la hora de la tablet en el canje (el op `redeem` del ledger) y en el
 *   deshacer -- así también vale cuando se hizo sin señal y se sincroniza después;
 * - nunca un trago regalado (el regalo tiene su propio estado) ni un extra arrastrado de una fiesta anterior (no se
 *   sabría a qué evento devolverlo).
 *
 * Queda en el ledger como `note` (no se agrega un valor nuevo al enum de `ops`: eso exigiría migrar la base) con
 * `payload.kind = 'undo_redeem'`. Reenviar el mismo opId nunca duplica nada (applyOp). */
export async function undoRedeemDisplayCode(
  db: any,
  params: { opId: string; displayCode: string; eventId: number; operatorId: number; registerId?: number | null; clientAt: Date }
) {
  const code = params.displayCode.trim().toUpperCase();

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "note",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "ticket",
      targetId: code,
      payload: { kind: "undo_redeem", displayCode: code },
      clientAt: params.clientAt,
    },
    async () => {
      const [ticket] = await db.select().from(tickets).where(eq(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected" as const, conflictNote: "El código no existe" };
      if (ticket.status === "cancelled") return { result: "rejected" as const, conflictNote: "El código fue anulado" };
      // Ya estaba por canjear (el canje nunca llegó, o ya se deshizo): no hay nada que deshacer.
      if (ticket.status !== "used") return { result: "applied" as const, conflictNote: "Ya estaba sin canjear" };

      if (ticket.usedByOperatorId !== params.operatorId) {
        return { result: "rejected" as const, conflictNote: "Solo quien lo canjeó puede deshacerlo; si no, pídele a un supervisor que lo anule" };
      }
      if (ticket.carriedFromEventId != null) {
        return { result: "rejected" as const, conflictNote: "Era un extra de una fiesta anterior: no se puede deshacer" };
      }
      const [gift] = await db.select().from(partyGifts).where(eq(partyGifts.ticketId, ticket.id)).limit(1);
      if (gift) return { result: "rejected" as const, conflictNote: "Un trago regalado no se puede deshacer" };

      // La hora del canje, según la tablet que lo hizo (la del ledger); si no está, la del servidor al canjear.
      const [redeemOp] = await db.select().from(ops)
        .where(and(eq(ops.type, "redeem"), eq(ops.targetId, code), eq(ops.result, "applied")))
        .orderBy(desc(ops.serverAt)).limit(1);
      const redeemedAt = redeemOp?.clientAt ?? ticket.usedAt;
      if (!redeemedAt || !undoWithinWindow(new Date(redeemedAt).getTime(), params.clientAt.getTime())) {
        return { result: "rejected" as const, conflictNote: "Pasaron más de 60 segundos: pídele a un supervisor que lo anule" };
      }

      await db.update(tickets).set({
        status: "valid",
        usedAt: null,
        usedByOperatorId: null,
        usedAtRegisterId: null,
      }).where(eq(tickets.id, ticket.id));

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
