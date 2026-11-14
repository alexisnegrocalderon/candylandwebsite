import { useMemo } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND } from '../shared/motionSpec';
import { MASCOT_COLOR_HEX, MASCOT_CONFETTI_FRAMES, MASCOT_INFLATE_FRAMES, MASCOT_SPIN, mascotTimes, resolveMascotPattern, type MascotColor } from '../shared/motionMascot';
import { useBeat } from './beat';
import { useMotion } from './context';
import { BalloonDog } from './three/BalloonDog';
import { DOG_BOX, dogTheme, PlayroomDog } from './playroom/dog';
import { ease, rand, safeInsets } from './theme';

/* El perrito globo en el video (shared/motionMascot.ts dice cuándo pasa cada cosa). Va detrás del texto y dentro de la
 * cámara (se acerca y late con ella). Vive todo el video:
 *  - se infla al empezar, con un rebote;
 *  - con música, se aplasta en cada pulso y da un saltito en los golpes fuertes; sin música, flota;
 *  - en cada corte de escena da una vuelta entera (se ve el reflejo);
 *  - si revienta: se hincha, estalla en confeti con los colores de la marca y deja la firma.
 * Es una capa del video entero (fuera de las <Sequence>): lee el cuadro global, igual que el pulso. */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const CONFETTI = [BRAND.magenta, BRAND.pink, BRAND.blue, BRAND.gold, BRAND.white];

