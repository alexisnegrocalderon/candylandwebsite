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
  /** Ruta del sitio -- también es la clave que elige el modelo. Puede llevar
   * ancla (`/#preguntas-frecuentes`) para caer en una sección. */
  path: string;
  topic: string;
  summary: string;
  /** Texto del botón: claro + 1 emoji. Meta corta en 20 caracteres. */
  buttonLabel: string;
  /** Palabras (sin tildes, minúsculas) que, en el mensaje de la persona,
   * indican claramente que esta página es la respuesta -- red de seguridad
   * por si la IA olvida mandar el botón (`pageForMessage`). */
  keywords?: string[];
  /** La red de seguridad no la agrega sola: el agente decide (ej. precios,
   * donde primero pregunta qué acceso quiere la persona para dar el precio
   * exacto, y el botón de compra es la respuesta final). */
  modelDecides?: boolean;
};

/** Páginas standalone y secciones útiles que no viven en `content/index.ts`
 * -- cambian poco, se mantienen a mano. Quedan FUERA las pantallas de
 * trabajo del equipo (puerta, cocina, guardarropía, caja, gastos, admin) y
 * las páginas personales (mis puntos, tickets, pago). */
const STANDALONE_SITE_PAGES: AgentSitePage[] = [
  {
    topic: 'Precios y tipos de acceso (qué incluye cada entrada)',
    path: '/entradas',
    summary: 'Los precios y los accesos disponibles, con lo que incluye cada uno. Mandarlo cuando pregunten por precios, valores o qué incluye la entrada y todavía no estén listos para comprar.',
    buttonLabel: 'Ver precios 💜',
    modelDecides: true,
    keywords: ['precio', 'precios', 'cuanto cuesta', 'cuanto vale', 'cuanto sale', 'valor de la entrada', 'valores', 'que incluye'],
  },
  {
    topic: 'Tarjeta PlayCard (QR, saldo, Playcoins)',
    path: '/blog/tarjeta-playcard',
    summary: 'Tu QR de acceso, saldo prepagado y Playcoins en un solo lugar, paso a paso.',
    buttonLabel: 'Mi PlayCard 💳',
    keywords: ['playcard', 'play card', 'playcoins'],
  },
  {
    topic: 'Recargar saldo de la PlayCard (después de comprar la entrada)',
    path: '/recargar',
    summary: 'Cargar saldo a la PlayCard cuando quieras, aunque ya tengan su entrada: ponen su correo, reciben un código de 6 dígitos y pagan. Mandarlo cuando pregunten cómo cargar o recargar saldo.',
    buttonLabel: 'Recargar saldo 💳',
    keywords: ['recargar', 'recarga', 'cargar saldo', 'cargar la tarjeta'],
  },
  {
    topic: 'Qué son las fiestas liberales',
    path: '/blog/que-son-las-fiestas-liberales',
    summary: 'Mitos y realidades de las fiestas liberales.',
    buttonLabel: 'Qué es Playroom 💜',
    keywords: ['que son las fiestas', 'fiesta liberal', 'fiestas liberales', 'de que se trata', 'de que trata', 'que es playroom', 'que es mansion'],
  },
  {
    topic: 'Disfraz obligatorio (quiz de nivel de disfraz)',
    path: '/blog/dress-code-explicado',
    summary: 'No tiene que ser profesional, pero sí es obligatorio -- tips y un quiz de 1 minuto.',
    buttonLabel: 'Qué ponerme 🎭',
    keywords: ['dress code', 'dresscode', 'que me pongo', 'que ropa', 'como vestirme', 'como me visto', 'disfraz obligatorio', 'es obligatorio el disfraz', 'codigo de vestimenta'],
  },
  {
    topic: 'Ideas de disfraz / "¿de qué me disfrazo?" (Oráculo de Disfraces con IA)',
    path: '/disfraces',
    summary: 'Contestas 5 preguntas y te recomienda 3 disfraces concretos: con lo que tienes en casa, con accesorios o full producción. Mandarlo cuando pidan ideas de disfraz.',
    buttonLabel: 'Ideas de disfraz 👀',
    keywords: ['idea de disfraz', 'ideas de disfraz', 'de que me disfrazo', 'de que disfrazarme', 'que disfraz'],
  },
  {
    topic: 'Beneficios para cumpleañeros',
    path: '/beneficios-cumpleaneros',
    summary: 'Postula si tu cumpleaños cae cerca de la fiesta y desbloquea entrada gratis, espumante y más. Mandarlo cuando pregunten por su cumpleaños o beneficios de cumpleañero.',
    buttonLabel: 'Cumpleaños 🎂',
    keywords: ['cumpleanos', 'cumpleanero', 'cumpleanera', 'mi cumple', 'cumple'],
  },
  {
    topic: 'Preguntas frecuentes (lo esencial: edad, carnet, reglas, accesos)',
    path: '/#preguntas-frecuentes',
    summary: 'Las preguntas que más nos hacen, respondidas en la portada. Mandarlo cuando la duda sea general o de reglas básicas y no haya una página más específica.',
    buttonLabel: 'Preguntas ❓',
    keywords: ['preguntas frecuentes', 'faq'],
  },
  {
    topic: 'PlayMatch (conocer gente en la fiesta)',
    path: '/playmatch',
    summary: 'Cómo funciona PlayMatch para conectar con otras personas durante la fiesta. Mandarlo cuando pregunten cómo conocer gente o qué es PlayMatch.',
    buttonLabel: 'Ver PlayMatch 💘',
    keywords: ['playmatch', 'play match', 'conocer gente', 'conocer personas'],
  },
  {
    topic: 'Quiénes somos',
    path: '/nosotros',
    summary: 'Quiénes son y la historia de Mansion Playroom.',
    buttonLabel: 'Conócenos 💜',
    keywords: ['quienes son', 'quienes somos', 'quien organiza', 'quien esta detras'],
  },
  {
    topic: 'Reembolso o transferencia de una entrada',
    path: '/politica-de-reembolso',
    summary: 'Reglas de reembolso y transferencia de entradas.',
    buttonLabel: 'Reembolsos 🔁',
    keywords: ['reembolso', 'devolucion', 'devuelven', 'transferir la entrada', 'transferir mi entrada', 'cambiar el nombre de la entrada', 'ceder la entrada'],
  },
  {
    topic: 'Privacidad de los datos',
    path: '/politica-de-privacidad',
    summary: 'Cómo se usan los datos personales.',
    buttonLabel: 'Privacidad 🔒',
    keywords: ['privacidad', 'mis datos', 'datos personales', 'discrecion'],
  },
  {
    topic: 'Programa de embajadores',
    path: '/embajadores',
    summary: 'Cómo funciona el programa de embajadores/referidos.',
    buttonLabel: 'Ser embajador 👑',
    keywords: ['embajador', 'embajadora', 'referidos', 'ganar comision'],
  },
];

