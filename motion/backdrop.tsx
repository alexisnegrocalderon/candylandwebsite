import { AbsoluteFill, Freeze, interpolate, Loop, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { backdropSpan, type Legibility } from '../shared/motionBackdrop';
import { BRAND, type MotionPalette } from '../shared/motionSpec';
import type { TextZone } from '../shared/motionVariety';
import { MotionContext, useMotion } from './context';
import { useExit } from './layers';
import { onColor } from './look';
import { beats } from './theme';

/* El video de fondo: UN video que corre continuo detrás de todo el reel (los textos cambian encima sin que se reinicie) y la
 * adaptación del texto a lo que se ve (shared/motionBackdrop.ts decide, acá se dibuja). Sin filtros CSS sobre el video: en el
 * iPhone y el iPad un filtro sobre un <video> es lo primero que se come la memoria. */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const BackdropLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec } = useMotion();
  const b = spec.backdrop;
  if (!b) return null;
  const spanFrames = Math.max(1, Math.round(backdropSpan(b) * fps));
  const video = (
    <OffthreadVideo src={b.url} muted trimBefore={Math.round(b.start * fps)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.black, overflow: 'hidden' }}>
      {b.loop === 'repetir'
        ? <Loop durationInFrames={spanFrames}>{video}</Loop>
        // Al acabarse el tramo se queda en el último cuadro (sin remontar el video: no hay salto).
        : <Freeze frame={Math.min(frame, spanFrames - 1)}>{video}</Freeze>}
    </AbsoluteFill>
  );
};

/** La paleta del estilo, con el texto claro u oscuro según lo que haya detrás del video. El acento (hero) y la superficie se conservan. */
export function adaptPalette(p: MotionPalette, ink: Legibility['ink']): MotionPalette {
  // El acento también tiene que verse: sobre un video claro, un acento pálido (rosa, oro) pasa a magenta; sobre uno oscuro, un
  // acento hondo (azul tinta) pasa a rosa. Los demás se quedan como son.
  const heroIsLight = onColor(p.hero) === BRAND.graphite;
  const hero = ink === 'oscuro' && heroIsLight ? BRAND.magenta : ink === 'claro' && !heroIsLight ? BRAND.pink : p.hero;
  const heroFill = hero !== p.hero ? hero : p.heroFill;
  if (ink === 'claro') {
    return { ...p, hero, heroFill, display: BRAND.white, body: BRAND.white, muted: `${BRAND.white}CC`, micro: BRAND.white, shadow: BRAND.black, deep: BRAND.black, dark: true };
  }
  return { ...p, hero, heroFill, display: BRAND.graphite, body: BRAND.graphite, muted: BRAND.stone, micro: BRAND.graphite, shadow: BRAND.pearlShade, deep: BRAND.pearl, bg: BRAND.pearl, dark: false };
}

/** Un degradado suave detrás de la zona del texto: oscurece el video (texto claro) o lo aclara (texto oscuro) justo donde hace falta. */
const Scrim: React.FC<{ zone: TextZone; ink: Legibility['ink']; amount: number; frames: number }> = ({ zone, ink, amount, frames }) => {
  const frame = useCurrentFrame();
  const exit = useExit(frames, beats.exit);
  const c = ink === 'claro' ? '0,0,0' : '255,255,255';
  const a = (k: number) => `rgba(${c},${(amount * k).toFixed(3)})`;
  const top = `linear-gradient(180deg, ${a(1)} 0%, ${a(0.7)} 26%, ${a(0)} 52%)`;
  const bottom = `linear-gradient(0deg, ${a(1)} 0%, ${a(0.7)} 28%, ${a(0)} 54%)`;
  const center = `radial-gradient(ellipse 130% 36% at 50% 50%, ${a(1)} 0%, ${a(0.75)} 55%, ${a(0)} 100%)`;
  const background = zone === 'top' ? top : zone === 'bottom' ? bottom : zone === 'split' ? `${top}, ${bottom}` : center;
  return <AbsoluteFill style={{ pointerEvents: 'none', background, opacity: interpolate(frame, [0, 8], [0, 1], clamp) * (1 - exit) }} />;
};

/** Lo que envuelve a una escena sobre el video: la paleta adaptada para todo lo de adentro, el degradado y una sombra suave que heredan los textos. */
export const AdaptedScene: React.FC<{ legibility: Legibility; zone: TextZone; frames: number; children: React.ReactNode }> = ({ legibility, zone, frames, children }) => {
  const outer = useMotion();
  const light = legibility.ink === 'claro';
  const boost = 0.35 + 0.35 * legibility.stroke;
  return (
    <MotionContext.Provider value={{ ...outer, palette: adaptPalette(outer.palette, legibility.ink) }}>
      <Scrim zone={zone} ink={legibility.ink} amount={legibility.scrim} frames={frames} />
      <AbsoluteFill style={{ textShadow: light ? `0 2px ${14 + legibility.stroke * 10}px rgba(0,0,0,${boost.toFixed(2)})` : '0 1px 12px rgba(255,255,255,0.55)' }}>{children}</AbsoluteFill>
    </MotionContext.Provider>
  );
};

/** Solo la paleta adaptada (sin degradado): la barra de arriba, el @ de abajo y los subtítulos, que viven todo el reel. */
export const AdaptedPalette: React.FC<{ legibility: Legibility | null; children: React.ReactNode }> = ({ legibility, children }) => {
  const outer = useMotion();
  if (!legibility) return <>{children}</>;
  return <MotionContext.Provider value={{ ...outer, palette: adaptPalette(outer.palette, legibility.ink) }}>{children}</MotionContext.Provider>;
};
