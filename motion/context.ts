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
}

export const MotionContext = createContext<MotionCtx | null>(null);

export function useMotion(): MotionCtx {
  const ctx = useContext(MotionContext);
  if (!ctx) throw new Error('useMotion fuera de <MotionVideo>');
  return ctx;
}
