import * as db from './db';
import { availabilityLabel, getUpcomingPublicEvents } from './instagramAgent';
import { getPlaymoreFocus } from './playmoreFocus';
import { withAgentUtm } from './agentLinks';
import { accessByKey, accessKeyForSlug, buildCheckoutPath, buildColabCheckoutPath, cleanQuantity, type AgentAccessKey } from '../shared/agentAccess';
import { dropSupersededTickets } from '../shared/liveTickets';

/* Resolución del link de compra para el botón "Comprar entrada" de
 * Instagram (Button Template), armado SOLO con datos de la base -- mismo
 * espíritu que server/whatsappInteractive.ts, acotado a lo único que
 * Instagram necesita hoy: el modelo solo pide `action: 'buy_link'`, nunca
 * arma el link él mismo. */

const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');

/** Mismo respaldo que ya usa el Open Graph del sitio cuando un evento no
 * tiene flyer propio cargado (server/ssrMeta.ts) -- logo genérico, ya
 * público, ya usado como imagen por defecto en todo el sitio. */
const DEFAULT_CARD_IMAGE = `${APP_URL}/candyland/og-candyland.jpg`;

/** El flyer real del evento (`events.imageUrl`, ya usado por los correos y
 * el Open Graph) si lo tiene cargado, o el logo genérico como respaldo --
 * para mandar antes del mensaje con el botón "Comprar" (el botón en sí no
 * se puede pintar de marca, pero la imagen que lo antecede sí). */
export function resolveEventCardImage(event: { imageUrl?: string | null } | null | undefined): string {
  return event?.imageUrl || DEFAULT_CARD_IMAGE;
}

/** El próximo evento público no agotado, con el link real de compra y la
 * imagen para la tarjeta. `null` si no hay ninguno (caso borde: todo
 * agotado o sin próxima fecha) -- en ese caso el llamador cae a mandar el
 * texto sin botón ni imagen. */
/** La entrada en venta de ese acceso (la del slug que el checkout espera), o
 * `null` si no existe, está oculta o no quedan cupos. */
async function liveAccessTicket(eventId: number, key: AgentAccessKey) {
  const access = accessByKey(key);
  if (!access) return null;
  const tickets = dropSupersededTickets(await db.getTicketTypesByEventId(eventId));
  const ticket = tickets.find((t) => t.category === 'acceso' && t.status !== 'hidden' && t.accesoSlug === access.slug);
  if (!ticket) return null;
  const remaining = ticket.poolRemaining ?? (ticket.totalStock - ticket.soldCount);
  if (ticket.status === 'soldout' || availabilityLabel(remaining, false) === 'AGOTADA') return null;
  return { access, remaining };
}

/** Link directo al checkout con el acceso ya elegido (modo express del
 * checkout: no vuelve a preguntar «¿cómo vienes?» y salta al primer paso que
 * falta), o `null` si ese acceso no se puede vender por acá. */
export async function resolveAccessCheckout(
  event: { id: number; slug: string },
  key: AgentAccessKey,
  quantity: number,
): Promise<{ path: string; label: string; button: string; quantity: number } | null> {
  const live = await liveAccessTicket(event.id, key);
  if (!live) return null;
  const qty = cleanQuantity(quantity);
  // PLAYMORE: checkout de la colab con el acceso y la composición ya elegidos (?items=…&quien=…).
  const focus = await getPlaymoreFocus();
  const colab = focus != null && focus.event.id === event.id;
  const path = colab ? buildColabCheckoutPath(event.slug, key, qty) : buildCheckoutPath(event.slug, key, qty);
  return { path, label: live.access.label, button: live.access.button, quantity: qty };
}

export async function resolveInstagramBuyLink(
  now: Date = new Date(),
  campaign: string = 'agente',
  content?: string,
  access?: { key: AgentAccessKey | ''; quantity?: number },
): Promise<{ url: string; eventTitle: string; imageUrl: string; buttonTitle: string; accessLabel: string | null } | null> {
  const upcoming = await getUpcomingPublicEvents(now);
  const event = upcoming.find((e) => e.status !== 'soldout');
  if (!event) return null;
  // Con el acceso conocido, el botón va directo al checkout; si ese acceso no
  // se puede vender por acá (agotado, con código, oculto), cae a la página del
  // evento como siempre.
  const direct = access?.key ? await resolveAccessCheckout(event, access.key, access.quantity ?? 1) : null;
  const focus = await getPlaymoreFocus(now);
  const isColab = focus != null && focus.event.id === event.id;
  // Con UTM: la venta que entra por este botón queda atribuida al agente
  // en "Ventas por Origen" y en la tarjeta "Ventas del agente".
  return {
    url: withAgentUtm(`${APP_URL}${direct ? direct.path : isColab ? `/checkout/${event.slug}` : `/eventos/${event.slug}`}`, 'instagram', isColab ? `${campaign}-playmore` : campaign, content),
    eventTitle: event.title,
    imageUrl: resolveEventCardImage(event),
    buttonTitle: direct?.button ?? 'Comprar entrada 🔥',
    accessLabel: direct?.label ?? null,
  };
}
