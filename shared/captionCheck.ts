/* Revisión de textos para Instagram (Plan de contenido y "Revisar un texto"):
 * qué se ve antes del "más", cuántos hashtags, si el gancho es concreto, y un
 * limpiador de marcas de IA en español. Lo puro, para probarlo sin pantalla.
 * Ideas del paquete github.com/Jakeschincariol/instagram-agent-skill (MIT),
 * reescritas en español para Playroom. */
import { AI_PHRASES_ES, NOT_JUST_PATTERN } from './aiPhrasesEs';

/** Caracteres que se ven en el feed antes del "... más". */
export const FEED_PREVIEW_CHARS = 125;
export const CAPTION_MAX_CHARS = 2200;
/** Tope de hashtags por publicación. Según el autor del paquete, Instagram lo
 * bajó de 30 a 5 en diciembre de 2025 (no confirmado acá); por eso vive en una
 * sola constante. Menos hashtags nunca hace daño. */
export const INSTAGRAM_HASHTAG_LIMIT = 5;

const chars = (s: string) => Array.from(s);

export function feedPreview(caption: string): { visible: string; truncated: boolean; firstLineCut: boolean } {
  const text = caption.trim();
  const all = chars(text);
  const truncated = all.length > FEED_PREVIEW_CHARS;
  const visible = all.slice(0, FEED_PREVIEW_CHARS).join('');
  const firstLine = text.split('\n')[0] ?? '';
  return { visible, truncated, firstLineCut: chars(firstLine).length > FEED_PREVIEW_CHARS };
}

export type CheckStatus = 'ok' | 'warn';
export interface CaptionCheck { id: string; label: string; status: CheckStatus; detail: string }

const MONTHS_DAYS = new RegExp(String.raw`\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|ma[nñ]ana)\b`, 'iu');
const ASK_VERBS = new RegExp(String.raw`\b(comenta|comenten|etiqueta|etiqueten|guarda|guarden|comparte|compartan|vota|voten|responde|respondan|compra|compren|escribe|escr[ií]banos|escr[ií]benos|reacciona|manda|mandanos|m[aá]ndanos|sigue|s[ií]guenos)\b`, 'giu');

export function extractHashtags(text: string): string[] {
  return Array.from(text.matchAll(new RegExp(String.raw`(^|\s)#([\p{L}\p{N}_]+)`, 'gu'))).map((m) => `#${m[2]}`);
}

/** Revisión de un texto. `hashtags` = los que van aparte (además de los que haya dentro del texto). */
export function lintCaption(caption: string, hashtags: string[] = []): { preview: ReturnType<typeof feedPreview>; checks: CaptionCheck[] } {
  const preview = feedPreview(caption);
  const checks: CaptionCheck[] = [];
  const length = chars(caption.trim()).length;
  checks.push(length > CAPTION_MAX_CHARS
    ? { id: 'length', label: 'Largo', status: 'warn', detail: `${length} de ${CAPTION_MAX_CHARS} caracteres: Instagram no deja publicarlo.` }
    : { id: 'length', label: 'Largo', status: 'ok', detail: `${length} de ${CAPTION_MAX_CHARS} caracteres.` });

  checks.push(preview.firstLineCut
    ? { id: 'first-line', label: 'Primera línea', status: 'warn', detail: `Pasa de ${FEED_PREVIEW_CHARS} caracteres y queda cortada a la mitad en el feed. Acórtala para que la idea se lea completa.` }
    : { id: 'first-line', label: 'Primera línea', status: 'ok', detail: 'Se lee completa antes del "más".' });

  const concrete = /\d/.test(preview.visible) || MONTHS_DAYS.test(preview.visible) || /playroom/i.test(preview.visible);
  checks.push(concrete
    ? { id: 'hook', label: 'Gancho concreto', status: 'ok', detail: 'La parte visible tiene un dato concreto (número, fecha o nombre).' }
    : { id: 'hook', label: 'Gancho concreto', status: 'warn', detail: 'Lo que se ve antes del "más" no tiene ningún dato concreto (número, fecha, nombre). Es lo que hace parar a alguien.' });

  const allTags = [...hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)), ...extractHashtags(caption)];
  const unique = new Set(allTags.map((t) => t.toLowerCase()));
  if (allTags.length > INSTAGRAM_HASHTAG_LIMIT) {
    checks.push({ id: 'hashtags', label: 'Hashtags', status: 'warn', detail: `${allTags.length} hashtags: el tope es ${INSTAGRAM_HASHTAG_LIMIT}. Deja los más específicos.` });
  } else if (unique.size < allTags.length) {
    checks.push({ id: 'hashtags', label: 'Hashtags', status: 'warn', detail: 'Hay hashtags repetidos.' });
  } else {
    checks.push({ id: 'hashtags', label: 'Hashtags', status: 'ok', detail: `${allTags.length} de ${INSTAGRAM_HASHTAG_LIMIT}.` });
  }

  const asks = Array.from(new Set(Array.from(caption.matchAll(ASK_VERBS)).map((m) => m[1].toLowerCase())));
  checks.push(asks.length > 2
    ? { id: 'ask', label: 'Una sola petición', status: 'warn', detail: `Pide varias cosas a la vez (${asks.join(', ')}). Una sola petición clara funciona mejor.` }
    : { id: 'ask', label: 'Una sola petición', status: 'ok', detail: asks.length > 0 ? `Pide: ${asks.join(', ')}.` : 'No pide nada (está bien si no hace falta).' });

  const { flags } = humanizeEs(caption);
  checks.push(flags.length > 0
    ? { id: 'ai', label: 'Suena a IA', status: 'warn', detail: flags.map((f) => `"${f.label}" → ${f.suggestion}`).join(' · ') }
    : { id: 'ai', label: 'Suena a IA', status: 'ok', detail: 'No se encontraron muletillas típicas de IA.' });

  return { preview, checks };
}

