import { getUpcomingPublicEvents } from './instagramAgent';

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
export async function resolveInstagramBuyLink(now: Date = new Date()): Promise<{ url: string; eventTitle: string; imageUrl: string } | null> {
  const upcoming = await getUpcomingPublicEvents(now);
  const event = upcoming.find((e) => e.status !== 'soldout');
  if (!event) return null;
  return { url: `${APP_URL}/eventos/${event.slug}`, eventTitle: event.title, imageUrl: resolveEventCardImage(event) };
}
