import { useEffect, useMemo, useRef } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { MotionVideo } from '@motion/MotionVideo';
import { MOTION_FPS, MOTION_SIZES, motionTimeline, type MotionSpec } from '@shared/motionSpec';

/* Vista previa en vivo: la MISMA composición que se graba a MP4 (motion/),
 * dentro del panel. Cambiar un texto se ve al instante, sin gastar IA.
 *
 * Sonido: todas parten en silencio. Cuando el dueño le sube el volumen a
 * una, las demás de la pantalla se silencian solas (nunca suenan dos). */

const players = new Set<PlayerRef>();

function soloSound(active: PlayerRef) {
  players.forEach((p) => { if (p !== active && !p.isMuted()) p.mute(); });
}

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
  const ref = useRef<PlayerRef>(null);
  const size = MOTION_SIZES[spec.format];
  const total = useMemo(() => motionTimeline(spec).total, [spec]);
  const inputProps = useMemo(() => ({ spec }), [spec]);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    players.add(player);
    const onMute = (e: { detail: { isMuted: boolean } }) => {
      if (!e.detail.isMuted) soloSound(player);
    };
    // Si se da play a una que tiene sonido, las otras con sonido se callan.
    const onPlay = () => {
      if (!player.isMuted()) soloSound(player);
    };
    player.addEventListener('mutechange', onMute);
    player.addEventListener('play', onPlay);
    return () => {
      player.removeEventListener('mutechange', onMute);
      player.removeEventListener('play', onPlay);
      players.delete(player);
    };
  }, []);

  return (
    <div className={`mx-auto overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/20 ${className}`} style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight, maxWidth: (maxHeight * size.width) / size.height }}>
      <Player
        ref={ref}
        component={MotionVideo}
        inputProps={inputProps}
        durationInFrames={Math.max(1, total)}
        fps={MOTION_FPS}
        compositionWidth={size.width}
        compositionHeight={size.height}
        style={{ width: '100%', height: '100%' }}
        controls={controls}
        autoPlay={autoPlay}
        initiallyMuted
        showVolumeControls={controls}
        loop
        clickToPlay
      />
    </div>
  );
}
