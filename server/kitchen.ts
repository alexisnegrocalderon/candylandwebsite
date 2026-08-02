import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { kitchenTickets } from "../drizzle/schema";
import { applyOp } from "./caja/ops";
import { canTransitionKitchenTicket, type KitchenTicketStatus } from "../shared/kitchen";

/** Comandas de cocina: pendientes/aprobadas (lo que hay que preparar y
 * entregar, más viejo primero) y las entregadas de la última hora aparte
 * (para poder deshacer un "Entregado" apretado por error sin buscar en
 * el historial completo). */
export async function listKitchenTickets(eventId: number) {
  const db = await getDb();
  if (!db) return { active: [], recentlyDelivered: [] };

  const active = await db.select().from(kitchenTickets)
    .where(and(eq(kitchenTickets.eventId, eventId), inArray(kitchenTickets.status, ["pendiente", "aprobado"])))
    .orderBy(asc(kitchenTickets.createdAt));

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentlyDelivered = await db.select().from(kitchenTickets)
    .where(and(eq(kitchenTickets.eventId, eventId), eq(kitchenTickets.status, "entregado"), gte(kitchenTickets.deliveredAt, oneHourAgo)))
    .orderBy(desc(kitchenTickets.deliveredAt));

  return { active, recentlyDelivered };
}

/** Cambia el estado de una comanda (Aprobar / Entregado / deshacer). Se
 * busca por `(eventId, ticketNumber)` -- es el dato que la pantalla de
 * cocina tiene a mano, no un id interno -- y las transiciones inválidas
 * (incluido re-entregar) devuelven `conflict` con el estado real, nunca
 * un error genérico. */
export async function updateKitchenTicket(
  rawDb: any,
  params: { opId: string; eventId: number; ticketNumber: string; operatorId: number; registerId?: number | null; clientAt: Date; to: KitchenTicketStatus }
) {
  const { result, conflictNote } = await applyOp(
    rawDb,
    {
      id: params.opId,
      type: "kitchen_update",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "kitchenTicket",
      targetId: params.ticketNumber,
      payload: { ticketNumber: params.ticketNumber, to: params.to },
      clientAt: params.clientAt,
    },
    async () => {
      const [ticket] = await rawDb.select().from(kitchenTickets)
        .where(and(eq(kitchenTickets.eventId, params.eventId), eq(kitchenTickets.ticketNumber, params.ticketNumber))).limit(1);
      if (!ticket) return { result: "rejected" as const, conflictNote: "No existe esa comanda" };

      if (!canTransitionKitchenTicket(ticket.status as KitchenTicketStatus, params.to)) {
        return { result: "conflict" as const, conflictNote: `La comanda ya está en estado "${ticket.status}"` };
      }

      const now = new Date();
      const patch: Record<string, unknown> = { status: params.to };
      if (params.to === "aprobado") {
        patch.approvedAt = now;
        patch.approvedByOperatorId = params.operatorId;
        // Deshacer un "Entregado" -- limpia la marca de entrega para que no
        // quede una comanda "aprobada" con hora de entrega vieja.
        if (ticket.status === "entregado") { patch.deliveredAt = null; patch.deliveredByOperatorId = null; }
      }
      if (params.to === "entregado") { patch.deliveredAt = now; patch.deliveredByOperatorId = params.operatorId; }

      await rawDb.update(kitchenTickets).set(patch).where(eq(kitchenTickets.id, ticket.id));

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
