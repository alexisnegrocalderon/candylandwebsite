import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, Thumbnail, type PlayerRef } from '@remotion/player';
import { MotionVideo } from '@motion/MotionVideo';
import { isTouchDevice } from './touch';
import { MOTION_FPS, MOTION_SIZES, motionTimeline, type MotionSpec } from '@shared/motionSpec';

/* iPhone: cada vista previa es una composición de 1080×1920 con filtros y capas, y un celular se queda sin memoria si hay
 * varias andando a la vez (Safari cierra la página: «Ocurrió un problema varias veces»). Por eso: (1) las miniaturas de
 * la pantalla de inicio son CUADROS quietos, no videos; (2) cada vista previa se monta solo cuando está a la vista y se
 * desmonta al alejarse; (3) en pantallas táctiles nada parte solo: se da play a una. */

const isTouch = isTouchDevice;

/** true mientras el elemento está (o casi está) en pantalla. */
function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

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
  spec, autoPlay = false, controls = true, className = '', maxHeight = 640, still = false,
}: {
  spec: MotionSpec;
  autoPlay?: boolean;
  controls?: boolean;
  className?: string;
  /** Alto máximo en px del cuadro (el ancho sale de la proporción). */
  maxHeight?: number;
  /** Un cuadro quieto (miniatura) en vez de un video andando: casi no gasta memoria. */
  still?: boolean;
}) {
  const ref = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const size = MOTION_SIZES[spec.format];
  const total = useMemo(() => motionTimeline(spec).total, [spec]);
  const inputProps = useMemo(() => ({ spec }), [spec]);
  // El cuadro de la miniatura: cuando el primer texto ya entró entero.
  const thumbFrame = useMemo(() => {
    const first = motionTimeline(spec).scenes[0];
    return first ? Math.min(total - 1, first.from + Math.round(first.frames * 0.75)) : 0;
  }, [spec, total]);
  const shouldAutoPlay = autoPlay && !isTouch();

  useEffect(() => {
    // El Player se monta solo cuando está a la vista (y no es una miniatura): se engancha cuando aparece.
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
  }, [inView, still]);

  return (
    <div ref={box} className={`mx-auto overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/20 ${className}`} style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight, maxWidth: (maxHeight * size.width) / size.height }}>
      {!inView ? null : still ? (
        <Thumbnail
          component={MotionVideo}
          inputProps={inputProps}
          durationInFrames={Math.max(1, total)}
          fps={MOTION_FPS}
          compositionWidth={size.width}
          compositionHeight={size.height}
          frameToDisplay={thumbFrame}
          style={{ width: '100%', height: '100%' }}
        />
      ) : <Player
        ref={ref}
        component={MotionVideo}
        inputProps={inputProps}
        durationInFrames={Math.max(1, total)}
        fps={MOTION_FPS}
        compositionWidth={size.width}
        compositionHeight={size.height}
        style={{ width: '100%', height: '100%' }}
        controls={controls}
        autoPlay={shouldAutoPlay}
        initiallyMuted
        showVolumeControls={controls}
        loop
        clickToPlay
      />}
    </div>
  );
}
