import { ALL_ARTICLES, articlePath } from '../client/src/content';

/* Todo lo que tiene que ver con links en las respuestas del agente de IA
 * (Instagram y WhatsApp). Regla del dueño (27/09): NUNCA se ve una URL
 * escrita en un mensaje -- los links viajan siempre como botón (Button
 * Template en Instagram, cta_url en WhatsApp). El modelo solo elige QUÉ
 * página mandar (`pageKey`, una ruta de esta lista cerrada); la URL, el
 * texto del botón y la marca de origen (UTM) los arma el servidor. */

const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');

export type AgentLinkChannel = 'instagram' | 'whatsapp';

export type AgentSitePage = {
  /** Ruta del sitio -- también es la clave que elige el modelo. */
  path: string;
  topic: string;
  summary: string;
  /** Texto del botón: Meta corta en 20 caracteres. */
  buttonLabel: string;
};

/** Páginas standalone (no viven en `content/index.ts`, ver
 * client/src/App.tsx) -- cambian poco, se mantienen a mano. */
const STANDALONE_SITE_PAGES: AgentSitePage[] = [
  {
    topic: 'Tarjeta PlayCard (QR, saldo, Playcoins)',
    path: '/blog/tarjeta-playcard',
    summary: 'Tu QR de acceso, saldo prepagado y Playcoins en un solo lugar, paso a paso.',
    buttonLabel: 'Ver la PlayCard',
  },
  {
    topic: 'Recargar saldo de la PlayCard (después de comprar la entrada)',
    path: '/recargar',
    summary: 'Cargar saldo a la PlayCard cuando quieras, aunque ya tengan su entrada: ponen su correo, reciben un código de 6 dígitos y pagan. Mandarlo cuando pregunten cómo cargar o recargar saldo.',
    buttonLabel: 'Recargar PlayCard',
  },
  {
    topic: 'Qué son las fiestas liberales',
    path: '/blog/que-son-las-fiestas-liberales',
    summary: 'Mitos y realidades de las fiestas liberales.',
    buttonLabel: 'Leer más',
  },
  {
    topic: 'Disfraz obligatorio (quiz de nivel de disfraz)',
    path: '/blog/dress-code-explicado',
    summary: 'No tiene que ser profesional, pero sí es obligatorio -- tips y un quiz de 1 minuto.',
    buttonLabel: 'Ver el dress code',
  },
  {
    topic: 'Ideas de disfraz / "¿de qué me disfrazo?" (Oráculo de Disfraces con IA)',
    path: '/disfraces',
    summary: 'Contestas 5 preguntas y te recomienda 3 disfraces concretos: con lo que tienes en casa, con accesorios o full producción. Mandarlo cuando pidan ideas de disfraz.',
    buttonLabel: 'Ideas de disfraz',
  },
  {
    topic: 'Quiénes somos',
    path: '/nosotros',
    summary: 'Quiénes son y la historia de Mansion Playroom.',
    buttonLabel: 'Conócenos',
  },
  {
    topic: 'Reembolso o transferencia de una entrada',
    path: '/politica-de-reembolso',
    summary: 'Reglas de reembolso y transferencia de entradas.',
    buttonLabel: 'Ver política',
  },
  {
    topic: 'Privacidad de los datos',
    path: '/politica-de-privacidad',
    summary: 'Cómo se usan los datos personales.',
    buttonLabel: 'Ver privacidad',
  },
  {
    topic: 'Programa de embajadores',
    path: '/embajadores',
    summary: 'Cómo funciona el programa de embajadores/referidos.',
    buttonLabel: 'Ser embajador',
  },
];

/** Lista cerrada de páginas que el agente puede mandar como botón. Los
 * artículos del blog/guías salen de `ALL_ARTICLES`, así uno nuevo aparece
 * solo sin tocar este archivo. */
export const AGENT_SITE_PAGES: AgentSitePage[] = [
  ...ALL_ARTICLES.map((a) => ({
    path: articlePath(a),
    topic: a.title,
    summary: a.description,
    buttonLabel: 'Leer más',
  })),
  ...STANDALONE_SITE_PAGES,
];

export const AGENT_PAGE_KEYS: string[] = AGENT_SITE_PAGES.map((p) => p.path);

/** Marca de origen en cada link del agente -- así las ventas que entran por
 * un botón del agente aparecen solas en "Ventas por Origen" (el checkout ya
 * guarda la UTM en la orden) y en la tarjeta "Ventas del agente". */
export function withAgentUtm(url: string, channel: AgentLinkChannel, campaign: string = 'agente'): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', channel);
  u.searchParams.set('utm_medium', 'dm');
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}

/** El botón de una página del sitio que eligió el modelo, o `null` si la
 * clave no es de la lista (nunca se arma una URL con algo inventado). */
export function resolvePageLink(pageKey: string | null | undefined, channel: AgentLinkChannel): { title: string; url: string } | null {
  if (!pageKey) return null;
  const page = AGENT_SITE_PAGES.find((p) => p.path === pageKey);
  if (!page) return null;
  return { title: page.buttonLabel.slice(0, 20), url: withAgentUtm(`${APP_URL}${page.path}`, channel) };
}

// http(s)://..., www...., o cualquier cosa con el dominio del sitio, con o
// sin esquema ("mansionplayroom.cl/entradas").
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s)]+|\b[\w.-]*mansionplayroom\.cl\S*/gi;

/** Red de seguridad: saca cualquier URL que se haya colado en un texto que
 * va a ver la persona, y dice qué link era (para convertirlo en botón). */
export function stripUrlsFromReply(text: string): { text: string; eventLink: boolean; pageKey: string | null } {
  let eventLink = false;
  let pageKey: string | null = null;
  const cleaned = text.replace(URL_PATTERN, (match) => {
    const path = extractPath(match);
    if (path.startsWith('/eventos/') || path === '/entradas' || path.startsWith('/entradas')) eventLink = true;
    else if (!pageKey && AGENT_PAGE_KEYS.includes(path)) pageKey = path;
    return '';
  });
  return {
    text: cleaned
      // Restos típicos de haber sacado un link: "acá: ." o "aquí -> ".
      .replace(/[ \t]*(?:->|→|:)[ \t]*(?=[.,!?)]?\s*$)/gm, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([.,!?])/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    eventLink,
    pageKey,
  };
}

function extractPath(match: string): string {
  try {
    const withScheme = /^https?:\/\//i.test(match) ? match : `https://${match}`;
    return new URL(withScheme.replace(/[.,!?]+$/, '')).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

/** Parte una respuesta en burbujas cortas, como escribe una persona: cada
 * bloque separado por una línea en blanco es una burbuja. Máximo `max`
 * burbujas -- lo que sobre se junta en la última, para no mandar una ráfaga
 * de mensajes. */
export function splitIntoBubbles(text: string, max = 3): string[] {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= max) return parts;
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join('\n\n')];
}
