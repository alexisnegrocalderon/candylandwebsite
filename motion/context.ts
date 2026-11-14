import { createContext, useContext } from 'react';
import type { MotionPalette, MotionSpec, MotionTimeline } from '../shared/motionSpec';
import type { ResolvedLook } from '../shared/motionVariety';

export interface MotionCtx {
  spec: MotionSpec;
  palette: MotionPalette;
  timeline: MotionTimeline;
  width: number;
  height: number;
  /** El texto grande deja espacio abajo para los subtítulos. */
  captionsOn: boolean;
  /** Composición de cada escena (shared/motionVariety.ts → resolveLayouts), en el orden de las escenas. */
  layouts: string[];
  /** El look del video ya resuelto (shared/motionVariety.ts → resolveLook): transición, entrada, trama, adornos, cámara y etiqueta. */
  look: ResolvedLook;
  /** Dibujo de una lámina quieta del pack (carrusel, post, historia); null = video. */
  slide: MotionSlideInfo | null;
}

export interface MotionSlideInfo {
  /** Posición de la lámina (0 = primera) y cuántas hay. */
  index: number;
  total: number;
  /** Carrusel con más láminas a la derecha: muestra «Desliza». */
  swipe: boolean;
  /** Es una lámina de carrusel (varias seguidas): las formas cruzan el borde hacia la lámina vecina. */
  thread: boolean;
}

export const MotionContext = createContext<MotionCtx | null>(null);

export function useMotion(): MotionCtx {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error('useMotion fuera de <MotionVideo>');
  return ctx;
}
