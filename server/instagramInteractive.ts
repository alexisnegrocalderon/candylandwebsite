import { getUpcomingPublicEvents } from './instagramAgent';

/* Resolución del link de compra para el botón "Comprar entrada" de
 * Instagram (Button Template), armado SOLO con datos de la base -- mismo
 * espíritu que server/whatsappInteractive.ts, acotado a lo único que
 * Instagram necesita hoy: el modelo solo pide `action: 'buy_link'`, nunca
 * arma el link él mismo. */

const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');

/** El próximo evento público no agotado, con el link real de compra. `null`
 * si no hay ninguno (caso borde: todo agotado o sin próxima fecha) -- en
 * ese caso el llamador cae a mandar el texto sin botón. */
export async function resolveInstagramBuyLink(now: Date = new Date()): Promise<{ url: string; eventTitle: string } | null> {
  const upcoming = await getUpcomingPublicEvents(now);
  const event = upcoming.find((e) => e.status !== 'soldout');
  if (!event) return null;
  return { url: `${APP_URL}/eventos/${event.slug}`, eventTitle: event.title };
}
