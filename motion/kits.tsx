import { useId } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionPalette, MotionStyle } from '../shared/motionSpec';
import { useMotion } from './context';
import { beats, ease, fonts, springs } from './theme';

/* Los tres estilos del Estudio Motion. Cada kit trae su fondo, cómo entra
 * cada palabra, la transición entre escenas y cuánto grade/grano lleva. Las
 * plantillas (scenes.tsx) no saben de estilos: le piden todo al kit. */

/** Pseudoazar estable (mismo cuadro → mismo resultado, en vista previa y grabación). */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export interface WordProps {
  word: string;
  /** Posición de la palabra en el titular (para el escalonado). */
  i: number;
  delay: number;
  hero: boolean;
  size: number;
}

export interface Kit {
  Background: React.FC;
  Word: React.FC<WordProps>;
  /** Transición de `beats.cut` cuadros, centrada en el corte. */
  Cut: React.FC;
  align: 'center' | 'left';
  uppercase: boolean;
  headlineFont: string;
  lineHeight: number;
  grade: number;
  grain: number;
  vignette: number;
  cutSfx: 'whoosh' | 'glitch';
  /** Cómo sale la escena (0 → 1). */
  exitStyle: (p: number) => React.CSSProperties;
}

/** Letra «candy bubble» de la marca: relleno sólido + volumen extruido + brillo. */
export function bubbleShadow(shadow: string, depth: number): string {
  const layers: string[] = [];
  for (let d = 1; d <= depth; d++) layers.push(`0 ${d * 2}px 0 ${shadow}`);
  layers.push(`0 ${depth * 2 + 10}px ${depth * 4}px rgba(0,0,0,0.22)`);
  return layers.join(', ');
}

function wordColors(p: MotionPalette, hero: boolean) {
  return hero ? { color: p.hero, shadow: p.hero === p.display ? p.shadow : p.deep } : { color: p.display, shadow: p.shadow };
}

/* --- LIQUID --------------------------------------------------------------- */

