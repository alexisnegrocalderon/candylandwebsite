// Tema único del Estudio Motion (regla 9 de la skill remotion-motion-graphics):
// curvas, resortes, fuentes y medidas. Ningún componente escribe un color,
// una curva o un resorte a mano: los colores salen de motionPalette
// (shared/motionSpec.ts), que solo conoce los de marca.
import { Easing } from 'remotion';

export const ease = {
  /** Entradas (easeOutExpo). */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** Movimientos y Ken Burns (easeInOutQuint). */
  inOut: Easing.bezier(0.83, 0, 0.17, 1),
  /** Solo salidas. */
  in: Easing.bezier(0.7, 0, 0.84, 0),
} as const;

export const springs = {
  snappy: { damping: 14, stiffness: 160, mass: 0.6 },
  smooth: { damping: 20, stiffness: 90, mass: 1 },
  bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
  heavy: { damping: 18, stiffness: 120, mass: 1.4 },
} as const;

export const fonts = {
  /** Letra «candy bubble» de la marca (estilos liquid). */
  display: "'Gliker Semi Bold Expanded', 'Unbounded', sans-serif",
  body: "'Unbounded', sans-serif",
  /** Grotesca editorial (la del sitio): titulares de revista y póster. */
  grotesk: "'Space Grotesk', 'Inter', sans-serif",
  /** Display editorial ancha (la de los títulos del sitio). */
  syne: "'Syne', 'Space Grotesk', sans-serif",
  ui: "'Inter', sans-serif",
  script: "'Allura', cursive",
  numbers: "'Anton', 'Unbounded', sans-serif",
} as const;

/** Escala tipográfica (px a 1080 de ancho). Contraste grande = look editorial. */
export const type = {
  micro: 20,
  s: 30,
  m: 48,
  l: 96,
  xl: 168,
  xxl: 300,
} as const;

/** Archivos de fuente (client/public/studio/fonts, los mismos del Estudio de siempre). */
export const FONT_FILES: Array<{ family: string; file: string; weight?: string }> = [
  { family: 'Gliker Semi Bold Expanded', file: 'studio/fonts/gliker-semibold-expanded.ttf', weight: '600' },
  { family: 'Unbounded', file: 'studio/fonts/unbounded.woff2', weight: '200 900' },
  { family: 'Inter', file: 'studio/fonts/inter.woff2', weight: '100 900' },
  { family: 'Allura', file: 'studio/fonts/allura.woff2', weight: '400' },
  { family: 'Anton', file: 'studio/fonts/Anton-Regular.ttf', weight: '400' },
  { family: 'Space Grotesk', file: 'fonts/space-grotesk-variable.woff2', weight: '300 700' },
  { family: 'Syne', file: 'fonts/syne-variable.woff2', weight: '400 800' },
];

/** Cuadros de cada movimiento, a 30 fps. Salidas más rápidas que entradas (regla 4). */
export const beats = {
  stagger: 3,
  enter: 20,
  exit: 9,
  cut: 12,
} as const;

/** Zona segura: Instagram tapa ~250 px arriba y abajo en 9:16. */
export function safeInsets(width: number, height: number) {
  const tall = height / width > 1.5;
  return { top: tall ? 270 : 90, bottom: tall ? 300 : 90, side: 84 };
}

/** Pseudoazar estable (mismo cuadro → mismo resultado, en vista previa y grabación). */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
