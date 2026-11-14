import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolvePaper, sceneJitter } from '../../shared/motionVariety';
import { useMotion } from '../context';
import { useGlide } from '../layouts';
import { onColor } from '../look';
import { jaggedEdge, tornClip } from '../paper';
import { beats, ease, fonts, rand } from '../theme';
import { BaseFill, clamp, type Kit, type WordProps } from './shared';

/* COLLAGE Y PAPEL: cuatro papeles dentro de un mismo estilo (spec.paper, o el que elija la semilla del video):
 *  - rasgado:   cada palabra es un recorte de papel con el borde dentado, pegado de un golpe y que tiembla como en stop-motion;
 *  - riso:      risografía, dos tintas que no calzan del todo (se «desalinean») sobre papel;
 *  - scrapbook: letras recortadas una por una, hoja de cuaderno y cintas;
 *  - diario:    titular de prensa con semitono, y la palabra clave marcada con resaltador.
 * El movimiento es «a doses» (se actualiza cada 2 o 3 cuadros), que es lo que hace que se sienta recortado a mano. Solo colores
 * de la paleta del video (nunca uno nuevo): el papel es el fondo, y los recortes salen de blanco, acento y tinta. */

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette, spec } = useMotion();
  const paper = resolvePaper(spec);
  const step = Math.floor(frame / 3);
  // Las formas grandes cambian de lugar con la semilla y se deslizan al cambiar de escena.
  const [ax, ay, bx, by] = useGlide((i) => {
    const j = sceneJitter(spec.seed, i);
    const k = sceneJitter(spec.seed + 91, i);
    return [0.5 + j.x * 0.28, 0.28 + 0.14 * (j.y * 0.5 + 0.5), 0.5 + k.x * 0.3, 0.74 - 0.12 * (k.y * 0.5 + 0.5), 0, 0];
  });
  const ink = palette.micro;

  if (paper === 'rasgado') {
    const piece = (cx: number, cy: number, w: number, h: number, rot: number, color: string, seedAdd: number) => (
      <div
        style={{
          position: 'absolute', left: width * cx - (width * w) / 2, top: height * cy - (height * h) / 2, width: width * w, height: height * h,
          transform: `rotate(${rot + ((step + seedAdd) % 3 - 1) * 0.35}deg)`, filter: 'drop-shadow(0 14px 0 rgba(0,0,0,0.16))',
        }}
      >
        <div style={{ width: '100%', height: '100%', background: color, clipPath: tornClip(spec.seed + seedAdd * 17 + (step % 3), 12, 5) }} />
      </div>
    );
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <BaseFill />
        {piece(ax, ay, 0.92, 0.36, -5, palette.hero, 1)}
        {piece(bx, by, 0.86, 0.3, 4, palette.accent, 2)}
        {piece(1 - ax * 0.4, 0.5, 0.5, 0.18, 9, palette.surface, 3)}
      </AbsoluteFill>
    );
  }

  if (paper === 'riso') {
    const dot = `radial-gradient(${ink} 24%, transparent 27%)`;
    const circle = (cx: number, cy: number, r: number, color: string, dx: number, dy: number) => (
      <div style={{ position: 'absolute', left: width * cx - r + dx, top: height * cy - r + dy, width: r * 2, height: r * 2, borderRadius: '50%', background: color, mixBlendMode: palette.dark ? 'screen' : 'multiply', opacity: 0.55 }} />
    );
    const reg = (x: number, y: number) => (
      <svg width={46} height={46} viewBox="-23 -23 46 46" style={{ position: 'absolute', left: x - 23, top: y - 23, opacity: 0.55 }}>
        <circle r={12} fill="none" stroke={ink} strokeWidth={2.5} />
        <path d="M-22 0H22M0 -22V22" stroke={ink} strokeWidth={2.5} />
      </svg>
    );
    // Las dos tintas se corren unos píxeles entre sí y «respiran» un poco: así se ve que no calzan.
    const wob = Math.sin(frame / 38) * 6;
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <BaseFill />
        {/* Dos tintas, una a cada lado: solo se cruzan en una lente, así el texto casi siempre cae sobre una sola tinta. */}
        {circle(ax, ay, width * 0.33, palette.hero, 0, 0)}
        {circle(1 - ax, Math.min(0.8, ay + 0.2), width * 0.3, palette.accent, 22 + wob, 16 - wob)}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: dot, backgroundSize: '26px 26px', opacity: 0.2, WebkitMaskImage: `radial-gradient(circle at ${bx * 100}% ${by * 100}%, black 0, transparent 62%)`, maskImage: `radial-gradient(circle at ${bx * 100}% ${by * 100}%, black 0, transparent 62%)` }} />
        {reg(70, 70)}{reg(width - 70, height - 70)}
      </AbsoluteFill>
    );
  }

  if (paper === 'scrapbook') {
    const tape = (x: number, y: number, rot: number) => (
      <div style={{ position: 'absolute', left: x - 130, top: y - 34, width: 260, height: 68, transform: `rotate(${rot}deg)`, background: `${palette.surface}CC`, boxShadow: '0 6px 0 rgba(0,0,0,0.12)', clipPath: 'polygon(0 6%, 4% 0, 8% 8%, 12% 0, 100% 0, 96% 50%, 100% 100%, 90% 94%, 86% 100%, 0 100%, 3% 50%)' }} />
    );
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <BaseFill />
        {/* Hoja de cuaderno: cuadrícula suave y la línea del margen. */}
        <AbsoluteFill style={{ backgroundImage: `linear-gradient(${ink}26 2px, transparent 2px), linear-gradient(90deg, ${ink}26 2px, transparent 2px)`, backgroundSize: '72px 72px', backgroundPosition: '12px 20px' }} />
        <div style={{ position: 'absolute', left: width * 0.13, top: 0, bottom: 0, width: 4, background: palette.hero, opacity: 0.55 }} />
        {tape(width * (0.16 + ax * 0.1), height * 0.17, -24 + (step % 2))}
        {tape(width * (0.84 - bx * 0.1), height * 0.86, 21 - (step % 2))}
      </AbsoluteFill>
    );
  }

  // diario
  const rule = (y: number) => (
    <>
      <div style={{ position: 'absolute', left: 56, right: 56, top: y, height: 8, background: ink, opacity: 0.8 }} />
      <div style={{ position: 'absolute', left: 56, right: 56, top: y + 16, height: 2, background: ink, opacity: 0.8 }} />
    </>
  );
  const dots = `radial-gradient(${palette.hero} 26%, transparent 29%)`;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <BaseFill />
      {/* Mancha de semitono: puntos que se agrandan hacia el centro de la mancha. */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: dots, backgroundSize: '30px 30px', opacity: 0.55, WebkitMaskImage: `radial-gradient(circle at ${ax * 100}% ${ay * 100}%, black 0, transparent 58%)`, maskImage: `radial-gradient(circle at ${ax * 100}% ${ay * 100}%, black 0, transparent 58%)` }} />
      {[0.25, 0.5, 0.75].map((x) => <div key={x} style={{ position: 'absolute', left: width * x, top: height * 0.22, bottom: height * 0.12, width: 2, background: ink, opacity: 0.18 }} />)}
      {rule(height * 0.185)}
      {rule(height * 0.815)}
    </AbsoluteFill>
  );
};

