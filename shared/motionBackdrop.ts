/* Video de fondo del Estudio Motion: se sube UN video, el panel lo analiza en el navegador (sin costo, sin servidor) y corre
 * continuo detrás de todo el reel. Lo analizado (luz y detalle de cada franja del cuadro, y los cortes de plano) viaja dentro
 * de la receta, igual que la canción propia (shared/motionSong.ts): la grabación a MP4 nunca vuelve a analizar.
 *
 * Con eso, cada escena decide cómo se ve su texto para que SIEMPRE se distinga: claro u oscuro, cuánto degradado detrás y
 * cuánto contorno. La decisión es por escena (no por cuadro) para que el texto no parpadee.
 *
 * Acá vive solo lo PURO (sin DOM ni Remotion): el análisis de cada cuadro, los cortes, la decisión de legibilidad y el mapeo
 * del tiempo (recorte y repetición). La lectura del video vive en client/.../videoAnalysis.ts. */

/** Muestras por segundo. */
export const BACKDROP_HZ = 2;
/** Franjas del cuadro: arriba, centro y abajo. */
export const BACKDROP_ZONES = 3;
export const BACKDROP_MIN_SECS = 1;
/** Más largo que esto no se analiza (el reel más largo dura 60 s; con 180 s sobra para elegir un tramo). */
export const BACKDROP_MAX_SECS = 180;
export const BACKDROP_MAX_CUTS = 200;
/** Lado de la cuadrícula en gris con que se comparan dos cuadros para detectar un corte. */
export const BACKDROP_GRID = { w: 24, h: 14 } as const;

export const BACKDROP_LOOPS = ['repetir', 'congelar'] as const;
export type BackdropLoop = (typeof BACKDROP_LOOPS)[number];
export const BACKDROP_LOOP_LABEL: Record<BackdropLoop, string> = {
  repetir: 'Repetir desde el inicio del tramo',
  congelar: 'Quedarse en el último cuadro',
};

/** Qué pasa con el sonido del video (el original no se usa todavía: queda en silencio). */
export const BACKDROP_AUDIOS = ['silencio', 'original', 'bajo'] as const;
export type BackdropAudio = (typeof BACKDROP_AUDIOS)[number];

/** Cómo se adapta el texto: automático (con lo analizado), forzar texto claro u oscuro, o apagada (el texto del estilo, tal cual). */
export const BACKDROP_ADAPTS = ['auto', 'claro', 'oscuro', 'apagada'] as const;
export type BackdropAdapt = (typeof BACKDROP_ADAPTS)[number];
export const BACKDROP_ADAPT_LABEL: Record<BackdropAdapt, string> = {
  auto: 'Automática (según el video)',
  claro: 'Texto siempre claro',
  oscuro: 'Texto siempre oscuro',
  apagada: 'Sin adaptar (colores del estilo)',
};

