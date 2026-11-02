/** Extras que un cliente tiene por usar, para mostrarlos en caja apenas se identifica (QR de la app, lista o email).
 *
 * Son los tickets `valid` de categoría distinta a «acceso» (estacionamiento, piscolón, consumos, merch…) de sus compras
 * aprobadas, del evento de esta noche o de una fiesta que ya terminó (los extras no usados quedan reservados para la
 * próxima: la misma regla de `redeemDisplayCode`). Solo lectura: el canje lo hace `caja.redeem`. */
import { and, eq, ne, isNotNull, or, sql } from 'drizzle-orm';
import { events, orders, partyGifts, partyProfiles, ticketTypes, tickets } from '../../drizzle/schema';
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
  const extras: CustomerExtra[] = rows.map((r: any) => ({ displayCode: String(r.displayCode), name: String(r.name), eventTitle: String(r.eventTitle), carried: r.ticketEventId !== params.eventId }));

  // Tragos que le invitaron en la fiesta (Playmatch): ya pagados por quien invitó y todavía sin cobrar en la barra. El ticket
  // queda a nombre de quien los recibe (se une por el correo de la entrada de su perfil) y vale en cualquier fiesta.
  const gifts = await db.select({
    displayCode: partyGifts.displayCode, drinkName: partyGifts.drinkName, eventTitle: events.title, giftEventId: partyGifts.eventId,
  }).from(partyGifts)
    .innerJoin(partyProfiles, eq(partyGifts.toProfileId, partyProfiles.id))
    .innerJoin(tickets, eq(partyProfiles.ticketId, tickets.id))
    .innerJoin(orders, eq(tickets.orderId, orders.id))
    .innerJoin(events, eq(partyGifts.eventId, events.id))
    .where(and(sql`LOWER(${orders.buyerEmail}) = ${email}`, eq(partyGifts.status, 'paid'), isNotNull(partyGifts.displayCode)))
    .limit(30);
  const seen = new Set(extras.map((e) => e.displayCode));
  for (const g of gifts) {
    const code = String(g.displayCode);
    if (seen.has(code)) continue;
    seen.add(code);
    extras.push({ displayCode: code, name: `🎁 ${g.drinkName} (regalo)`, eventTitle: String(g.eventTitle), carried: g.giftEventId !== params.eventId });
  }
  return extras;
}
