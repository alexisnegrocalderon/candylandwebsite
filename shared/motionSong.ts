/* Canción propia del Estudio Motion: se sube un MP3/M4A/WAV, el panel la analiza en el navegador (sin costo, sin
 * servidor) y todo el video se mueve al ritmo: los cortes caen en el pulso, la cámara late con el bombo y la luz
 * se enciende en los golpes fuertes.
 *
 * Acá vive solo lo PURO (sin DOM ni Remotion): el análisis de las muestras, el mejor fragmento, y qué pasa en cada
 * cuadro (pulso, golpe, energía). Lo usan el panel (analizar), la línea de tiempo (cortes al pulso) y la composición
 * (motion/beat.ts). La decodificación del archivo vive en client/.../songAnalysis.ts. */

export const SONG_BPM_RANGE = { min: 70, max: 180 } as const;
/** Muestras de energía por segundo. */
export const SONG_ENERGY_HZ = 10;
/** Más largo que esto no se analiza (el video más largo dura 60 s). */
export const SONG_MAX_SECS = 600;
export const SONG_MIN_SECS = 8;
export const SONG_MAX_HITS = 1500;

export interface MotionSong {
  url: string;
  /** Nombre del archivo (solo para mostrarlo). */
  name: string;
  bpm: number;
  /** Segundo de la canción donde cae el primer tiempo fuerte (tiempo 1 del compás). */
  downbeat: number;
  /** Segundo de la canción donde parte el video: siempre sobre el tiempo 1 de un compás. */
  start: number;
  /** Lo que dura la canción entera (s). */
  duration: number;
  /** Energía de toda la canción, 0–99, `SONG_ENERGY_HZ` muestras por segundo. */
  energy: number[];
  /** Golpes fuertes (bombo, drops) en segundos de la canción. */
  hits: number[];
  /** Volumen de la canción en el video (0–1). */
  volume: number;
  /** El MP4 se graba SIN la canción (sigue sonando en la vista previa): para una canción comercial, que se agrega desde
   * la biblioteca de música de Instagram y así queda con su licencia. El video sale igual de sincronizado. */
  muteOnExport: boolean;
}

export interface SongAnalysis {
  bpm: number;
  downbeat: number;
  duration: number;
  energy: number[];
  hits: number[];
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Segundos entre pulsos. */
export const songBeatSecs = (bpm: number) => 60 / bpm;

/* --- Análisis ---------------------------------------------------------------
 * Solo con las muestras: una señal de bajos (el bombo) y una de todo el espectro; de sus subidas bruscas sale el
 * tempo (autocorrelación), la fase del pulso y los golpes fuertes. Pensado para música de fiesta (electrónica,
 * reggaetón, pop), donde el bombo marca el pulso. */

const HOP = 512;

interface Envelopes {
  hopSecs: number;
  low: Float32Array;
  full: Float32Array;
  onset: Float32Array;
}

function envelopes(samples: Float32Array, sampleRate: number): Envelopes {
  const n = Math.floor(samples.length / HOP);
  const hopSecs = HOP / sampleRate;
  const low = new Float32Array(n);
  const full = new Float32Array(n);
  // Pasa-bajos de un polo (~150 Hz): lo que queda es el bombo y el bajo.
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let y = 0;
  for (let i = 0; i < n; i++) {
    let sl = 0;
    let sf = 0;
    for (let k = 0; k < HOP; k++) {
      const x = samples[i * HOP + k];
      y += a * (x - y);
      sl += y * y;
      sf += x * x;
    }
    low[i] = Math.sqrt(sl / HOP);
    full[i] = Math.sqrt(sf / HOP);
  }
  const norm = (arr: Float32Array) => {
    let max = 1e-9;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    for (let i = 0; i < arr.length; i++) arr[i] /= max;
  };
  norm(low);
  norm(full);
  // Subida brusca de la energía (en escala logarítmica, como el oído): bombo pesa más que el resto.
  const onset = new Float32Array(n);
  const K = 40;
  for (let i = 1; i < n; i++) {
    const dl = Math.log1p(K * low[i]) - Math.log1p(K * low[i - 1]);
    const df = Math.log1p(K * full[i]) - Math.log1p(K * full[i - 1]);
    onset[i] = Math.max(0, dl) * 1.0 + Math.max(0, df) * 0.5;
  }
  return { hopSecs, low, full, onset };
}

/** Valor de la señal en un tiempo fraccionario (en hops), interpolado. */
function at(arr: Float32Array, pos: number): number {
  if (pos < 0 || pos >= arr.length - 1) return 0;
  const i = Math.floor(pos);
  const f = pos - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

function autocorr(onset: Float32Array, lag: number): number {
  let s = 0;
  const end = onset.length - Math.ceil(lag) - 2;
  for (let i = 0; i < end; i++) s += onset[i] * at(onset, i + lag);
  return s / Math.max(1, end);
}

function estimateTempo(env: Envelopes): number {
  const { onset, hopSecs } = env;
  // Resta la media para que el ruido de fondo no pese.
  let mean = 0;
  for (let i = 0; i < onset.length; i++) mean += onset[i];
  mean /= Math.max(1, onset.length);
  const o = new Float32Array(onset.length);
  for (let i = 0; i < o.length; i++) o[i] = onset[i] - mean;
  let best = 120;
  let bestScore = -Infinity;
  for (let bpm = SONG_BPM_RANGE.min; bpm <= SONG_BPM_RANGE.max; bpm += 0.5) {
    const lag = 60 / bpm / hopSecs;
    // El pulso y su doble (compás de dos tiempos) refuerzan; la mitad también.
    let score = autocorr(o, lag) + 0.5 * autocorr(o, lag * 2) + 0.25 * autocorr(o, lag * 4);
    // Prior suave hacia 90–150 BPM (el rango de las fiestas) para no elegir la mitad ni el doble.
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.8) ** 2);
    score *= prior;
    if (score > bestScore) { bestScore = score; best = bpm; }
  }
  return best;
}