const Confetti: React.FC<{ t: number; x: number; y: number; size: number; color: string; seed: number }> = ({ t, x, y, size, color, seed }) => {
  const k = size / 1000;
  const fade = interpolate(t, [MASCOT_CONFETTI_FRAMES - 12, MASCOT_CONFETTI_FRAMES], [1, 0], clamp);
  const ring = interpolate(t, [0, 9], [0, 1], { easing: ease.out, ...clamp });
  const colors = [...CONFETTI, color];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* El «¡pum!»: un anillo de luz que se abre. */}
      <div
        style={{
          position: 'absolute', left: x - size * 0.45 * ring, top: y - size * 0.45 * ring, width: size * 0.9 * ring, height: size * 0.9 * ring,
          borderRadius: '50%', border: `${Math.max(2, 18 * k * (1 - ring))}px solid ${BRAND.white}`, opacity: (1 - ring) * 0.9,
        }}
      />
      {Array.from({ length: 64 }, (_, i) => {
        const a = rand(seed + i * 3.1) * Math.PI * 2;
        const speed = (0.35 + 0.65 * rand(seed + i * 7.7)) * size * 0.05;
        const vx = Math.cos(a) * speed;
        const vy = Math.sin(a) * speed - size * 0.025;
        const g = size * 0.0024;
        // Frenado del aire: se abre rápido y después cae despacio.
        const drag = (1 - Math.pow(0.9, t)) / 0.1;
        const px = x + vx * drag;
        const py = y + vy * drag + 0.5 * g * t * t;
        const w = (rand(seed + i) > 0.5 ? 16 : 22) * k * 2.2;
        const round = rand(seed + i * 1.9) > 0.65;
        const spin = t * (rand(seed + i * 5.3) * 30 - 15);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: px, top: py, width: w, height: round ? w : w * 1.9, borderRadius: round ? '50%' : 3 * k,
              background: colors[i % colors.length], opacity: fade,
              transform: `translate(-50%, -50%) rotate(${spin}deg) scaleX(${Math.cos((t + i) / 3)})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const Mascot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { spec, timeline, width, height, captionsOn } = useMotion();
  const b = useBeat();
  const times = useMemo(() => mascotTimes(spec, timeline, fps), [spec, timeline, fps]);
  const mascot = spec.mascot;
  if (!mascot) return null;

  const pair = mascot.kind === 'pareja';
  const inset = safeInsets(width, height);
  const big = mascot.size === 'grande';
  const size = Math.round(big ? Math.min(width * 0.9, height * 0.5) : width * 0.46);
  const cx = big ? width / 2 : width - inset.side - size * 0.36;
  // El dibujo ilustrado es más «ruidoso» que el globo 3D (estampados): va más abajo para dejar libre el titular.
  const cy = big ? height * (mascot.style === 'ilustrado' ? 0.67 : 0.63) : height - inset.bottom - size * 0.4 - (captionsOn ? height * 0.1 : 0);

  // Inflarse (con un rebote) y, en loop sin reventar, desinflarse al final.
  let inflate = spring({ frame, fps, config: { damping: 9, stiffness: 110, mass: 0.8 }, durationInFrames: MASCOT_INFLATE_FRAMES + 18 });
  if (times.deflateAt != null) inflate *= interpolate(frame, [times.deflateAt, times.total - 1], [1, 0], { easing: ease.in, ...clamp });
  // Antes de reventar se hincha de más (y tiembla un poco).
  let swell = 1;
  let gone = false;
  if (times.popAt != null) {
    swell = interpolate(frame, [times.popAt - 8, times.popAt], [1, 1.22], { easing: ease.in, ...clamp });
    if (frame >= times.popAt - 8 && frame < times.popAt) swell += Math.sin(frame * 2.1) * 0.015;
    gone = frame >= times.popAt;
  }
  // Una vuelta entera en cada corte.
  const spin = times.spins.reduce((acc, c) => acc + interpolate(frame, [c - MASCOT_SPIN.before, c + MASCOT_SPIN.after], [0, Math.PI * 2], { easing: ease.inOut, ...clamp }), 0);
  const rotY = (pair ? -0.2 : -0.6) + Math.sin(frame / 38) * (pair ? 0.16 : 0.32) + spin;
  // Con música se aplasta en el pulso y salta en los golpes; sin música, flota. En la pareja se aplastan por turnos
  // (uno en los pulsos pares, el otro en los impares).
  const squash = b.has ? b.pulse * (0.45 + 0.55 * b.energy) : 0;
  const even = b.index % 2 === 0;
  const hop = b.has ? b.hit * size * 0.05 : 0;
  const bob = Math.sin(frame / 22) * size * 0.012;
  const lift = hop + bob;

  // El confeti lleva el color del globo (en los dibujos de solo línea, el de la tinta).
  const dogInk = dogTheme(mascot.color);
  const color = mascot.style === 'ilustrado' && !dogInk.gloss ? dogInk.ink : MASCOT_COLOR_HEX[mascot.color];
  const feetY = cy - size / 2 + size * 0.83;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {!gone && (
        <>
          {/* Sombra suave en el piso: se achica cuando salta. */}
          <div
            style={{
              position: 'absolute', left: cx - size * 0.3, top: feetY - size * 0.035, width: size * 0.6, height: size * 0.07, borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.38), rgba(0,0,0,0) 70%)',
              opacity: inflate * (1 - Math.min(0.6, lift / (size * 0.08))) * 0.9,
              transform: `scaleX(${1 - Math.min(0.3, lift / (size * 0.2))})`,
            }}
          />
          <div style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2 - lift, width: size, height: size, transform: `scale(${swell})` }}>
            {mascot.style === 'ilustrado' ? (
              // La ilustración de Playroom (la de los vasos). La pareja: dos perritos frente a frente, cada uno con su color y su estampado.
              pair ? (
                <>
                  {[0, 1].map((k) => {
                    const pw = size * 0.53;
                    const h = (pw * DOG_BOX.height) / DOG_BOX.width;
                    const other: MascotColor = mascot.color === 'celeste' || mascot.color === 'linea-celeste' ? 'magenta' : 'celeste';
                    return (
                      <div key={k} style={{ position: 'absolute', left: k === 0 ? 0 : size * 0.47, top: size * 0.83 - (DOG_BOX.feet / DOG_BOX.height) * h }}>
                        <PlayroomDog width={pw} color={k === 0 ? mascot.color : other} pattern={resolveMascotPattern(mascot.pattern, spec.seed, k)} inflate={inflate} squash={(k === 0) === even ? squash : squash * 0.3} turn={spin} flip={k === 0} phase={k * 11} />
                      </div>
                    );
                  })}
                </>
              ) : (
                // Un poco más chico que el cuadro: así el hocico y la cola no tocan los bordes.
                <div style={{ position: 'absolute', left: size * 0.07, top: size * 0.83 - (DOG_BOX.feet / DOG_BOX.height) * ((size * 0.86 * DOG_BOX.height) / DOG_BOX.width) }}>
                  <PlayroomDog width={size * 0.86} color={mascot.color} pattern={resolveMascotPattern(mascot.pattern, spec.seed)} inflate={inflate} squash={squash} turn={spin} />
                </div>
              )
            ) : (
              <BalloonDog
                size={size}
                variant={pair ? 'pareja' : 'uno'}
                color={color}
                multi={mascot.color === 'multi'}
                metal={mascot.color === 'plata' || mascot.color === 'oro'}
                inflate={inflate}
                squash={pair ? (even ? squash : squash * 0.3) : squash}
                squash2={pair ? (even ? squash * 0.3 : squash) : 0}
                rotY={rotY}
              />
            )}
          </div>
        </>
      )}
      {times.popAt != null && frame >= times.popAt && frame < times.popAt + MASCOT_CONFETTI_FRAMES && (
        <Confetti t={frame - times.popAt} x={cx} y={cy - size * 0.05} size={size} color={color} seed={spec.seed % 997} />
      )}
    </AbsoluteFill>
  );
};