/** Nombre y palabras de cada artículo del blog o guía. Un artículo nuevo
 * sin entrada acá aparece solo, como "Leer más 📖". */
const ARTICLE_OVERRIDES: Record<string, { buttonLabel: string; keywords?: string[] }> = {
  '/blog/primera-vez-que-esperar': { buttonLabel: 'Mi primera vez ✨', keywords: ['primera vez', 'nunca he ido', 'nunca fui', 'que esperar', 'como es una fiesta', 'me da nervio', 'me da verguenza'] },
  '/blog/que-llevar': { buttonLabel: 'Qué llevar 🎒', keywords: ['que llevar', 'que debo llevar', 'que tengo que llevar', 'que se lleva', 'llevo carnet', 'que necesito llevar', 'hay que llevar'] },
  '/blog/como-llegar-y-estacionar': { buttonLabel: 'Cómo llegar 📍', keywords: ['como llegar', 'como llego', 'donde queda', 'donde es', 'direccion', 'ubicacion', 'estacionar', 'estacionamiento', 'parking', 'en que sector'] },
  '/panoramas/valparaiso': { buttonLabel: 'Panoramas Valpo 🌃', keywords: ['panoramas en valpo', 'panoramas en valparaiso', 'que hacer en valparaiso', 'donde salir en valparaiso'] },
  '/panoramas/vina-del-mar': { buttonLabel: 'Panoramas Viña 🌴', keywords: ['panoramas en vina', 'que hacer en vina', 'donde salir en vina'] },
};

