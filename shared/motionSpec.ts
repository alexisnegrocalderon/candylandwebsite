/* Estudio Motion (admin → Contenido → Estudio): la «receta» de un video de
 * motion graphics. La escriben la IA (server/motionAi.ts) o el dueño en el
 * editor, la dibuja Remotion (motion/) igual en la vista previa del panel y
 * en la grabación a MP4 de GitHub Actions (scripts/render-studio-video.mjs).
 *
 * Acá vive solo lo PURO, sin dependencias: la forma, la limpieza de lo que
 * llega (normalizeMotionSpec) y la línea de tiempo (motionTimeline). Así la
 * composición, el servidor y los tests leen exactamente lo mismo. */

export const MOTION_FPS = 30;

export const MOTION_TEMPLATES = ['anuncio', 'countdown', 'montaje', 'sting'] as const;
export type MotionTemplate = (typeof MOTION_TEMPLATES)[number];
export const MOTION_TEMPLATE_LABEL: Record<MotionTemplate, string> = {
  anuncio: 'Anuncio de evento',
  countdown: 'Countdown',
  montaje: 'Montaje de fotos/clips',
  sting: 'Intro / outro de marca',
};

export const MOTION_STYLES = ['liquid', 'glitch', 'editorial'] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];
export const MOTION_STYLE_LABEL: Record<MotionStyle, string> = {
  liquid: 'Liquid',
  glitch: 'Glitch',
  editorial: 'Editorial',
};

export const MOTION_FORMATS = ['reel', 'feed', 'square'] as const;
export type MotionFormat = (typeof MOTION_FORMATS)[number];
export const MOTION_FORMAT_LABEL: Record<MotionFormat, string> = {
  reel: 'Reel / Historia 9:16',
  feed: 'Feed 4:5',
  square: 'Cuadrado 1:1',
};
export const MOTION_SIZES: Record<MotionFormat, { width: number; height: number }> = {
  reel: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
};

/** Color de fondo de la pieza: siempre uno de marca, a todo el sangrado. */
export const MOTION_BASES = ['azul', 'rosa', 'tinta'] as const;
export type MotionBase = (typeof MOTION_BASES)[number];
export const MOTION_BASE_LABEL: Record<MotionBase, string> = {
  azul: 'Celeste de marca',
  rosa: 'Rosa de marca',
  tinta: 'Azul tinta',
};

