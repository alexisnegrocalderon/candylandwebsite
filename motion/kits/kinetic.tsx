import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { useMotion } from '../context';
import { ease, fonts } from '../theme';
import { editorial } from './editorial';
import { BaseFill, clamp, Hairline, type Kit } from './shared';

/* KINETIC — tipografía cinética editorial para hablar de temas (referencia A
 * del dueño). El fondo es casi nada: color plano y guías de construcción. Lo
 * que se mueve es el texto (motion/kinetic.tsx arma cada escena). */

const Background: React.FC = () => {
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  return (
    <AbsoluteFill>
      <BaseFill />
      {/* Guías de construcción, como un pliego de diseño. */}
      <Hairline x={width * 0.5} y={0} length={height} vertical delay={0} color={palette.micro} opacity={0.07} />
      <Hairline x={84} y={0} length={height} vertical delay={4} color={palette.micro} opacity={0.07} />
      <Hairline x={width - 84} y={0} length={height} vertical delay={8} color={palette.micro} opacity={0.07} />
      <Hairline x={0} y={height * 0.62} length={width} delay={12} color={palette.micro} opacity={0.07} />
    </AbsoluteFill>
  );
};

/** Corte: una barra del color protagonista cruza rápido (4 cuadros) y tapa el cambio. */
const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const { palette } = useMotion();
  const x = interpolate(frame, [3, 9], [-width, width], { easing: ease.inOut, ...clamp });
  if (frame < 3 || frame > 9) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: x, width, background: palette.heroFill }} />
    </AbsoluteFill>
  );
};

export const kinetic: Kit = {
  ...editorial,
  Background,
  Cut,
  headlineFont: fonts.syne,
  grade: 0.04,
  grain: 0.08,
  vignette: 0.06,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p }),
};

/** Lo que dura la entrada de cada palabra según cuántas hay (más palabras = más rápido). */
export function kineticPace(words: number, frames: number): number {
  return Math.max(3, Math.min(8, Math.floor((frames * 0.4) / Math.max(1, words))));
}