const PAPER_FONT: Record<string, string> = { rasgado: fonts.numbers, riso: fonts.grotesk, scrapbook: fonts.numbers, diario: fonts.numbers };

const Word: React.FC<WordProps> = ({ word, i, delay, hero, size }) => {
  const frame = useCurrentFrame();
  const { palette, spec } = useMotion();
  const paper = resolvePaper(spec);
  const local = frame - delay - i * beats.stagger;
  const hidden = <span style={{ display: 'inline-block', opacity: 0 }}>{word}</span>;
  if (local < 0) return hidden;
  const sd = spec.seed % 97;
  // «A doses»: el recorte se pega de un golpe (grande → su tamaño en 4 saltos) y después tiembla un poquito.
  const slap = [1.45, 1.2, 1.07, 1][Math.min(3, Math.floor(local / 2))];
  const boil = Math.floor(frame / 4);
  const shiver = (rand(boil * 7 + i * 13 + sd) - 0.5) * 1.4;
  const tilt = (rand(i * 5.3 + sd) - 0.5) * 7;
  const family = PAPER_FONT[paper];

  if (paper === 'rasgado') {
    const pool = [palette.surface, palette.display, palette.accent, palette.surface];
    let bg = hero ? palette.hero : pool[(i + sd) % pool.length];
    // El papel del texto nunca se confunde con el papel del fondo del cuadro.
    if (!hero && bg === palette.bg) bg = palette.surface;
    return (
      <span style={{ display: 'inline-block', transform: `rotate(${tilt + shiver}deg) scale(${slap})`, filter: `drop-shadow(0 ${size * 0.05}px 0 rgba(0,0,0,0.24))` }}>
        <span style={{ display: 'inline-block', fontFamily: family, background: bg, color: onColor(bg), padding: `${size * 0.05}px ${size * 0.2}px ${size * 0.01}px`, clipPath: tornClip(i * 31 + sd + (boil % 3), 9, 7) }}>
          {word}
        </span>
      </span>
    );
  }

  if (paper === 'riso') {
    // Dos pasadas de tinta: la de atrás (acento) llega corrida; al entrar se desalinea mucho y va calzando.
    const off = size * 0.035 + Math.max(0, 6 - local) * size * 0.014;
    const mix = palette.dark ? 'screen' : 'multiply';
    const front = hero ? palette.hero : palette.display;
    return (
      <span style={{ display: 'inline-block', position: 'relative', fontFamily: family, fontWeight: 700, letterSpacing: '-0.03em', transform: `rotate(${tilt * 0.4}deg)`, opacity: interpolate(local, [0, 2], [0, 1], clamp) }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, color: hero ? palette.accent : palette.hero, transform: `translate(${off}px, ${off * 0.8}px)`, mixBlendMode: mix, whiteSpace: 'nowrap' }}>{word}</span>
        <span style={{ position: 'relative', color: front, mixBlendMode: mix }}>{word}</span>
      </span>
    );
  }

  if (paper === 'scrapbook') {
    const pool = [palette.surface, palette.accent, palette.display, palette.surface, palette.hero];
    return (
      <span style={{ display: 'inline-block', whiteSpace: 'nowrap', transform: `scale(${slap > 1.2 ? 1.1 : 1})` }}>
        {Array.from(word).map((ch, k) => {
          const lt = local - k * 1.1;
          if (lt < 0) return <span key={k} style={{ display: 'inline-block', opacity: 0, padding: `0 ${size * 0.08}px` }}>{ch}</span>;
          const ls = [1.5, 1.22, 1.06, 1][Math.min(3, Math.floor(lt / 2))];
          let bg = hero ? (k % 3 === 1 ? palette.surface : palette.hero) : pool[(k + i + sd) % pool.length];
          if (bg === palette.bg) bg = palette.surface;
          const dy = (rand(k * 3.1 + i * 7 + sd) - 0.5) * size * 0.1;
          const rot = (rand(k * 1.7 + i * 11 + sd) - 0.5) * 11 + (rand(boil + k * 5 + i) - 0.5) * 1.2;
          return (
            <span
              key={k}
              style={{
                display: 'inline-block', margin: `0 ${size * 0.015}px`, fontFamily: family, background: bg, color: onColor(bg), padding: `${size * 0.03}px ${size * 0.075}px 0`,
                transform: `translateY(${dy}px) rotate(${rot}deg) scale(${ls})`, boxShadow: `0 ${size * 0.045}px 0 rgba(0,0,0,0.2)`,
                clipPath: k % 2 ? undefined : 'polygon(0 4%, 100% 0, 97% 100%, 3% 96%)',
              }}
            >
              {ch}
            </span>
          );
        })}
      </span>
    );
  }

  // diario: tinta negra sobre papel de prensa; la palabra clave, con resaltador y puntos de semitono.
  const press = interpolate(local, [0, 3], [0, 1], clamp);
  if (hero) {
    return (
      <span
        style={{
          display: 'inline-block', fontFamily: family, color: onColor(palette.hero), letterSpacing: '0.01em', padding: `${size * 0.02}px ${size * 0.14}px 0`, opacity: press,
          backgroundImage: `radial-gradient(rgba(0,0,0,0.2) 22%, transparent 25%), linear-gradient(${palette.hero}, ${palette.hero})`, backgroundSize: `${size * 0.1}px ${size * 0.1}px, 100% 100%`,
          transform: `rotate(-1.6deg) skewX(-4deg) scale(${slap > 1.2 ? 1.12 : 1})`, boxShadow: `${size * 0.05}px ${size * 0.05}px 0 ${palette.display}`,
        }}
      >
        {word}
      </span>
    );
  }
  return <span style={{ display: 'inline-block', fontFamily: family, color: palette.display, letterSpacing: '0.01em', opacity: press, transform: `scale(${slap > 1.2 ? 1.08 : 1})` }}>{word}</span>;
};

