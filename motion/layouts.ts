import { interpolate, useCurrentFrame } from 'remotion';
import { sceneJitter } from '../shared/motionVariety';
import { useMotion } from './context';
import { ease } from './theme';

/* Geometría de las composiciones (shared/motionVariety.ts elige CUÁL toca a
 * cada escena; acá se define QUÉ HACE cada una). Todo en fracciones del
 * cuadro (x del ancho, y del alto, r del ancho), así vale para 9:16, 4:5 y
 * cuadrado. La semilla del video mueve un poco cada forma y a veces la
 * espeja, así dos videos con la misma composición no quedan idénticos. */

export type Anchor = 'top' | 'center' | 'bottom' | 'split';
export type Align = 'left' | 'center' | 'right';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Composición «de revista» (kinetic y editorial): dónde va el bloque de texto y las dos formas. */
export interface MagazineGeometry {
  anchor: Anchor;
  align: Align;
  /** Multiplica el tamaño de la palabra protagonista. */
  heroScale: number;
  circle: Circle;
  ring: Circle;
}

export const MAGAZINE: Record<string, MagazineGeometry> = {
  abajo: { anchor: 'bottom', align: 'left', heroScale: 1, circle: { x: 0.72, y: 0.3, r: 0.34 }, ring: { x: 0.12, y: 0.95, r: 0.42 } },
  arriba: { anchor: 'top', align: 'left', heroScale: 1, circle: { x: 0.7, y: 0.74, r: 0.34 }, ring: { x: 0.92, y: 0.14, r: 0.4 } },
  centro: { anchor: 'center', align: 'left', heroScale: 1.05, circle: { x: 0.26, y: 0.2, r: 0.22 }, ring: { x: 0.9, y: 0.86, r: 0.45 } },
  derecha: { anchor: 'bottom', align: 'right', heroScale: 1, circle: { x: 0.27, y: 0.3, r: 0.32 }, ring: { x: 0.94, y: 0.92, r: 0.4 } },
  gigante: { anchor: 'center', align: 'left', heroScale: 1.5, circle: { x: 0.84, y: 0.13, r: 0.2 }, ring: { x: 0.1, y: 0.86, r: 0.36 } },
  partido: { anchor: 'split', align: 'left', heroScale: 1.1, circle: { x: 0.62, y: 0.5, r: 0.3 }, ring: { x: 0.08, y: 0.12, r: 0.3 } },
};

/** Composición del póster 3D. */
export interface PosterGeometry {
  /** La palabra clave abajo (normal) o arriba (invertido). */
  invert: boolean;
  /** Dónde cae el objeto 3D (fracciones del cuadro) y qué tan grande (× lado menor). */
  object: { x: number; y: number; size: number };
  align: Align;
}

export const POSTER: Record<string, PosterGeometry> = {
  clasico: { invert: false, object: { x: 0.5, y: 0.5, size: 1 }, align: 'left' },
  invertido: { invert: true, object: { x: 0.5, y: 0.52, size: 0.95 }, align: 'left' },
  izquierda: { invert: false, object: { x: 0.3, y: 0.62, size: 1.12 }, align: 'right' },
  derecha: { invert: false, object: { x: 0.72, y: 0.6, size: 1.12 }, align: 'left' },
};

/** Composición de las tarjetas de vidrio. */
export interface SoftUiGeometry {
  cardFirst: boolean;
  /** Tamaño de la tarjeta y del título respecto a lo normal. */
  cardScale: number;
  titleScale: number;
  /** Inclinación 3D de la tarjeta: -1 hacia la izquierda, 1 hacia la derecha, 0 la que corresponde a la escena. */
  tilt: -1 | 0 | 1;
  /** Corrimiento horizontal de la tarjeta (fracción del ancho). */
  shift: number;
}

