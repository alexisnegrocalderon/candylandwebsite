/* Filtros por reglas (sin IA, sin costo) para los mensajes directos del
 * agente: lo que NO necesita que el agente gaste una respuesta ni que le
 * llegue un aviso al dueño. Pedido del dueño tras el reporte semanal del
 * agente: había mucho ruido (spam, adjuntos sueltos, mensajes de una palabra)
 * y la gente que pregunta la dirección antes de comprar no quedaba bien cerrada. */

function norm(text: string): string {
  return text.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase();
}

/** Pregunta por la dirección / dónde queda / cómo llegar. Es una señal de
 * compra, nunca algo para derivar. */
export function asksAddress(raw: string): boolean {
  const t = norm(raw);
  return /\b(direccion|ubicacion|ubicados?|como llego|como llegar|como se llega|donde (quedan?|es|esta|estan|son|se hace|hacen|se hara|sera|va a ser|nos juntamos)|en que (sector|lugar|parte|comuna)|que direccion|me pasas? la dir|mandame la dir)\b/.test(t);
}

/** Publicidad / spam por DM: seguidores, inversiones, links raros, ofertas
 * de servicios. Solo cuenta si NO habla de la fiesta (un cliente real que
 * pega su Instagram junto a una pregunta no es spam). */
const SPAM = [
  /https?:\/\//, /www\./, /\b[a-z0-9-]+\.(com|net|ru|xyz|io|me|shop|site)\b/, /t\.me\//, /wa\.me\//, /bit\.ly/,
  /seguidores|followers|compra (likes|seguidores)|aumenta tu (cuenta|alcance)/,
  /ganar dinero|gana dinero|ganancias|inversion|crypto|bitcoin|forex|trading/,
  /trabajo desde casa|ingresos extra|prestamo|credito rapido/,
  /agencia de (marketing|publicidad)|te ofrezco (mis )?servicios|promociono|promocion de (cuentas|likes)|colaboracion pagada|gestion de redes/,
  /whatsapp\s*\+?\d{6,}|escribeme al privado|manda dm/,
];
const EVENT_WORDS = /\b(entrada|entradas|fiesta|evento|precio|valor|ir|asistir|comprar|disfraz|aniversario|playroom|mansion|dress|horario)\b/;

export function isDmSpam(raw: string): boolean {
  const t = norm(raw);
  if (EVENT_WORDS.test(t)) return false;
  return SPAM.some((r) => r.test(t));
}

const EMOJI_RE = new RegExp(String.raw`[\p{Extended_Pictographic}\p{Emoji_Component}‍️]`, 'gu');

/** Solo emojis, risas o un signo suelto ("😂😂", "jajaja", "jsjs", "xd", "."): no es una consulta. */
export function isReactionOnly(raw: string): boolean {
  const stripped = raw.replace(EMOJI_RE, '').replace(/[\s.,!¡?¿\-_*+~]+/g, '');
  if (stripped.length === 0) return true;
  return /^(ja|je|ji|js|js|ha|ha?ha|xd+|lol|kk+|jaja+|jeje+|jsjs+)+$/i.test(norm(stripped));
}

export type AttachmentKind = 'share' | 'media' | 'other';

/** Qué tipo de adjunto llegó sin texto. `share` = reel/post/historia
 * compartidos, sticker o corazón: casi siempre un amigo mandando algo, nada
 * que contestar ni que avisar. `media` = foto, video, audio o archivo: puede
 * ser un comprobante o un problema real, así que lo ve una persona. */
export function classifyAttachments(attachments: unknown): AttachmentKind {
  if (!Array.isArray(attachments) || attachments.length === 0) return 'other';
  const types = attachments.map((a) => String((a as { type?: unknown } | null)?.type ?? '').toLowerCase());
  const SHARE = ['share', 'ig_reel', 'reel', 'ig_post', 'story_mention', 'like_heart', 'sticker', 'reaction'];
  if (types.every((t) => SHARE.includes(t))) return 'share';
  if (types.some((t) => ['image', 'video', 'audio', 'file'].includes(t))) return 'media';
  return 'other';
}
