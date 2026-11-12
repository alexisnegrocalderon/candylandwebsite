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
  // Rejilla en perspectiva que avanza hacia la cámara (SVG: no depende de transformaciones 3D del navegador).
  const horizon = height * 0.56;
  const shift = ((frame * 0.012 * spec.custom.speed) % 1 + 1) % 1;
  const rows = 16;
  const cols = 14;
  const hLines = Array.from({ length: rows }, (_, k) => {
    const u = (k + shift) / rows;
    const y = horizon + (height - horizon) * u * u;
    return <line key={`h${k}`} x1={0} x2={width} y1={y} y2={y} stroke={palette.hero} strokeWidth={3} opacity={Math.min(1, 0.25 + u)} />;
  });
  const vLines = Array.from({ length: cols + 1 }, (_, i) => {
    const x = (width / (cols)) * i;
    return <line key={`v${i}`} x1={width / 2} y1={horizon} x2={x} y2={height} stroke={palette.micro} strokeWidth={2} opacity={0.5} />;
  });
  return (
    <AbsoluteFill style={{ background: palette.bg, overflow: 'hidden' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="horizonGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={palette.hero} stopOpacity={0} />
            <stop offset="1" stopColor={palette.hero} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <rect x={0} y={horizon - 180} width={width} height={180} fill="url(#horizonGlow)" />
        {vLines}
        {hLines}
        <line x1={0} x2={width} y1={horizon} y2={horizon} stroke={palette.hero} strokeWidth={6} />
      </svg>
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
