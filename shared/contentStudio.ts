/* Estudio de contenido (admin → Marketing → Estudio): las láminas de
 * carruseles, posts e historias de Instagram, armadas con las plantillas de
 * marca (las mismas de los diseños de Claude Design) y exportadas a PNG desde
 * el navegador.
 *
 * Acá vive lo PURO -- tamaños, forma del diseño, su limpieza y cómo una pieza
 * del Plan de contenido (shared/contentPlan.ts) se convierte en láminas --
 * para poder probarlo sin navegador. Lo visual está en
 * client/src/components/admin/studio/. */

import type { ContentPiece } from './contentPlan';

export const STUDIO_FORMATS = ['carrusel', 'post', 'historia'] as const;
export type StudioFormat = (typeof STUDIO_FORMATS)[number];

/** Pedido del dueño: posts y carruseles en 3:4, historias en 9:16. */
export const STUDIO_SIZES: Record<StudioFormat, { width: number; height: number }> = {
  carrusel: { width: 1080, height: 1440 },
  post: { width: 1080, height: 1440 },
  historia: { width: 1080, height: 1920 },
};

/** Las tres familias de diseño que ya usa la cuenta:
 * - azul: el "Desafío" (fondo azul, letras fucsia, foto que se sale del borde).
 * - pastel: el "Test" de Halloween (fondos pastel que se turnan, morado).
 * - playcard: la de la PlayCard (rosado y celeste en diagonal, logo). */
export const STUDIO_THEMES = ['azul', 'pastel', 'playcard'] as const;
export type StudioTheme = (typeof STUDIO_THEMES)[number];

export const STUDIO_LAYOUTS = ['portada', 'pregunta', 'resultados', 'pasos', 'cierre', 'imagen'] as const;
export type StudioLayout = (typeof STUDIO_LAYOUTS)[number];

export const STUDIO_IMAGE_SIDES = ['auto', 'left', 'right'] as const;
export type StudioImageSide = (typeof STUDIO_IMAGE_SIDES)[number];

/** Láminas por diseño (Instagram permite hasta 20 en un carrusel). */
export const STUDIO_MAX_SLIDES = 20;
/** Opciones a/b/c/d de una pregunta. */
export const STUDIO_MAX_OPTIONS = 4;
/** Filas de "resultados" (A = Vampiro...) o tarjetas de "pasos". */
export const STUDIO_MAX_ITEMS = 4;
export const STUDIO_MAX_DESIGNS_LISTED = 100;

export interface StudioItem {
  /** Emoji o letra del círculo (resultados) / etiqueta de la píldora (pasos). */
  badge: string;
  title: string;
  body: string;
}

export interface StudioSlide {
  layout: StudioLayout;
  /** Palabra manuscrita sobre el título ("Desafío", "Test") o el antetítulo
   * en mayúsculas de la PlayCard ("PASO A PASO"). */
  script: string;
  /** Número grande de la pregunta ("01."). */
  number: string;
  title: string;
  /** Subtítulo en cursiva / párrafo. */
  body: string;
  /** Opciones a, b, c, d (en orden). */
  options: string[];
  items: StudioItem[];
  /** Texto del botón con borde ("Comenta cuántas acertaste"). */
  cta: string;
  /** Texto chico bajo el botón ("y etiqueta a alguien..."). */
  footnote: string;
  imageUrl: string;
  imageSide: StudioImageSide;
  /** Paleta en la familia pastel (0 durazno, 1 lila, 2 lima); -1 = se turna sola. */
  palette: number;
  /** Muestra "Desliza →" abajo. */
  swipeHint: boolean;
}

export interface StudioDesign {
  title: string;
  format: StudioFormat;
  theme: StudioTheme;
  eventId: number | null;
  /** Texto de la publicación (del Plan de contenido), para copiarlo al subir. */
  caption: string;
  slides: StudioSlide[];
}

const LIMITS = {
  title: 200,
  script: 40,
  number: 6,
  slideTitle: 200,
  body: 400,
  option: 160,
  itemBadge: 24,
  itemTitle: 80,
  itemBody: 240,
  cta: 60,
  footnote: 200,
  imageUrl: 1000,
  caption: 3000,
} as const;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Solo URLs http(s): una lámina nunca debe cargar `javascript:` ni `data:`
 * gigantes guardados en la base. */
function cleanImageUrl(value: unknown): string {
  const url = str(value, LIMITS.imageUrl).trim();
  return /^https?:\/\//i.test(url) || url.startsWith('/') ? url : '';
}

