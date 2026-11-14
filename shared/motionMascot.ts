/* El perrito globo: el objeto característico de Playroom, en 3D (motion/three/BalloonDog.tsx). Va DETRÁS del texto (nunca
 * lo tapa) y vive todo el video: se infla al empezar, rebota con cada pulso de la música, gira mostrando el reflejo en
 * cada corte y, si se pide, revienta en confeti en el golpe más cercano a la firma (o al final).
 *
 * Acá vive solo lo PURO: la forma, la limpieza y los momentos clave (para la composición, el sonido y los tests). */
import { songHitFrames, type MotionSong } from './motionSong';

export const MASCOT_KINDS = ['perrito', 'pareja'] as const;
export type MascotKind = (typeof MASCOT_KINDS)[number];
export const MASCOT_KIND_LABEL: Record<MascotKind, string> = {
  perrito: 'Un perrito',
  pareja: 'La pareja (rosa y celeste, frente a frente)',
};

export const MASCOT_COLORS = ['magenta', 'rosa', 'celeste', 'rojo', 'amarillo', 'multi', 'oro', 'plata'] as const;
export type MascotColor = (typeof MASCOT_COLORS)[number];
export const MASCOT_COLOR_LABEL: Record<MascotColor, string> = {
  magenta: 'Magenta (el clásico)',
  rosa: 'Rosa',
  celeste: 'Celeste',
  rojo: 'Rojo brillante',
  amarillo: 'Amarillo',
  multi: 'Multicolor (cada burbuja de un color)',
  oro: 'Oro',
  plata: 'Plata espejo',
};
/** Color base de cada globo (el brillo lo pone el reflejo). */
export const MASCOT_COLOR_HEX: Record<MascotColor, string> = {
  magenta: '#FF1E9A',
  rosa: '#F49BFF',
  celeste: '#2BB5FF',
  rojo: '#FF2D3A',
  amarillo: '#FFD23F',
  multi: '#FF1E9A',
  oro: '#F2C14E',
  plata: '#E6ECF5',
};

export const MASCOT_SIZES = ['grande', 'chico'] as const;
export type MascotSize = (typeof MASCOT_SIZES)[number];
export const MASCOT_SIZE_LABEL: Record<MascotSize, string> = {
  grande: 'Grande, al centro (protagonista)',
  chico: 'Chico, en la esquina (acompaña)',
};

export interface MotionMascot {
  kind: MascotKind;
  color: MascotColor;
  size: MascotSize;
  /** Revienta en confeti al final (en el golpe más cercano a la firma). */
  pop: boolean;
}

const pick = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(value as string) ? (value as T) : fallback;

export function normalizeMascot(raw: unknown): MotionMascot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!(MASCOT_KINDS as readonly string[]).includes(r.kind as string)) return null;
  return {
    kind: r.kind as MascotKind,
    color: pick(r.color, MASCOT_COLORS, 'magenta'),
    size: pick(r.size, MASCOT_SIZES, 'grande'),
    pop: r.pop !== false,
  };
}

/* --- Momentos clave -------------------------------------------------------- */

/** Cuadros que tarda en inflarse. */
export const MASCOT_INFLATE_FRAMES = 22;
/** Vuelta en cada corte: empieza un poco antes y termina después. */
export const MASCOT_SPIN = { before: 6, after: 16 } as const;
/** Lo que dura el confeti. */
export const MASCOT_CONFETTI_FRAMES = 34;

export interface MascotTimes {
  /** Cuadros de los cortes de escena (donde da una vuelta). */
  spins: number[];
  /** Cuadro en que revienta (null = no revienta). */
  popAt: number | null;
  /** Cuadro en que empieza a desinflarse al final (loop sin reventar: termina igual que empezó). */
  deflateAt: number | null;
  total: number;
}

/** El golpe fuerte más cercano a `frame` (±`window` cuadros), o el mismo cuadro si no hay. */
function nearestHit(song: Pick<MotionSong, 'hits' | 'start'> | null, frame: number, fps: number, window: number, min: number, max: number): number {
  if (!song) return frame;
  let best = frame;
  let bestD = Infinity;
  for (const h of songHitFrames(song, fps)) {
    const d = Math.abs(h - frame);
    if (d <= window && d < bestD && h >= min && h <= max) { bestD = d; best = h; }
  }
  return best;
}

export function mascotTimes(
  input: { mascot: MotionMascot | null; loop: boolean; song: MotionSong | null },
  timeline: { scenes: Array<{ from: number }>; outroFrom: number | null; total: number },
  fps: number,
): MascotTimes {
  const total = timeline.total;
  const spins = timeline.scenes.slice(1).map((s) => s.from);
  if (!input.mascot) return { spins: [], popAt: null, deflateAt: null, total };
  let popAt: number | null = null;
  if (input.mascot.pop) {
    // Con firma: revienta justo cuando entra el logo (el perrito «se convierte» en la marca). Sin firma: un poco antes
    // del final, para que el confeti alcance a caer.
    const ideal = timeline.outroFrom ?? total - Math.round(fps * 1.2);
    const min = MASCOT_INFLATE_FRAMES + 8;
    const max = total - 10;
    // Con canción, al golpe fuerte más cercano (hasta medio segundo): el globo revienta con el bombo.
    popAt = Math.max(min, Math.min(max, nearestHit(input.song, ideal, fps, Math.round(fps * 0.5), min, max)));
    if (popAt <= min && total < min + 20) popAt = null;
  }
  // En loop, si no revienta, se desinfla al final para volver a inflarse al repetir: sin salto.
  const deflateAt = popAt == null && input.loop ? Math.max(MASCOT_INFLATE_FRAMES, total - 14) : null;
  return { spins, popAt, deflateAt, total };
}