/** Desfase (en segundos) donde caen los pulsos: el que más energía de subida junta. */
function estimatePhase(env: Envelopes, period: number): number {
  const { onset, hopSecs } = env;
  const steps = Math.max(8, Math.round(period / hopSecs));
  let best = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * period;
    let score = 0;
    for (let t = phase; t / hopSecs < onset.length - 2; t += period) {
      // Tolera ±1 hop: el bombo no cae exacto en la rejilla.
      const p = t / hopSecs;
      score += Math.max(at(onset, p - 1), at(onset, p), at(onset, p + 1));
    }
    if (score > bestScore) { bestScore = score; best = phase; }
  }
  return best;
}

/** Golpes fuertes: máximos locales de la subida de energía por sobre el promedio. */
function detectHits(env: Envelopes): Array<{ t: number; strength: number }> {
  const { onset, hopSecs } = env;
  const n = onset.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i];
  mean /= Math.max(1, n);
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (onset[i] - mean) ** 2;
  const std = Math.sqrt(varSum / Math.max(1, n));
  const threshold = mean + 1.1 * std;
  const radius = Math.max(2, Math.round(0.12 / hopSecs));
  const minGap = 0.16;
  const out: Array<{ t: number; strength: number }> = [];
  for (let i = radius; i < n - radius; i++) {
    const v = onset[i];
    if (v < threshold) continue;
    let isMax = true;
    for (let k = -radius; k <= radius; k++) if (onset[i + k] > v) { isMax = false; break; }
    if (!isMax) continue;
    const t = i * hopSecs;
    const prev = out[out.length - 1];
    if (prev && t - prev.t < minGap) {
      if (v > prev.strength) { prev.t = t; prev.strength = v; }
      continue;
    }
    out.push({ t, strength: v });
  }
  return out;
}

/** Ajusta el período con los golpes que caen cerca del pulso (mínimos cuadrados): corrige el error de décimas de BPM
 * que, en 60 s, se notaría como un desfase de varios cuadros. */
function refineGrid(hits: Array<{ t: number; strength: number }>, period: number, phase: number): { period: number; phase: number } {
  let p = period;
  let ph = phase;
  for (let iter = 0; iter < 4; iter++) {
    const pts: Array<{ n: number; t: number; w: number }> = [];
    for (const h of hits) {
      const n = Math.round((h.t - ph) / p);
      const err = h.t - (ph + n * p);
      if (n >= 0 && Math.abs(err) < p * 0.14) pts.push({ n, t: h.t, w: h.strength });
    }
    if (pts.length < 8) break;
    let sw = 0, sn = 0, st = 0, snn = 0, snt = 0;
    for (const q of pts) { sw += q.w; sn += q.w * q.n; st += q.w * q.t; snn += q.w * q.n * q.n; snt += q.w * q.n * q.t; }
    const den = sw * snn - sn * sn;
    if (Math.abs(den) < 1e-9) break;
    const slope = (sw * snt - sn * st) / den;
    const icpt = (st - slope * sn) / sw;
    if (!Number.isFinite(slope) || !Number.isFinite(icpt) || Math.abs(slope - p) > p * 0.03) break;
    p = slope;
    ph = icpt;
  }
  return { period: p, phase: ph };
}