/** Colores de marca (server/studioAi/brandPack.ts). Ningún otro entra a un video. */
export const BRAND = {
  blue: '#00A3FF',
  pink: '#EF8DFF',
  magenta: '#FF008E',
  ink: '#0010DF',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export interface MotionPalette {
  bg: string;
  /** Relleno del titular (letra «candy bubble»). */
  display: string;
  /** Sombra/volumen del titular. */
  shadow: string;
  /** Texto de bajada. */
  body: string;
  /** EL color protagonista: máximo un elemento por cuadro. */
  hero: string;
  accent: string;
  deep: string;
}

export function motionPalette(base: MotionBase): MotionPalette {
  switch (base) {
    case 'rosa':
      return { bg: BRAND.pink, display: BRAND.white, shadow: BRAND.magenta, body: BRAND.ink, hero: BRAND.ink, accent: BRAND.blue, deep: BRAND.magenta };
    case 'tinta':
      return { bg: BRAND.ink, display: BRAND.white, shadow: BRAND.magenta, body: BRAND.white, hero: BRAND.pink, accent: BRAND.blue, deep: BRAND.black };
    default:
      return { bg: BRAND.blue, display: BRAND.white, shadow: BRAND.ink, body: BRAND.white, hero: BRAND.pink, accent: BRAND.magenta, deep: BRAND.ink };
  }
}

export const MOTION_MUSIC = ['none', 'pulse', 'drive', 'dream'] as const;
export type MotionMusic = (typeof MOTION_MUSIC)[number];
export const MOTION_MUSIC_LABEL: Record<MotionMusic, string> = {
  none: 'Sin música',
  pulse: 'Pulse (electrónica, 120 BPM)',
  drive: 'Drive (house, 124 BPM)',
  dream: 'Dream (suave, 96 BPM)',
};
/** Pulsos por minuto de cada pista (client/public/motion/audio/*.wav). */
export const MOTION_MUSIC_BPM: Record<Exclude<MotionMusic, 'none'>, number> = { pulse: 120, drive: 124, dream: 96 };

export interface MotionMedia {
  url: string;
  kind: 'image' | 'video';
}

export interface MotionScene {
  /** Etiqueta chica de arriba («SÁBADO 14», «NUEVO»). */
  kicker: string;
  /** El texto grande. Pocas palabras. */
  text: string;
  /** Palabra de `text` que va en el color protagonista (vacío = ninguna). */
  highlight: string;
  /** Bajada bajo el texto grande. */
  sub: string;
  /** Lo que dice la voz en esta escena (y los subtítulos). */
  say: string;
  /** Segundos en pantalla (sin voz; con voz manda lo que dura la frase). */
  secs: number;
  media: MotionMedia | null;
}

export interface MotionVoice {
  url: string;
  /** Huella del guion con que se generó (si cambió una frase, quedó vieja). */
  hash: string;
  voice: string;
  rate: number;
  pitch: number;
  /** Lo que dura cada frase, en el mismo orden que las escenas. */
  secs: number[];
}

export interface MotionSpec {
  v: 1;
  title: string;
  /** Texto para la publicación de Instagram. */
  caption: string;
  eventId: number | null;
  template: MotionTemplate;
  style: MotionStyle;
  format: MotionFormat;
  base: MotionBase;
  scenes: MotionScene[];
  /** Solo plantilla countdown: el número grande y su unidad. */
  countdown: { value: number; unit: string };
  /** Cierra con la firma animada de la marca. */
  outro: boolean;
  /** Línea bajo el logo en la firma («Entradas en la bio»). */
  outroLine: string;
  music: MotionMusic;
  sfx: boolean;
  voice: MotionVoice | null;
  captions: boolean;
}

export const MOTION_MAX_SCENES = 10;
export const MOTION_SCENE_SECS = { min: 1, max: 8 } as const;
export const MOTION_MAX_TOTAL_SECS = 60;
export const MOTION_OUTRO_SECS = 2.6;
export const MOTION_STING_SECS = 3.6;
/** Silencio de la voz (igual que server/studioVoice.ts). */
export const MOTION_VOICE_LEAD = 0.35;
export const MOTION_VOICE_GAP = 0.3;
export const MOTION_VOICE_TAIL = 1.1;

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const pick = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(value as string) ? (value as T) : fallback;
const clampNum = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Solo https (o una ruta del propio sitio). Nada de data:, javascript:, http:. */
export function cleanMediaUrl(value: unknown): string {
  const url = str(value, 1000);
  if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
  try {
    return new URL(url).protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

function normalizeMedia(raw: unknown): MotionMedia | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = cleanMediaUrl(r.url);
  if (!url) return null;
  const kind = r.kind === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image';
  return { url, kind };
}

export function emptyScene(text = ''): MotionScene {
  return { kicker: '', text, highlight: '', sub: '', say: '', secs: 2.5, media: null };
}

function normalizeScene(raw: unknown): MotionScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = str(r.text, 90);
  const highlight = str(r.highlight, 40);
  const scene: MotionScene = {
    kicker: str(r.kicker, 40),
    text,
    // Lo resaltado tiene que estar en el texto: si no, no se resalta nada.
    highlight: highlight && text.toLowerCase().includes(highlight.toLowerCase()) ? highlight : '',
    sub: str(r.sub, 140),
    say: str(r.say, 180),
    secs: Math.round(clampNum(r.secs, MOTION_SCENE_SECS.min, MOTION_SCENE_SECS.max, 2.5) * 10) / 10,
    media: normalizeMedia(r.media),
  };
  return scene.text || scene.media || scene.kicker ? scene : null;
}

function normalizeVoice(raw: unknown, sceneCount: number): MotionVoice | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = cleanMediaUrl(r.url);
  const secs = Array.isArray(r.secs) ? r.secs.map((s) => clampNum(s, 0.2, 30, NaN)).filter((s) => Number.isFinite(s)) : [];
  if (!url || secs.length !== sceneCount) return null;
  return {
    url,
    hash: str(r.hash, 40),
    voice: str(r.voice, 30),
    rate: Math.round(clampNum(r.rate, -25, 30, 0)),
    pitch: Math.round(clampNum(r.pitch, -12, 12, 0)),
    secs: secs.map((s) => Math.round(s * 100) / 100),
  };
}

