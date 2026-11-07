import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { sceneJitter } from '../../shared/motionVariety';
import { useMotion } from '../context';
import { useGlide } from '../layouts';
import { beats, fonts, rand } from '../theme';
import { BaseFill, heroText, type Kit, type WordProps } from './shared';

/* GLITCH — energía de fiesta, pero limpio: grotesca en mayúsculas, la señal
 * se rompe solo al entrar y en pulsos cortos; el resto del tiempo, quieto. */

/** ¿Hay pulso de glitch en este cuadro? Uno cada ~2 s, 3 cuadros. */
function glitchPulse(frame: number): number {
  const slot = Math.floor(frame / 60);
  const at = slot * 60 + 20 + Math.floor(rand(slot + 3) * 30);
  return frame >= at && frame < at + 3 ? 1 - (frame - at) / 3 : 0;
}

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette, spec } = useMotion();
  const pulse = glitchPulse(frame);
  // El halo de color cambia de lugar con la semilla y se desliza al cambiar de escena.
  const [hx, hy] = useGlide((i) => { const j = sceneJitter(spec.seed, i); return [0.5 + j.x * 0.22, 0.5 + j.y * 0.22]; });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <BaseFill />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${palette.micro}14 1px, transparent 1px), linear-gradient(90deg, ${palette.micro}14 1px, transparent 1px)`,
          backgroundSize: '90px 90px',
          backgroundPosition: `0 ${(frame * 1.2) % 90}px`,
        }}
      />
      <div
        style={{
          position: 'absolute', width: width * 1.1, height: width * 1.1, left: width * hx - width * 0.55, top: height * hy - width * 0.55,
          borderRadius: '50%', background: `radial-gradient(circle, ${palette.hero}40, transparent 62%)`,
          transform: `scale(${1 + Math.sin(frame / 22) * 0.04})`,
        }}
      />
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 5px)' }} />
      {pulse > 0 &&
        Array.from({ length: 3 }, (_, k) => (
          <div
            key={k}
            style={{
              position: 'absolute', left: 0, right: 0, top: height * rand(frame * 3 + k), height: 8 + rand(frame + k * 7) * 40,
              background: k % 2 ? palette.accent : palette.hero, opacity: 0.45 * pulse,
              transform: `translateX(${(rand(frame + k) - 0.5) * 160}px)`,
            }}
          />
        ))}
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const local = frame - delay - i * beats.stagger;
  if (local < 0) return <span style={{ display: 'inline-block', opacity: 0 }}>{word}</span>;
  const entering = Math.max(0, 1 - local / 6);
  const shake = Math.max(entering, glitchPulse(frame + i * 5) * 0.5);
  const dx = (rand(frame * 13 + i) - 0.5) * size * 0.35 * shake;
  const split = size * 0.06 * shake;
  const visible = entering > 0.5 ? rand(frame + i * 31) > 0.3 : true;
  const base: React.CSSProperties = hero ? heroText(palette) : { color: palette.display };
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: visible ? 1 : 0,
        transform: `translateX(${dx}px) skewX(${-10 * shake}deg)`,
        ...base,
        ...(split > 0.5 && !base.backgroundImage ? { textShadow: `${-split}px 0 0 ${palette.hero}, ${split}px 0 0 ${palette.accent}` } : {}),
      }}
    >
      {word}
    </span>
  );
};

const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const mid = beats.cut / 2;
  if (Math.abs(frame - mid) > 2) return null;
  const slices = 7;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {frame === mid && <AbsoluteFill style={{ backgroundColor: palette.display, opacity: 0.7 }} />}
      {Array.from({ length: slices }, (_, k) => (
        <div
          key={k}
          style={{
            position: 'absolute', left: 0, width, top: (height / slices) * k, height: height / slices + 1,
            background: [palette.hero, palette.accent, palette.bg, palette.display][k % 4],
            opacity: rand(frame * 7 + k) > 0.5 ? 0.85 : 0,
            transform: `translateX(${(rand(frame * 11 + k) - 0.5) * width * 0.6}px)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

export const glitch: Kit = {
  Background,
  Word,
  Cut,
  align: 'center',
  uppercase: true,
  headlineFont: fonts.grotesk,
  headlineWeight: 700,
  letterSpacing: '-0.035em',
  lineHeight: 0.94,
  contrast: false,
  grade: 0.14,
  grain: 0.09,
  vignette: 0.26,
  cutSfx: 'glitch',
  exitStyle: () => ({}),
};