/** Qué tiempo (0–3) del compás es el fuerte: el que junta más bajo. */
function pickDownbeatIndex(env: Envelopes, period: number, phase: number): number {
  const { low, hopSecs } = env;
  const sums = [0, 0, 0, 0];
  let k = 0;
  for (let t = phase; t / hopSecs < low.length - 2; t += period, k++) sums[k % 4] += at(low, t / hopSecs);
  let best = 0;
  for (let i = 1; i < 4; i++) if (sums[i] > sums[best]) best = i;
  return best;
}

export function analyzeSong(samples: Float32Array, sampleRate: number): SongAnalysis {
  const duration = samples.length / sampleRate;
  const env = envelopes(samples, sampleRate);
  const hits = detectHits(env);
  const coarse = estimateTempo(env);
  const phase0 = estimatePhase(env, 60 / coarse);
  const { period, phase } = refineGrid(hits, 60 / coarse, phase0);
  const bpm = round(60 / period, 2);
  const idx = pickDownbeatIndex(env, period, phase);
  let downbeat = phase + idx * period;
  // El primer tiempo fuerte que cae dentro de la canción.
  while (downbeat - period * 4 >= 0) downbeat -= period * 4;

  // Energía a SONG_ENERGY_HZ: el promedio de la señal completa en cada ventana, normalizado por su percentil 95.
  const slots = Math.ceil(duration * SONG_ENERGY_HZ);
  const raw = new Float32Array(slots);
  for (let s = 0; s < slots; s++) {
    const from = Math.floor((s / SONG_ENERGY_HZ) / env.hopSecs);
    const to = Math.min(env.full.length, Math.max(from + 1, Math.floor(((s + 1) / SONG_ENERGY_HZ) / env.hopSecs)));
    let sum = 0;
    for (let i = from; i < to; i++) sum += env.full[i];
    raw[s] = to > from ? sum / (to - from) : 0;
  }
  const sorted = Array.from(raw).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1e-6;
  const energy = Array.from(raw, (v) => Math.round(clamp(v / p95, 0, 1) * 99));

  return {
    bpm,
    downbeat: round(Math.max(0, downbeat), 3),
    duration: round(duration, 2),
    energy,
    hits: hits.slice(0, SONG_MAX_HITS).map((h) => round(h.t, 3)),
  };
}

/* --- Fragmento ------------------------------------------------------------- */

/** Los tiempos 1 de cada compás de la canción (donde puede partir el video). */
export function songBarStarts(song: Pick<MotionSong, 'bpm' | 'downbeat' | 'duration'>): number[] {
  const bar = songBeatSecs(song.bpm) * 4;
  const out: number[] = [];
  for (let t = song.downbeat; t < song.duration; t += bar) out.push(round(t, 3));
  return out;
}

/** Energía media (0–1) de un tramo de la canción. */
export function songMeanEnergy(song: Pick<MotionSong, 'energy'>, from: number, to: number): number {
  const a = Math.max(0, Math.floor(from * SONG_ENERGY_HZ));
  const b = Math.min(song.energy.length, Math.max(a + 1, Math.ceil(to * SONG_ENERGY_HZ)));
  let sum = 0;
  for (let i = a; i < b; i++) sum += song.energy[i];
  return b > a ? sum / (b - a) / 99 : 0;
}

/** El mejor tramo de `secs` segundos: arranca en el tiempo 1 de un compás y es el más intenso (baile, no intro). */
export function bestSongStart(song: Pick<MotionSong, 'bpm' | 'downbeat' | 'duration' | 'energy'>, secs: number): number {
  const bars = songBarStarts(song).filter((t) => t + secs <= song.duration + 0.01);
  if (!bars.length) return round(song.downbeat, 3);
  let best = bars[0];
  let bestScore = -Infinity;
  for (const t of bars) {
    const whole = songMeanEnergy(song, t, t + secs);
    // Premia que el tramo suba (un drop adentro) y que arranque con pegada.
    const half = secs / 2;
    const rise = Math.max(0, songMeanEnergy(song, t + half, t + secs) - songMeanEnergy(song, t, t + half));
    const score = whole + 0.35 * rise;
    if (score > bestScore + 1e-6) { bestScore = score; best = t; }
  }
  return best;
}

/** El compás más cercano a un segundo cualquiera (para el selector manual). */
export function snapToBar(song: Pick<MotionSong, 'bpm' | 'downbeat' | 'duration'>, secs: number): number {
  const bar = songBeatSecs(song.bpm) * 4;
  const k = Math.max(0, Math.round((secs - song.downbeat) / bar));
  return round(Math.min(song.downbeat + k * bar, Math.max(song.downbeat, song.duration - bar)), 3);
}

