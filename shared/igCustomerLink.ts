/* Vincular una conversación de Instagram con la ficha de cliente real
 * (server/igCustomerLink.ts). Acá vive lo PURO: normalizar el @, detectar
 * cuándo la persona dice que ya compró, y puntuar qué clientes se le parecen
 * -- para poder probarlo sin base de datos.
 *
 * Ojo: "dice que ya compró" es solo lo que escribió la persona. La
 * sugerencia siempre sale de órdenes aprobadas reales y la vinculación la
 * confirma el dueño con un toque; nada se vincula solo. */

/** Minúsculas, sin tildes ni signos raros: para comparar texto sin que "é" o
 * una mayúscula arruine el match. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "@Foo.Bar", "https://instagram.com/foo.bar/?igsh=1" y "foo.bar" son la
 * misma cuenta. Devuelve '' si no queda nada usable. */
export function normalizeIgHandle(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[/?#].*$/, '');
  s = s.replace(/^@+/, '').trim();
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : '';
}

const BOUGHT_VERBS = '(compr|adquir|pagu|sac|tengo|tenemos|reserv|asegur|conseg)';
const NEGATED = new RegExp(`\\b(no|aun no|todavia no|aun|todavia|cuando|si) (la |lo |las |los )?(ya )?${BOUGHT_VERBS}`);
const BOUGHT_PATTERNS: RegExp[] = [
  new RegExp(`\\bya (la |lo |las |los |nos |me )?${BOUGHT_VERBS}`),
  /\bya (estamos|estoy|quedamos|quede) (listo|lista|listos|listas|dentro|confirmad)/,
  /\b(listo|lista|listos|listas)\b.{0,30}\b(entrada|entradas|acceso|accesos|compra)\b/,
  /\bcompr(e|amos|o)\b.{0,25}\b(entrada|entradas|acceso|accesos|preventa)\b/,
  /\b(entrada|entradas|acceso|accesos)\b.{0,20}\b(comprada|compradas|listas?|asegurad[ao]s?|pagad[ao]s?)\b/,
];

/** ¿Alguno de los mensajes de la persona dice que ya tiene su entrada?
 * Descarta preguntas ("¿ya compraron?") y negaciones ("todavía no compro"). */
export function saysAlreadyBought(texts: Array<string | null | undefined>): boolean {
  return texts.some((raw) => {
    if (!raw) return false;
    const t = foldText(raw);
    if (t.includes('?') || NEGATED.test(t)) return false;
    return BOUGHT_PATTERNS.some((re) => re.test(t));
  });
}

const STOPWORDS = new Set(['soy', 'los', 'las', 'con', 'por', 'una', 'del', 'pareja', 'preventa', 'interesada', 'interesado', 'acceso', 'entrada', 'entradas', 'cliente', 'persona', 'primera', 'vez', 'viene', 'quiere', 'pregunto', 'gmail', 'hotmail', 'outlook', 'yahoo', 'mail']);

function tokens(value: string | null | undefined): string[] {
  if (!value) return [];
  return foldText(value).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export interface BuyerCandidate {
  customerId: number;
  email: string;
  fullName: string | null;
  instagram: string | null;
  orderNumber: string;
  tickets: string;
}

export interface CustomerSuggestion extends BuyerCandidate { score: number }

/** Qué tanto se parece un comprador a esta conversación. Cuenta nombres que
 * coinciden entre el perfil de Instagram / la ficha de la IA y el comprador, y
 * partes del nombre o del correo que aparecen DENTRO del @ (ej. @soykatrina →
 * "katrina"). Solo devuelve los que tienen alguna coincidencia. */
export function rankCustomerSuggestions(
  hints: { username: string | null; name: string | null; notes: string | null },
  candidates: BuyerCandidate[],
  limit = 5,
): CustomerSuggestion[] {
  const handle = normalizeIgHandle(hints.username);
  const hintTokens = new Set([...tokens(hints.name), ...tokens(hints.notes)]);
  const out: CustomerSuggestion[] = [];
  for (const c of candidates) {
    const nameTokens = tokens(c.fullName);
    const mailTokens = tokens(c.email.split('@')[0]);
    let score = 0;
    for (const t of nameTokens) {
      if (hintTokens.has(t)) score += 3;
      if (handle && t.length >= 4 && handle.includes(t)) score += 2;
    }
    for (const t of mailTokens) {
      if (handle && t.length >= 4 && handle.includes(t)) score += 1;
      if (hintTokens.has(t)) score += 1;
    }
    if (handle && normalizeIgHandle(c.instagram) === handle) score += 10;
    if (score > 0) out.push({ ...c, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
