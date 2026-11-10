import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
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
    return { x: width * rand(k), y, r: 50 + rand(k + 60) * 160, blur: 4 + (1 - depth) * 22, o: 0.05 + depth * 0.08 };
  });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: `linear-gradient(180deg, ${palette.bg}, ${palette.bg2})` }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 52% at ${cx}px ${cy}px, ${palette.hero}77 0%, transparent 70%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 85% 75% at 50% 45%, transparent 48%, rgba(0,8,40,0.6) 100%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: height * 0.5 + Math.sin(frame / 60) * 40, height: 6, background: 'linear-gradient(90deg, transparent 0%, rgba(190,235,255,0.85) 50%, transparent 100%)', opacity: 0.35 + 0.25 * Math.sin(frame / 22), filter: 'blur(1px)' }} />
      {bokeh.map((b, k) => (
        <div key={k} style={{ position: 'absolute', left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: '50%', background: `radial-gradient(circle, ${palette.display} 0%, ${palette.display}00 70%)`, opacity: b.o, filter: `blur(${b.blur}px)` }} />
      ))}
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette, spec } = useMotion();
  // Mezcla tipográfica: la palabra protagonista usa una fuente de contraste (Anton o Syne), elegida por la semilla del video.
  const contrast = spec.seed % 2 === 0 ? { family: "'Anton', sans-serif", weight: 400, upper: true, scale: 1.25 } : { family: "'Syne', sans-serif", weight: 800, upper: false, scale: 1.15 };
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
        filter: `blur(${interpolate(p, [0, 0.8], [10, 0], clamp)}px) drop-shadow(-1px -2px 0 rgba(255,255,255,0.7)) drop-shadow(0 ${Math.round(size * 0.06)}px ${Math.round(size * 0.1)}px rgba(0,8,50,0.55))`,
        color: base,
        ...(hero ? { fontFamily: contrast.family, fontWeight: contrast.weight, fontSize: size * contrast.scale, textTransform: contrast.upper ? 'uppercase' : 'none' } : {}),
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

/* Foto enmarcada como burbuja de marca: marco blanco brillante, luz de la misma banda y sombra suave. */
const Framed: React.FC<{ media: { url: string; kind: 'image' | 'video' }; index: number; frames: number }> = ({ media, frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const p = interpolate(frame, [0, frames], [0, 1], { ...clamp });
  const float = Math.sin(frame / 38) * 14;
  const w = Math.round(width * 0.66);
  const h = Math.round(w * 1.18);
  const sweep = ((frame * 1.1) % 170) - 35;
  return (
    <div style={{ position: 'absolute', left: (width - w) / 2, top: height * 0.5 - h / 2 + float, width: w, height: h, borderRadius: 64, background: 'rgba(255,255,255,0.92)', padding: 14, boxSizing: 'border-box', transform: `scale(${1 + 0.03 * p})`, filter: `drop-shadow(0 26px 40px rgba(0,8,50,0.45))` }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 52, overflow: 'hidden', background: palette.bg }}>
        <Img src={media.url} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.06) contrast(1.05)' }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${sweep - 9}%, rgba(255,255,255,0.45) ${sweep}%, transparent ${sweep + 9}%)` }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 85% 75% at 50% 45%, transparent 55%, rgba(0,8,40,0.45) 100%)' }} />
      </div>
    </div>
  );
};

export const liquid: Kit = {
  Background,
  Word,
  Cut,
  Framed,
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
