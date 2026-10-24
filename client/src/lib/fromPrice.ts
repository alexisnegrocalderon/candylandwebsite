import { dropSupersededTickets } from '@shared/liveTickets';
import { isMissionActiveForEvent, missionDepositPrice } from '@shared/mission300';

/* «Entradas desde $X» del inicio de la app: lo más barato que se puede comprar HOY de un evento
 * (solo accesos, nunca extras ni lo agotado). Con Misión 300 abierta se cobra el abono, así que
 * ese es el «desde» (mismo criterio que la lista de la compra). */

type Ticket = { category?: string | null; accesoSlug?: string | null; name?: string | null; status?: string | null; price: string | number; totalStock?: number | null; soldCount?: number | null };
type EventLike = { eventDate: Date | string; missionForceClosed?: number | boolean | null };

export function fromPrice(tickets: Ticket[], event: EventLike | null | undefined, now: Date = new Date()): number | null {
  if (!event) return null;
  const mission = isMissionActiveForEvent(event, now);
  const prices = dropSupersededTickets(tickets)
    .filter((t) => t.category !== 'extra' && t.status !== 'soldout')
    .filter((t) => t.totalStock == null || t.totalStock - (t.soldCount ?? 0) > 0)
    .map((t) => (mission ? missionDepositPrice(t.accesoSlug) : Number(t.price)))
    .filter((p) => Number.isFinite(p) && p > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}
