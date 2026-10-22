/* Videos del Estudio de contenido (HyperFrames): reels 9:16 y posts animados
 * 3:4 armados con las plantillas de marca, sin IA. Un video es una lista de
 * escenas con texto y duración; de acá sale la composición HTML que
 * HyperFrames reproduce (vista previa en el admin) y graba a MP4.
 *
 * Plantillas:
 * - puntos: gancho + 2 a 6 puntos numerados + cierre (como «¿Tu primera vez?»).
 * - anuncio: el evento (foto, nombre), su día y hora, y el cierre con entradas.
 * - guion: las líneas de un guion de Reel (shared/reelScript.ts), cada una con
 *   su tiempo, como texto en pantalla.
 * - laminas: un diseño del Estudio (carrusel, post o historia) animado lámina
 *   por lámina. Esa composición se arma en el navegador (necesita dibujar las
 *   láminas): ver `slidesVideoHtml`.
 *
 * Reglas de HyperFrames que se cumplen acá: cada escena es un `.clip` con
 * `data-start`/`data-duration`, una sola línea de tiempo GSAP en pausa
 * registrada en `window.__timelines`, nada al azar ni con reloj, y lo que se
 * anima es siempre un hijo del clip. */

import { BUBBLE_PALETTES, layoutBubbleHeadline } from './studioBubble';
import { fitFontSize, STUDIO_THEMES, type StudioDesign, type StudioTheme } from './contentStudio';
import { beatSheet, type ReelBeatInput } from './reelScript';
import { formatChileDate, formatChileTime } from './chileDate';

export const VIDEO_TEMPLATES = ['puntos', 'anuncio', 'guion', 'laminas'] as const;
export type VideoTemplate = (typeof VIDEO_TEMPLATES)[number];

/** Reel / historia 9:16, o post de feed 3:4 animado. */
export const VIDEO_FORMATS = ['reel', 'feed'] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const VIDEO_SIZES: Record<VideoFormat, { width: number; height: number }> = {
  reel: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1440 },
};

export const VIDEO_TEMPLATE_LABEL: Record<VideoTemplate, string> = {
  puntos: 'Gancho + puntos',
  anuncio: 'Anuncio de evento',
  guion: 'Desde un guion de Reel',
  laminas: 'Láminas animadas',
};
export const VIDEO_FORMAT_LABEL: Record<VideoFormat, string> = { reel: 'Reel / historia 9:16', feed: 'Feed 3:4' };

export const VIDEO_MAX_SCENES = 12;
export const VIDEO_MIN_SECS = 1;
export const VIDEO_MAX_SECS = 8;
/** Instagram deja reels más largos, pero sin voz ni música propia un texto
 * animado no sostiene más de un minuto. */
export const VIDEO_MAX_TOTAL_SECS = 60;
const CLOSING_SECS = 3;

/** Letras que se pueden elegir. «globo» es el titular de tres capas de Bubble. */
export const VIDEO_FONTS = {
  // `cw`: ancho medio de una letra (en «em»), para que el texto quepa sin salirse.
  globo: { label: 'Globo (Bubble)', css: "'Fredoka Bubble', sans-serif", weight: 700, upper: true, cw: 0.95 },
  gliker: { label: 'Gliker', css: "'Gliker Semi Bold Expanded', sans-serif", weight: 600, upper: true, cw: 0.95 },
  unbounded: { label: 'Unbounded', css: "'Unbounded', sans-serif", weight: 800, upper: true, cw: 1.05 },
  syne: { label: 'Syne', css: "'Syne', sans-serif", weight: 800, upper: false, cw: 0.9 },
  grotesk: { label: 'Space Grotesk', css: "'Space Grotesk', sans-serif", weight: 700, upper: false, cw: 0.7 },
  inter: { label: 'Inter', css: "'Inter', sans-serif", weight: 800, upper: false, cw: 0.72 },
  josefin: { label: 'Josefin Sans', css: "'Josefin Sans Variable', sans-serif", weight: 700, upper: true, cw: 0.8 },
  allura: { label: 'Allura (manuscrita)', css: "'Allura', cursive", weight: 400, upper: false, cw: 0.55 },
} as const;
export type VideoFont = keyof typeof VIDEO_FONTS;
const FONT_KEYS = Object.keys(VIDEO_FONTS) as VideoFont[];

export const VIDEO_ALIGNS = ['left', 'center', 'right'] as const;
export type VideoAlign = (typeof VIDEO_ALIGNS)[number];
export const VIDEO_VPOS = ['top', 'center', 'bottom'] as const;
export type VideoVpos = (typeof VIDEO_VPOS)[number];
export const VIDEO_TEXT_SCALE = { min: 0.6, max: 1.6 } as const;

/** Ajustes de diseño. En el video son los de todas las escenas; en una
 * escena, lo que esa escena cambia. Lo que no viene, lo pone la plantilla. */
export interface VideoStyle {
  font?: VideoFont;
  /** Color del texto grande (#rrggbb). */
  titleColor?: string;
  /** Color de acento: etiqueta, número, sombra del texto y botón (#rrggbb). */
  accentColor?: string;
  /** Tamaño del texto grande: 1 = el de la plantilla. */
  textScale?: number;
  align?: VideoAlign;
  vpos?: VideoVpos;
  /** Sobre la foto o video de fondo: oscurecido (0 a 80 %) y desenfoque (0 a 20 px). */
  overlay?: number;
  blur?: number;
}