export const SOFTUI: Record<string, SoftUiGeometry> = {
  arriba: { cardFirst: false, cardScale: 1, titleScale: 1, tilt: 0, shift: 0 },
  abajo: { cardFirst: true, cardScale: 1, titleScale: 1, tilt: 0, shift: 0 },
  centro: { cardFirst: false, cardScale: 1.14, titleScale: 0.72, tilt: 0, shift: 0 },
  izquierda: { cardFirst: false, cardScale: 1.04, titleScale: 1, tilt: -1, shift: -0.05 },
  derecha: { cardFirst: true, cardScale: 1.04, titleScale: 1, tilt: 1, shift: 0.05 },
};

/** Composición del texto en los estilos centrados (liquid y glitch). */
export interface CenteredGeometry {
  v: 'top' | 'center' | 'bottom';
  align: Align;
}

export const CENTERED: Record<string, CenteredGeometry> = {
  centro: { v: 'center', align: 'center' },
  bajo: { v: 'bottom', align: 'center' },
  alto: { v: 'top', align: 'center' },
  izquierda: { v: 'center', align: 'left' },
  derecha: { v: 'center', align: 'right' },
};

/** La forma de la composición, movida un poco por la semilla y a veces espejada (solo las formas, no el texto). */
export function magazineGeometry(layout: string, index: number, seed: number): MagazineGeometry {
  const base = MAGAZINE[layout] ?? MAGAZINE.abajo;
  const j = sceneJitter(seed, index);
  const mirror = j.side === -1;
  const move = (c: Circle, amount: number): Circle => ({
    x: (mirror ? 1 - c.x : c.x) + j.x * amount,
    y: c.y + j.y * amount,
    r: c.r * (1 + j.r * 0.12),
  });
  return { ...base, circle: move(base.circle, 0.035), ring: move(base.ring, 0.05) };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpCircle = (a: Circle, b: Circle, t: number): Circle => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), r: lerp(a.r, b.r, t) });

/** Cuántos cuadros tarda la forma en deslizarse de una composición a la siguiente. */
const GLIDE_FRAMES = 18;

/** Qué escena está en pantalla y cuántos cuadros lleva. Dentro de una escena (`index`) usa su cuadro local; fuera de
 * las escenas (el fondo) la busca en la línea de tiempo (después de la última queda en la última: la firma). */
function useSceneCursor(index?: number): { idx: number; local: number } {
  const frame = useCurrentFrame();
  const { timeline } = useMotion();
  if (index !== undefined) return { idx: index, local: frame };
  const at = timeline.scenes.findIndex((t) => frame >= t.from && frame < t.from + t.frames);
  const idx = at >= 0 ? at : frame < 0 ? 0 : timeline.scenes.length - 1;
  return { idx, local: frame - (timeline.scenes[idx]?.from ?? 0) };
}

const glideT = (local: number) => interpolate(local, [0, GLIDE_FRAMES], [0, 1], { easing: ease.out, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** La geometría «de revista» de la escena. Al empezar una escena, las formas vienen deslizándose desde donde estaban
 * en la anterior (en una lámina quieta ya llegaron). */
export function useMagazine(index?: number): { geo: MagazineGeometry; layout: string; index: number } {
  const { layouts, spec } = useMotion();
  const { idx, local } = useSceneCursor(index);
  const layout = layouts[idx] ?? layouts[0] ?? 'abajo';
  const now = magazineGeometry(layout, idx, spec.seed);
  if (idx === 0) return { geo: now, layout, index: idx };
  const before = magazineGeometry(layouts[idx - 1] ?? layout, idx - 1, spec.seed);
  const t = glideT(local);
  return { geo: { ...now, circle: lerpCircle(before.circle, now.circle, t), ring: lerpCircle(before.ring, now.ring, t) }, layout, index: idx };
}

/** Parámetros numéricos de la escena en pantalla (posiciones de manchas, halos…) que se deslizan de una escena a la siguiente. */
export function useGlide(paramsFor: (index: number) => number[]): number[] {
  const { idx, local } = useSceneCursor();
  const now = paramsFor(idx);
  if (idx === 0) return now;
  const before = paramsFor(idx - 1);
  const t = glideT(local);
  return now.map((v, i) => lerp(before[i] ?? v, v, t));
}
