/* Sonido inmersivo del sitio -- TODO lo que se afina de oído vive acá (BPM,
 * volúmenes, filtros, notas, patrones), separado del motor (engine.ts) para
 * poder ajustar el sonido sin tocar la lógica y para poder probar los
 * patrones sin audio (config.test.ts).
 *
 * Idea: "la fiesta se acerca". Afuera de la Mansión se oye la fiesta a través
 * de la pared (filtro cerrado); al bajar por la página la puerta se va
 * abriendo; al tocar una pista se abre de verdad y entra su loop. */

export const SOUND_PREF_KEY = 'mp_sound';

export type PistaId = 'TECH' | 'PERREO';
export type SceneId = 'AMBIENT' | PistaId;

/** Volumen general (0-1). Bajo a propósito: es un sitio web, no un club.
 * Medido en el navegador (salida final): ambiente ≈ -22 dBFS, pistas ≈ -18 dBFS
 * (RMS) -- Tech y Perreo quedan parejas. */
export const MASTER_LEVEL = 0.24;
export const MASTER_FADE_IN_S = 0.8;
export const MASTER_FADE_OUT_S = 0.4;
/** Duración del cruce entre escenas (ambiente ⇄ pista ⇄ pista), tipo DJ. */
export const CROSSFADE_S = 1.2;

/** Filtro pasa-bajos maestro: cuánto "se oye a través de la pared". */
export const CUTOFF_CLOSED_HZ = 420;
export const CUTOFF_NEAR_HZ = 2600;
export const CUTOFF_OPEN_HZ = 19000;

/** Nivel de "apertura de la puerta" (0 = hero, 1 = final de la página) → Hz.
 * Escala exponencial: el oído percibe frecuencia en octavas, no en Hz. */
export function zoneCutoff(level: number): number {
  const t = Math.min(1, Math.max(0, level));
  return CUTOFF_CLOSED_HZ * Math.pow(CUTOFF_NEAR_HZ / CUTOFF_CLOSED_HZ, t);
}

export const SCENES: Record<SceneId, { bpm: number; level: number }> = {
  AMBIENT: { bpm: 122, level: 0.6 },
  TECH: { bpm: 126, level: 0.9 },
  PERREO: { bpm: 96, level: 0.8 },
};

/** Duración de un paso (semicorchea) en segundos. */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

export type HitKind = 'kick' | 'hat' | 'openHat' | 'clap' | 'snare' | 'bass' | 'sub' | 'pluck' | 'rumble';
export interface StepHit {
  kind: HitKind;
  /** Intensidad 0-1. */
  vel: number;
  /** Frecuencia en Hz para los sonidos con nota. */
  freq?: number;
}

// Notas (Hz) -- La menor.
const A1 = 55;
const G1 = 49;
const C2 = 65.41;
const A3 = 220;
const C4 = 261.63;
const E4 = 329.63;
const G3 = 196;

const TECH_BASS = [A1, A1, C2, A1];
const PERREO_SUB: Array<[number, number]> = [[0, A1], [6, A1], [8, C2], [14, G1]];

/** Qué suena en el paso `step` (0 en adelante, contado sin parar) de cada
 * escena. 16 pasos = un compás. Puro: no toca audio. */
export function stepsFor(scene: SceneId, step: number): StepHit[] {
  const s = step % 16;
  const bar = Math.floor(step / 16);
  const hits: StepHit[] = [];

  if (scene === 'AMBIENT') {
    // La fiesta detrás de la pared: bombo suave en negras + un golpe grave.
    if (s % 4 === 0) hits.push({ kind: 'kick', vel: s === 0 ? 0.8 : 0.6 });
    if (s === 0 || s === 8) hits.push({ kind: 'rumble', vel: 0.7 });
    return hits;
  }

  if (scene === 'TECH') {
    // 4x4: bombo en cada negra, hi-hat abierto al contratiempo, clap en 2 y 4.
    if (s % 4 === 0) hits.push({ kind: 'kick', vel: 1 });
    if (s % 4 === 2) hits.push({ kind: 'openHat', vel: 0.55 });
    if (s % 2 === 1) hits.push({ kind: 'hat', vel: s % 4 === 1 ? 0.28 : 0.2 });
    if (s === 4 || s === 12) hits.push({ kind: 'clap', vel: 0.75 });
    // Bajo rodante en los contratiempos.
    if (s % 4 === 2) hits.push({ kind: 'bass', vel: 0.8, freq: TECH_BASS[(s >> 2) % TECH_BASS.length] });
    // Un acorde cortito cada dos compases para dar movimiento.
    if (bar % 2 === 1 && (s === 7 || s === 10)) hits.push({ kind: 'pluck', vel: 0.5, freq: s === 7 ? A3 : E4 });
    return hits;
  }

  // PERREO -- dembow: "boom-ch-boom-chick".
  if (s % 4 === 0) hits.push({ kind: 'kick', vel: s % 8 === 0 ? 1 : 0.75 });
  if (s === 3 || s === 11) hits.push({ kind: 'snare', vel: 0.85 });
  if (s === 6 || s === 14) hits.push({ kind: 'snare', vel: 0.55 });
  if (s % 2 === 0) hits.push({ kind: 'hat', vel: 0.22 });
  for (const [at, freq] of PERREO_SUB) {
    if (s === at) hits.push({ kind: 'sub', vel: 0.9, freq });
  }
  if (bar % 2 === 0 && (s === 2 || s === 10)) hits.push({ kind: 'pluck', vel: 0.45, freq: s === 2 ? C4 : G3 });
  return hits;
}

/** Cantidad de barras del ecualizador de las tarjetas de pista. */
export const EQ_BARS = 9;