export interface MotionBackdrop {
  url: string;
  /** Nombre del archivo (solo para mostrarlo). */
  name: string;
  /** Lo que dura el video entero (s). */
  duration: number;
  /** Segundo del video donde parte el reel (recorte del inicio). */
  start: number;
  loop: BackdropLoop;
  /** 0–100: cuánto se ve del fondo del estilo (su color y adornos) sobre el video. 0 = solo el video. */
  mix: number;
  audio: BackdropAudio;
  adapt: BackdropAdapt;
  /** Luz de cada franja: 0–99, `BACKDROP_HZ` muestras por segundo × `BACKDROP_ZONES` franjas (en ese orden). */
  luma: number[];
  /** Detalle (bordes, textura) de cada franja: 0–99, mismo orden. Lo parejo y calmado queda cerca de 0. */
  busy: number[];
  /** Cambios de plano, en segundos del video. */
  cuts: number[];
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/* --- Análisis de un cuadro --------------------------------------------------------------------------------- */

export interface FrameStat {
  /** Luz media de cada franja, 0–99. */
  luma: number[];
  /** Detalle medio de cada franja, 0–99. */
  busy: number[];
  /** Cuadrícula en gris (`BACKDROP_GRID`) para comparar con el cuadro anterior. */
  grid: number[];
}

/** Luz de un píxel (BT.709 sobre el valor ya codificado, 0–255). */
const lumaOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Mide un cuadro (RGBA de `w`×`h`, p. ej. 96×54): luz y detalle por franja, y la cuadrícula para detectar cortes. */
export function analyzeFrame(data: ArrayLike<number>, w: number, h: number): FrameStat {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = lumaOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const luma: number[] = [];
  const busy: number[] = [];
  for (let z = 0; z < BACKDROP_ZONES; z++) {
    const y0 = Math.floor((z * h) / BACKDROP_ZONES);
    const y1 = Math.floor(((z + 1) * h) / BACKDROP_ZONES);
    let sum = 0;
    let grad = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < w; x++) {
        const v = gray[y * w + x];
        sum += v;
        // Detalle: cuánto cambia el gris con el vecino de la derecha y el de abajo.
        if (x + 1 < w) grad += Math.abs(v - gray[y * w + x + 1]);
        if (y + 1 < h) grad += Math.abs(v - gray[(y + 1) * w + x]);
        n++;
      }
    }
    luma.push(Math.round(clamp((sum / Math.max(1, n) / 255) * 99, 0, 99)));
    // Un cuadro parejo da ~0; una multitud, letras o follaje, 20–40 de gradiente medio.
    busy.push(Math.round(clamp((grad / Math.max(1, n * 2)) * 3.3, 0, 99)));
  }
  const grid: number[] = [];
  for (let gy = 0; gy < BACKDROP_GRID.h; gy++) {
    for (let gx = 0; gx < BACKDROP_GRID.w; gx++) {
      const x0 = Math.floor((gx * w) / BACKDROP_GRID.w);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / BACKDROP_GRID.w));
      const y0 = Math.floor((gy * h) / BACKDROP_GRID.h);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / BACKDROP_GRID.h));
      let s = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += gray[y * w + x]; n++; }
      grid.push(Math.round(s / n));
    }
  }
  return { luma, busy, grid };
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** De los cuadros (uno cada 1/`hz` s) saca lo que se guarda: luz, detalle y cortes de plano. */
export function buildBackdropAnalysis(frames: FrameStat[], hz = BACKDROP_HZ): { luma: number[]; busy: number[]; cuts: number[] } {
  const luma = frames.flatMap((f) => f.luma);
  const busy = frames.flatMap((f) => f.busy);
  // Un corte es un salto de la cuadrícula entre dos cuadros seguidos mucho mayor que lo normal del video (el movimiento de
  // cámara también cambia el gris, pero poco a poco).
  const diffs = frames.map((f, i) => (i === 0 ? 0 : f.grid.reduce((s, v, k) => s + Math.abs(v - frames[i - 1].grid[k]), 0) / f.grid.length));
  const threshold = Math.max(22, 3.2 * median(diffs.slice(1)));
  const cuts: number[] = [];
  let last = -Infinity;
  diffs.forEach((d, i) => {
    const t = i / hz;
    if (i > 0 && d > threshold && t - last >= 1) {
      cuts.push(round(t, 2));
      last = t;
    }
  });
  return { luma, busy, cuts: cuts.slice(0, BACKDROP_MAX_CUTS) };
}

/* --- Limpieza de lo guardado ---------------------------------------------------------------------------------- */

const pick = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(value as string) ? (value as T) : fallback);

/** Cuántas muestras tiene un video de esa duración. */
export const backdropSamples = (duration: number) => Math.floor(duration * BACKDROP_HZ) + 1;

/** Limpia un video de fondo guardado. `cleanUrl` es cleanMediaUrl (se inyecta para no depender de motionSpec.ts). */
export function normalizeBackdrop(raw: unknown, cleanUrl: (v: unknown) => string): MotionBackdrop | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = cleanUrl(r.url);
  const duration = Number(r.duration);
  if (!url || !Number.isFinite(duration) || duration < BACKDROP_MIN_SECS || duration > BACKDROP_MAX_SECS) return null;
  const samples = backdropSamples(duration);
  const fit = (v: unknown) => {
    const src = (Array.isArray(v) ? v : []).map((x) => Math.round(clamp(Number(x) || 0, 0, 99)));
    if (src.length === 0) return null;
    // Se ajusta al largo esperado: si falta, se repite lo último; si sobra, se corta.
    return Array.from({ length: samples * BACKDROP_ZONES }, (_, i) => src[Math.min(i, src.length - 1)]);
  };
  const luma = fit(r.luma);
  const busy = fit(r.busy);
  if (!luma || !busy) return null;
  const cuts = (Array.isArray(r.cuts) ? r.cuts : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0 && v < duration)
    .sort((a, b) => a - b)
    .map((v) => round(v, 2))
    .slice(0, BACKDROP_MAX_CUTS);
  return {
    url,
    name: String(r.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Video',
    duration: round(duration, 2),
    // Siempre queda al menos 1 s de video después del inicio del tramo.
    start: round(clamp(Number(r.start) || 0, 0, Math.max(0, duration - 1)), 2),
    loop: pick(r.loop, BACKDROP_LOOPS, 'repetir'),
    mix: Math.round(clamp(Number.isFinite(Number(r.mix)) ? Number(r.mix) : 0, 0, 100)),
    audio: pick(r.audio, BACKDROP_AUDIOS, 'silencio'),
    adapt: pick(r.adapt, BACKDROP_ADAPTS, 'auto'),
    luma,
    busy,
    cuts,
  };
}

/* --- Tiempo: recorte y repetición ---------------------------------------------------------------------------- */

/** Lo que dura el tramo elegido (desde `start` hasta el final del video). */
export const backdropSpan = (b: Pick<MotionBackdrop, 'duration' | 'start'>) => Math.max(0.5, b.duration - b.start);

