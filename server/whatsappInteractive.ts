import * as db from './db';
import { formatChileDate, formatChileTime } from '../shared/chileDate';
import { availabilityLabel, getUpcomingPublicEvents } from './instagramAgent';
import {
  buildButtonsPayload,
  buildCtaUrlPayload,
  buildListPayload,
  buildTextPayload,
  type WaButton,
} from './whatsappSend';

/* Mensajes interactivos de WhatsApp armados SOLO con datos de la base, sin
 * IA: menú de bienvenida, lista de próximas fechas, detalle de una fecha con
 * botón de compra. Todo lo que tiene una respuesta exacta (qué fechas hay,
 * cuánto vale) se resuelve acá en milisegundos y sin costo, y el agente
 * queda para las preguntas abiertas.
 *
 * Mismas reglas que el agente: el remanente exacto del cupo nunca se muestra
 * (semáforo de `availabilityLabel`), y la dirección no aparece. */

const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');

/** Ids de los botones/filas que manda el servidor. Cuando la persona toca
 * uno, Meta devuelve ESTE id y el webhook lo resuelve sin pasar por la IA. */
export const WA_IDS = {
  dates: 'menu:fechas',
  prices: 'menu:precios',
  human: 'menu:humano',
  eventPrefix: 'event:',
  // Respuesta rápida sugerida por la IA: lo que importa es el texto (se le
  // pasa al agente como si la persona lo hubiera escrito).
  quickPrefix: 'quick:',
} as const;

export const WELCOME_BUTTONS: WaButton[] = [
  { id: WA_IDS.dates, title: 'Próximas fechas' },
  { id: WA_IDS.prices, title: 'Precios' },
  { id: WA_IDS.human, title: 'Hablar con alguien' },
];

export type WaOutgoing = {
  payload: Record<string, unknown>;
  /** Lo que se guarda en la bandeja como texto del mensaje. */
  text: string;
  /** Resumen de botones/lista para que la bandeja muestre lo que se vio. */
  interactive: unknown;
};

export function welcomeMenuMessage(to: string, welcomeMessage: string): WaOutgoing {
  return {
    payload: buildButtonsPayload(to, welcomeMessage, WELCOME_BUTTONS),
    text: welcomeMessage,
    interactive: { type: 'button', buttons: WELCOME_BUTTONS.map((b) => b.title) },
  };
}

/** Texto + respuestas rápidas sugeridas por la IA. Sin botones, texto normal. */
export function replyWithButtons(to: string, text: string, buttons: string[]): WaOutgoing {
  if (buttons.length === 0) return { payload: buildTextPayload(to, text), text, interactive: null };
  const waButtons = buttons.map((title, i) => ({ id: `${WA_IDS.quickPrefix}${i}:${title}`, title }));
  return {
    payload: buildButtonsPayload(to, text, waButtons),
    text,
    interactive: { type: 'button', buttons },
  };
}

/** Lista de próximas fechas para elegir. Con una sola fecha va directo al
 * detalle (una lista de un elemento es un toque de más); sin fechas, un
 * texto que lo dice. */
export async function eventListMessage(to: string, intro?: string, now: Date = new Date()): Promise<WaOutgoing> {
  const upcoming = await getUpcomingPublicEvents(now);
  if (upcoming.length === 0) {
    const text = `Todavía no hay una próxima fecha anunciada 💜 La vas a ver primero en nuestro Instagram y en ${APP_URL}`;
    return { payload: buildTextPayload(to, text), text, interactive: null };
  }
  if (upcoming.length === 1) return eventDetailMessage(to, upcoming[0].slug, now);

  const text = intro ?? 'Estas son las próximas fechas 💜 Toca la que te tinca para ver precios y entradas.';
  const rows = upcoming.map((e) => ({
    id: `${WA_IDS.eventPrefix}${e.slug}`,
    title: e.title,
    description: `${formatChileDate(new Date(e.eventDate))}${e.status === 'soldout' ? ' · AGOTADA' : ''}`,
  }));
  return {
    payload: buildListPayload(to, text, 'Ver fechas', 'Próximas fechas', rows),
    text,
    interactive: { type: 'list', rows: rows.map((r) => `${r.title} (${r.description})`) },
  };
}

/** Detalle de una fecha (día, horario, lugar, precios con semáforo) y botón
 * "Comprar entrada" con el link real. Si la fecha ya no está entre las
 * próximas (se despublicó, ya pasó), cae a la lista. */
export async function eventDetailMessage(to: string, slug: string, now: Date = new Date()): Promise<WaOutgoing> {
  const upcoming = await getUpcomingPublicEvents(now);
  const event = upcoming.find((e) => e.slug === slug);
  if (!event) {
    if (upcoming.length === 0) return eventListMessage(to, undefined, now);
    return eventListMessage(to, 'Esa fecha ya no está disponible 🙈 Estas son las próximas:', now);
  }

  const lines: string[] = [`*${event.title}*`, `📅 ${formatChileDate(new Date(event.eventDate), { withYear: true })}`];
  if (event.doorsOpen) lines.push(`🕘 Desde las ${formatChileTime(new Date(event.doorsOpen))}`);
  if (event.venue) lines.push(`📍 ${event.venue}`);

  if (event.status === 'soldout') {
    lines.push('', 'Las entradas para esta fecha están AGOTADAS.');
  } else {
    const tickets = await db.getTicketTypesByEventId(event.id);
    const accesos = tickets.filter((t) => t.category === 'acceso' && t.status !== 'hidden');
    if (accesos.length > 0) {
      lines.push('');
      for (const t of accesos) {
        const remaining = t.poolRemaining ?? (t.totalStock - t.soldCount);
        const label = availabilityLabel(remaining, t.status === 'soldout');
        const precio = `$${Number(t.price).toLocaleString('es-CL')}`;
        lines.push(`• ${t.name}: ${precio}${label === 'disponible' ? '' : ` (${label})`}`);
      }
    }
  }

  const text = lines.join('\n');
  const url = `${APP_URL}/eventos/${event.slug}`;
  if (event.status === 'soldout') {
    return { payload: buildTextPayload(to, text), text, interactive: null };
  }
  return {
    payload: buildCtaUrlPayload(to, text, 'Comprar entrada', url),
    text,
    interactive: { type: 'cta_url', label: 'Comprar entrada', url },
  };
}

/** Texto de la IA + botón "Comprar entrada" del próximo evento con venta
 * abierta. Si no hay ninguno, solo el texto. */
export async function replyWithBuyLink(to: string, text: string, now: Date = new Date()): Promise<WaOutgoing> {
  const upcoming = await getUpcomingPublicEvents(now);
  const event = upcoming.find((e) => e.status !== 'soldout');
  if (!event) return { payload: buildTextPayload(to, text), text, interactive: null };
  const url = `${APP_URL}/eventos/${event.slug}`;
  return {
    payload: buildCtaUrlPayload(to, text, 'Comprar entrada', url),
    text,
    interactive: { type: 'cta_url', label: 'Comprar entrada', url },
  };
}