export function emptySlide(layout: StudioLayout = 'pregunta'): StudioSlide {
  return {
    layout,
    script: '',
    number: '',
    title: '',
    body: '',
    options: [],
    items: [],
    cta: '',
    footnote: '',
    imageUrl: '',
    imageSide: 'auto',
    palette: -1,
    swipeHint: false,
  };
}

export function normalizeStudioSlide(raw: unknown): StudioSlide | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const palette = Number(r.palette);
  return {
    layout: oneOf(r.layout, STUDIO_LAYOUTS, 'pregunta'),
    script: str(r.script, LIMITS.script),
    number: str(r.number, LIMITS.number),
    title: str(r.title, LIMITS.slideTitle),
    body: str(r.body, LIMITS.body),
    options: (Array.isArray(r.options) ? r.options : [])
      .filter((o): o is string => typeof o === 'string')
      .slice(0, STUDIO_MAX_OPTIONS)
      .map((o) => o.slice(0, LIMITS.option)),
    items: (Array.isArray(r.items) ? r.items : [])
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
      .slice(0, STUDIO_MAX_ITEMS)
      .map((i) => ({ badge: str(i.badge, LIMITS.itemBadge), title: str(i.title, LIMITS.itemTitle), body: str(i.body, LIMITS.itemBody) })),
    cta: str(r.cta, LIMITS.cta),
    footnote: str(r.footnote, LIMITS.footnote),
    imageUrl: cleanImageUrl(r.imageUrl),
    imageSide: oneOf(r.imageSide, STUDIO_IMAGE_SIDES, 'auto'),
    palette: Number.isInteger(palette) && palette >= 0 && palette <= 2 ? palette : -1,
    swipeHint: r.swipeHint === true,
  };
}

/** Limpia un diseño que viene del panel o de la base: recorta textos, descarta
 * láminas rotas y deja todo dentro de los topes. `null` si no hay ninguna
 * lámina usable. */
export function normalizeStudioDesign(raw: unknown): StudioDesign | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const slides = (Array.isArray(r.slides) ? r.slides : [])
    .map(normalizeStudioSlide)
    .filter((s): s is StudioSlide => s !== null)
    .slice(0, STUDIO_MAX_SLIDES);
  if (slides.length === 0) return null;
  const format = oneOf(r.format, STUDIO_FORMATS, 'carrusel');
  const eventId = Number(r.eventId);
  return {
    title: str(r.title, LIMITS.title).trim() || 'Sin título',
    format,
    theme: oneOf(r.theme, STUDIO_THEMES, 'azul'),
    eventId: r.eventId != null && Number.isInteger(eventId) && eventId > 0 ? eventId : null,
    caption: str(r.caption, LIMITS.caption),
    // Un post o una historia es UNA imagen.
    slides: format === 'carrusel' ? slides : slides.slice(0, 1),
  };
}

/** Lado de la foto en la familia azul: la portada la lleva a la derecha y
 * desde ahí se alterna (como en el carrusel del Desafío). */
export function resolveImageSide(slide: Pick<StudioSlide, 'imageSide'>, index: number): 'left' | 'right' {
  if (slide.imageSide !== 'auto') return slide.imageSide;
  return index % 2 === 0 ? 'right' : 'left';
}

/** Paleta de la familia pastel: se turna durazno → lila → lima. */
export function resolvePalette(slide: Pick<StudioSlide, 'palette'>, index: number): number {
  return slide.palette >= 0 ? slide.palette : index % 3;
}

/** "3/7" del encabezado. */
export function pageLabel(index: number, total: number): string {
  return total > 1 ? `${index + 1}/${total}` : '';
}

/** Tamaño de letra (px) para que un título quepa en su caja: lo limita la
 * palabra más larga (no se puede cortar) y el área total. `charWidth` es el
 * ancho promedio de una letra en "em" (la letra ancha del Desafío es ~0,95). */
export function fitFontSize(
  text: string,
  box: { width: number; height: number },
  opts: { max: number; min: number; charWidth?: number; lineHeight?: number },
): number {
  const clean = text.trim();
  if (!clean) return opts.max;
  const cw = opts.charWidth ?? 0.95;
  const lh = opts.lineHeight ?? 1;
  const longest = Math.max(...clean.split(/\s+/).map((w) => w.length));
  const byWord = box.width / (longest * cw);
  const byArea = Math.sqrt((box.width * box.height) / (clean.length * cw * lh)) * 0.92;
  return Math.round(Math.max(opts.min, Math.min(opts.max, byWord, byArea)));
}

/* --- Del Plan de contenido a láminas -------------------------------------- */

