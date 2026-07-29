import { eq } from "drizzle-orm";
import { tickets, partyGifts } from "../../drizzle/schema";
import { applyOp } from "./ops";

/** Canje de un código legible en caja -- las 6 validaciones pedidas en
 * docs/ARQUITECTURA-CAJA.md §9: existe, pertenece al evento, no usado, no
 * anulado. ("Pertenece al cliente" y "vigente" ya están implícitas: el
 * código solo se le muestra a un cliente puntual, y el evento activo es el
 * único que se puede canjear desde /caja.) */
export async function redeemDisplayCode(
  db: any,
  params: { opId: string; displayCode: string; eventId: number; operatorId: number; registerId?: number | null; clientAt: Date }
) {
  const code = params.displayCode.trim().toUpperCase();

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "redeem",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "ticket",
      targetId: code,
      payload: { displayCode: code },
      clientAt: params.clientAt,
    },
    async () => {
      const [ticket] = await db.select().from(tickets).where(eq(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected" as const, conflictNote: "El código no existe" };

      // Un trago que alguien invitó en la fiesta es la única excepción a
      // "tiene que ser de este evento": el dueño decidió que un regalo no
      // cobrado siga válido para la próxima fiesta. Para todo lo demás la
      // validación queda igual de estricta.
      const [gift] = await db.select().from(partyGifts).where(eq(partyGifts.ticketId, ticket.id)).limit(1);
      if (!gift && ticket.eventId !== params.eventId) {
        return { result: "rejected" as const, conflictNote: "El código no corresponde a este evento" };
      }

      if (ticket.status === "cancelled") return { result: "rejected" as const, conflictNote: "El código fue anulado" };
      if (ticket.status === "used") {
        return { result: "conflict" as const, conflictNote: `Ya fue canjeado el ${ticket.usedAt?.toISOString?.() ?? ticket.usedAt}` };
      }

      await db.update(tickets).set({
        status: "used",
        usedAt: new Date(),
        usedByOperatorId: params.operatorId,
        usedAtRegisterId: params.registerId ?? null,
      }).where(eq(tickets.id, ticket.id));

      // El regalo se marca cobrado en el mismo paso, para que deje de
      // aparecer en el snapshot de las tablets y en "mis regalos".
      if (gift) {
        await db.update(partyGifts).set({ status: "redeemed", redeemedAt: new Date() }).where(eq(partyGifts.id, gift.id));
      }

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
