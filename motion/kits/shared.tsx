import { useId } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionPalette } from '../../shared/motionSpec';
import { useMotion } from '../context';
import { ease, springs } from '../theme';

/* Piezas que comparten los estilos: el contrato de un kit, el fondo, el
 * círculo de acento de las referencias y cómo se pinta el texto protagonista. */

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

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
  headlineWeight: number;
  letterSpacing: string;
  lineHeight: number;
  /** Titular con contraste editorial: palabras chicas + la protagonista gigante. */
  contrast: boolean;
  grade: number;
  grain: number;
  vignette: number;
  cutSfx: 'whoosh' | 'glitch';
  /** Cómo sale la escena (0 → 1). */
  exitStyle: (p: number) => React.CSSProperties;
}

/** Letra «candy bubble» de la marca: relleno sólido + volumen extruido + sombra. */
export function bubbleShadow(shadow: string, depth: number): string {
  const layers: string[] = [];
  for (let d = 1; d <= depth; d++) layers.push(`0 ${d * 2}px 0 ${shadow}`);
  layers.push(`0 ${depth * 2 + 10}px ${depth * 4}px rgba(0,0,0,0.18)`);
  return layers.join(', ');
}

/** Estilo del texto protagonista. En noche es un degradé rosa→oro con brillo
 * (como PLAYMORE): un degradé no admite text-shadow, así que lleva drop-shadow. */
export function heroText(p: MotionPalette): React.CSSProperties {
  if (p.heroFill.startsWith('linear-gradient')) {
    return { backgroundImage: p.heroFill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: `drop-shadow(0 0 24px ${p.hero}66)` };
  }
  return { color: p.hero };
}

/** Fondo: color sólido de marca. Solo noche lleva un degradé muy suave (ciruela → negro cálido). */
export const BaseFill: React.FC = () => {
  const { palette } = useMotion();
  return <AbsoluteFill style={{ background: palette.bg2 === palette.bg ? palette.bg : `radial-gradient(120% 80% at 30% 20%, ${palette.bg} 0%, ${palette.bg2} 75%)` }} />;
};

/** El círculo de color de las referencias: entra con resorte y respira. */
export const AccentCircle: React.FC<{ x: number; y: number; r: number; delay?: number; color?: string; ring?: boolean }> = ({ x, y, r, delay = 0, color, ring }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const p = spring({ frame: frame - delay, fps, config: springs.heavy });
  const breathe = 1 + Math.sin(frame / 40) * 0.012;
  const c = color ?? palette.hero;
  return (
    <div
      style={{
        position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%',
        // En «noche» el círculo de acento lleva el degradé rosa→oro de PLAYMORE (en diagonal); en los demás, color plano.
        background: ring ? 'transparent' : color === undefined && palette.heroFill.startsWith('linear-gradient') ? palette.heroFill.replace('90deg', '135deg') : c,
        border: ring ? `3px solid ${c}` : undefined,
        transform: `scale(${p * breathe})`, opacity: interpolate(p, [0, 0.3], [0, 1], clamp),
      }}
    />
  );
};

/** Línea fina que se dibuja (guías de grilla). */
export const Hairline: React.FC<{ x: number; y: number; length: number; vertical?: boolean; delay?: number; color: string; opacity?: number }> = ({ x, y, length, vertical, delay = 0, color, opacity = 0.35 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 26], [0, 1], { easing: ease.out, ...clamp });
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: vertical ? 2 : length * p, height: vertical ? length * p : 2, background: color, opacity }} />
  );
};

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

/** Id único para defs de SVG (varias vistas previas en la misma página). */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}