/** Transición: una tira de papel rasgado cruza el cuadro de derecha a izquierda (con otra de acento un paso atrás). */
const Cut: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { palette, spec } = useMotion();
  const total = beats.cut;
  const half = total / 2;
  // Entra por la derecha hasta cubrir todo y sale por la izquierda; el borde de cada lado es dentado.
  const L = frame <= half ? interpolate(frame, [0, half], [width + 45, 0], { easing: ease.in, ...clamp }) : 0;
  const R = frame <= half ? width : interpolate(frame, [half, total], [width, -45], { easing: ease.out, ...clamp });
  const s = spec.seed + Math.floor(frame / 2);
  const poly = (shift: number, seed: number) => {
    const left = jaggedEdge(seed, height, L - 40 + shift, 14, 40);
    const right = jaggedEdge(seed + 500, height, R + shift, 14, 40).reverse();
    return [...left, ...right].map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ');
  };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width={width} height={height}>
        <polygon points={poly(46, s + 9)} fill={palette.accent} />
        <polygon points={poly(0, s)} fill={palette.hero} />
      </svg>
    </AbsoluteFill>
  );
};

export const collage: Kit = {
  Background,
  Word,
  Cut,
  align: 'center',
  uppercase: true,
  headlineFont: fonts.numbers,
  headlineWeight: 400,
  letterSpacing: '0.01em',
  lineHeight: 1.12,
  contrast: false,
  grade: 0.08,
  grain: 0.12,
  vignette: 0.12,
  cutSfx: 'rip',
  exitStyle: (p) => ({ opacity: 1 - p, transform: `translateY(${p * 36}px) rotate(${p * 2.5}deg)` }),
};
