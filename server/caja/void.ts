import { eq } from "drizzle-orm";
import { tickets } from "../../drizzle/schema";
import { applyOp } from "./ops";

/** Anulación de un código (acceso o extra) con motivo obligatorio -- solo
 * supervisor/admin (verificado en el router, no acá). docs/ARQUITECTURA-CAJA.md
 * §3.2, §9: nunca se borra el ticket, solo cambia de estado; el motivo y
 * quién anuló quedan en el ledger `ops`. */
export async function voidTicketCode(
  db: any,
  params: { opId: string; displayCode: string; eventId: number; operatorId: number; registerId?: number | null; reason: string; clientAt: Date }
) {
  const code = params.displayCode.trim().toUpperCase();

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "void_code",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "ticket",
      targetId: code,
      payload: { displayCode: code, reason: params.reason },
      clientAt: params.clientAt,
    },
    async () => {
      const [ticket] = await db.select().from(tickets).where(eq(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected" as const, conflictNote: "El código no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected" as const, conflictNote: "El código no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected" as const, conflictNote: "El código ya estaba anulado" };

      await db.update(tickets).set({ status: "cancelled" }).where(eq(tickets.id, ticket.id));
      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