/** Limpia cualquier cosa que llegue (IA, panel, fila vieja). Nunca lanza. */
export function normalizeMotionSpec(raw: unknown): MotionSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const template = pick(r.template, MOTION_TEMPLATES, 'anuncio');
  const style = pick(r.style, MOTION_STYLES, 'liquid');
  let scenes = (Array.isArray(r.scenes) ? r.scenes : []).map(normalizeScene).filter((s): s is MotionScene => !!s).slice(0, MOTION_MAX_SCENES);
  if (template === 'sting') scenes = scenes.slice(0, 1);
  if (scenes.length === 0) scenes = [emptyScene(template === 'sting' ? 'Mansion Playroom' : 'Tu texto aquí')];
  // Tope total: se recortan escenas del final hasta caber.
  while (scenes.length > 1 && scenes.reduce((n, s) => n + s.secs, 0) > MOTION_MAX_TOTAL_SECS) scenes = scenes.slice(0, -1);
  const cd = (r.countdown && typeof r.countdown === 'object' ? r.countdown : {}) as Record<string, unknown>;
  const eventId = Number(r.eventId);
  const voice = normalizeVoice(r.voice, scenes.length);
  return {
    v: 1,
    title: str(r.title, 200) || 'Video sin nombre',
    caption: typeof r.caption === 'string' ? r.caption.slice(0, 2200) : '',
    eventId: Number.isInteger(eventId) && eventId > 0 ? eventId : null,
    template,
    style,
    format: pick(r.format, MOTION_FORMATS, 'reel'),
    base: pick(r.base, MOTION_BASES, style === 'glitch' ? 'tinta' : style === 'editorial' ? 'rosa' : 'azul'),
    scenes,
    countdown: { value: Math.round(clampNum(cd.value, 0, 999, 7)), unit: str(cd.unit, 16) || 'DÍAS' },
    outro: template === 'sting' ? false : r.outro !== false,
    outroLine: str(r.outroLine, 60),
    music: pick(r.music, MOTION_MUSIC, 'pulse'),
    sfx: r.sfx !== false,
    voice,
    captions: !!voice && r.captions !== false,
  };
}

/* --- Línea de tiempo --------------------------------------------------------
 * Con voz, cada escena dura lo que su frase (más los silencios del WAV, así el
 * texto cae justo con la voz). Sin voz, en un montaje con música, los cortes
 * caen en el pulso. La firma de la marca va al final. */

export interface TimelineScene {
  index: number;
  from: number;
  frames: number;
}

export interface MotionTimeline {
  scenes: TimelineScene[];
  /** Cuadro donde empieza la firma (null si no lleva). */
  outroFrom: number | null;
  outroFrames: number;
  total: number;
  /** Cuadros por pulso de la música (null sin música). */
  beatFrames: number | null;
}

