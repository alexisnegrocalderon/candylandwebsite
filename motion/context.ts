import { createContext, useContext } from 'react';
import type { MotionPalette, MotionSpec, MotionTimeline } from '../shared/motionSpec';

export interface MotionCtx {
  spec: MotionSpec;
  palette: MotionPalette;
  timeline: MotionTimeline;
  width: number;
  height: number;
  /** El texto grande deja espacio abajo para los subtítulos. */
  captionsOn: boolean;
  /** Dibujo de una lámina quieta del pack (carrusel, post, historia); null = video. */
  slide: MotionSlideInfo | null;
}

export interface MotionSlideInfo {
  /** Posición de la lámina (0 = primera) y cuántas hay. */
  index: number;
  total: number;
  /** Carrusel con más láminas a la derecha: muestra «Desliza». */
  swipe: boolean;
}

export const MotionContext = createContext<MotionCtx | null>(null);

export function useMotion(): MotionCtx {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error('useMotion fuera de <MotionVideo>');
  return ctx;
}
