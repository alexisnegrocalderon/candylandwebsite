import { legibilityFor, type Legibility } from './motionBackdrop';
import { MOTION_FPS, type MotionSpec, type MotionTimeline } from './motionSpec';
import { ZONE_STRIPS, layoutZone } from './motionVariety';

/* Cómo se ve el texto de cada escena sobre el video de fondo: una decisión por escena (claro u oscuro, degradado y contorno)
 * calculada con lo analizado. Lo usan la composición (motion/MotionVideo.tsx) y el panel (para contarte qué decidió). */

export interface BackdropPlan {
  /** Una por escena, en el mismo orden que las escenas. */
  scenes: Legibility[];
  /** La firma del final (null si no lleva). */
  outro: Legibility | null;
  /** Lo que se ve en los bordes de todo el reel (la barra de arriba, el @ de abajo y los subtítulos). */
  edges: Legibility;
}

export function backdropPlan(spec: MotionSpec, timeline: MotionTimeline, layouts: string[], fps = MOTION_FPS): BackdropPlan | null {
  const b = spec.backdrop;
  if (!b || b.adapt === 'apagada') return null;
  const secs = (frames: number) => frames / fps;
  const scenes = timeline.scenes.map((t) => legibilityFor(b, secs(t.from), secs(t.from + t.frames), ZONE_STRIPS[layoutZone(spec.style, layouts[t.index])]));
  const outro = timeline.outroFrom != null ? legibilityFor(b, secs(timeline.outroFrom), secs(timeline.total), ZONE_STRIPS.center) : null;
  // Los bordes (HUD y subtítulos) viven todo el reel: se miran arriba y abajo en toda su duración.
  const edges = legibilityFor(b, 0, secs(timeline.total), [0, 2]);
  return { scenes, outro, edges };
}

/** Una frase para el panel: cuántas escenas llevan texto claro y cuántas oscuro. */
export function describePlan(plan: BackdropPlan): string {
  const light = plan.scenes.filter((s) => s.ink === 'claro').length;
  const dark = plan.scenes.length - light;
  const parts: string[] = [];
  if (light) parts.push(`${light} con texto claro`);
  if (dark) parts.push(`${dark} con texto oscuro`);
  return parts.join(' y ') || 'sin escenas';
}