/** Contorno de una mancha líquida: radio que ondula con el tiempo, curva suave. */
export function blobPath(cx: number, cy: number, r: number, t: number, seed: number, points = 8): string {
  const pts = Array.from({ length: points }, (_, k) => {
    const a = (k / points) * Math.PI * 2;
    const wob = 1 + 0.13 * Math.sin(t * 0.045 + k * 1.7 + seed) + 0.07 * Math.sin(t * 0.083 + k * 2.9 + seed * 2);
    return [cx + Math.cos(a) * r * wob, cy + Math.sin(a) * r * wob] as const;
  });
  // Catmull-Rom → Bézier cerrada.
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let k = 0; k < points; k++) {
    const p0 = pts[(k - 1 + points) % points], p1 = pts[k], p2 = pts[(k + 1) % points], p3 = pts[(k + 2) % points];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

const LiquidBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const blurId = `liq-blur-${useId().replace(/:/g, '')}`;
  const blobs = [
    { x: 0.12, y: 0.16, r: 0.42, color: palette.display, o: 0.16, s: 1 },
    { x: 0.92, y: 0.5, r: 0.38, color: palette.hero, o: 0.32, s: 4 },
    { x: 0.3, y: 0.92, r: 0.46, color: palette.deep, o: 0.22, s: 9 },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="28" />
          </filter>
        </defs>
        {blobs.map((b, k) => (
          <path
            key={k}
            d={blobPath(width * b.x + Math.sin(frame / (70 + k * 15)) * 40, height * b.y + Math.cos(frame / (90 + k * 10)) * 50, width * b.r, frame, b.s)}
            fill={b.color}
            opacity={b.o}
            filter={`url(#${blurId})`}
          />
        ))}
        {/* Burbujas chicas que suben: textura viva sin tapar el texto. */}
        {Array.from({ length: 9 }, (_, k) => {
          const speed = 0.6 + rand(k) * 0.9;
          const y = height + 80 - ((frame * speed * 3 + rand(k + 20) * height * 1.4) % (height + 160));
          const x = width * (0.06 + 0.88 * rand(k + 40)) + Math.sin(frame / 25 + k) * 14;
          const r = 8 + rand(k + 60) * 22;
          return <circle key={`b${k}`} cx={x} cy={y} r={r} fill="none" stroke={palette.display} strokeOpacity={0.35} strokeWidth={3} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

const LiquidWord: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const p = spring({ frame: frame - delay - i * beats.stagger, fps, config: springs.bouncy });
  const { color, shadow } = wordColors(palette, hero);
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: interpolate(p, [0, 0.4], [0, 1], clamp),
        transform: `translateY(${interpolate(p, [0, 1], [size * 0.55, 0])}px) scale(${interpolate(p, [0, 1], [0.7, 1])})`,
        filter: `blur(${interpolate(p, [0, 0.7], [14, 0], clamp)}px)`,
        color,
        textShadow: bubbleShadow(shadow, Math.max(3, Math.round(size / 26))),
      }}
    >
      {word}
    </span>
  );
};

const LiquidCut: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const maskId = `liq-hole-${useId().replace(/:/g, '')}`;
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

/* --- GLITCH --------------------------------------------------------------- */

/** ¿Hay pulso de glitch en este cuadro? Uno cada ~1,5 s, 4 cuadros. */
function glitchPulse(frame: number): number {
  const slot = Math.floor(frame / 45);
  const at = slot * 45 + Math.floor(rand(slot + 3) * 30);
  return frame >= at && frame < at + 4 ? 1 - (frame - at) / 4 : 0;
}

const GlitchBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const pulse = glitchPulse(frame);
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
      {/* Grilla de pixel que se desliza despacio. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${palette.accent}22 2px, transparent 2px), linear-gradient(90deg, ${palette.accent}22 2px, transparent 2px)`,
          backgroundSize: '120px 120px',
          backgroundPosition: `0 ${(frame * 1.5) % 120}px`,
        }}
      />
      {/* Halo de color detrás del texto. */}
      <div
        style={{
          position: 'absolute', width: width * 1.2, height: width * 1.2, left: -width * 0.1, top: height * 0.5 - width * 0.6,
          borderRadius: '50%', background: `radial-gradient(circle, ${palette.shadow}55, transparent 60%)`,
          transform: `scale(${1 + Math.sin(frame / 18) * 0.05})`,
        }}
      />
      {/* Scanlines. */}
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 2px, transparent 2px, transparent 6px)' }} />
      {pulse > 0 &&
        Array.from({ length: 5 }, (_, k) => (
          <div
            key={k}
            style={{
              position: 'absolute', left: 0, right: 0,
              top: height * rand(frame * 3 + k), height: 12 + rand(frame + k * 7) * 60,
              background: k % 2 ? palette.accent : palette.shadow, opacity: 0.5 * pulse,
              transform: `translateX(${(rand(frame + k) - 0.5) * 200}px)`,
            }}
          />
        ))}
    </AbsoluteFill>
  );
};

const GlitchWord: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const local = frame - delay - i * beats.stagger;
  if (local < 0) return <span style={{ display: 'inline-block', opacity: 0 }}>{word}</span>;
  // Entrada: 7 cuadros de «señal rota» y queda firme; después, pulsos cada tanto.
  const entering = Math.max(0, 1 - local / 7);
  const shake = Math.max(entering, glitchPulse(frame + i * 5) * 0.7);
  const dx = (rand(frame * 13 + i) - 0.5) * size * 0.5 * shake;
  const split = size * 0.09 * shake + 3;
  const color = hero ? palette.hero : palette.display;
  const visible = entering > 0.6 ? rand(frame + i * 31) > 0.35 : true;
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: visible ? 1 : 0,
        color,
        transform: `translateX(${dx}px) skewX(${-12 * shake}deg) scale(${1 + 0.15 * entering})`,
        textShadow: `${-split}px 0 0 ${palette.shadow}, ${split}px 0 0 ${palette.accent}`,
      }}
    >
      {word}
    </span>
  );
};

