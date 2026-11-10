import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useMotion } from '../context';
import type { MotionCustomBg, MotionCustomFont } from '../../shared/motionSpec';
import { kinetic } from './kinetic';
import { clamp, type Kit, type WordProps } from './shared';

/* Estilo «Personalizado» (admin → Estudio): el look lo elige quien crea el
 * video. Fondo, fuente, entrada y velocidad salen de spec.custom
 * (shared/motionSpec.ts). Colores: los de la base y el acento de la marca. */

const FAMILY: Record<MotionCustomFont, string> = {
  unbounded: 'Unbounded',
  gliker: 'Gliker Semi Bold Expanded',
  anton: 'Anton',
  syne: 'Syne',
  grotesk: 'Space Grotesk',
  inter: 'Inter',
  allura: 'Allura',
};
const WEIGHT: Record<MotionCustomFont, number> = { unbounded: 800, gliker: 600, anton: 400, syne: 800, grotesk: 700, inter: 800, allura: 400 };

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { spec, palette } = useMotion();
  const bg: MotionCustomBg = spec.custom.bg;
  if (bg === 'solido') return <AbsoluteFill style={{ background: palette.bg }} />;
  if (bg === 'degradado') return <AbsoluteFill style={{ background: `linear-gradient(180deg, ${palette.bg}, ${palette.bg2})` }} />;
  if (bg === 'sol') {
    const stripe = (frame * 2 * spec.custom.speed) % 40;
    const mask = `repeating-linear-gradient(180deg, transparent 0 ${20 + stripe}px, #000 ${20 + stripe}px ${44 + stripe}px)`;
    return (
      <AbsoluteFill style={{ background: palette.bg, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: width / 2 - 260, top: height * 0.52, width: 520, height: 520, borderRadius: '50%', background: `linear-gradient(${palette.hero}, ${palette.bg2})`, opacity: 0.85, WebkitMaskImage: mask, maskImage: mask }} />
      </AbsoluteFill>
    );
  }
  // rejilla en perspectiva que avanza
  const shift = (frame * 6 * spec.custom.speed) % 160;
  return (
    <AbsoluteFill style={{ background: palette.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', perspective: 420, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: '-60% -40% 0 -40%',
          backgroundImage: `linear-gradient(${palette.hero} 4px, transparent 4px), linear-gradient(90deg, ${palette.micro} 4px, transparent 4px)`,
          backgroundSize: '140px 160px', backgroundPosition: `0 ${shift}px`,
          transform: 'rotateX(64deg)', transformOrigin: '50% 0%',
        }} />
      </div>
    </AbsoluteFill>
  );
};

/** Entrada de cada palabra: elástica, pixelada o deslizando desde abajo, a la velocidad elegida. */
const Word: React.FC<WordProps> = ({ word, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec, palette } = useMotion();
  const c = spec.custom;
  const t = Math.max(0, (frame - delay) * c.speed);
  let transform = 'none';
  let opacity = 1;
  if (c.entry === 'elastica') {
    const p = spring({ frame: t, fps, config: { damping: 10, stiffness: 190 } });
    transform = `scale(${0.4 + 0.6 * p})`;
    opacity = interpolate(t, [0, 3], [0, 1], clamp);
  } else if (c.entry === 'pixel') {
    const s = Math.floor(interpolate(t, [0, 10], [0, 1], clamp) * 5) / 5;
    transform = `translateY(${(1 - s) * 40}px)`;
    opacity = s > 0 ? 1 : 0;
  } else {
    const p = interpolate(t, [0, 12], [0, 1], clamp);
    transform = `translateY(${(1 - p) * 90}px)`;
    opacity = p;
  }
  const family = FAMILY[c.font];
  return (
    <span style={{
      display: 'inline-block', margin: '0 0.12em', transform, opacity,
      fontFamily: `'${family}', sans-serif`, fontWeight: WEIGHT[c.font], fontSize: size,
      color: hero ? palette.hero : palette.display, textShadow: hero ? `0 0 28px ${palette.hero}` : undefined,
      textTransform: c.uppercase ? 'uppercase' : 'none', lineHeight: 1.02,
    }}>
      {word}
    </span>
  );
};

export const custom: Kit = {
  Background,
  Word,
  Cut: kinetic.Cut,
  align: 'center',
  uppercase: true,
  headlineFont: `'Unbounded', sans-serif`,
  headlineWeight: 800,
  letterSpacing: '-0.02em',
  lineHeight: 1.02,
  contrast: false,
  grade: 0.1,
  grain: 0.05,
  vignette: 0.25,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p, transform: `scale(${1 + p * 0.1})` }),
};
