import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { MOTION_HANDLE } from '../shared/motionSpec';
import { useMotion } from './context';
import { ease, fonts, rand, springs, type } from './theme';

/* Lo que hace que una pieza se vea «de revista» y no «de paint»: micro-textos
 * en los bordes, líneas finas, marcas de registro, código de barras y el @.
 * Todo en micro-tipo, a media opacidad, y entrando escalonado. Se apaga con
 * spec.hud = false. */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Ícono de Instagram dibujado (nunca un emoji: respeta la paleta). */
export const IgGlyph: React.FC<{ size: number; color: string; stroke?: number }> = ({ size, color, stroke }) => {
  const w = stroke ?? Math.max(2, size / 12);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={(w * 24) / size}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="17.6" cy="6.4" r="0.6" fill={color} stroke="none" />
    </svg>
  );
};

const Barcode: React.FC<{ color: string; height: number; seed?: number }> = ({ color, height, seed = 3 }) => (
  <div style={{ display: 'flex', gap: 2, height, alignItems: 'stretch' }}>
    {Array.from({ length: 26 }, (_, i) => (
      <div key={i} style={{ width: 1 + Math.floor(rand(i + seed) * 4), background: color }} />
    ))}
  </div>
);

const Cross: React.FC<{ x: number; y: number; color: string; size?: number }> = ({ x, y, color, size = 22 }) => (
  <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }}>
    <div style={{ position: 'absolute', left: size / 2 - 1, top: 0, width: 2, height: size, background: color }} />
    <div style={{ position: 'absolute', top: size / 2 - 1, left: 0, height: 2, width: size, background: color }} />
  </div>
);

function mmss(frame: number, fps: number) {
  const s = Math.floor(frame / fps);
  const ff = String(frame % fps).padStart(2, '0');
  return `00:${String(s).padStart(2, '0')}:${ff}`;
}

export const Hud: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { palette, width, height, timeline, slide, spec } = useMotion();
  // PLAYMORE (fondos noche y arcade) es en Santiago y +21; lo demás, Playroom de siempre.
  const playmore = spec.base === 'noche' || spec.base === 'arcade' || spec.style === 'arcade';
  const pad = 56;
  const top = height > 1500 ? 120 : 52;
  const bottom = height > 1500 ? 150 : 52;
  const lineIn = interpolate(frame, [4, 34], [0, 1], { easing: ease.out, ...clamp });
  const textIn = (d: number) => interpolate(frame, [d, d + 14], [0, 1], { easing: ease.out, ...clamp });
  const sceneNo = Math.max(0, timeline.scenes.findIndex((s) => frame >= s.from && frame < s.from + s.frames));
  const microStyle: React.CSSProperties = {
    fontFamily: fonts.grotesk, fontWeight: 600, fontSize: type.micro, letterSpacing: '0.22em', color: palette.micro, textTransform: 'uppercase', whiteSpace: 'nowrap',
  };
  const fadeOut = slide ? 1 : interpolate(frame, [durationInFrames - 12, durationInFrames - 1], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.62 * fadeOut }}>
      {/* Barra de arriba. */}
      <div style={{ position: 'absolute', top, left: pad, right: pad, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...microStyle, opacity: textIn(6), transform: `translateY(${(1 - textIn(6)) * 10}px)` }}>{playmore ? 'PLAYMORE · Playroom × Dalmore' : 'Mansion Playroom'}</span>
        <span style={{ ...microStyle, opacity: textIn(10) }}>{playmore ? 'Providencia · CL' : 'Valparaíso · CL'}</span>
        <span style={{ ...microStyle, opacity: textIn(14), border: `2px solid ${palette.micro}`, borderRadius: 999, padding: '4px 12px', letterSpacing: '0.12em' }}>{playmore ? '+21' : '+18'}</span>
      </div>
      <div style={{ position: 'absolute', top: top + 44, left: pad, width: (width - pad * 2) * lineIn, height: 2, background: palette.micro, opacity: 0.6 }} />

      {/* Marcas de registro. */}
      {[[pad, top + 90], [width - pad, top + 90], [pad, height - bottom - 70], [width - pad, height - bottom - 70]].map(([x, y], i) => (
        <div key={i} style={{ opacity: textIn(12 + i * 3) }}><Cross x={x} y={y} color={palette.micro} /></div>
      ))}

      {/* Texto vertical con el número de escena (en una lámina quieta no hace falta: va el «01 / 05»). */}
      {!slide && (
        <div style={{ position: 'absolute', right: pad - 8, top: height / 2, transform: 'translate(50%, -50%) rotate(90deg)', ...microStyle, opacity: textIn(18) }}>
          {`Escena ${String(sceneNo + 1).padStart(2, '0')} / ${String(timeline.scenes.length).padStart(2, '0')}`}
        </div>
      )}

      {/* Carrusel: invitación a deslizar, a mitad de altura del borde derecho. */}
      {slide?.swipe && (
        <div style={{ position: 'absolute', right: pad, bottom: bottom + 70, display: 'flex', alignItems: 'center', gap: 12, ...microStyle, border: `2px solid ${palette.micro}`, borderRadius: 999, padding: '10px 22px', opacity: 1 }}>
          Desliza
          <svg width={34} height={14} viewBox="0 0 34 14" fill="none"><path d="M0 7h32M26 2l6 5-6 5" stroke={palette.micro} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      )}

      {/* Abajo: @ con ícono, contador y código de barras. */}
      <div style={{ position: 'absolute', bottom, left: pad, right: pad, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: textIn(16) }}>
          <IgGlyph size={30} color={palette.micro} />
          <span style={{ ...microStyle, letterSpacing: '0.08em', textTransform: 'none' }}>{MOTION_HANDLE}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, opacity: textIn(20) }}>
          <span style={{ ...microStyle, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.1em' }}>
            {slide ? `${String(slide.index + 1).padStart(2, '0')} / ${String(slide.total).padStart(2, '0')}` : mmss(frame, fps)}
          </span>
          <Barcode color={palette.micro} height={34} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Empuje lento de cámara sobre todo el contenido (el HUD queda fijo, como un visor). */
export const Camera: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], { easing: ease.inOut, ...clamp });
  return <AbsoluteFill style={{ transform: `scale(${1 + 0.035 * p}) translateY(${-14 * p}px)` }}>{children}</AbsoluteFill>;
};