const NUMBER_PREFIX = /^\s*(?:(?:escenario|pregunta|situaci[oó]n|paso|l[aá]mina)\s*)?(\d{1,2})\s*[.):\-–]\s*/i;

/** Separa "01. Pregunta… a) uno b) dos" en número, pregunta y opciones. Las
 * opciones se reconocen solo si vienen EN ORDEN (a, b, c, d): una "a)" suelta
 * dentro de una frase no parte el texto. */
export function parseSlideText(text: string): { number: string; question: string; options: string[] } {
  let rest = text.trim();
  let number = '';
  const num = rest.match(NUMBER_PREFIX);
  if (num) {
    number = `${num[1].padStart(2, '0')}.`;
    rest = rest.slice(num[0].length);
  }

  const optionRe = /(^|[\s\n])\(?([a-dA-D])[)\]:]\s+|(^|\n)\s*([a-dA-D])\.\s+/g;
  const cuts: { letterIndex: number; start: number; end: number }[] = [];
  let expected = 0;
  for (const m of Array.from(rest.matchAll(optionRe))) {
    const letter = (m[2] ?? m[4]).toLowerCase();
    if (letter.charCodeAt(0) - 97 !== expected) continue;
    const lead = (m[1] ?? m[3] ?? '').length;
    cuts.push({ letterIndex: expected, start: (m.index ?? 0) + lead, end: (m.index ?? 0) + m[0].length });
    expected++;
    if (expected >= STUDIO_MAX_OPTIONS) break;
  }
  // Una sola "a)" no es una pregunta con opciones.
  if (cuts.length < 2) return { number, question: rest, options: [] };

  const options = cuts.map((c, i) => rest.slice(c.end, cuts[i + 1]?.start ?? rest.length).trim().replace(/[;,]$/, '').trim());
  return { number, question: rest.slice(0, cuts[0].start).trim(), options };
}

/** Título + bajada: corta en el primer salto de línea o, si es largo, en el
 * primer "?" / "." / "!" que deje un título razonable. */
export function splitHeadline(text: string): { title: string; body: string } {
  const clean = text.trim();
  const newline = clean.indexOf('\n');
  if (newline > 0) return { title: clean.slice(0, newline).trim(), body: clean.slice(newline + 1).trim() };
  if (clean.length <= 60) return { title: clean, body: '' };
  const m = clean.match(/^([\s\S]{8,90}?[?.!])\s+([\s\S]+)$/);
  return m ? { title: m[1].trim(), body: m[2].trim() } : { title: clean, body: '' };
}

/** Arma un diseño a partir de una pieza del Plan de contenido: la primera
 * lámina es la portada, la última el cierre y las del medio preguntas (con
 * sus opciones a/b si las trae). El dueño después ajusta lo que quiera. */
export function designFromPiece(piece: ContentPiece, eventId: number | null): StudioDesign {
  const format: StudioFormat = piece.format === 'carrusel' ? 'carrusel' : piece.format === 'historia' ? 'historia' : 'post';
  const caption = [piece.caption, piece.hashtags.join(' ')].filter(Boolean).join('\n\n');
  const base = { title: piece.hook.slice(0, LIMITS.title) || 'Sin título', format, theme: 'azul' as StudioTheme, eventId, caption: caption.slice(0, LIMITS.caption) };

  if (format !== 'carrusel' || piece.slides.length === 0) {
    const { title, body } = splitHeadline(piece.hook);
    const slide = { ...emptySlide('portada'), title, body };
    if (piece.keyword) slide.cta = `Responde "${piece.keyword}"`.slice(0, LIMITS.cta);
    return normalizeStudioDesign({ ...base, slides: [slide] })!;
  }

  const parsed = piece.slides.map(parseSlideText);
  const hasQuiz = parsed.some((p) => p.options.length >= 2);
  const slides = piece.slides.map((text, i) => {
    const last = i === piece.slides.length - 1 && piece.slides.length >= 3;
    if (i === 0) {
      const { title, body } = splitHeadline(text);
      return { ...emptySlide('portada'), script: hasQuiz ? 'Desafío' : '', title, body, swipeHint: true };
    }
    const p = parsed[i];
    if (last && p.options.length === 0) {
      const { title, body } = splitHeadline(text);
      return { ...emptySlide('cierre'), title, body, footnote: piece.interaction.slice(0, LIMITS.footnote) };
    }
    return { ...emptySlide('pregunta'), number: p.number, title: p.question, options: p.options, swipeHint: !last };
  });
  return normalizeStudioDesign({ ...base, slides })!;
}
