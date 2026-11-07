import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND } from '../../shared/motionSpec';
import { sceneJitter } from '../../shared/motionVariety';
import { useMotion } from '../context';
import { useGlide } from '../layouts';
import { beats, ease, fonts, rand, springs } from '../theme';
import { BaseFill, blobPath, bubbleShadow, clamp, heroText, useSvgId, type Kit, type WordProps } from './shared';

/* LIQUID — la letra «candy bubble» de la marca, pulida: dos manchas grandes y
 * lentas (no seis), pocas burbujas finas, y el titular con volumen. */

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette, spec } = useMotion();
  const blurId = useSvgId('liq-blur');
  // Las dos manchas cambian de lado y de altura con la semilla y se deslizan al cambiar de escena.
  const [x1, y1, r1, x2, y2, r2] = useGlide((i) => {
    const j = sceneJitter(spec.seed, i);
    return [0.5 + j.side * 0.45, 0.12 + 0.3 * (j.y * 0.5 + 0.5), 0.4 + 0.08 * j.r, 0.5 - j.side * 0.45, 0.7 + 0.25 * (j.x * 0.5 + 0.5), 0.5 + 0.08 * j.r];
  });
  const blobs = [
    { x: x1, y: y1, r: r1, color: palette.hero, o: palette.dark ? 0.35 : 0.42, s: 4 },
    // En fondos claros (perla, niebla) la segunda mancha es el acento, no un gris.
    { x: x2, y: y2, r: r2, color: palette.display === BRAND.graphite ? palette.accent : palette.display, o: palette.dark ? 0.08 : 0.2, s: 9 },
  ];
  return (
    <AbsoluteFill>
      <BaseFill />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="40" /></filter>
        </defs>
        {blobs.map((b, k) => (
          <path
            key={k}
            d={blobPath(width * b.x + Math.sin(frame / (80 + k * 20)) * 40, height * b.y + Math.cos(frame / (95 + k * 10)) * 50, width * b.r, frame, b.s)}
            fill={b.color}
            opacity={b.o}
            filter={`url(#${blurId})`}
          />
        ))}
        {Array.from({ length: 5 }, (_, k) => {
          const speed = 0.5 + rand(k) * 0.7;
          const y = height + 80 - ((frame * speed * 3 + rand(k + 20) * height * 1.4) % (height + 160));
          const x = width * (0.08 + 0.84 * rand(k + 40)) + Math.sin(frame / 25 + k) * 12;
          return <circle key={`b${k}`} cx={x} cy={y} r={10 + rand(k + 60) * 18} fill="none" stroke={palette.display} strokeOpacity={0.3} strokeWidth={2} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const p = spring({ frame: frame - delay - i * beats.stagger, fps, config: springs.bouncy });
  const depth = Math.max(3, Math.round(size / 30));
  const fill: React.CSSProperties = hero && palette.heroFill.startsWith('linear') ? heroText(palette) : {
    color: hero ? palette.hero : palette.display,
    textShadow: bubbleShadow(hero ? palette.deep : palette.shadow, depth),
  };
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: interpolate(p, [0, 0.4], [0, 1], clamp),
        transform: `translateY(${interpolate(p, [0, 1], [size * 0.5, 0])}px) scale(${interpolate(p, [0, 1], [0.72, 1])})`,
        filter: `blur(${interpolate(p, [0, 0.7], [12, 0], clamp)}px)`,
        ...fill,
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
  grade: 0.1,
  grain: 0.06,
  vignette: 0.12,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p, transform: `scale(${1 - 0.08 * p})`, filter: `blur(${p * 10}px)` }),
};
