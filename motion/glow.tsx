import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { BRAND } from '../shared/motionSpec';
import { useBeat } from './beat';
import { useMotion } from './context';
import { useSvgId } from './kits/shared';
import { ease } from './theme';

/* Luz de fondo estilo Apple: una sola atmósfera de color (con los colores de la marca) que respira con la energía
 * de la música y se enciende en cada golpe fuerte. Va entre el fondo y las escenas.
 *
 * - halo: cuatro manchas de luz que se mueven lento, como la luz de un interruptor encendido.
 * - haces: rayos que salen desde abajo al centro y se abren con la música, como los de la carpeta.
 *
 * Solo degradados (nada de desenfoques: un celular los paga caros). En fondos oscuros la luz suma («screen»);
 * en fondos claros va más suave y sin mezcla, para que se vea sin ensuciar. */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

function useLight() {
  const { palette, spec } = useMotion();
  const b = useBeat();
  const frame = useCurrentFrame();
  const dark = palette.dark;
  // Respira con la música; sin música, un vaivén lento (1 ciclo cada ~4 s).
  const breathe = b.has ? 0.55 + 0.45 * b.energy : 0.7 + 0.12 * Math.sin(frame / 19);
  const kick = b.has ? b.pulse * (0.35 + 0.65 * b.energy) : 0;
  const flash = b.has ? b.hit * (0.45 + 0.55 * b.energy) : 0;
  const intro = interpolate(frame, [0, 24], [0, 1], { easing: ease.out, ...clamp });
  return { palette, spec, frame, dark, breathe, kick, flash, intro, mix: dark ? ('screen' as const) : ('normal' as const), soft: dark ? 1 : 0.55 };
}

const Halo: React.FC = () => {
  const { palette, frame, breathe, kick, flash, intro, mix, soft } = useLight();
  const { width, height } = useMotion();
  const t = frame / 30;
  const colors = [palette.hero, BRAND.blue, BRAND.pink, BRAND.magenta];
  const r = Math.max(width, height) * 0.62;
  const blobs = colors.map((color, i) => {
    // Cada mancha recorre su propia órbita lenta (Lissajous): nunca se repite igual a la vista.
    const cx = width * (0.5 + 0.34 * Math.sin(t * (0.5 + i * 0.13) + i * 1.7));
    const cy = height * (0.5 + 0.3 * Math.cos(t * (0.42 + i * 0.11) + i * 2.3));
    const size = r * (0.8 + 0.18 * breathe + 0.1 * kick);
    const alpha = Math.min(0.9, (0.26 + 0.3 * breathe + 0.22 * kick) * soft) * intro;
    return (
      <div
        key={i}
        style={{
          position: 'absolute', left: cx - size, top: cy - size, width: size * 2, height: size * 2, borderRadius: '50%',
          background: `radial-gradient(circle, ${color} 0%, ${color}00 62%)`, opacity: alpha, mixBlendMode: mix,
        }}
      />
    );
  });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      {blobs}
      {/* Destello en cada golpe fuerte. */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 55%, ${BRAND.white} 0%, ${palette.hero}00 58%)`, opacity: flash * 0.28 * soft, mixBlendMode: mix }} />
    </AbsoluteFill>
  );
};

const Beams: React.FC = () => {
  const { palette, frame, breathe, kick, flash, intro, mix, soft } = useLight();
  const { width, height } = useMotion();
  const id = useSvgId('beam');
  const t = frame / 30;
  const cx = width / 2;
  const base = height * 0.78;
  // Seis haces: se abren con la energía y cada uno se balancea a su propio paso.
  const spread = 0.2 + 0.16 * breathe + 0.07 * kick;
  const angles = [-1.0, -0.62, -0.22, 0.22, 0.62, 1.0];
  const colors = [BRAND.magenta, palette.hero, BRAND.blue, BRAND.pink, palette.hero, BRAND.blue];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, mixBlendMode: mix, opacity: Math.min(1, (0.55 + 0.25 * kick) * soft * intro) }}>
        <defs>
          {angles.map((_, i) => (
            <linearGradient key={i} id={`${id}-${i}`} x1="0" y1={base} x2="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={colors[i]} stopOpacity={0.95} />
              <stop offset="0.55" stopColor={colors[(i + 2) % colors.length]} stopOpacity={0.45} />
              <stop offset="1" stopColor={colors[(i + 4) % colors.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {angles.map((a, i) => {
          const sway = Math.sin(t * (0.6 + i * 0.17) + i * 1.3) * 0.07;
          const center = (a * spread + sway) * width * 0.75;
          const half = width * (0.075 + 0.05 * breathe + 0.045 * kick);
          const topY = -height * 0.1;
          const pts = `${cx - 12},${base} ${cx + 12},${base} ${cx + center + half},${topY} ${cx + center - half},${topY}`;
          return <polygon key={i} points={pts} fill={`url(#${id}-${i})`} />;
        })}
      </svg>
      {/* La fuente de luz abajo (la carpeta de la referencia): un resplandor que se enciende con cada golpe. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 46% 15% at 50% 79%, ${BRAND.white} 0%, ${palette.hero}aa 38%, ${palette.hero}00 100%)`,
          opacity: Math.min(1, (0.4 + 0.5 * flash + 0.25 * kick) * soft * intro), mixBlendMode: mix,
        }}
      />
    </AbsoluteFill>
  );
};

export const Glow: React.FC = () => {
  const { spec } = useMotion();
  if (spec.glow === 'halo') return <Halo />;
  if (spec.glow === 'haces') return <Beams />;
  return null;
};

/** Loop: el video se funde al color del fondo al final y vuelve a salir de él al principio, así al repetirse no se
 * ve el salto (la música ya cae en compases enteros, ver motionTimeline). */
export const LoopFade: React.FC = () => {
  const frame = useCurrentFrame();
  const { spec, palette, timeline } = useMotion();
  if (!spec.loop) return null;
  const total = timeline.total;
  const out = interpolate(frame, [total - 11, total - 1], [0, 1], { easing: ease.in, ...clamp });
  const into = interpolate(frame, [0, 3], [1, 0], clamp);
  const o = Math.max(out, into);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ backgroundColor: palette.bg, opacity: o, pointerEvents: 'none' }} />;
};
