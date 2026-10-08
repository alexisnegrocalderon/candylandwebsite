/* Diseñador IA del Estudio (admin → Marketing → Estudio → «Nuevo con IA»):
 * Claude diseña cada lámina libremente en HTML+CSS, igual que en la ventana
 * de Claude Design del dueño, con el PlayRoom Design System
 * (server/studioAi/brandPack.ts). Acá vive lo PURO: la forma del diseño, las
 * operaciones de edición que devuelve la IA, el documento de cada lámina y
 * el costo de cada mensaje. El saneado del HTML está en el servidor
 * (server/studioAi/sanitize.ts): todo lo que se guarda pasó por ahí. */

import { STUDIO_SIZES, type StudioFormat } from './contentStudio';

export const AI_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];

export const AI_MODEL_LABEL: Record<AiModel, string> = {
  'claude-sonnet-5-5': 'Sonnet (rápido)',
  'claude-opus-5-5': 'Opus (mejor diseño)',
};

/** US$ por millón de tokens (API de Anthropic, octubre 2026). Escribir en
 * caché cuesta 1,25× la entrada normal. */
export const AI_PRICES: Record<AiModel, { input: number; output: number; cacheRead: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
};

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** Costo en US$ de un uso. Si el modelo que respondió no está en la tabla
 * (ej. un respaldo automático), se cobra como el más caro conocido para no
 * mostrar de menos. */
export function usageCostUsd(model: string, usage: AiUsage): number {
  const p = AI_PRICES[model as AiModel] ?? AI_PRICES['claude-opus-5-5'];
  const perToken = (usd: number) => usd / 1_000_000;
  return (
    usage.inputTokens * perToken(p.input) +
    usage.cacheWriteTokens * perToken(p.input * 1.25) +
    usage.cacheReadTokens * perToken(p.cacheRead) +
    usage.outputTokens * perToken(p.output)
  );
}

export function formatUsd(usd: number): string {
  if (usd < 0.01) return '< US$0,01';
  return `US$${usd.toFixed(2).replace('.', ',')}`;
}

/* --- El diseño ------------------------------------------------------------ */

/** Láminas por diseño y tope de tamaño de cada pieza: un carrusel de
 * Instagram admite hasta 20; con más de 10 nadie llega al final. */
export const AI_MAX_SLIDES = 12;
export const AI_MAX_SLIDE_HTML = 30_000;
export const AI_MAX_CSS = 40_000;
export const AI_MAX_CAPTION = 3000;

export interface AiSlide {
  html: string;
}

export interface AiDesign {
  title: string;
  format: StudioFormat;
  eventId: number | null;
  /** CSS compartido por todas las láminas (como el shared.css de Claude Design). */
  css: string;
  slides: AiSlide[];
  /** Texto de la publicación, listo para pegar en Instagram. */
  caption: string;
  /** La idea del diseño en una o dos frases (la escribe la IA al crear). */
  concept: string;
}

