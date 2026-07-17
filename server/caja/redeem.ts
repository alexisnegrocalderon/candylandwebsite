import { eq } from "drizzle-orm";
import { tickets } from "../../drizzle/schema";
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
      if (ticket.eventId !== params.eventId) return { result: "rejected" as const, conflictNote: "El código no corresponde a este evento" };
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

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