export interface VideoScene {
  title: string;
  body: string;
  secs: number;
  /** Foto o video (.mp4/.webm) de fondo de esta escena. */
  mediaUrl?: string;
  /** Color de fondo («#rrggbb») o degradado («#rrggbb,#rrggbb»). Vacío = el de la plantilla. */
  bg?: string;
  style?: VideoStyle;
}

export interface StudioVideo {
  title: string;
  template: VideoTemplate;
  format: VideoFormat;
  theme: StudioTheme;
  eventId: number | null;
  caption: string;
  /** Foto o video de la primera escena en los videos guardados antes de que
   * cada escena tuviera su fondo. Al limpiar el video pasa a la escena 1. */
  mediaUrl: string;
  scenes: VideoScene[];
  /** Cierre: botón grande y la frase de arriba. Vacíos = sin cierre. */
  cta: string;
  ctaLine: string;
  /** Solo «laminas»: el diseño que se anima y cuánto dura cada lámina. */
  design: StudioDesign | null;
  secsPerSlide: number;
  /** Diseño de todas las escenas (cada escena puede cambiarlo). */
  style?: VideoStyle;
}

const LIMITS = { title: 200, sceneTitle: 120, sceneBody: 200, cta: 60, ctaLine: 120, caption: 3000, mediaUrl: 1000 } as const;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clampSecs(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(VIDEO_MAX_SECS, Math.max(VIDEO_MIN_SECS, n)) * 10) / 10;
}

function cleanUrl(value: unknown): string {
  const url = str(value, LIMITS.mediaUrl).trim();
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : '';
}

function cleanColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toUpperCase() : undefined;
}

/** Un color o dos (degradado) separados por coma. */
function cleanBg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const colors = value.split(',').map(cleanColor);
  return colors.length <= 2 && colors.every(Boolean) ? colors.join(',') : undefined;
}

function cleanNumber(value: unknown, min: number, max: number, step: number): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(max, Math.max(min, n)) / step) * step;
}

/** Deja solo los ajustes válidos; sin ninguno, `undefined` (el video queda como antes). */
export function normalizeVideoStyle(raw: unknown): VideoStyle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const style: VideoStyle = {
    font: typeof r.font === 'string' && (FONT_KEYS as string[]).includes(r.font) ? (r.font as VideoFont) : undefined,
    titleColor: cleanColor(r.titleColor),
    accentColor: cleanColor(r.accentColor),
    textScale: cleanNumber(r.textScale, VIDEO_TEXT_SCALE.min, VIDEO_TEXT_SCALE.max, 0.05),
    align: typeof r.align === 'string' && (VIDEO_ALIGNS as readonly string[]).includes(r.align) ? (r.align as VideoAlign) : undefined,
    vpos: typeof r.vpos === 'string' && (VIDEO_VPOS as readonly string[]).includes(r.vpos) ? (r.vpos as VideoVpos) : undefined,
    overlay: cleanNumber(r.overlay, 0, 80, 1),
    blur: cleanNumber(r.blur, 0, 20, 1),
  };
  if (style.textScale !== undefined) style.textScale = Math.round(style.textScale * 100) / 100;
  for (const k of Object.keys(style) as (keyof VideoStyle)[]) if (style[k] === undefined) delete style[k];
  return Object.keys(style).length ? style : undefined;
}

function normalizeScene(s: Record<string, unknown>): VideoScene {
  const scene: VideoScene = { title: str(s.title, LIMITS.sceneTitle), body: str(s.body, LIMITS.sceneBody), secs: clampSecs(s.secs, 2.5) };
  const mediaUrl = cleanUrl(s.mediaUrl);
  if (mediaUrl) scene.mediaUrl = mediaUrl;
  const bg = cleanBg(s.bg);
  if (bg) scene.bg = bg;
  const style = normalizeVideoStyle(s.style);
  if (style) scene.style = style;
  return scene;
}

/** Limpia un video que viene del panel o de la base. `designNormalizer` deja
 * pasar el diseño de «laminas» (se inyecta para no depender acá de cómo se
 * limpia un diseño; el servidor y el panel pasan `normalizeStudioDesign`). */
export function normalizeStudioVideo(raw: unknown, designNormalizer: (d: unknown) => StudioDesign | null): StudioVideo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const template = oneOf(r.template, VIDEO_TEMPLATES, 'puntos');
  const scenes = (Array.isArray(r.scenes) ? r.scenes : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .slice(0, VIDEO_MAX_SCENES)
    .map(normalizeScene);
  // Videos de antes: la foto del video era la de la escena 1; ahora es de esa escena.
  let mediaUrl = cleanUrl(r.mediaUrl);
  if (mediaUrl && scenes[0]) {
    if (!scenes[0].mediaUrl) scenes[0].mediaUrl = mediaUrl;
    mediaUrl = '';
  }
  const design = template === 'laminas' && r.design ? designNormalizer(r.design) : null;
  if (template === 'laminas' ? !design : scenes.length === 0) return null;
  const eventId = Number(r.eventId);
  return {
    title: str(r.title, LIMITS.title).trim() || 'Video sin título',
    template,
    format: oneOf(r.format, VIDEO_FORMATS, 'reel'),
    theme: oneOf(r.theme, STUDIO_THEMES, 'bubble'),
    eventId: r.eventId != null && Number.isInteger(eventId) && eventId > 0 ? eventId : null,
    caption: str(r.caption, LIMITS.caption),
    mediaUrl,
    scenes,
    cta: str(r.cta, LIMITS.cta),
    ctaLine: str(r.ctaLine, LIMITS.ctaLine),
    design,
    secsPerSlide: clampSecs(r.secsPerSlide, 2.5),
    ...(normalizeVideoStyle(r.style) ? { style: normalizeVideoStyle(r.style) } : {}),
  };
}

