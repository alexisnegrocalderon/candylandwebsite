import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { seededRandom } from '../../shared/motionVariety';
import { useMotion } from '../context';
import { useSceneCursor } from '../layouts';
import { freeBands, textZone } from '../look';
import { DOODLE_KINDS, doodlePath, roughLine } from '../paper';
import { beats, ease, fonts, rand } from '../theme';
import { BaseFill, clamp, type Kit, type WordProps } from './shared';

/* PIZARRA: un video explicativo «dibujado a mano». El texto se escribe con marcador (de izquierda a derecha, con la punta
 * moviéndose), la palabra clave se subraya y cada escena dibuja sus garabatos (estrellas, flechas, círculos…) trazo a trazo en
 * las zonas que el texto deja libres. Las líneas «hierven» (cambian un poquito cada 3 cuadros), como en una animación a mano.
 * Sin filtros: solo trazos SVG, para que el celular lo mueva sin problema. */

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette, spec, layouts } = useMotion();
  const { idx, local } = useSceneCursor();
  const boil = Math.floor(frame / 3);
  const tall = height / width > 1.5;
  const bands = freeBands(textZone(spec.style, layouts[idx]), tall);
  const r = seededRandom(spec.seed * 19 + idx * 131 + 7);
  // Tres garabatos por escena: distintos entre sí y de un lado y otro del texto.
  const kinds = [...DOODLE_KINDS].sort(() => r() - 0.5).slice(0, 3);
  const xs = [0.2, 0.8, 0.5].sort(() => r() - 0.5);
  const colors = [palette.hero, palette.accent, palette.micro];
  const grid = palette.micro;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <BaseFill />
      {/* Cuadrícula de cuaderno, muy suave, y un par de manchas de borrador. */}
      <AbsoluteFill style={{ backgroundImage: `linear-gradient(${grid}14 2px, transparent 2px), linear-gradient(90deg, ${grid}14 2px, transparent 2px)`, backgroundSize: '96px 96px', backgroundPosition: '0 30px' }} />
      <div style={{ position: 'absolute', left: width * 0.05, top: height * 0.34, width: width * 0.7, height: height * 0.12, borderRadius: '50%', background: palette.surface, opacity: 0.35, transform: 'rotate(-8deg)' }} />
      <div style={{ position: 'absolute', right: width * 0.02, top: height * 0.62, width: width * 0.6, height: height * 0.1, borderRadius: '50%', background: palette.surface, opacity: 0.3, transform: 'rotate(6deg)' }} />
      {kinds.map((kind, k) => {
        const start = 6 + k * 9;
        const p = interpolate(local, [start, start + 16], [0, 1], { easing: ease.out, ...clamp });
        if (p <= 0) return null;
        const size = width * (0.11 + r() * 0.05);
        const band = bands[k % bands.length];
        const cx = width * xs[k];
        const cy = height * (band + (r() - 0.5) * 0.05);
        const rot = (r() - 0.5) * 30;
        return (
          <svg key={`${idx}-${k}`} width={size * 2} height={size * 2} viewBox="-1.25 -1.25 2.5 2.5" style={{ position: 'absolute', left: cx - size, top: cy - size, transform: `rotate(${rot}deg)`, overflow: 'visible' }}>
            <path
              d={doodlePath(kind, spec.seed + idx * 31 + k * 7, boil)}
              pathLength={1}
              fill="none"
              stroke={colors[k % colors.length]}
              // 7 px: la caja de 2,5 unidades mide `size * 2` px, así que 1 unidad = size * 0,8 px.
              strokeWidth={7 / (size * 0.8)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={1}
              strokeDashoffset={1 - p}
            />
          </svg>
        );
      })}
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { palette, spec } = useMotion();
  // Las palabras se escriben de a una (más pausado que en los otros estilos): cada una espera a que termine la anterior.
  const local = frame - delay - i * beats.stagger * 2;
  if (local < 0) return <span style={{ display: 'inline-block', opacity: 0 }}>{word}</span>;
  const dur = Math.max(6, Math.round(word.length * 1.5));
  const p = interpolate(local, [0, dur], [0, 1], { ...clamp });
  const boil = Math.floor(frame / 4);
  const jitter = (rand(boil * 3 + i * 9 + (spec.seed % 53)) - 0.5) * (hero ? 1.2 : 1.8);
  const under = interpolate(local, [dur, dur + 9], [0, 1], { easing: ease.out, ...clamp });
  const color = hero ? palette.hero : palette.display;
  return (
    <span style={{ display: 'inline-block', position: 'relative', fontFamily: fonts.marker, color, transform: `rotate(${jitter + (hero ? -2 : 0)}deg) scale(${hero ? 1.08 : 1})` }}>
      {/* El texto se revela de izquierda a derecha, como si se escribiera. */}
      <span style={{ display: 'inline-block', clipPath: `inset(-20% ${(1 - p) * 100}% -20% -6%)` }}>{word}</span>
      {/* La punta del marcador, mientras escribe. */}
      {p < 1 && <span style={{ position: 'absolute', left: `${p * 100}%`, top: '55%', width: size * 0.13, height: size * 0.13, marginLeft: -size * 0.04, borderRadius: '50%', background: hero ? palette.accent : palette.hero, boxShadow: `0 0 0 ${size * 0.03}px ${palette.surface}` }} />}
      {/* La palabra clave se subraya con un trazo que tiembla. */}
      {hero && under > 0 && (
        <svg width="100%" height={size * 0.22} viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -size * 0.08, overflow: 'visible' }}>
          <path d={roughLine(spec.seed + i * 5, Math.floor(frame / 3))} pathLength={1} fill="none" stroke={palette.accent} strokeWidth={0.32} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - under} />
        </svg>
      )}
    </span>
  );
};

/** Transición: un borrador de pizarra barre el cuadro de izquierda a derecha (y deja la pizarra limpia). */
const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const total = beats.cut;
  const half = total / 2;
  const L = frame <= half ? interpolate(frame, [0, half], [width + 160, 0], { easing: ease.in, ...clamp }) : 0;
  const R = frame <= half ? width : interpolate(frame, [half, total], [width, -160], { easing: ease.out, ...clamp });
  const edge = frame <= half ? L : R;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: Math.max(0, L), width: Math.max(0, R - Math.max(0, L)), background: palette.bg }} />
      {/* El borrador: cuerpo de fieltro y su cinta, justo en el borde que avanza. */}
      <div style={{ position: 'absolute', left: edge - 70, top: height * 0.4, width: 210, height: height * 0.2, borderRadius: 26, background: palette.display, boxShadow: '0 14px 0 rgba(0,0,0,0.18)', transform: `rotate(${frame % 2 ? -2 : 2}deg)` }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '38%', borderRadius: '26px 26px 0 0', background: palette.hero }} />
      </div>
    </AbsoluteFill>
  );
};

export const pizarra: Kit = {
  Background,
  Word,
  Cut,
  align: 'center',
  uppercase: false,
  headlineFont: fonts.marker,
  headlineWeight: 400,
  letterSpacing: '0.005em',
  lineHeight: 1.16,
  contrast: false,
  grade: 0.03,
  grain: 0.06,
  vignette: 0.06,
  cutSfx: 'whoosh',
  exitStyle: (p) => ({ opacity: 1 - p }),
};
