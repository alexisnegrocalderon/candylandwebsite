import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { useMotion } from '../context';
import { beats, ease, fonts } from '../theme';
import { BaseFill, clamp, type Kit, type WordProps } from './shared';

/* POSTER — póster suizo (referencia C del dueño): fondo neutro, letra
 * grotesca gigante en grilla, íconos en las esquinas y un objeto 3D de marca
 * entre las palabras (motion/poster.tsx arma cada escena). */

const Background: React.FC = () => <BaseFill />;

const Word: React.FC<WordProps> = ({ word, i, delay, size }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const p = interpolate(frame - delay - i * beats.stagger, [0, 14], [0, 1], { easing: ease.out, ...clamp });
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: size * 0.06, marginBottom: -size * 0.06 }}>
      <span style={{ display: 'inline-block', color: palette.display, transform: `translateY(${(1 - p) * 102}%)` }}>{word}</span>
    </span>
  );
};

/** Corte de imprenta: el pliego se va hacia arriba y entra el siguiente (8 cuadros). */
const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const { palette } = useMotion();
  const y = interpolate(frame, [2, 10], [height, -height * 0.2], { easing: ease.inOut, ...clamp });
  if (frame < 2 || frame > 11) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: y, height: height * 1.2, background: palette.display }} />
    </AbsoluteFill>
  );
};

export const poster: Kit = {
  Background,
  Word,
  Cut,
  align: 'left',
  uppercase: true,
  headlineFont: fonts.syne,
  headlineWeight: 800,
  letterSpacing: '-0.05em',
  lineHeight: 0.86,
  contrast: false,
  grade: 0.03,
  grain: 0.06,
  vignette: 0.05,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p }),
};
