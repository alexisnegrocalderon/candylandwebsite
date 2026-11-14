import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, type MotionScene, type MotionStyle } from '../shared/motionSpec';
import { seededRandom, type LookCut as LookCutKind, type LookEntry } from '../shared/motionVariety';
import { useMotion } from './context';
import { useSvgId } from './kits/shared';
import { useExit } from './layers';
import { CENTERED, MAGAZINE } from './layouts';
import { beats, ease, fonts, springs } from './theme';

/* El «look» del video: lo que se combina ENCIMA del estilo para que dos piezas
 * del mismo estilo no se vean iguales (shared/motionVariety.ts dice cuál toca;
 * acá se dibuja). Trama del fondo, adornos Playroom (cintas, sellos, recuadro,
 * destellos, stickers), transiciones y entradas del texto.
 *
 * Reglas: solo colores de la paleta del video, nada de desenfoques permanentes
 * (un celular los paga caros) y pocas piezas por cuadro. Todo sale de la
 * semilla: vista previa, láminas y MP4 se ven igual. */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Texto que se lee sobre un color de la paleta: grafito sobre los claros, blanco sobre los oscuros. */
export function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return BRAND.white;
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? BRAND.graphite : BRAND.white;
}

/** PLAYMORE (fondos noche y arcade) es en Providencia y +21; lo demás, Playroom en Valparaíso y +18. */
function usePlaymore(): boolean {
  const { spec } = useMotion();
  return spec.base === 'noche' || spec.base === 'arcade' || spec.style === 'arcade';
}

/* --- Trama del fondo ----------------------------------------------------------- */

