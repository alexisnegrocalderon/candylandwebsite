import { and, eq } from "drizzle-orm";
import { tickets, ticketTypes } from "../../drizzle/schema";
import { applyOp } from "./ops";

/** Marca la entrada de un acceso en la puerta.
 *
 * Es el gemelo de `redeemDisplayCode` (./redeem.ts) para el otro lado del
 * mostrador: aquel canjea extras por `displayCode`, este marca accesos por
 * `ticketCode` -- el código que ya viaja en el QR de la entrada y que ya
 * está indexado en la búsqueda local de la tablet.
 *
 * Mismas validaciones que el canje (existe, es de este evento, no anulado,
 * no usado) más una propia: solo accesos. Sin esto, el código de un trago
 * serviría para marcar entrada, y el conteo de gente adentro dejaría de
 * significar algo. */
export async function checkInTicket(
  db: any,
  params: { opId: string; ticketCode: string; eventId: number; operatorId: number; registerId?: number | null; clientAt: Date; /** La puerta confirmó haber comparado las cédulas. */ idVerified?: boolean }
) {
  const code = params.ticketCode.trim().toUpperCase();

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "checkin",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "ticket",
      targetId: code,
      payload: params.idVerified ? { ticketCode: code, idVerified: true } : { ticketCode: code },
      clientAt: params.clientAt,
    },
    async () => {
      const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketCode, code)).limit(1);
      if (!ticket) return { result: "rejected" as const, conflictNote: "El código no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected" as const, conflictNote: "El código no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected" as const, conflictNote: "El acceso fue anulado" };
      if (ticket.status === "used") {
        return { result: "conflict" as const, conflictNote: alreadyInNote(ticket.usedAt) };
      }

      const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticket.ticketTypeId)).limit(1);
      if (tt?.category !== "acceso") {
        return { result: "rejected" as const, conflictNote: "Ese código es de un extra, no de un acceso" };
      }

      // UPDATE condicional: si dos puertas marcan la misma entrada a la vez (un QR
      // compartido por pantallazo), solo una pasa de válida a usada; la otra
      // recibe "ya entró" en vez de dejar pasar a dos personas con un solo QR.
      const res = await db.update(tickets).set({
        status: "used",
        usedAt: new Date(),
        usedByOperatorId: params.operatorId,
        usedAtRegisterId: params.registerId ?? null,
      }).where(and(eq(tickets.id, ticket.id), eq(tickets.status, ticket.status)));
      const affected = Array.isArray(res) ? res[0]?.affectedRows : res?.affectedRows;
      if (affected === 0) {
        const [now] = await db.select().from(tickets).where(eq(tickets.id, ticket.id)).limit(1);
        return { result: "conflict" as const, conflictNote: alreadyInNote(now?.usedAt) };
      }

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}

/** "Ya entró a las 23:15" en hora de Chile (antes salía en UTC, ej. 2026-10-31T02:15:00.000Z). */
function alreadyInNote(usedAt: unknown): string {
  const d = usedAt ? new Date(usedAt as string | Date) : null;
  if (!d || Number.isNaN(d.getTime())) return 'Esta persona ya entró';
  const hora = d.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `Esta persona ya entró a las ${hora}`;
}
