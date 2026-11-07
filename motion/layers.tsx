import { AbsoluteFill, Img, interpolate, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionMedia } from '../shared/motionSpec';
import { useMotion } from './context';
import { ease } from './theme';

/* Las capas que van en TODA escena (regla 5 de la skill): fondo → fotos →
 * gráfica y texto → grade → grano y viñeta. */

const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.07 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        backgroundImage: NOISE,
        backgroundSize: '220px',
        backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`,
        opacity,
        mixBlendMode: 'overlay',
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.2 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,${strength}) 100%)` }} />
);

/** Une fotos y gráfica en un solo look: tinte del color de fondo + luz arriba/sombra abajo. */
export const Grade: React.FC<{ opacity?: number }> = ({ opacity = 0.14 }) => {
  const { palette } = useMotion();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ backgroundColor: palette.bg, mixBlendMode: 'soft-light', opacity }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 30%, transparent 70%, rgba(0,0,0,0.14))' }} />
    </AbsoluteFill>
  );
};

/** Foto o clip a todo el cuadro. Las fotos siempre con Ken Burns (regla 6),
 * alternando acercar/alejar entre escenas; los clips con OffthreadVideo. */
export const MediaLayer: React.FC<{ media: MotionMedia; index: number; frames: number; dim?: number }> = ({ media, index, frames, dim = 0.32 }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const zoomIn = index % 2 === 0;
  const p = interpolate(frame, [0, frames], [0, 1], { easing: ease.inOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scale = zoomIn ? 1 + 0.1 * p : 1.1 - 0.1 * p;
  const pan = (index % 3 === 1 ? -1 : 1) * 24 * p;
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `scale(${scale}) translateX(${pan}px)`,
    filter: 'saturate(1.08) contrast(1.06)',
  };
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {media.kind === 'video' ? <OffthreadVideo src={media.url} muted style={style} /> : <Img src={media.url} style={style} />}
      {/* Tinte de marca y sombra abajo: el texto se lee sobre cualquier foto. */}
      <AbsoluteFill style={{ backgroundColor: palette.bg, mixBlendMode: 'multiply', opacity: 0.28 }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,${dim * 0.4}) 0%, transparent 35%, rgba(0,0,0,${dim}) 70%, rgba(0,0,0,${dim + 0.2}) 100%)` }} />
    </AbsoluteFill>
  );
};

/** Escena entera sale más rápido de lo que entró (regla 4). */
export function useExit(frames: number, length = 9): number {
  const frame = useCurrentFrame();
  return interpolate(frame, [frames - length, frames - 1], [0, 1], { easing: ease.in, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

/** Respiración de lo que queda quieto más de 2 s (regla 7). */
export function useBreathe(speed = 22, amount = 0.012): number {
  const frame = useCurrentFrame();
  return 1 + Math.sin(frame / speed) * amount;
}

export function useFps(): number {
  return useVideoConfig().fps;
}