export function motionTimeline(spec: MotionSpec, fps = MOTION_FPS): MotionTimeline {
  const beatFrames = spec.music === 'none' ? null : (fps * 60) / MOTION_MUSIC_BPM[spec.music];
  if (spec.template === 'sting') {
    const frames = Math.round(MOTION_STING_SECS * fps);
    return { scenes: [{ index: 0, from: 0, frames }], outroFrom: null, outroFrames: 0, total: frames, beatFrames };
  }
  const voice = spec.voice && spec.voice.secs.length === spec.scenes.length ? spec.voice : null;
  const last = spec.scenes.length - 1;
  let from = 0;
  const scenes = spec.scenes.map((scene, index): TimelineScene => {
    let secs: number;
    if (voice) {
      secs = voice.secs[index] + (index === 0 ? MOTION_VOICE_LEAD : 0) + (index === last ? MOTION_VOICE_TAIL : MOTION_VOICE_GAP);
    } else {
      secs = scene.secs;
    }
    let frames = Math.max(Math.round(fps * 0.8), Math.round(secs * fps));
    // Montaje sin voz: el corte cae en un pulso (mínimo dos pulsos por toma).
    if (!voice && beatFrames && spec.template === 'montaje') {
      frames = Math.round(Math.max(2, Math.round(frames / beatFrames)) * beatFrames);
    }
    const out = { index, from, frames };
    from += frames;
    return out;
  });
  const outroFrames = spec.outro ? Math.round(MOTION_OUTRO_SECS * fps) : 0;
  return { scenes, outroFrom: spec.outro ? from : null, outroFrames, total: from + outroFrames, beatFrames };
}

/* --- Subtítulos -------------------------------------------------------------
 * Azure no entrega el tiempo de cada palabra por la vía que usamos, así que
 * dentro de cada frase las palabras se reparten según su largo (las largas
 * duran más). Con la frase real de la voz el error es de décimas. */

export interface CaptionWord {
  text: string;
  from: number;
  to: number;
}

export function captionWords(spec: MotionSpec, fps = MOTION_FPS): CaptionWord[] {
  const voice = spec.voice;
  if (!voice || !spec.captions) return [];
  const tl = motionTimeline(spec, fps);
  const words: CaptionWord[] = [];
  tl.scenes.forEach((t, i) => {
    const say = spec.scenes[i].say.trim();
    if (!say) return;
    const parts = say.split(/\s+/);
    const start = t.from + Math.round((i === 0 ? MOTION_VOICE_LEAD : 0) * fps);
    const span = Math.max(1, Math.round(voice.secs[i] * fps));
    const weights = parts.map((w) => Math.max(2, w.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, '').length) + 1.5);
    const sum = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    parts.forEach((w, k) => {
      const a = start + Math.round((acc / sum) * span);
      acc += weights[k];
      const b = start + Math.round((acc / sum) * span);
      words.push({ text: w, from: a, to: Math.max(a + 1, b) });
    });
  });
  return words;
}

/** Frases que lee la voz (una por escena; vacía = se usa el texto grande). */
export function voiceSays(spec: MotionSpec): string[] {
  return spec.scenes.map((s) => (s.say || s.text).trim());
}

/** Un video de partida para cada plantilla (el editor empieza de acá). */
export function starterSpec(template: MotionTemplate, style: MotionStyle = 'liquid'): MotionSpec {
  const scenes: Partial<MotionScene>[] =
    template === 'countdown'
      ? [{ kicker: 'FALTAN', text: 'para la noche', secs: 3 }, { text: '¿Ya tienes tu entrada?', highlight: 'entrada', secs: 2.5 }]
      : template === 'montaje'
        ? [{ text: 'Así se vivió', highlight: 'vivió', secs: 2 }, { text: 'la última noche', secs: 2 }, { text: 'Y esto recién empieza', highlight: 'empieza', secs: 2.5 }]
        : template === 'sting'
          ? [{ text: 'Mansion Playroom' }]
          : [
              { kicker: 'SE VIENE', text: 'Una noche distinta', highlight: 'distinta', secs: 2.2 },
              { kicker: 'SÁBADO', text: 'Valparaíso', sub: 'Dirección exacta al comprar', secs: 2.4 },
              { text: 'Entradas en la bio', highlight: 'bio', secs: 2.4 },
            ];
  return normalizeMotionSpec({ template, style, scenes, outroLine: 'mansionplayroom.cl', title: MOTION_TEMPLATE_LABEL[template] });
}