/** Lista cerrada de páginas que el agente puede mandar como botón. Los
 * artículos del blog/guías salen de `ALL_ARTICLES`, así uno nuevo aparece
 * solo sin tocar este archivo. */
export const AGENT_SITE_PAGES: AgentSitePage[] = [
  ...ALL_ARTICLES.map((a) => {
    const path = articlePath(a);
    const override = ARTICLE_OVERRIDES[path];
    return {
      path,
      topic: a.title,
      summary: a.description,
      buttonLabel: override?.buttonLabel ?? 'Leer más 📖',
      keywords: override?.keywords,
    };
  }),
  ...STANDALONE_SITE_PAGES,
];

export const AGENT_PAGE_KEYS: string[] = AGENT_SITE_PAGES.map((p) => p.path);

/** Marca de origen en cada link del agente -- así las ventas que entran por
 * un botón del agente aparecen solas en "Ventas por Origen" (el checkout ya
 * guarda la UTM en la orden) y en la tarjeta "Ventas del agente". */
export function withAgentUtm(url: string, channel: AgentLinkChannel, campaign: string = 'agente', content?: string): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', channel);
  u.searchParams.set('utm_medium', 'dm');
  u.searchParams.set('utm_campaign', campaign);
  // De qué anuncio o link llegó el chat (shared/igReferral.ts, referralUtmContent).
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
}

/** Pasa un link del sitio por el contador de clics (`/api/go`, ver
 * server/linkTracker.ts), que redirige al mismo destino con sus UTM. Links
 * de otros dominios quedan igual. El origen es `utm_content` (o la campaña). */
export function trackedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.host !== new URL(APP_URL).host || u.pathname.startsWith('/api/go')) return url;
    const origin = u.searchParams.get('utm_content') || u.searchParams.get('utm_campaign') || 'sin-origen';
    return `${APP_URL}/api/go?o=${encodeURIComponent(origin)}&to=${encodeURIComponent(u.pathname + u.search + u.hash)}`;
  } catch {
    return url;
  }
}

/** El botón de una página del sitio que eligió el modelo, o `null` si la
 * clave no es de la lista (nunca se arma una URL con algo inventado). */
export function resolvePageLink(pageKey: string | null | undefined, channel: AgentLinkChannel, campaign: string = 'agente', content?: string): { title: string; url: string } | null {
  if (!pageKey) return null;
  const page = AGENT_SITE_PAGES.find((p) => p.path === pageKey);
  if (!page) return null;
  return { title: page.buttonLabel.slice(0, 20), url: withAgentUtm(`${APP_URL}${page.path}`, channel, campaign, content) };
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


function plain(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Red de seguridad: la página del catálogo que el mensaje de la persona
 * pide con claridad (sus palabras aparecen tal cual), o `null`. Las páginas
 * marcadas `modelDecides` (precios) no se agregan solas. Si calzan dos
 * páginas, gana la primera de la lista (las más específicas van primero). */
export function pageForMessage(message: string): AgentSitePage | null {
  const text = ` ${plain(message)} `;
  if (text.trim().length === 0) return null;
  for (const page of AGENT_SITE_PAGES) {
    if (!page.modelDecides && page.keywords?.some((k) => text.includes(` ${plain(k)} `))) return page;
  }
  return null;
}
