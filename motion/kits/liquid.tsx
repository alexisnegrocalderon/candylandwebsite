import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND } from '../../shared/motionSpec';
import { sceneJitter } from '../../shared/motionVariety';
import { useMotion } from '../context';
import { useGlide } from '../layouts';
import { beats, ease, fonts, rand, springs } from '../theme';
import { BaseFill, blobPath, clamp, useSvgId, type Kit, type WordProps } from './shared';

/* LIQUID — la letra «candy bubble» de la marca, pulida: dos manchas grandes y
 * lentas (no seis), pocas burbujas finas, y el titular con volumen. */

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette, spec } = useMotion();
  // El resplandor principal cambia de lugar con la semilla y se desliza al cambiar de escena.
  const [x1, y1] = useGlide((i) => {
    const j = sceneJitter(spec.seed, i);
    return [0.5 + j.side * 0.25, 0.3 + 0.12 * (j.y * 0.5 + 0.5), 0, 0, 0, 0];
  });
  const cy = height * (y1 + 0.02 * Math.sin(frame / 120));
  const cx = width * (x1 + 0.02 * Math.cos(frame / 150));
  // Reflejos suaves a distintas profundidades: los lejanos más borrosos y tenues (profundidad de campo).
  const bokeh = Array.from({ length: 16 }, (_, k) => {
    const depth = rand(k + 90);
    const span = height + 480;
    const y = (((height * rand(k + 30) - frame * (0.4 + depth * 1.1)) % span) + span) % span - 240;
    return { x: width * rand(k), y, r: 50 + rand(k + 60) * 160, blur: 4 + (1 - depth) * 22, o: 0.1 + depth * 0.16 };
  });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: `linear-gradient(180deg, ${palette.bg}, ${palette.bg2})` }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 52% at ${cx}px ${cy}px, ${palette.hero}66 0%, transparent 72%)` }} />
      {bokeh.map((b, k) => (
        <div key={k} style={{ position: 'absolute', left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: '50%', background: `radial-gradient(circle, ${palette.display} 0%, ${palette.display}00 70%)`, opacity: b.o, filter: `blur(${b.blur}px)` }} />
      ))}
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  // Entrada suave: sin rebote exagerado, con un solo desenfoque que enfoca la letra.
  const p = spring({ frame: frame - delay - i * beats.stagger, fps, config: { damping: 24, stiffness: 110 } });
  const base = hero ? palette.hero : palette.display;
  // Banda de luz que cruza cada palabra despacio (como una luz de cine sobre el titular).
  const sweep = ((frame * 1.1 + i * 26) % 170) - 35;
  const light = `linear-gradient(105deg, transparent ${sweep - 9}%, rgba(255,255,255,0.75) ${sweep}%, transparent ${sweep + 9}%)`;
  const volume = 'linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 46%, rgba(0,20,90,0.22) 100%)';
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: interpolate(p, [0, 0.5], [0, 1], clamp),
        transform: `translateY(${interpolate(p, [0, 1], [size * 0.2, 0])}px) scale(${interpolate(p, [0, 1], [0.92, 1])})`,
        filter: `blur(${interpolate(p, [0, 0.8], [10, 0], clamp)}px) drop-shadow(0 ${Math.round(size * 0.05)}px ${Math.round(size * 0.12)}px rgba(0,12,70,0.35))`,
        color: base,
        backgroundImage: `${light}, ${volume}, linear-gradient(${base}, ${base})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
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
  const maskId = useSvgId('liq-hole');
  const half = beats.cut / 2;
  const diag = Math.hypot(width, height);
  const grow = interpolate(frame, [0, half], [0, diag * 0.62], { easing: ease.in, ...clamp });
  const hole = interpolate(frame, [half, beats.cut], [0, diag * 0.62], { easing: ease.out, ...clamp });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height}>
        <defs>
          <mask id={maskId}>
            <rect width={width} height={height} fill="white" />
            {frame >= half && <path d={blobPath(width / 2, height * 0.42, hole, frame * 6, 3)} fill="black" />}
          </mask>
        </defs>
        <path d={blobPath(width / 2, height * 0.58, frame < half ? grow : diag, frame * 6, 1)} fill={palette.hero} mask={`url(#${maskId})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const liquid: Kit = {
  Background,
  Word,
  Cut,
  align: 'center',
  uppercase: false,
  headlineFont: fonts.display,
  headlineWeight: 600,
  letterSpacing: '-0.03em',
  lineHeight: 1.04,
  contrast: false,
  grade: 0.2,
  grain: 0.09,
  vignette: 0.32,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p, transform: `scale(${1 - 0.08 * p})`, filter: `blur(${p * 10}px)` }),
};
