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

/** Cómo se dibuja el perrito: la ilustración de Playroom (la de los vasos: línea y estampados) o el globo 3D con reflejos. Los videos
 * guardados antes de que existiera la ilustración quedan con el 3D. */
export const MASCOT_STYLES = ['ilustrado', 'globo3d'] as const;
export type MascotStyle = (typeof MASCOT_STYLES)[number];
export const MASCOT_STYLE_LABEL: Record<MascotStyle, string> = {
  ilustrado: 'Ilustrado (el de los vasos de Playroom)',
  globo3d: 'Globo 3D con reflejos',
};

/** Estampado del globo ilustrado. «auto» lo elige la semilla del video. */
export const MASCOT_PATTERNS = ['auto', 'puntos', 'corazones', 'cuadricula', 'manchas', 'rayas', 'cuadros', 'estrellas', 'liso'] as const;
export type MascotPattern = (typeof MASCOT_PATTERNS)[number];
export const MASCOT_PATTERN_LABEL: Record<MascotPattern, string> = {
  auto: 'Automático (lo elige la semilla)',
  puntos: 'Puntos',
  corazones: 'Corazones',
  cuadricula: 'Cuadrícula (rombos)',
  manchas: 'Manchas (dálmata)',
  rayas: 'Rayas',
  cuadros: 'Cuadros (bola disco)',
  estrellas: 'Estrellas',
  liso: 'Liso',
};
const REAL_PATTERNS = MASCOT_PATTERNS.filter((p) => p !== 'auto');

/** El estampado que se dibuja: el elegido o, en «auto», uno de la semilla (el segundo perrito de la pareja, otro distinto). */
export function resolveMascotPattern(pattern: MascotPattern, seed: number, index = 0): Exclude<MascotPattern, 'auto'> {
  if (pattern !== 'auto') return pattern;
  return REAL_PATTERNS[(Math.abs(Math.floor(seed)) * 7 + index * 3 + 1) % REAL_PATTERNS.length] as Exclude<MascotPattern, 'auto'>;
}

export const MASCOT_COLORS = ['magenta', 'rosa', 'celeste', 'rojo', 'amarillo', 'menta', 'violeta', 'naranja', 'multi', 'tinta', 'linea-celeste', 'linea-rosa', 'oro', 'plata'] as const;
export type MascotColor = (typeof MASCOT_COLORS)[number];
export const MASCOT_COLOR_LABEL: Record<MascotColor, string> = {
  magenta: 'Magenta (el clásico)',
  menta: 'Menta',
  violeta: 'Violeta',
  naranja: 'Naranja',
  tinta: 'Solo línea negra (como el vaso)',
  'linea-celeste': 'Solo línea celeste (como el vaso)',
  'linea-rosa': 'Solo línea rosa (como el vaso)',
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
  menta: '#4FD9A8',
  violeta: '#8A5CFF',
  naranja: '#FF8A3D',
  tinta: '#FFFFFF',
  'linea-celeste': '#FFFFFF',
  'linea-rosa': '#FFFFFF',
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
  /** Ilustrado (vasos de Playroom) o globo 3D. */
  style: MascotStyle;
  /** Estampado del globo ilustrado. */
  pattern: MascotPattern;
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
    // Sin estilo guardado (videos de antes de la ilustración) = el globo 3D de siempre.
    style: pick(r.style, MASCOT_STYLES, 'globo3d'),
    pattern: pick(r.pattern, MASCOT_PATTERNS, 'auto'),
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