/* --- Qué pasa en cada cuadro ---------------------------------------------- */

export interface BeatState {
  /** Número de pulso desde el inicio del video (0 = el primero). */
  index: number;
  /** Tiempo dentro del compás: 0, 1, 2 o 3 (0 = el fuerte). */
  inBar: number;
  /** 0–1 dentro del pulso (0 = justo en el pulso). */
  phase: number;
  /** 1 en el pulso y cae rápido a 0 (para un latido). */
  pulse: number;
  /** 1 en un golpe fuerte y cae a 0 en ~0,3 s (para destellos). */
  hit: number;
  /** Intensidad de la música ahora, 0–1. */
  energy: number;
}

/** Los golpes fuertes dentro del video, en cuadros desde su inicio (ordenados). */
export function songHitFrames(song: Pick<MotionSong, 'hits' | 'start'>, fps: number): number[] {
  const out: number[] = [];
  for (const t of song.hits) {
    const f = Math.round((t - song.start) * fps);
    if (f >= 0) out.push(f);
  }
  return out;
}

/** Energía (0–1) en un segundo del video. */
export function songEnergyAt(song: Pick<MotionSong, 'energy' | 'start'>, secs: number): number {
  const pos = (song.start + secs) * SONG_ENERGY_HZ;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = song.energy[clamp(i, 0, song.energy.length - 1)] ?? 0;
  const b = song.energy[clamp(i + 1, 0, song.energy.length - 1)] ?? a;
  return (a * (1 - f) + b * f) / 99;
}

/** Pulso, golpe y energía de un cuadro. `hitFrames` sale de `songHitFrames` (se calcula una vez). */
export function songBeatState(song: Pick<MotionSong, 'bpm' | 'energy' | 'start'>, hitFrames: number[], frame: number, fps: number): BeatState {
  const beatFrames = (fps * 60) / song.bpm;
  const pos = frame / beatFrames;
  const index = Math.max(0, Math.floor(pos));
  const phase = pos - Math.floor(pos);
  let last = -1;
  // Búsqueda binaria del último golpe a o antes de este cuadro.
  let lo = 0, hi = hitFrames.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hitFrames[mid] <= frame) { last = hitFrames[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  const sinceHit = last < 0 ? Infinity : (frame - last) / fps;
  return {
    index,
    inBar: index % 4,
    phase,
    pulse: Math.exp(-phase * beatFrames / 3.5),
    hit: Math.exp(-sinceHit / 0.11),
    energy: songEnergyAt(song, frame / fps),
  };
}

/* --- Normalización (lo que llega del panel o de una fila guardada) --------- */

const strClean = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Limpia una canción guardada. `cleanUrl` es cleanMediaUrl (se inyecta para no depender de motionSpec.ts). */
export function normalizeSong(raw: unknown, cleanUrl: (v: unknown) => string): MotionSong | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = cleanUrl(r.url);
  const bpm = Number(r.bpm);
  const duration = Number(r.duration);
  if (!url || !Number.isFinite(bpm) || !Number.isFinite(duration)) return null;
  if (bpm < SONG_BPM_RANGE.min - 5 || bpm > SONG_BPM_RANGE.max + 5 || duration < SONG_MIN_SECS || duration > SONG_MAX_SECS) return null;
  const energy = (Array.isArray(r.energy) ? r.energy : []).slice(0, SONG_MAX_SECS * SONG_ENERGY_HZ).map((v) => Math.round(clamp(Number(v) || 0, 0, 99)));
  if (energy.length < SONG_MIN_SECS * SONG_ENERGY_HZ) return null;
  const hits = (Array.isArray(r.hits) ? r.hits : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0 && v <= duration)
    .slice(0, SONG_MAX_HITS)
    .sort((a, b) => a - b)
    .map((v) => round(v, 3));
  const downbeat = clamp(Number(r.downbeat) || 0, 0, duration);
  const start = clamp(Number(r.start) || 0, 0, duration);
  return {
    url,
    name: strClean(r.name, 80) || 'Canción',
    bpm: round(clamp(bpm, SONG_BPM_RANGE.min - 5, SONG_BPM_RANGE.max + 5), 2),
    downbeat: round(downbeat, 3),
    start: round(start, 3),
    duration: round(duration, 2),
    energy,
    hits,
    volume: round(clamp(Number.isFinite(Number(r.volume)) ? Number(r.volume) : 0.9, 0, 1), 2),
    muteOnExport: r.muteOnExport === true,
  };
}
