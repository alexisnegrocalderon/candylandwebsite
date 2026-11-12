import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { useMotion } from '../context';
import { beats, fonts, rand } from '../theme';
import { BaseFill, type Kit, type WordProps } from './shared';

/* ARCADE — PLAYMORE · Player 1 vs Player 2. Pantalla de arcade futurista: piso de grilla neón que corre hacia el
 * horizonte, sol retro, líneas de pantalla y el marcador P1 (magenta, mundo Playroom) contra P2 (celeste, mundo
 * Dalmore). Las palabras entran «pixeladas» (en saltos, como un juego de 8 bits) con brillo neón. Solo colores de
 * la paleta (motionPalette('arcade')): magenta = hero, celeste = accent, oro = micro. */

const glow = (color: string, k = 1) => `0 0 ${18 * k}px ${color}, 0 0 ${46 * k}px ${color}99`;

/** Puntaje del marcador: sube a saltos y nunca baja (mismo cuadro = mismo número). */
function score(frame: number, seed: number): string {
  const steps = Math.floor(frame / 9);
  let total = 0;
  for (let k = 0; k < steps; k++) total += rand(k * 7 + seed) > 0.55 ? 50 + Math.floor(rand(k + seed) * 4) * 50 : 0;
  return String(total).padStart(5, '0');
}

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const horizon = height * 0.6;
  const blocks = (color: string) => (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {[0, 1, 2, 3].map((k) => <span key={k} style={{ width: 14, height: 24, background: color, boxShadow: glow(color, 0.4) }} />)}
    </span>
  );
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <BaseFill />
      {/* Sol retro en el horizonte (oro → magenta), con franjas. */}
      <div
        style={{
          position: 'absolute', left: width / 2 - width * 0.3, top: horizon - width * 0.3, width: width * 0.6, height: width * 0.3,
          borderRadius: `${width * 0.3}px ${width * 0.3}px 0 0`, background: `linear-gradient(180deg, ${palette.micro} 0%, ${palette.hero} 85%)`, opacity: 0.32,
          maskImage: 'repeating-linear-gradient(180deg, #000 0 26px, transparent 26px 34px)', WebkitMaskImage: 'repeating-linear-gradient(180deg, #000 0 26px, transparent 26px 34px)',
        }}
      />
      {/* Piso de grilla que corre hacia la cámara. */}
      <div
        style={{
          position: 'absolute', left: -width * 0.6, right: -width * 0.6, top: horizon, height: height - horizon + height * 0.1,
          backgroundImage: `linear-gradient(${palette.hero}CC 4px, transparent 4px), linear-gradient(90deg, ${palette.accent}AA 4px, transparent 4px)`,
          backgroundSize: '140px 110px', backgroundPosition: `0 ${(frame * 5) % 110}px`,
          transform: 'perspective(900px) rotateX(64deg)', transformOrigin: '50% 0%', opacity: 0.75,
        }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, top: horizon - 3, height: 6, background: palette.hero, boxShadow: glow(palette.hero, 0.8), opacity: 0.8 }} />
      {/* Marcador Player 1 vs Player 2. */}
      <div style={{ position: 'absolute', left: width * 0.08, right: width * 0.08, top: height > 1500 ? 196 : 112, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: fonts.grotesk, fontWeight: 700, fontSize: 30, letterSpacing: '0.16em' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14, color: palette.hero }}>P1 {blocks(palette.hero)} <span style={{ color: palette.display }}>{score(frame, 3)}</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14, color: palette.accent }}><span style={{ color: palette.display }}>{score(frame, 11)}</span> {blocks(palette.accent)} P2</span>
      </div>
      {/* Líneas de pantalla y un barrido de luz lento. */}
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 2px, transparent 2px, transparent 6px)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: ((frame * 9) % (height + 300)) - 300, height: 300, background: `linear-gradient(180deg, transparent, ${palette.display}10, transparent)` }} />
    </AbsoluteFill>
  );
};

const Word: React.FC<WordProps> = ({ word, i, delay, hero }) => {
  const frame = useCurrentFrame();
  const { palette } = useMotion();
  const local = frame - delay - i * beats.stagger;
  if (local < 0) return <span style={{ display: 'inline-block', opacity: 0 }}>{word}</span>;
  // Entrada en saltos (8 bits): 1,6 → 1,3 → 1,1 → 1, y un parpadeo en el primer cuadro.
  const step = Math.min(3, Math.floor(local / 2));
  const scale = [1.6, 1.3, 1.1, 1][step];
  const color = hero ? palette.hero : palette.display;
  const halo = hero ? palette.hero : palette.accent;
  return (
    <span
      style={{
        display: 'inline-block', opacity: local < 1 ? 0.4 : 1, transform: `scale(${scale})`, color,
        textShadow: `${glow(halo, hero ? 1 : 0.7)}, 6px 6px 0 ${hero ? palette.accent : palette.hero}`,
      }}
    >
      {word}
    </span>
  );
};

/** Transición: la pantalla se llena de bloques de color (píxeles) y se vacía. */
const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette } = useMotion();
  const mid = beats.cut / 2;
  const dist = Math.abs(frame - mid);
  if (dist > 4) return null;
  const cols = 9;
  const size = width / cols;
  const rows = Math.ceil(height / size);
  const fill = 1 - dist / 5;
  const colors = [palette.hero, palette.accent, palette.micro, palette.bg];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: cols * rows }, (_, k) => {
        if (rand(k * 13 + 5) > fill) return null;
        return <div key={k} style={{ position: 'absolute', left: (k % cols) * size, top: Math.floor(k / cols) * size, width: size + 1, height: size + 1, background: colors[k % colors.length] }} />;
      })}
    </AbsoluteFill>
  );
};

export const arcade: Kit = {
  Background,
  Word,
  Cut,
  align: 'center',
  uppercase: true,
  headlineFont: fonts.body,
  headlineWeight: 800,
  letterSpacing: '-0.02em',
  lineHeight: 1.02,
  contrast: false,
  grade: 0.12,
  grain: 0.06,
  vignette: 0.3,
  cutSfx: 'glitch',
  exitStyle: (p) => ({ opacity: 1 - p, transform: `scale(${1 + p * 0.15})` }),
};
