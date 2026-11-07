import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useMotion } from '../context';
import { beats, ease, fonts, springs } from '../theme';
import { BaseFill, clamp, heroText, type Kit, type WordProps } from './shared';

/* SOFT UI — tarjetas de vidrio flotando (referencia B del dueño): fondo
 * claro con dos brillos suaves de marca, líneas guía punteadas con cruces, y
 * texto en grotesca semibold que sube y se enfoca (motion/softui.tsx arma
 * cada escena con su tarjeta). Única excepción documentada a «sin degradés». */

const Dashed: React.FC<{ vertical?: boolean; at: number; delay: number; color: string }> = ({ vertical, at, delay, color }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 30], [0, 1], { easing: ease.out, ...clamp });
  const line = `repeating-linear-gradient(${vertical ? '180deg' : '90deg'}, ${color} 0 10px, transparent 10px 20px)`;
  return (
    <div
      style={{
        position: 'absolute', background: line, opacity: 0.35,
        ...(vertical ? { left: at, top: 0, width: 2, height: `${p * 100}%` } : { top: at, left: 0, height: 2, width: `${p * 100}%` }),
      }}
    />
  );
};

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const drift = Math.sin(frame / 60) * 30;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <BaseFill />
      <div style={{ position: 'absolute', width: width * 1.2, height: width * 1.2, left: -width * 0.5 + drift, top: -width * 0.35, borderRadius: '50%', background: `radial-gradient(circle, ${palette.accent}55, transparent 62%)` }} />
      <div style={{ position: 'absolute', width: width * 1.3, height: width * 1.3, right: -width * 0.55 - drift, bottom: -width * 0.4, borderRadius: '50%', background: `radial-gradient(circle, ${palette.hero}50, transparent 62%)` }} />
      <Dashed vertical at={width * 0.16} delay={4} color={palette.micro} />
      <Dashed vertical at={width * 0.84} delay={8} color={palette.micro} />
      <Dashed at={height * 0.22} delay={6} color={palette.micro} />
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const p = spring({ frame: frame - delay - i * beats.stagger, fps, config: springs.smooth });
  return (
    <span
      style={{
        display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 28}px)`, filter: `blur(${(1 - p) * 8}px)`,
        ...(hero ? heroText(palette) : { color: palette.display }),
      }}
    >
      {word}
    </span>
  );
};

/** Corte suave: un velo de vidrio que desenfoca y aclara (como cambiar de pantalla en el celular). */
const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const o = interpolate(frame, [0, beats.cut / 2, beats.cut], [0, 0.85, 0], clamp);
  return <AbsoluteFill style={{ pointerEvents: 'none', background: palette.surface, opacity: o * (palette.dark ? 0.25 : 0.7), backdropFilter: `blur(${o * 24}px)` }} />;
};

export const softui: Kit = {
  Background,
  Word,
  Cut,
  align: 'center',
  uppercase: false,
  headlineFont: fonts.grotesk,
  headlineWeight: 600,
  letterSpacing: '-0.035em',
  lineHeight: 1.02,
  contrast: false,
  grade: 0.02,
  grain: 0.05,
  vignette: 0.04,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p, transform: `scale(${1 - 0.05 * p})`, filter: `blur(${p * 8}px)` }),
};
