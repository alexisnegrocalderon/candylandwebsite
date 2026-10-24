import { dropSupersededTickets } from '@shared/liveTickets';
import { isMissionActiveForEvent, missionDepositPrice } from '@shared/mission300';

/* «Entradas desde $X» del inicio de la app: lo más barato que se puede comprar HOY de un evento
 * (solo accesos: nunca barra, merch, guardarropía, extras, lo oculto ni lo agotado). Con Misión 300 abierta se cobra el abono, así que
 * ese es el «desde» (mismo criterio que la lista de la compra). */

type Ticket = {
  category?: string | null; accesoSlug?: string | null; name?: string | null; status?: string | null; price: string | number;
  totalStock?: number | null; soldCount?: number | null; salesStart?: Date | string | null; salesEnd?: Date | string | null;
};

/** Una entrada (no barra, merch, guardarropía ni extras): mismo criterio que shared/ticketKind.ts. */
const isAcceso = (t: Ticket) => t.category === 'acceso' || !t.category;

/** Se puede comprar ahora: a la venta (ni agotada ni oculta), con cupo y dentro de sus fechas de venta. */
function onSale(t: Ticket, now: Date): boolean {
  if (t.status === 'soldout' || t.status === 'hidden') return false;
  if (t.totalStock != null && t.totalStock - (t.soldCount ?? 0) <= 0) return false;
  if (t.salesStart && new Date(t.salesStart).getTime() > now.getTime()) return false;
  if (t.salesEnd && new Date(t.salesEnd).getTime() < now.getTime()) return false;
  return true;
}
type EventLike = { eventDate: Date | string; missionForceClosed?: number | boolean | null };

export function fromPrice(tickets: Ticket[], event: EventLike | null | undefined, now: Date = new Date()): number | null {
  if (!event) return null;
  const mission = isMissionActiveForEvent(event, now);
  const prices = dropSupersededTickets(tickets)
    .filter((t) => isAcceso(t) && onSale(t, now))
    .map((t) => (mission ? missionDepositPrice(t.accesoSlug) : Number(t.price)))
    .filter((p) => Number.isFinite(p) && p > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}