/** El fondo (foto o video) de una escena: el suyo o, en la escena 1 de un video sin limpiar, el del video. */
export function sceneMedia(video: Pick<StudioVideo, 'mediaUrl'>, scene: VideoScene, index: number): string {
  return scene.mediaUrl || (index === 0 ? video.mediaUrl : '');
}

function base(partial: Partial<StudioVideo> & Pick<StudioVideo, 'template' | 'scenes'>): StudioVideo {
  return {
    title: 'Video sin título', format: 'reel', theme: 'bubble', eventId: null, caption: '', mediaUrl: '',
    cta: 'mansionplayroom.cl', ctaLine: 'Comunidad · Respeto · Libertad', design: null, secsPerSlide: 2.5, ...partial,
  };
}

/** El ejemplo de «¿Tu primera vez?»: para partir editando en vez de en blanco. */
export function starterPointsVideo(): StudioVideo {
  return base({
    title: '¿Tu primera vez?',
    template: 'puntos',
    mediaUrl: '/candyland/hero-video-mobile.mp4',
    scenes: [
      { title: '¿Tu\nprimera\nvez?', body: '3 cosas antes de venir', secs: 3.2 },
      { title: 'Consenti-\nmiento', body: 'Siempre se pregunta. Un no es no.', secs: 2.2 },
      { title: 'Solo +18', body: 'Un espacio estrictamente para adultos.', secs: 2.1 },
      { title: 'Tu ritmo', body: 'Nadie te apura. Tú decides hasta dónde.', secs: 2.2 },
    ],
  });
}

/** El código de un embajador tal como se escribe al comprar: letras, números,
 * guion y guion bajo (2 a 32), en mayúsculas. Cualquier otra cosa = sin código. */
export function cleanAmbassadorCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9_-]{2,32}$/.test(code) ? code : '';
}

