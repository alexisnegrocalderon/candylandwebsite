/** Extras que un cliente tiene por usar, para mostrarlos en caja apenas se identifica (QR de la app, lista o email).
 *
 * Son los tickets `valid` de categoría distinta a «acceso» (estacionamiento, piscolón, consumos, merch…) de sus compras
 * aprobadas, del evento de esta noche o de una fiesta que ya terminó (los extras no usados quedan reservados para la
 * próxima: la misma regla de `redeemDisplayCode`). Solo lectura: el canje lo hace `caja.redeem`. */
import { and, eq, ne, isNotNull, or, sql } from 'drizzle-orm';
import { events, orders, ticketTypes, tickets } from '../../drizzle/schema';
import { DEMO_EVENT_SLUG, DEMO_PAST_SLUG_PREFIX, isDemoSlug } from '../../shared/demoAccount';

export type CustomerExtra = { displayCode: string; name: string; eventTitle: string; carried: boolean };

export async function listCustomerExtrasForCaja(db: any, params: { email: string; eventId: number }): Promise<CustomerExtra[]> {
  const email = params.email.trim().toLowerCase();
  if (!email) return [];
  const rows = await db.select({
    displayCode: tickets.displayCode, name: ticketTypes.name, ticketEventId: tickets.eventId,
    eventTitle: events.title, eventStatus: events.status, eventSlug: events.slug,
  }).from(tickets)
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
    .innerJoin(events, eq(tickets.eventId, events.id))
    .where(and(
      sql`LOWER(${orders.buyerEmail}) = ${email}`,
      eq(orders.paymentStatus, 'approved'),
      eq(tickets.status, 'valid'),
      isNotNull(tickets.displayCode),
      ne(ticketTypes.category, 'acceso'),
      // Los extras de la cuenta de prueba (evento oculto) también salen, para poder probar la caja en modo prueba.
      or(eq(tickets.eventId, params.eventId), eq(events.status, 'past'), eq(events.slug, DEMO_EVENT_SLUG), sql`${events.slug} LIKE ${DEMO_PAST_SLUG_PREFIX + '%'}`),
    ))
    .orderBy(tickets.createdAt)
    .limit(60);
  return rows.map((r: any) => ({ displayCode: String(r.displayCode), name: String(r.name), eventTitle: String(r.eventTitle), carried: r.ticketEventId !== params.eventId }));
}