export const Texture: React.FC = () => {
  const frame = useCurrentFrame();
  const { look, palette, width, height, spec } = useMotion();
  if (look.texture === 'ninguna') return null;
  const c = palette.micro;
  const drift = frame * 0.35;
  if (look.texture === 'puntos') {
    return <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: `radial-gradient(${c}30 3px, transparent 3.6px)`, backgroundSize: '46px 46px', backgroundPosition: `${drift}px ${drift * 0.6}px` }} />;
  }
  if (look.texture === 'rayas') {
    const dir = spec.seed % 2 ? 135 : 45;
    return <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: `repeating-linear-gradient(${dir}deg, ${c}16 0px, ${c}16 4px, transparent 4px, transparent 40px)`, backgroundPosition: `${drift * 1.4}px 0px` }} />;
  }
  if (look.texture === 'cuadros') {
    return <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: `conic-gradient(${c}0D 25%, transparent 0 50%, ${c}0D 0 75%, transparent 0)`, backgroundSize: '180px 180px', backgroundPosition: `${drift}px ${drift}px` }} />;
  }
  if (look.texture === 'rayos') {
    // Rayos de sol desde un punto que cambia con la semilla, girando muy lento.
    const cx = 30 + (spec.seed % 5) * 10;
    return <AbsoluteFill style={{ pointerEvents: 'none', backgroundImage: `repeating-conic-gradient(from ${frame * 0.12}deg at ${cx}% 40%, ${palette.hero}16 0deg, ${palette.hero}16 7deg, transparent 7deg, transparent 15deg)` }} />;
  }
  // ondas: líneas que ondulan, cada una con su fase.
  const lines = 7;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height}>
        {Array.from({ length: lines }, (_, k) => {
          const y = (height / (lines + 1)) * (k + 1);
          const amp = 26 + (k % 3) * 12;
          let d = `M 0 ${y.toFixed(1)}`;
          for (let x = 0; x <= width; x += 90) d += ` L ${x} ${(y + Math.sin(x / 150 + frame / 26 + k * 1.3) * amp).toFixed(1)}`;
          return <path key={k} d={d} fill="none" stroke={k % 3 === 1 ? palette.hero : c} strokeOpacity={k % 3 === 1 ? 0.3 : 0.14} strokeWidth={4} strokeLinejoin="round" />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

/* --- Adornos de la escena -------------------------------------------------------- */

type Zone = 'top' | 'center' | 'bottom' | 'split';

/** Dónde está el texto en esta composición (los adornos van a la zona que queda libre). */
function textZone(style: MotionStyle, layout: string | undefined): Zone {
  if (style === 'editorial' || style === 'kinetic') return MAGAZINE[layout ?? '']?.anchor ?? 'bottom';
  if (style === 'poster') return 'split';
  if (style === 'liquid' || style === 'glitch' || style === 'arcade') return CENTERED[layout ?? '']?.v ?? 'center';
  return 'center';
}

/** Alturas libres (fracción del alto) según dónde va el texto. */
function freeBands(zone: Zone, tall: boolean): number[] {
  const top = tall ? 0.215 : 0.2;
  const bottom = tall ? 0.79 : 0.82;
  if (zone === 'top') return [bottom];
  if (zone === 'bottom') return [top];
  if (zone === 'split') return [0.5];
  return [top, bottom];
}

const STAR4 = 'M0,-1 C0.1,-0.32 0.32,-0.1 1,0 C0.32,0.1 0.1,0.32 0,1 C-0.1,0.32 -0.32,0.1 -1,0 C-0.32,-0.1 -0.1,-0.32 0,-1 Z';
const STICKER_PATHS: string[] = [
  // corazón
  'M50 88 C20 64 8 46 8 31 C8 17 19 9 30 9 C39 9 46 14 50 21 C54 14 61 9 70 9 C81 9 92 17 92 31 C92 46 80 64 50 88 Z',
  // estrella
  'M50 6 L61.8 36.6 L94.5 38.4 L69 59.1 L77.5 90.8 L50 73 L22.5 90.8 L31 59.1 L5.5 38.4 L38.2 36.6 Z',
  // rayo
  'M60 5 L20 55 L45 55 L36 95 L80 43 L55 43 Z',
  // destello de cuatro puntas
  'M50 4 C54 34 66 46 96 50 C66 54 54 66 50 96 C46 66 34 54 4 50 C34 46 46 34 50 4 Z',
  // gota / burbuja
  'M50 8 C72 30 84 46 84 62 C84 80 69 93 50 93 C31 93 16 80 16 62 C16 46 28 30 50 8 Z',
];

const Tape: React.FC<{ y: number; angle: number; text: string; bg: string; delay: number; dir: 1 | -1 }> = ({ y, angle, text, bg, delay, dir }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { width, slide } = useMotion();
  const p = slide ? 1 : spring({ frame: frame - delay, fps, config: springs.heavy });
  const h = 76;
  const fg = onColor(bg);
  const run = Array.from({ length: 10 }, () => text).join('   ✦   ');
  return (
    <div
      style={{
        position: 'absolute', left: -width * 0.2, width: width * 1.4, top: y - h / 2, height: h, background: bg, overflow: 'hidden',
        transform: `rotate(${angle}deg) scaleX(${p})`, transformOrigin: dir === 1 ? '0% 50%' : '100% 50%',
        display: 'flex', alignItems: 'center',
      }}
    >
      <div style={{ whiteSpace: 'nowrap', fontFamily: fonts.numbers, fontSize: 44, letterSpacing: '0.08em', color: fg, textTransform: 'uppercase', transform: `translateX(${dir === 1 ? -frame * 2.4 - 40 : frame * 2.4 - 900}px)` }}>
        {run}
      </div>
    </div>
  );
};

const Stamp: React.FC<{ x: number; y: number; size: number; angle: number; ring: string; center: string }> = ({ x, y, size, angle, ring, center }) => {
  const frame = useCurrentFrame();
  const { palette, slide } = useMotion();
  const id = useSvgId('sello');
  const t = slide ? 1 : interpolate(frame - 10, [0, 6], [0, 1], { easing: ease.out, ...clamp });
  const c = palette.hero;
  return (
    <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, opacity: t * 0.92, transform: `rotate(${angle}deg) scale(${interpolate(t, [0, 1], [1.9, 1])})` }}>
      <svg width={size} height={size} viewBox="0 0 200 200">
        <defs><path id={id} d="M 100,100 m -74,0 a 74,74 0 1,1 148,0 a 74,74 0 1,1 -148,0" /></defs>
        <circle cx={100} cy={100} r={95} fill="none" stroke={c} strokeWidth={5} />
        <circle cx={100} cy={100} r={56} fill="none" stroke={c} strokeWidth={2.5} strokeDasharray="5 5" />
        <text fill={c} style={{ fontFamily: fonts.grotesk, fontWeight: 700, fontSize: 17.5, letterSpacing: '0.16em' }}>
          <textPath href={`#${id}`} startOffset="0%">{ring}</textPath>
        </text>
        <text x={100} y={100} textAnchor="middle" dominantBaseline="central" fill={c} style={{ fontFamily: fonts.numbers, fontSize: center.length > 5 ? 26 : center.length > 3 ? 36 : 50, letterSpacing: '0.02em' }}>{center}</text>
      </svg>
    </div>
  );
};

/** Adornos de UNA escena. Van entre el fondo (o la foto) y el texto: nunca tapan lo que se lee. */
export const SceneDeco: React.FC<{ scene: MotionScene; index: number; frames: number }> = ({ scene, index, frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { look, palette, width, height, spec, layouts, slide } = useMotion();
  const playmore = usePlaymore();
  const exit = useExit(frames, beats.exit);
  if (look.deco === 'ninguno') return null;
  const rand = seededRandom(spec.seed * 211 + index * 6151 + 29);
  const tall = height / width > 1.5;
  const zone = textZone(spec.style, layouts[index]);
  const bands = freeBands(zone, tall);
  const last = index === spec.scenes.length - 1 && spec.scenes.length > 1;
  const age = playmore ? '+21' : '+18';
  const brand = playmore ? 'PLAYMORE' : 'MANSION PLAYROOM';
  const wrap: React.CSSProperties = { pointerEvents: 'none', overflow: 'hidden', opacity: 1 - exit };

  if (look.deco === 'cintas') {
    const label = last ? `COMENTA ${spec.keyword}` : scene.kicker || brand;
    const second = last ? brand : `${brand} · ${age}`;
    const side: 1 | -1 = rand() < 0.5 ? 1 : -1;
    return (
      <AbsoluteFill style={wrap}>
        {bands.map((b, k) => (
          <Tape key={k} y={height * b} angle={(k === 0 ? side : -side) * (3 + rand() * 4)} text={k === 0 ? label : second} bg={k === 0 ? palette.hero : palette.display} delay={3 + k * 5} dir={k === 0 ? side : (-side as 1 | -1)} />
        ))}
      </AbsoluteFill>
    );
  }

  if (look.deco === 'sello') {
    const size = width * (tall ? 0.36 : 0.3);
    const left = rand() < 0.5;
    const band = bands[Math.floor(rand() * bands.length) % bands.length];
    const x = left ? width * 0.26 : width * 0.74;
    const ring = `${brand} · ${playmore ? 'PROVIDENCIA' : 'VALPARAÍSO'} · ${age} · `;
    return (
      <AbsoluteFill style={wrap}>
        <Stamp x={x} y={height * band} size={size} angle={(left ? -1 : 1) * (8 + rand() * 9)} ring={ring.length < 34 ? ring + ring : ring} center={last ? spec.keyword : age} />
      </AbsoluteFill>
    );
  }

  if (look.deco === 'esquinas') {
    // Por fuera del bloque de texto y por dentro del HUD: enmarca la escena sin pisar la etiqueta ni la bajada.
    const x0 = 40;
    const y0 = tall ? 196 : 112;
    const x1 = width - 40;
    const y1 = height - (tall ? 236 : 112);
    const arm = 96;
    const t = (d: number) => (slide ? 1 : interpolate(frame - d, [0, 14], [0, 1], { easing: ease.out, ...clamp }));
    const corner = (x: number, y: number, sx: 1 | -1, sy: 1 | -1, color: string, d: number) => (
      <g key={`${x}-${y}`} stroke={color} strokeWidth={7} strokeLinecap="square" fill="none">
        <line x1={x} y1={y} x2={x + sx * arm * t(d)} y2={y} />
        <line x1={x} y1={y} x2={x} y2={y + sy * arm * t(d + 3)} />
      </g>
    );
    const blink = 0.45 + 0.55 * Math.abs(Math.sin(frame / 9));
    return (
      <AbsoluteFill style={wrap}>
        <svg width={width} height={height}>
          {corner(x0, y0, 1, 1, palette.hero, 2)}
          {corner(x1, y0, -1, 1, palette.micro, 5)}
          {corner(x0, y1, 1, -1, palette.micro, 8)}
          {corner(x1, y1, -1, -1, palette.hero, 11)}
          <circle cx={x0 + 34} cy={y0 + 36} r={9} fill={palette.hero} opacity={slide ? 1 : blink * t(6)} />
        </svg>
      </AbsoluteFill>
    );
  }

  if (look.deco === 'destellos') {
    const count = 8;
    return (
      <AbsoluteFill style={wrap}>
        {Array.from({ length: count }, (_, k) => {
          // Cerca de los bordes o en la zona libre: el centro del texto queda despejado.
          const edge = rand() < 0.55;
          const band = bands[k % bands.length];
          const x = edge ? (rand() < 0.5 ? 0.05 + rand() * 0.14 : 0.81 + rand() * 0.14) : 0.12 + rand() * 0.76;
          const y = edge ? 0.14 + rand() * 0.72 : band + (rand() - 0.5) * 0.12;
          const s = 26 + rand() * 62;
          const phase = rand() * 6.28;
          const p = slide ? 1 : spring({ frame: frame - 4 - k * 2, fps, config: springs.bouncy });
          const tw = 0.72 + 0.28 * Math.sin(frame / 8 + phase);
          return (
            <svg key={k} width={s * 2} height={s * 2} viewBox="-1 -1 2 2" style={{ position: 'absolute', left: width * x - s, top: height * y - s, transform: `scale(${p * tw}) rotate(${frame * 0.4 + phase * 20}deg)`, opacity: 0.9 }}>
              <path d={STAR4} fill={k % 3 === 0 ? palette.hero : palette.display} />
            </svg>
          );
        })}
      </AbsoluteFill>
    );
  }

  // stickers: figuras de marca con borde blanco, como pegatinas.
  // Dos por zona libre, una a cada lado.
  const count = bands.length * 2;
  const fills = [palette.hero, palette.accent, palette.display, palette.hero];
  const pick = Math.floor(rand() * STICKER_PATHS.length);
  const flipSide = rand() < 0.5 ? 0 : 1;
  return (
    <AbsoluteFill style={wrap}>
      {Array.from({ length: count }, (_, k) => {
        const band = bands[Math.floor(k / 2) % bands.length];
        // Alternan de lado (la semilla decide cuál parte): dos pegatinas nunca caen una sobre otra.
        const leftSide = (k + flipSide) % 2 === 0;
        const x = leftSide ? 0.1 + rand() * 0.2 : 0.7 + rand() * 0.2;
        const y = band + (rand() - 0.5) * 0.09;
        const s = width * (0.15 + rand() * 0.07);
        const rot = (rand() - 0.5) * 40;
        const p = slide ? 1 : spring({ frame: frame - 5 - k * 4, fps, config: springs.bouncy });
        const float = Math.sin(frame / 24 + k * 1.9) * 9;
        const fill = fills[k % fills.length];
        return (
          <svg key={k} width={s} height={s} viewBox="-8 -8 116 116" style={{ position: 'absolute', left: width * x - s / 2, top: height * y - s / 2 + float, transform: `scale(${p}) rotate(${rot + Math.sin(frame / 31 + k) * 4}deg)` }}>
            <path d={STICKER_PATHS[(pick + k) % STICKER_PATHS.length]} fill={fill} stroke={fill === palette.surface ? palette.hero : palette.surface} strokeWidth={9} strokeLinejoin="round" paintOrder="stroke" />
          </svg>
        );
      })}
    </AbsoluteFill>
  );
};

/* --- Transiciones ------------------------------------------------------------------
 * Duran `beats.cut` cuadros y van centradas en el corte: a la mitad tapan todo el
 * cuadro (ahí cambia la escena) y después lo destapan. `n` es el número del corte:
 * con él alternan de lado, así dos cortes seguidos no son iguales. */

/** Cuadros que dura una transición del look (las del estilo duran `beats.cut`): más larga, para que se alcance a ver. */
export const LOOK_CUT_FRAMES = 20;
const cutEase = Easing.inOut(Easing.cubic);

export const LookCut: React.FC<{ kind: Exclude<LookCutKind, 'estilo'>; n: number }> = ({ kind, n }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const total = LOOK_CUT_FRAMES;
  const half = total / 2;
  const diag = Math.hypot(width, height);
  const flip = n % 2 === 1;
  const a = interpolate(frame, [0, half], [0, 1], { easing: cutEase, ...clamp });
  const b = interpolate(frame, [half, total], [0, 1], { easing: cutEase, ...clamp });
  const fill: React.CSSProperties = { pointerEvents: 'none', overflow: 'hidden' };

  if (kind === 'flash') {
    const o = frame <= half ? a : 1 - b;
    return <AbsoluteFill style={{ ...fill, backgroundColor: palette.display, opacity: o * 0.9 }} />;
  }

  if (kind === 'barrido') {
    // Dos paneles: el de acento va un paso atrás y asoma como borde.
    const pos = (lag: number) => {
      const f = frame - lag;
      const t = f <= half ? interpolate(f, [0, half], [-1.04, 0], { easing: cutEase, ...clamp }) : interpolate(f, [half, total], [0, 1.04], { easing: cutEase, ...clamp });
      return (flip ? -t : t) * width;
    };
    return (
      <AbsoluteFill style={fill}>
        <div style={{ position: 'absolute', inset: 0, background: palette.accent, transform: `translateX(${pos(2.5)}px)` }} />
        <div style={{ position: 'absolute', inset: 0, background: palette.hero, transform: `translateX(${pos(0)}px)` }} />
      </AbsoluteFill>
    );
  }

  if (kind === 'iris') {
    const cx = width * (flip ? 0.7 : 0.3);
    const cy = height * (flip ? 0.34 : 0.62);
    if (frame < half) {
      const d = a * diag * 2.3;
      return <AbsoluteFill style={fill}><div style={{ position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: '50%', background: palette.hero }} /></AbsoluteFill>;
    }
    const hole = b * diag * 2.3;
    return <AbsoluteFill style={fill}><div style={{ position: 'absolute', left: cx - hole / 2, top: cy - hole / 2, width: hole, height: hole, borderRadius: '50%', boxShadow: `0 0 0 ${diag * 1.4}px ${palette.hero}` }} /></AbsoluteFill>;
  }

  if (kind === 'persianas') {
    const bars = 6;
    const vertical = flip;
    return (
      <AbsoluteFill style={fill}>
        {Array.from({ length: bars }, (_, k) => {
          const lag = k * 0.7;
          const s = frame <= half
            ? interpolate(frame, [lag, half], [0, 1], { easing: cutEase, ...clamp })
            : interpolate(frame, [half, total - (bars - 1 - k) * 0.7], [1, 0], { easing: cutEase, ...clamp });
          const origin = frame <= half ? '0% 0%' : '100% 100%';
          const color = k % 2 ? palette.deep : palette.hero;
          return vertical
            ? <div key={k} style={{ position: 'absolute', top: 0, bottom: 0, left: (width / bars) * k, width: width / bars + 1, background: color, transform: `scaleY(${s})`, transformOrigin: origin }} />
            : <div key={k} style={{ position: 'absolute', left: 0, right: 0, top: (height / bars) * k, height: height / bars + 1, background: color, transform: `scaleX(${s})`, transformOrigin: origin }} />;
        })}
      </AbsoluteFill>
    );
  }

  if (kind === 'diagonal') {
    const size = diag * 1.5;
    const t = frame <= half ? interpolate(frame, [0, half], [-1, 0], { easing: cutEase, ...clamp }) : interpolate(frame, [half, total], [0, 1], { easing: cutEase, ...clamp });
    return (
      <AbsoluteFill style={fill}>
        <div style={{ position: 'absolute', left: width / 2 - size / 2, top: height / 2 - size / 2, width: size, height: size, background: palette.hero, borderLeft: `26px solid ${palette.accent}`, borderRight: `26px solid ${palette.accent}`, transform: `rotate(${flip ? -24 : 24}deg) translateX(${t * size * 1.04}px)` }} />
      </AbsoluteFill>
    );
  }

  // cortina: dos mitades que se cierran al centro y se vuelven a abrir.
  const p = frame <= half ? a : 1 - b;
  const edge = 10;
  return (
    <AbsoluteFill style={fill}>
      {flip ? (
        <>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: (width / 2 + 1) * p, background: palette.hero, borderRight: `${edge}px solid ${palette.accent}` }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: (width / 2 + 1) * p, background: palette.hero, borderLeft: `${edge}px solid ${palette.accent}` }} />
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (height / 2 + 1) * p, background: palette.hero, borderBottom: `${edge}px solid ${palette.accent}` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: (height / 2 + 1) * p, background: palette.hero, borderTop: `${edge}px solid ${palette.accent}` }} />
        </>
      )}
    </AbsoluteFill>
  );
};