/** Lo que hace falta de un evento para anunciarlo. */
export interface VideoEvent {
  id: number;
  title: string;
  eventDate: Date | string;
  doorsOpen?: Date | string | null;
  imageUrl?: string | null;
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Anuncio del evento con sus datos reales (hora de Chile). La dirección no
 * va nunca: se entrega solo a quien compró. */
export function eventVideo(event: VideoEvent, opts: { code?: string; format?: VideoFormat } = {}): StudioVideo {
  const date = event.eventDate;
  const code = cleanAmbassadorCode(opts.code);
  return base({
    format: opts.format ?? 'reel',
    title: `Anuncio ${event.title}`,
    template: 'anuncio',
    eventId: event.id,
    mediaUrl: event.imageUrl?.trim() ?? '',
    scenes: [
      { title: event.title, body: 'Evento +18', secs: 3 },
      { title: capitalize(formatChileDate(date)), body: `${formatChileTime(event.doorsOpen ?? date)} hrs`, secs: 2.6 },
      { title: 'Cupos limitados', body: 'Compra tu entrada antes', secs: 2.2 },
    ],
    // Con código de embajador, el botón es el código (es lo que se escribe al comprar).
    cta: code ? `Mi código: ${code}` : 'Entradas en mansionplayroom.cl',
    ctaLine: code ? 'Entradas en mansionplayroom.cl' : '¿Vienes?',
    caption: [
      `${event.title} · ${capitalize(formatChileDate(date))}`,
      `🎟️ Entradas en mansionplayroom.cl (link en la bio)${code ? `\nUsa mi código ${code} al comprar tu entrada.` : ''}`,
      '#MansionPlayroom #FiestaLiberal #VinaDelMar',
    ].join('\n\n'),
  });
}

/** La PlayCard en un reel: los mismos pasos de la plantilla del carrusel. */
export function playcardVideo(): StudioVideo {
  return base({
    title: 'PlayCard animada',
    template: 'puntos',
    theme: 'playcard',
    scenes: [
      { title: 'Tarjeta\nPlayCard', body: 'Un solo QR para todo: tu acceso, tu saldo y tus Playcoins.', secs: 3.4 },
      { title: 'Se activa con tu entrada', body: 'Al comprar, tu tarjeta queda lista.', secs: 2.6 },
      { title: 'Saldo y Playcoins', body: 'Cada compra suma Playcoins.', secs: 2.6 },
      { title: 'Pagas sin billetera', body: 'Muestras tu QR y ingresas tu PIN.', secs: 2.6 },
      { title: 'Te sigue de fiesta en fiesta', body: 'Lo que no gastes queda para la próxima.', secs: 2.8 },
    ],
    cta: 'Comprar mi entrada',
    ctaLine: '@mansionplayroom.cl',
    caption: 'Tu PlayCard: un solo QR para tu acceso, tu saldo y tus Playcoins. Se activa sola con tu entrada. 🎟️\n\n#MansionPlayroom #PlayCard',
  });
}

/** Un guion de Reel (gancho elegido + líneas) a escenas con los tiempos de
 * `beatSheet`. En pantalla va el texto de pantalla de cada línea o, si no
 * trae, lo que se dice. */
export function scriptVideo(script: { hook: ReelBeatInput; beats: ReelBeatInput[]; caption?: string }): StudioVideo {
  const sheet = beatSheet([script.hook, ...script.beats]);
  const scenes = sheet.beats.slice(0, VIDEO_MAX_SCENES).map((b, i) => ({
    title: (b.screen.trim() || b.say.trim()).slice(0, LIMITS.sceneTitle),
    body: '',
    // El gancho necesita al menos 2,5 s para leerse; las demás, 1,5 s.
    secs: clampSecs(Math.max(b.secs, i === 0 ? 2.5 : 1.5), 2),
  }));
  return base({ title: script.hook.screen.trim() || script.hook.say.trim() || 'Reel', template: 'guion', scenes, caption: script.caption ?? '' });
}

/** Un diseño del Estudio animado lámina por lámina. */
export function slidesVideo(design: StudioDesign): StudioVideo {
  return base({
    title: `${design.title} (animado)`,
    template: 'laminas',
    format: design.format === 'historia' ? 'reel' : 'feed',
    theme: design.theme,
    eventId: design.eventId,
    caption: design.caption,
    scenes: [],
    design,
    cta: '',
    ctaLine: '',
  });
}

/* --- Tiempos -------------------------------------------------------------- */

export interface TimedScene extends VideoScene {
  start: number;
}

/** Cuándo empieza cada escena y cuánto dura el video (con el cierre). Si se
 * pasa del tope, las últimas escenas se cortan. */
export function videoTimeline(video: Pick<StudioVideo, 'scenes' | 'cta' | 'ctaLine'>): { scenes: TimedScene[]; closing: { start: number; secs: number } | null; total: number } {
  const scenes: TimedScene[] = [];
  let t = 0;
  const closingSecs = video.cta.trim() || video.ctaLine.trim() ? CLOSING_SECS : 0;
  for (const s of video.scenes) {
    if (t + s.secs + closingSecs > VIDEO_MAX_TOTAL_SECS) break;
    scenes.push({ ...s, start: round(t) });
    t += s.secs;
  }
  const closing = closingSecs ? { start: round(t), secs: closingSecs } : null;
  return { scenes, closing, total: round(t + closingSecs) };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/* --- La composición HTML -------------------------------------------------- */

interface VideoLook {
  bgs: string[];
  accent: string;
  title: string;
  text: string;
  bubble: boolean;
  font: string;
  weight: number;
  upper: boolean;
  logo: string;
}

function lookFor(theme: StudioTheme): VideoLook {
  if (theme === 'bubble') {
    return { bgs: BUBBLE_PALETTES.map((p) => p.bg), accent: '#F0287A', title: '#F0287A', text: '#FFFFFF', bubble: true, font: "'Fredoka Bubble', sans-serif", weight: 700, upper: true, logo: '/studio/logo-wordmark-white.png' };
  }
  if (theme === 'pastel') {
    return { bgs: ['#FDDBAE', '#E3CAFD', '#EEFFA9'], accent: '#A020F0', title: '#A020F0', text: '#111111', bubble: false, font: "'Gliker Semi Bold Expanded', sans-serif", weight: 600, upper: true, logo: '/candyland/logo-wordmark-email.png' };
  }
  if (theme === 'playcard') {
    return { bgs: ['#FFD6F5', '#BFEBFB'], accent: '#E866C2', title: '#E866C2', text: '#3B2236', bubble: false, font: "'Syne', sans-serif", weight: 800, upper: false, logo: '/candyland/logo-wordmark-email.png' };
  }
  return { bgs: ['#00A3FF', '#0A6CFF'], accent: '#FF0A9C', title: '#FF0A9C', text: '#FFFFFF', bubble: false, font: "'Gliker Semi Bold Expanded', sans-serif", weight: 600, upper: true, logo: '/studio/logo-wordmark-white.png' };
}

function unescapeAttr(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';

/** Cómo se llega a cada archivo (foto, logo, fuente) desde la composición.
 * Recibe una ruta del sitio ("/studio/fonts/x.woff2") o una URL completa. */
export type AssetUrl = (path: string) => string;

/** Vista previa en el admin: todo se carga desde el sitio. */
export function siteAssets(origin: string): AssetUrl {
  const root = origin.replace(/\/+$/, '');
  return (path) => (path.startsWith('/') ? `${root}${path}` : path);
}

/** Proyecto para grabar: HyperFrames solo lee archivos locales, así que cada
 * archivo se copia a `assets/` (`files`: ruta local → de dónde bajarlo). */
export function projectAssets(): { assetUrl: AssetUrl; files: Map<string, string> } {
  const files = new Map<string, string>();
  const bySource = new Map<string, string>();
  const assetUrl: AssetUrl = (path) => {
    const known = bySource.get(path);
    if (known) return known;
    const name = (path.split(/[?#]/)[0].split('/').pop() || 'archivo').replace(/[^A-Za-z0-9._-]/g, '_');
    let local = `assets/${name}`;
    for (let n = 2; files.has(local); n++) local = `assets/${n}-${name}`;
    files.set(local, path);
    bySource.set(path, local);
    return local;
  };
  return { assetUrl, files };
}

/** Las fuentes de las plantillas (las mismas de /studio/fonts.css y del sitio). */
function fontFaces(asset: AssetUrl): string {
  const face = (family: string, path: string, format: string, extra: string) => `@font-face { font-family: '${family}'; src: url('${asset(path)}') format('${format}'); ${extra} }`;
  return [
    face('Fredoka Bubble', '/studio/fonts/fredoka.woff2', 'woff2', 'font-weight: 300 700;'),
    face('Gliker Semi Bold Expanded', '/studio/fonts/gliker-semibold-expanded.ttf', 'truetype', 'font-weight: 600;'),
    face('Allura', '/studio/fonts/allura.woff2', 'woff2', 'font-weight: 400;'),
    face('Inter', '/studio/fonts/inter.woff2', 'woff2', 'font-weight: 100 900;'),
    face('Josefin Sans Variable', '/studio/fonts/josefin-sans.woff2', 'woff2', 'font-weight: 100 700;'),
    face('Josefin Sans Variable', '/studio/fonts/josefin-sans-italic.woff2', 'woff2', 'font-weight: 100 700; font-style: italic;'),
    face('Unbounded', '/studio/fonts/unbounded.woff2', 'woff2', 'font-weight: 200 900;'),
    face('Syne', '/fonts/syne-variable.woff2', 'woff2', 'font-weight: 400 800;'),
    face('Space Grotesk', '/fonts/space-grotesk-variable.woff2', 'woff2', 'font-weight: 300 700;'),
  ].join('\n');
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

function documentHtml(opts: { asset: AssetUrl; width: number; height: number; total: number; css: string; body: string; script: string; title: string }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<script src="${GSAP_URL}"></script>
<style>
${fontFaces(opts.asset)}
html, body { margin: 0; background: #000; }
#root { position: relative; width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; }
${opts.css}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${opts.total}" data-width="${opts.width}" data-height="${opts.height}">
${opts.body}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${opts.script}
window.__timelines["main"] = tl;
</script>
</body>
</html>
`;
}

/** Mezcla dos colores #rrggbb (t = 0 el primero, 1 el segundo). */
function mixHex(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Fondo de una escena: un color o un degradado de dos. */
function bgCss(bg: string): string {
  const [a, b] = bg.split(',');
  return b ? `linear-gradient(160deg, ${a} 0%, ${b} 100%)` : a;
}

const FLEX = { left: 'flex-start', top: 'flex-start', center: 'center', right: 'flex-end', bottom: 'flex-end' } as const;

/** Lo que una escena cambia del diseño de la plantilla (todo vacío = igual que siempre). */
interface SceneLook {
  bubble: boolean;
  /** Letra elegida para el titular normal (no globo). */
  font: (typeof VIDEO_FONTS)[VideoFont] | null;
  titleColor?: string;
  accentColor?: string;
  scale: number;
  align?: VideoAlign;
}

/** Titular en letras globo (tres capas, como en el Estudio) o en la letra de la plantilla. */
function titleHtml(id: string, text: string, look: VideoLook, box: { width: number; height: number }, onPhoto: boolean, max: number, sl: SceneLook): string {
  if (!text.trim()) return '';
  const s = sl.scale;
  if (sl.bubble) {
    const { lines, size } = layoutBubbleHeadline(text, box, { max: max * s, min: 56 * s, maxLines: 4 });
    const rows = lines.map((line, i) => {
      const l = escapeHtml(line);
      return `<div class="bl ${i % 2 === 0 ? 'pk' : 'wh'}" style="font-size:${size}px"><span class="e">${l}</span><span class="r">${l}</span><span class="f">${l}</span></div>`;
    });
    // Con color propio, las filas rosadas toman ese color (con su borde claro y su sombra oscura).
    const css = [
      sl.align ? `align-items:${FLEX[sl.align]}` : '',
      sl.titleColor ? `--bf:${sl.titleColor};--br:${mixHex(sl.titleColor, '#000000', 0.18)};--be:${mixHex(sl.titleColor, '#FFFFFF', 0.7)}` : '',
    ].filter(Boolean).join(';');
    return `<div id="${id}" class="ttl bub${sl.titleColor ? ' cc' : ''}"${css ? ` style="${css}"` : ''}>${rows.join('')}</div>`;
  }
  const charWidth = sl.font ? sl.font.cw : look.upper ? 0.95 : 0.7;
  const size = fitFontSize(text, box, { max: max * s, min: 48 * s, charWidth, lineHeight: 1.02 });
  const extra = [
    sl.font ? `font-family:${sl.font.css.replace(/"/g, "'")};font-weight:${sl.font.weight};text-transform:${sl.font.upper ? 'uppercase' : 'none'}` : '',
    sl.titleColor ? `color:${sl.titleColor}` : '',
    onPhoto && sl.accentColor ? `text-shadow:0 6px 0 ${sl.accentColor}, 0 12px 30px rgba(0,0,0,0.45)` : '',
    sl.align ? `text-align:${sl.align}` : '',
  ].filter(Boolean).map((x) => `;${x}`).join('');
  return `<div id="${id}" class="ttl dt${onPhoto ? ' onp' : ''}" style="font-size:${size}px${extra}">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
}

function chipHtml(id: string, text: string, onPhoto: boolean, look: VideoLook, accent?: string): string {
  if (!text.trim()) return '';
  const size = text.length > 34 ? Math.max(34, Math.round(52 * (34 / text.length))) : 52;
  const line = look.bubble || onPhoto;
  const cls = line ? 'chip line' : 'chip fill';
  return `<div id="${id}" class="${cls}" style="font-size:${size}px${accent && !line ? `;background:${accent}` : ''}">${escapeHtml(text)}</div>`;
}

/** La composición de un video de plantilla (puntos, anuncio o guion). */
export function videoCompositionHtml(video: StudioVideo, opts: { asset: AssetUrl }): string {
  const look = lookFor(video.theme);
  const { width, height } = VIDEO_SIZES[video.format];
  const reel = video.format === 'reel';
  // Reels: arriba va la cuenta y abajo el texto y los botones de Instagram.
  const safeTop = reel ? 250 : 110;
  const safeBottom = reel ? 560 : 120;
  const side = 90;
  const boxWidth = width - side * 2;
  const area = height - safeTop - safeBottom;
  const { scenes, closing, total } = videoTimeline(video);
  const asset = opts.asset;

  const body: string[] = [];
  const js: string[] = [];

  scenes.forEach((s, i) => {
    const id = `s${i}`;
    const end = round(s.start + s.secs);
    const first = i === 0;
    // Cada escena va sobre su foto/video si tiene; si no, en su color o en los fondos de la plantilla.
    const media = sceneMedia(video, s, i);
    const onPhoto = !!media;
    const mediaIsVideo = onPhoto && isVideoUrl(media);
    const bg = s.bg ? bgCss(s.bg) : look.bgs[i % look.bgs.length];
    const st: VideoStyle = { ...video.style, ...s.style };
    const sl: SceneLook = {
      bubble: st.font ? st.font === 'globo' : look.bubble,
      font: st.font && st.font !== 'globo' ? VIDEO_FONTS[st.font] : null,
      titleColor: st.titleColor,
      accentColor: st.accentColor,
      scale: st.textScale ?? 1,
      align: st.align,
    };
    // Desenfoque: la foto crece un poco para que el borde borroso no se vea.
    const blur = onPhoto && st.blur ? st.blur : 0;
    const mediaStyle = blur ? ` style="filter:blur(${blur}px);left:${-2 * blur}px;top:${-2 * blur}px;width:${width + 4 * blur}px;height:${height + 4 * blur}px"` : '';
    const numbered = video.template === 'puntos' && !first;
    const parts: string[] = [];
    if (onPhoto) {
      // Un video de fondo va suelto en la raíz, debajo de la escena: HyperFrames
      // no sincroniza bien un <video> con tiempos dentro de otro elemento con tiempos.
      if (mediaIsVideo) body.push(`<video id="${id}-m" class="clip media" src="${escapeHtml(asset(media))}" muted playsinline data-start="${s.start}" data-duration="${s.secs}" data-track-index="0"${mediaStyle}></video>`);
      else parts.push(`<img id="${id}-m" class="media" src="${escapeHtml(asset(media))}" alt=""${mediaStyle}>`);
      parts.push('<div class="shade"></div>');
      if (st.overlay) parts.push(`<div class="dim" style="background:rgba(0,0,0,${st.overlay / 100})"></div>`);
    } else {
      parts.push('<div class="dots"></div>');
    }
    // Un texto más grande necesita más alto (nunca más que la zona segura).
    const textBox = { width: boxWidth, height: Math.min(area, area * (onPhoto ? 0.42 : numbered ? 0.36 : 0.5) * Math.max(1, sl.scale)) };
    const column = [
      numbered ? `<div id="${id}-n" class="num"${sl.accentColor ? ` style="box-shadow:14px 14px 0 ${sl.accentColor}"` : ''}>${i}</div>` : '',
      titleHtml(`${id}-t`, s.title, look, textBox, onPhoto, onPhoto ? 170 : 200, sl),
      chipHtml(`${id}-b`, s.body, onPhoto, look, sl.accentColor),
    ].join('');
    const colCss = [st.vpos ? `justify-content:${FLEX[st.vpos]}` : '', st.align ? `align-items:${FLEX[st.align]}` : ''].filter(Boolean).join(';');
    parts.push(`<div class="col ${onPhoto ? 'bottom' : 'center'}"${colCss ? ` style="${colCss}"` : ''}>${column}</div>`);
    body.push(`<div id="${id}" class="clip scene" data-start="${s.start}" data-duration="${s.secs}" data-track-index="1" style="background:${mediaIsVideo ? 'transparent' : bg}">${parts.join('')}</div>`);

    if (onPhoto) js.push(`tl.fromTo("#${id}-m", { scale: 1.12 }, { scale: 1, duration: ${s.secs}, ease: "none" }, ${s.start});`);
    else js.push(`tl.fromTo("#${id} .dots", { backgroundPosition: "0px 0px" }, { backgroundPosition: "68px 136px", duration: ${s.secs}, ease: "none" }, ${s.start});`);
    if (numbered) js.push(`tl.fromTo("#${id}-n", { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 0.4, ease: "back.out(2)" }, ${round(s.start + 0.02)});`);
    if (s.title.trim()) {
      // El primer cuadro es la miniatura y el gancho: el título ya se ve en el segundo 0.
      js.push(first
        ? `tl.fromTo("#${id}-t", { scale: 0.86 }, { scale: 1, duration: 0.5, ease: "back.out(2.4)" }, 0);`
        : `tl.fromTo("#${id}-t", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.42, ease: "back.out(2.4)" }, ${round(s.start + 0.12)});`);
    }
    if (s.body.trim()) js.push(`tl.fromTo("#${id}-b", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, ${round(Math.min(end - 0.4, s.start + 0.42))});`);
  });

  if (closing) {
    const c = closing.start;
    const lineSize = fitFontSize(video.ctaLine || ' ', { width: boxWidth, height: 220 }, { max: 84, min: 44, charWidth: 0.62, lineHeight: 1.05 });
    const ctaSize = video.cta.length > 22 ? Math.max(36, Math.round(58 * (22 / video.cta.length))) : 58;
    body.push(`<div id="cl" class="clip scene closing" data-start="${c}" data-duration="${closing.secs}" data-track-index="2" style="background:${look.bgs[look.bgs.length - 1]}">
<div class="burst"></div>
<div class="col center">
<img id="cl-logo" class="logo" src="${escapeHtml(asset(look.logo))}" alt="Mansion Playroom">
${video.ctaLine.trim() ? `<div id="cl-line" class="cline" style="font-size:${lineSize}px">${escapeHtml(video.ctaLine)}</div>` : ''}
${video.cta.trim() ? `<div id="cl-pulse"><div id="cl-cta" class="cta" style="font-size:${ctaSize}px${video.style?.accentColor ? `;background:${video.style.accentColor}` : ''}">${escapeHtml(video.cta)}</div></div>` : ''}
</div>
</div>`);
    js.push(`tl.fromTo("#cl .burst", { rotate: 0 }, { rotate: 40, duration: ${closing.secs}, ease: "none" }, ${c});`);
    js.push(`tl.fromTo("#cl-logo", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.8)" }, ${round(c + 0.05)});`);
    if (video.ctaLine.trim()) js.push(`tl.fromTo("#cl-line", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, ${round(c + 0.45)});`);
    if (video.cta.trim()) {
      js.push(`tl.fromTo("#cl-cta", { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.5)" }, ${round(c + 0.8)});`);
      js.push(`tl.fromTo("#cl-pulse", { scale: 1 }, { scale: 1.06, duration: 0.35, ease: "sine.inOut", yoyo: true, repeat: 3 }, ${round(c + 1.3)});`);
    }
  }

  const css = `
.scene { position: absolute; inset: 0; overflow: hidden; z-index: 1; }
video.media { z-index: 0; }
.media { position: absolute; left: 0; top: 0; width: ${width}px; height: ${height}px; object-fit: cover; }
.shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,0,30,0.1) 0%, rgba(20,0,30,0.5) 50%, rgba(20,0,30,0.9) 100%); }
.dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,0.2) 3px, transparent 3.5px); background-size: 34px 34px; }
.col { position: absolute; left: ${side}px; right: ${side}px; top: ${safeTop}px; bottom: ${safeBottom}px; display: flex; flex-direction: column; align-items: center; gap: 56px; }
.col.center { justify-content: center; }
.col.bottom { justify-content: flex-end; }
.num { width: 220px; height: 220px; border-radius: 50%; background: #fff; box-shadow: 14px 14px 0 ${look.accent}; display: flex; align-items: center; justify-content: center; font-family: ${look.font}; font-weight: ${look.weight}; font-size: 140px; color: ${look.title}; flex-shrink: 0; }
.ttl.bub { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.bl { position: relative; font-family: 'Fredoka Bubble', sans-serif; font-weight: 700; line-height: 0.98; text-transform: uppercase; white-space: nowrap; text-align: center; }
.bl .e { -webkit-text-stroke: 0.125em; paint-order: stroke fill; text-shadow: 0 0.055em 0.05em rgba(60,0,80,0.36); }
.bl .r { position: absolute; inset: 0; -webkit-text-stroke: 0.062em; paint-order: stroke fill; }
.bl .f { position: absolute; inset: 0; }
.bl.pk .e { color: #FFC4DD; -webkit-text-stroke-color: #FFC4DD; }
.bl.pk .r { color: #D40F63; -webkit-text-stroke-color: #D40F63; }
.bl.pk .f { color: #F0287A; text-shadow: -0.014em -0.034em 0 rgba(255,255,255,0.32); }
.bl.wh .e { color: #FFA8D0; -webkit-text-stroke-color: #FFA8D0; }
.bl.wh .r { color: #FFD9EA; -webkit-text-stroke-color: #FFD9EA; }
.bl.wh .f { color: #FFFFFF; text-shadow: 0 0.03em 0 #F7D2E4; }
.ttl.dt { font-family: ${look.font}; font-weight: ${look.weight}; line-height: 1.02; letter-spacing: -0.03em; text-transform: ${look.upper ? 'uppercase' : 'none'}; color: ${look.title}; text-align: center; max-width: ${boxWidth}px; }
.ttl.dt.onp { color: #FFFFFF; text-shadow: 0 6px 0 ${look.accent}, 0 12px 30px rgba(0,0,0,0.45); }
.chip { font-family: 'Inter', sans-serif; font-weight: 700; line-height: 1.25; text-align: center; max-width: ${boxWidth}px; border-radius: 40px; padding: 22px 40px; box-sizing: border-box; }
.chip.line { color: #FFFFFF; border: 5px solid rgba(255,255,255,0.92); }
.chip.fill { color: #FFFFFF; background: ${look.accent}; }
.burst { position: absolute; left: 50%; top: 45%; width: 2600px; height: 2600px; margin: -1300px 0 0 -1300px; border-radius: 50%; background: repeating-conic-gradient(rgba(255,255,255,0.16) 0deg 10deg, transparent 10deg 20deg); }
.logo { width: 720px; height: auto; }
.cline { font-family: 'Fredoka Bubble', sans-serif; font-weight: 700; text-transform: uppercase; color: ${look.text}; text-align: center; line-height: 1.05; }
.cta { background: ${look.accent}; color: #FFFFFF; font-family: 'Inter', sans-serif; font-weight: 800; padding: 30px 60px; border-radius: 999px; border: 5px solid #FFFFFF; white-space: nowrap; box-shadow: 0 14px 30px rgba(0,0,0,0.25); }` + (body.some((b) => b.includes('class="dim"') || b.includes('ttl bub cc')) ? `
.dim { position: absolute; inset: 0; }
.cc .bl.pk .e { color: var(--be); -webkit-text-stroke-color: var(--be); }
.cc .bl.pk .r { color: var(--br); -webkit-text-stroke-color: var(--br); }
.cc .bl.pk .f { color: var(--bf); }` : '');

  return documentHtml({ asset, width, height, total, css, body: body.join('\n'), script: js.join('\n'), title: video.title });
}

/** La composición de «laminas»: cada lámina (ya dibujada a HTML por el panel,
 * a tamaño real) es una escena con una entrada que se turna (desliza, zoom,
 * salto) y un acercamiento lento mientras se ve. */
export function slidesVideoHtml(opts: { asset: AssetUrl; title: string; format: VideoFormat; slidesHtml: string[]; secsPerSlide: number }): string {
  const { width, height } = VIDEO_SIZES[opts.format];
  const secs = clampSecs(opts.secsPerSlide, 2.5);
  const slides = opts.slidesHtml.slice(0, Math.floor(VIDEO_MAX_TOTAL_SECS / secs));
  const entrances = [
    '{ x: 140, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }',
    '{ scale: 0.82, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.6)" }',
    '{ y: 160, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }',
  ];
  const body: string[] = [];
  const js: string[] = [];
  // Las láminas traen rutas del sitio ("/candyland/logo.png") y URLs de fotos: pasan por `asset`.
  const localize = (html: string) => html
    .replace(/(src=")([^"]+)(")/g, (_m, a: string, url: string, b: string) => a + escapeHtml(opts.asset(unescapeAttr(url))) + b)
    .replace(/url\((&quot;|'|")?([^)'"&]+)(&quot;|'|")?\)/g, (_m, _q, url: string) => `url('${escapeHtml(opts.asset(url))}')`);
  // Cada lámina sigue visible medio segundo más, debajo de la que entra: el
  // cambio pasa de una a otra sin un cuadro negro entre medio.
  const overlap = 0.5;
  slides.forEach((raw, i) => {
    const html = localize(raw);
    const start = round(i * secs);
    const last = i === slides.length - 1;
    body.push(`<div id="l${i}" class="clip scene" data-start="${start}" data-duration="${last ? secs : round(secs + overlap)}" data-track-index="${(i % 2) + 1}" style="z-index:${i + 1}"><div id="l${i}-in" class="lin"><div id="l${i}-z" class="lz">${html}</div></div></div>`);
    // La primera ya está en el cuadro 0 (es la miniatura); las demás entran.
    if (i > 0) js.push(`tl.fromTo("#l${i}-in", ${entrances[i % entrances.length]}, ${start});`);
    js.push(`tl.fromTo("#l${i}-z", { scale: 1 }, { scale: 1.05, duration: ${last ? secs : round(secs + overlap)}, ease: "none" }, ${start});`);
  });
  const css = `
.scene { position: absolute; inset: 0; overflow: hidden; background: #000; }
.lin, .lz { position: absolute; inset: 0; }`;
  return documentHtml({ asset: opts.asset, width, height, total: round(slides.length * secs), css, body: body.join('\n'), script: js.join('\n'), title: opts.title });
}
