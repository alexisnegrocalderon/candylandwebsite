import { Composition } from 'remotion';
import { MOTION_FPS, MOTION_SIZES, motionTimeline, normalizeMotionSpec, starterSpec } from '../shared/motionSpec';
import { MotionVideo, type MotionVideoProps } from './MotionVideo';

/* Raíz para la grabación (scripts/render-studio-video.mjs) y para revisar a
 * mano con `npx remotion studio motion/index.ts`. El tamaño y el largo salen
 * de la receta que llega en inputProps. */
export const MOTION_COMPOSITION_ID = 'Motion';

export const RemotionRoot: React.FC = () => (
  <Composition
    id={MOTION_COMPOSITION_ID}
    component={MotionVideo}
    fps={MOTION_FPS}
    width={1080}
    height={1920}
    durationInFrames={MOTION_FPS * 8}
    defaultProps={{ spec: starterSpec('anuncio', 'liquid') } satisfies MotionVideoProps}
    calculateMetadata={({ props }) => {
      const spec = normalizeMotionSpec(props.spec);
      const { width, height } = MOTION_SIZES[spec.format];
      // Se conserva el resto de las props (p. ej. `slide`, el dibujo quieto del carrusel).
      return { width, height, durationInFrames: motionTimeline(spec).total, props: { ...props, spec } };
    }}
  />
);
