import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { useMotion } from '../context';
import { useMagazine } from '../layouts';
import { beats, ease, fonts } from '../theme';
import { AccentCircle, BaseFill, clamp, Hairline, type Kit, type WordProps } from './shared';

/* EDITORIAL — revista: fondo neutro o de marca, el círculo de acento, guías
 * finas, y el titular con contraste (palabras chicas + la protagonista enorme)
 * revelado con máscara línea a línea. */

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  // Las formas van donde dice la composición de la escena en pantalla y se deslizan a la siguiente.
  const { geo } = useMagazine();
  const drift = interpolate(frame, [0, 900], [0, -40]);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <BaseFill />
      <AccentCircle x={width * geo.circle.x} y={height * geo.circle.y + drift} r={width * geo.circle.r} delay={2} />
      <AccentCircle x={width * geo.ring.x} y={height * geo.ring.y - drift * 0.5} r={width * geo.ring.r} delay={8} ring color={palette.micro} />
      <Hairline x={84} y={height * 0.18} length={height * 0.64} vertical delay={6} color={palette.micro} opacity={0.25} />
      <Hairline x={84} y={height * 0.82} length={width - 168} delay={10} color={palette.micro} opacity={0.25} />
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const p = interpolate(frame - delay - i * beats.stagger, [0, 18], [0, 1], { easing: ease.out, ...clamp });
  // Las chicas en grotesca, las protagonistas en Syne gruesa: contraste de revista.
  // El acento es el círculo; la palabra grande va en el color del texto (si
  // fuera del mismo color que el círculo, desaparecería encima de él).
  const style: React.CSSProperties = hero
    ? { fontFamily: fonts.syne, fontWeight: 800, letterSpacing: '-0.045em', color: palette.display }
    : { fontFamily: fonts.grotesk, fontWeight: 500, letterSpacing: '-0.02em', color: palette.muted };
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: size * 0.1, marginBottom: -size * 0.1 }}>
      <span style={{ display: 'inline-block', transform: `translateY(${interpolate(p, [0, 1], [110, 0])}%) rotate(${interpolate(p, [0, 1], [3, 0])}deg)`, ...style }}>
        {word}
      </span>
    </span>
  );
};

const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const { palette } = useMotion();
  const y = interpolate(frame, [0, beats.cut], [height, -height], { easing: ease.inOut, ...clamp });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: y, height, background: palette.deep }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 8, background: palette.hero }} />
      </div>
    </AbsoluteFill>
  );
};

export const editorial: Kit = {
  Background,
  Word,
  Cut,
  align: 'left',
  uppercase: false,
  headlineFont: fonts.syne,
  headlineWeight: 800,
  letterSpacing: '-0.04em',
  lineHeight: 0.98,
  contrast: true,
  grade: 0.06,
  grain: 0.07,
  vignette: 0.08,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p, transform: `translateY(${-40 * p}px)` }),
};