/** Cierre con el @ (como las referencias): nombre, ícono que entra con resorte y el handle. */
export const HandleCard: React.FC<{ frames: number; line: string }> = ({ frames, line }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { palette } = useMotion();
  const name = spring({ frame, fps, config: springs.smooth });
  const icon = spring({ frame: frame - 12, fps, config: springs.bouncy });
  const handle = spring({ frame: frame - 20, fps, config: springs.snappy });
  const exit = interpolate(frame, [frames - 10, frames - 1], [0, 1], { easing: ease.in, ...clamp });
  // El nombre se «enfoca» (de desenfocado y espaciado a nítido).
  const blur = interpolate(name, [0, 1], [16, 0]);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - exit }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        <div
          style={{
            fontFamily: fonts.syne, fontWeight: 700, fontSize: 92, letterSpacing: `${interpolate(name, [0, 1], [0.3, -0.02])}em`,
            color: palette.display, filter: `blur(${blur}px)`, opacity: name,
          }}
        >
          Mansion Playroom
        </div>
        <div style={{ transform: `scale(${icon}) rotate(${interpolate(icon, [0, 1], [-30, 0])}deg)`, opacity: icon }}>
          <IgGlyph size={110} color={palette.hero} stroke={9} />
        </div>
        <div style={{ fontFamily: fonts.grotesk, fontWeight: 600, fontSize: 40, letterSpacing: '0.04em', color: palette.body, opacity: handle, transform: `translateY(${(1 - handle) * 20}px)` }}>
          {MOTION_HANDLE}
        </div>
        {line && line.replace(/^@/, '').toLowerCase() !== MOTION_HANDLE.replace(/^@/, '').toLowerCase() && (
          <div style={{ fontFamily: fonts.grotesk, fontWeight: 600, fontSize: type.micro + 6, letterSpacing: '0.24em', textTransform: 'uppercase', color: palette.muted, opacity: handle }}>
            {line}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