export interface AiFlag { label: string; suggestion: string }

const URL_SPLIT = new RegExp(String.raw`(https?:\/\/\S+|www\.\S+)`, 'giu');

/** Lo que se arregla solo, sin cambiar palabras: caracteres invisibles, raya
 * larga, puntos suspensivos de un carácter, espacios dobles. El ZWJ se respeta
 * cuando une emojis (🏳️‍🌈 o familias), si no los rompería. Nunca toca links. */
export function cleanAiMarks(text: string): string {
  return text.split(URL_SPLIT).map((part, i) => {
    if (i % 2 === 1) return part; // es un link
    return part
      .replace(new RegExp(String.raw`[\u200B\u200C\u2060\u2061-\u2064\uFEFF\u00AD\u180E]`, 'gu'), '')
      // Caracteres "tag": solo valen dentro de banderas de emoji (🏴 + tags); sueltos son marca de agua.
      .replace(new RegExp(String.raw`(\p{Extended_Pictographic})?([\u{E0000}-\u{E007F}]+)`, 'gu'), (_m, emoji: string | undefined, tags: string) => (emoji ? emoji + tags : ''))
      .replace(new RegExp(String.raw`(?<![\p{Extended_Pictographic}\uFE0F])\u200D|\u200D(?!\p{Extended_Pictographic})`, 'gu'), '')
      .replace(new RegExp(String.raw`[\u00A0\u202F]`, 'gu'), ' ')
      .replace(new RegExp(String.raw`^[ \t]*—[ \t]*`, 'gmu'), '')
      .replace(new RegExp(String.raw`[ \t]*—[ \t]*`, 'gu'), ', ')
      .replace(new RegExp(String.raw`–`, 'gu'), '-')
      .replace(new RegExp(String.raw`…`, 'gu'), '...')
      .replace(new RegExp(String.raw`,\s*([,.;:!?])`, 'gu'), '$1')
      .replace(new RegExp(String.raw`[ \t]{2,}`, 'gu'), ' ')
      .replace(new RegExp(String.raw`[ \t]+\n`, 'gu'), '\n');
  }).join('');
}

/** Limpia lo seguro y avisa lo que necesita criterio (muletillas de IA). */
export function humanizeEs(text: string): { cleaned: string; flags: AiFlag[] } {
  const cleaned = cleanAiMarks(text);
  const flags: AiFlag[] = [];
  for (const p of AI_PHRASES_ES) if (p.pattern.test(cleaned)) flags.push({ label: p.label, suggestion: p.suggestion });
  if (NOT_JUST_PATTERN.test(cleaned)) flags.push({ label: '"no es solo X, es Y"', suggestion: 'decir directo lo que es' });
  const emojiBullets = cleaned.split('\n').filter((l) => new RegExp(String.raw`^\s*\p{Extended_Pictographic}`, 'u').test(l)).length;
  if (emojiBullets >= 3) flags.push({ label: 'lista con emojis de viñeta', suggestion: 'menos viñetas, frases normales' });
  return { cleaned, flags };
}