/* --- Entrada del texto ----------------------------------------------------------------
 * Envuelve una palabra YA dibujada por el kit (con su relleno, volumen y brillo) y
 * le pone otra entrada. El kit sigue pintando; acá solo se mueve. */

/** Con este retraso, la palabra del kit ya terminó su propia entrada (queda quieta, con sus efectos continuos). */
export const SETTLED_DELAY = -300;

export const EntryWord: React.FC<{ kind: Exclude<LookEntry, 'estilo'>; i: number; delay: number; size: number; letters: number; children: React.ReactNode }> = ({ kind, i, delay, size, letters, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - delay - i * beats.stagger;
  const base: React.CSSProperties = { display: 'inline-block' };
  if (local < 0) return <span style={{ ...base, opacity: 0 }}>{children}</span>;

  if (kind === 'mascara') {
    const p = interpolate(local, [0, 16], [0, 1], { easing: ease.out, ...clamp });
    // Ya asentada no recorta: el volumen y la sombra de la letra vuelven a verse enteros.
    if (p >= 1) return <span style={base}>{children}</span>;
    return (
      <span style={{ ...base, overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: size * 0.1, marginBottom: -size * 0.1 }}>
        <span style={{ ...base, transform: `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 3}deg)` }}>{children}</span>
      </span>
    );
  }
  if (kind === 'rebote') {
    const p = spring({ frame: local, fps, config: springs.bouncy });
    return <span style={{ ...base, opacity: interpolate(local, [0, 3], [0, 1], clamp), transform: `scale(${interpolate(p, [0, 1], [0.3, 1])}) rotate(${(1 - p) * (i % 2 ? 9 : -9)}deg)` }}>{children}</span>;
  }
  if (kind === 'enfoque') {
    const p = interpolate(local, [0, 14], [0, 1], { easing: ease.out, ...clamp });
    return <span style={{ ...base, opacity: p, transform: `scale(${interpolate(p, [0, 1], [1.14, 1])})`, filter: p < 1 ? `blur(${(1 - p) * 14}px)` : undefined }}>{children}</span>;
  }
  if (kind === 'golpe') {
    const p = interpolate(local, [0, 7], [0, 1], { easing: ease.out, ...clamp });
    return <span style={{ ...base, opacity: interpolate(local, [0, 2], [0, 1], clamp), transform: `scale(${interpolate(p, [0, 1], [2.3, 1])})` }}>{children}</span>;
  }
  if (kind === 'giro') {
    const p = interpolate(local, [0, 14], [0, 1], { easing: ease.out, ...clamp });
    return <span style={{ ...base, opacity: interpolate(local, [0, 4], [0, 1], clamp), transform: `perspective(900px) rotateX(${(1 - p) * -88}deg)`, transformOrigin: '50% 100%' }}>{children}</span>;
  }
  // maquina: aparece letra a letra, a saltos.
  const n = Math.max(1, letters);
  const shown = Math.min(n, Math.floor(local / 1.4) + 1);
  if (shown >= n) return <span style={base}>{children}</span>;
  return <span style={{ ...base, clipPath: `inset(-20% ${(1 - shown / n) * 100}% -30% -5%)` }}>{children}</span>;
};