export function emptyAiDesign(format: StudioFormat, title = 'Diseño nuevo', eventId: number | null = null): AiDesign {
  return { title, format, eventId, css: '', slides: [], caption: '', concept: '' };
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Forma limpia de un diseño leído de la base o del panel. NO sanea el HTML:
 * eso lo hace el servidor antes de guardar. */
export function normalizeAiDesign(raw: unknown): AiDesign {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const format = r.format === 'post' || r.format === 'historia' ? r.format : 'carrusel';
  const eventId = Number(r.eventId);
  return {
    title: str(r.title, 200).trim() || 'Diseño nuevo',
    format,
    eventId: r.eventId != null && Number.isInteger(eventId) && eventId > 0 ? eventId : null,
    css: str(r.css, AI_MAX_CSS),
    slides: (Array.isArray(r.slides) ? r.slides : [])
      .map((s) => ({ html: str((s as Record<string, unknown>)?.html, AI_MAX_SLIDE_HTML) }))
      .filter((s) => s.html.trim().length > 0)
      .slice(0, format === 'carrusel' ? AI_MAX_SLIDES : 1),
    caption: str(r.caption, AI_MAX_CAPTION),
    concept: str(r.concept, 600),
  };
}

/** Reemplaza el HTML de una lámina (edición a mano en el panel). Rechaza lo que
 * no cabe en vez de recortarlo: un HTML cortado a la mitad rompería la lámina. */
export function replaceSlideHtml(design: AiDesign, index: number, html: string): AiDesign {
  if (!Number.isInteger(index) || index < 0 || index >= design.slides.length) throw new Error('Esa lámina no existe.');
  if (!html.trim()) throw new Error('La lámina quedó vacía.');
  if (html.length > AI_MAX_SLIDE_HTML) throw new Error('La lámina quedó demasiado pesada para guardarla.');
  return { ...design, slides: design.slides.map((s, i) => (i === index ? { html } : s)) };
}

/* --- Operaciones de edición (lo que devuelve la IA al ajustar) ------------- */

export const AI_OPS = ['set_css', 'set_slide', 'insert_slide', 'delete_slide', 'move_slide', 'set_caption'] as const;
export type AiOpType = (typeof AI_OPS)[number];

/** Forma plana (todos los campos siempre presentes) porque así lo exige la
 * salida estructurada estricta; los que no aplican vienen vacíos o en -1. */
export interface AiOp {
  op: AiOpType;
  /** Lámina afectada (0 = la primera). */
  index: number;
  /** Destino de move_slide. */
  to: number;
  html: string;
  css: string;
  caption: string;
}

/** Aplica las operaciones en orden sobre una copia. Las que no tienen sentido
 * (índice fuera de rango, HTML vacío) se saltan y se cuentan en `skipped`, en
 * vez de romper todo el diseño por una sola instrucción mala de la IA. */
export function applyAiOps(design: AiDesign, ops: AiOp[]): { design: AiDesign; skipped: number } {
  const next: AiDesign = { ...design, slides: design.slides.map((s) => ({ ...s })) };
  const max = next.format === 'carrusel' ? AI_MAX_SLIDES : 1;
  let skipped = 0;
  for (const op of ops) {
    const n = next.slides.length;
    const valid = Number.isInteger(op.index) && op.index >= 0;
    switch (op.op) {
      case 'set_css':
        if (op.css.trim()) next.css = op.css.slice(0, AI_MAX_CSS);
        else skipped++;
        break;
      case 'set_caption':
        next.caption = op.caption.slice(0, AI_MAX_CAPTION);
        break;
      case 'set_slide':
        if (valid && op.index < n && op.html.trim()) next.slides[op.index] = { html: op.html.slice(0, AI_MAX_SLIDE_HTML) };
        else skipped++;
        break;
      case 'insert_slide':
        if (valid && op.index <= n && n < max && op.html.trim()) next.slides.splice(op.index, 0, { html: op.html.slice(0, AI_MAX_SLIDE_HTML) });
        else skipped++;
        break;
      case 'delete_slide':
        if (valid && op.index < n && n > 1) next.slides.splice(op.index, 1);
        else skipped++;
        break;
      case 'move_slide':
        if (valid && op.index < n && Number.isInteger(op.to) && op.to >= 0 && op.to < n) {
          const [moved] = next.slides.splice(op.index, 1);
          next.slides.splice(op.to, 0, moved);
        } else skipped++;
        break;
      default:
        skipped++;
    }
  }
  return { design: next, skipped };
}

/* --- El documento de cada lámina ------------------------------------------ */

/** Lo que va siempre debajo del CSS de la IA: el tamaño fijo de la lámina
 * manda (un carrusel 3:4 no puede salir 4:5 porque la IA se equivocó). */
export function frameBaseCss(format: StudioFormat): string {
  const { width, height } = STUDIO_SIZES[format];
  return [
    '*{box-sizing:border-box}',
    'html,body{margin:0;padding:0;background:transparent}',
    `.board{width:${width}px !important;height:${height}px !important;position:relative;overflow:hidden}`,
  ].join('\n');
}

/** Documento completo de una lámina para el `srcdoc` del iframe (sin
 * scripts: el iframe va con `sandbox`). */
export function slideDocument(design: Pick<AiDesign, 'css' | 'format'>, slide: AiSlide): string {
  const html = /class\s*=\s*["'][^"']*\bboard\b/.test(slide.html) ? slide.html : `<div class="board">${slide.html}</div>`;
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<link rel="stylesheet" href="/studio/fonts.css">',
    `<style>${design.css.replace(/<\/style/gi, '')}</style>`,
    `<style>${frameBaseCss(design.format)}</style>`,
    `</head><body>${html}</body></html>`,
  ].join('');
}