/** Segundo del VIDEO que se ve cuando el reel lleva `t` segundos: parte en `start` y, al acabarse el tramo, repite o se queda quieto. */
export function backdropClipSecs(b: Pick<MotionBackdrop, 'duration' | 'start' | 'loop'>, t: number): number {
  const span = backdropSpan(b);
  const local = Math.max(0, t);
  return b.start + (b.loop === 'repetir' ? local % span : Math.min(local, span - 0.04));
}

/* --- Legibilidad ---------------------------------------------------------------------------------------------- */

export interface Legibility {
  /** Color del texto: claro (casi blanco) u oscuro (grafito). */
  ink: 'claro' | 'oscuro';
  /** 0–0.72: cuánto se oscurece (si el texto es claro) o aclara (si es oscuro) el video detrás del texto. */
  scrim: number;
  /** 0–1: cuánto contorno necesita el texto (el video tiene mucho detalle). */
  stroke: number;
  /** Luz media (0–99) y detalle medio (0–99) de lo que queda detrás del texto. */
  bright: number;
  busy: number;
}

/** Luz lineal aproximada (0–1) de un valor 0–99 codificado. */
const linear = (v: number) => (v / 99) ** 2.2;
const percentile = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : 0;
};
/** Contraste buscado para texto grande y grueso (WCAG pide 3:1; se deja margen). */
const TARGET = 4;
const WHITE = 1;
const GRAPHITE = 0.008;
const MAX_SCRIM = 0.72;

/** Cómo se debe ver el texto de una escena que dura de `from` a `to` (segundos del reel) sobre las franjas `zones`. */
export function legibilityFor(b: MotionBackdrop, from: number, to: number, zones: number[]): Legibility {
  const lums: number[] = [];
  const busies: number[] = [];
  const step = 1 / BACKDROP_HZ;
  const last = Math.max(from, to - 0.01);
  for (let t = from; t <= last + 1e-6; t += step) {
    const idx = Math.min(backdropSamples(b.duration) - 1, Math.max(0, Math.floor(backdropClipSecs(b, t) * BACKDROP_HZ)));
    for (const z of zones) {
      lums.push(b.luma[idx * BACKDROP_ZONES + z] ?? 0);
      busies.push(b.busy[idx * BACKDROP_ZONES + z] ?? 0);
    }
  }
  if (lums.length === 0) lums.push(50);
  // Para decidir el color del texto manda lo que PREDOMINA detrás (la mediana): un destello de un segundo no da vuelta una escena.
  // Para decidir cuánto velo hace falta manda lo peor que pasa (el percentil 80 de lo claro, o el 20 de lo oscuro).
  const median = linear(percentile(lums, 0.5));
  const l80 = linear(percentile(lums, 0.8));
  const l20 = linear(percentile(lums, 0.2));
  // Texto claro: hay que oscurecer lo claro hasta que 1,05/(l'+0,05) ≥ TARGET. Texto oscuro: aclarar lo oscuro hasta (l'+0,05)/0,058 ≥ TARGET.
  const needLight = clamp(1 - ((WHITE + 0.05) / TARGET - 0.05) / Math.max(l80, 1e-6), 0, MAX_SCRIM);
  const needDark = clamp((TARGET * (GRAPHITE + 0.05) - 0.05 - l20) / Math.max(1 - l20, 1e-6), 0, MAX_SCRIM);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const bright = Math.round(mean(lums));
  const busy = Math.round(mean(busies));
  const forced = b.adapt === 'claro' || b.adapt === 'oscuro' ? b.adapt : null;
  // Muy oscuro → texto claro; muy claro → texto oscuro; en el término medio, el que necesite menos velo (con preferencia por el claro,
  // que es lo que más se usa en un reel).
  const ink = forced ?? (median <= 0.12 ? 'claro' : median >= 0.45 ? 'oscuro' : needDark < needLight - 0.15 ? 'oscuro' : 'claro');
  // Siempre un poco de profundidad detrás del texto claro (un video «pelado» se ve plano), nunca de más.
  const scrim = round(ink === 'claro' ? Math.max(0.1, needLight) : Math.max(0.06, needDark), 2);
  return { ink, scrim, stroke: round(clamp((busy - 20) / 50, 0, 1), 2), bright, busy };
}

/** La franja (0 arriba, 1 centro, 2 abajo) con menos detalle entre `from` y `to`: ahí el texto se lee mejor. */
export function calmestZone(b: MotionBackdrop, from: number, to: number): number {
  const sums = [0, 0, 0];
  let n = 0;
  for (let t = from; t <= Math.max(from, to - 0.01) + 1e-6; t += 1 / BACKDROP_HZ) {
    const idx = Math.min(backdropSamples(b.duration) - 1, Math.max(0, Math.floor(backdropClipSecs(b, t) * BACKDROP_HZ)));
    for (let z = 0; z < BACKDROP_ZONES; z++) sums[z] += b.busy[idx * BACKDROP_ZONES + z] ?? 0;
    n++;
  }
  // Si dos empatan, gana la de abajo (donde caen los textos de un reel).
  return sums.reduce((best, v, z) => (v < sums[best] - 1e-9 || (Math.abs(v - sums[best]) < 1e-9 && z > best) ? z : best), 0);
}
