import { useMemo } from 'react';
import { Player } from '@remotion/player';
import { MotionVideo } from '@motion/MotionVideo';
import { MOTION_FPS, MOTION_SIZES, motionTimeline, type MotionSpec } from '@shared/motionSpec';

/* Vista previa en vivo: la MISMA composición que se graba a MP4 (motion/),
 * dentro del panel. Cambiar un texto se ve al instante, sin gastar IA. */
export function MotionPreview({
  spec, autoPlay = false, controls = true, className = '', maxHeight = 640,
}: {
  spec: MotionSpec;
  autoPlay?: boolean;
  controls?: boolean;
  className?: string;
  /** Alto máximo en px del cuadro (el ancho sale de la proporción). */
  maxHeight?: number;
}) {
  const size = MOTION_SIZES[spec.format];
  const total = useMemo(() => motionTimeline(spec).total, [spec]);
  const inputProps = useMemo(() => ({ spec }), [spec]);
  return (
    <div className={`mx-auto overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/20 ${className}`} style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight, maxWidth: (maxHeight * size.width) / size.height }}>
      <Player
        component={MotionVideo}
        inputProps={inputProps}
        durationInFrames={Math.max(1, total)}
        fps={MOTION_FPS}
        compositionWidth={size.width}
        compositionHeight={size.height}
        style={{ width: '100%', height: '100%' }}
        controls={controls}
        autoPlay={autoPlay}
        loop
        clickToPlay
      />
    </div>
  );
}