const GlitchCut: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const mid = beats.cut / 2;
  const on = Math.abs(frame - mid) <= 3;
  if (!on) return null;
  const slices = 8;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {frame === mid && <AbsoluteFill style={{ backgroundColor: palette.display, opacity: 0.85 }} />}
      {Array.from({ length: slices }, (_, k) => (
        <div
          key={k}
          style={{
            position: 'absolute', left: 0, width,
            top: (height / slices) * k, height: height / slices + 1,
            background: [palette.shadow, palette.accent, palette.bg, palette.display][k % 4],
            opacity: rand(frame * 7 + k) > 0.45 ? 0.9 : 0,
            transform: `translateX(${(rand(frame * 11 + k) - 0.5) * width * 0.8}px)`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/* --- EDITORIAL ------------------------------------------------------------ */

const EditorialBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const drift = interpolate(frame, [0, 900], [0, -120]);
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, overflow: 'hidden' }}>
      {/* Aro fino enorme que gira despacio: aire y lujo, sin ruido. */}
      <div
        style={{
          position: 'absolute', width: width * 1.25, height: width * 1.25, borderRadius: '50%',
          border: `3px solid ${palette.body}26`, left: width * 0.35, top: height * 0.08 + drift,
          transform: `rotate(${frame * 0.2}deg)`,
        }}
      />
      <div
        style={{
          position: 'absolute', width: width * 0.7, height: width * 0.7, borderRadius: '50%',
          border: `2px solid ${palette.body}1f`, left: -width * 0.3, top: height * 0.62 - drift * 0.5,
        }}
      />
      {/* Encabezado de revista. */}
      <div
        style={{
          position: 'absolute', top: 96, left: 84, right: 84, display: 'flex', justifyContent: 'space-between',
          fontFamily: fonts.ui, fontWeight: 600, fontSize: 24, letterSpacing: '0.32em', color: palette.body, opacity: 0.75,
        }}
      >
        <span>MANSION PLAYROOM</span>
        <span>VALPARAÍSO</span>
      </div>
      <div style={{ position: 'absolute', top: 140, left: 84, width: interpolate(frame, [0, 30], [0, width - 168], { easing: ease.out, ...clamp }), height: 2, background: palette.body, opacity: 0.5 }} />
    </AbsoluteFill>
  );
};

const EditorialWord: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const p = interpolate(frame - delay - i * beats.stagger, [0, 18], [0, 1], { easing: ease.out, ...clamp });
  const color = hero ? palette.hero : palette.display;
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
      <span
        style={{
          display: 'inline-block',
          color,
          transform: `translateY(${interpolate(p, [0, 1], [110, 0])}%) rotate(${interpolate(p, [0, 1], [4, 0])}deg)`,
          textShadow: bubbleShadow(hero ? palette.deep : palette.shadow, Math.max(2, Math.round(size / 40))),
        }}
      >
        {word}
      </span>
    </span>
  );
};

const EditorialCut: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const { palette } = useMotion();
  const y = interpolate(frame, [0, beats.cut], [height, -height], { easing: ease.inOut, ...clamp });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: y, height, background: palette.deep }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, background: palette.hero }} />
      </div>
    </AbsoluteFill>
  );
};

export const KITS: Record<MotionStyle, Kit> = {
  liquid: {
    Background: LiquidBackground,
    Word: LiquidWord,
    Cut: LiquidCut,
    align: 'center',
    uppercase: false,
    headlineFont: fonts.display,
    lineHeight: 1.04,
    grade: 0.12,
    grain: 0.06,
    vignette: 0.14,
    cutSfx: 'whoosh',
    exitStyle: (p) => ({ opacity: 1 - p, transform: `scale(${1 - 0.08 * p})`, filter: `blur(${p * 10}px)` }),
  },
  glitch: {
    Background: GlitchBackground,
    Word: GlitchWord,
    Cut: GlitchCut,
    align: 'center',
    uppercase: true,
    headlineFont: fonts.body,
    lineHeight: 1,
    grade: 0.18,
    grain: 0.1,
    vignette: 0.3,
    cutSfx: 'glitch',
    exitStyle: () => ({}),
  },
  editorial: {
    Background: EditorialBackground,
    Word: EditorialWord,
    Cut: EditorialCut,
    align: 'left',
    uppercase: false,
    headlineFont: fonts.display,
    lineHeight: 1.02,
    grade: 0.1,
    grain: 0.08,
    vignette: 0.12,
    cutSfx: 'whoosh',
    exitStyle: (p) => ({ opacity: 1 - p, transform: `translateY(${-50 * p}px)` }),
  },
};
