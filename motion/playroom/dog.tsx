import { useId } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { MASCOT_COLOR_HEX, type MascotColor, type MascotPattern } from '../../shared/motionMascot';

/* El perrito de Playroom: el de los vasos. Línea gruesa, burbujas de globo de modelar y estampados (puntos, corazones,
 * cuadrícula, manchas…), sin cara. Está dibujado en SVG, burbuja por burbuja, así que se infla una a una (del hocico a la cola),
 * la cola y las orejas se mueven, y el estampado crece con cada burbuja como si estuviera impreso en el globo.
 *
 * Colores libres: a elección del dueño. «Solo línea» es el dibujo del vaso (línea y estampado de un solo color sobre blanco). */

export type DogPattern = Exclude<MascotPattern, 'auto'>;

export interface DogTheme {
  /** Relleno del globo. */
  fill: string;
  /** Contorno. */
  ink: string;
  /** Color del estampado. */
  pat: string;
  /** Brillo de globo (los dibujos de solo línea no llevan). */
  gloss: boolean;
  /** Cada burbuja de un color (multicolor). */
  multi?: boolean;
}

const LINE = (c: string): DogTheme => ({ fill: '#FFFFFF', ink: c, pat: c, gloss: false });
const SOLID = (fill: string, pat: string): DogTheme => ({ fill, ink: '#14111A', pat, gloss: true });

export function dogTheme(color: MascotColor): DogTheme {
  switch (color) {
    case 'tinta': return LINE('#14111A');
    case 'linea-celeste': return LINE('#0097F2');
    case 'linea-rosa': return LINE('#FF008E');
    case 'multi': return { ...SOLID('#FF1E9A', '#FFFFFF'), multi: true };
    case 'amarillo': return SOLID(MASCOT_COLOR_HEX.amarillo, '#FF1E9A');
    case 'plata': return SOLID('#E6ECF5', '#8FA0B8');
    case 'oro': return SOLID(MASCOT_COLOR_HEX.oro, '#FFFFFF');
    case 'rosa': return SOLID(MASCOT_COLOR_HEX.rosa, '#FFFFFF');
    default: return SOLID(MASCOT_COLOR_HEX[color] ?? MASCOT_COLOR_HEX.magenta, '#FFFFFF');
  }
}

/** Colores de cada burbuja en el modo multicolor. */
const MULTI = ['#FF1E9A', '#2BB5FF', '#FFD23F', '#4FD9A8', '#8A5CFF', '#FF8A3D', '#F49BFF', '#FF2D3A'];

type Shape = { kind: 'cap'; len: number; thick: number } | { kind: 'ell'; rx: number; ry: number };
interface Bubble {
  id: string;
  cx: number;
  cy: number;
  rot: number;
  shape: Shape;
  /** En qué orden se infla (0 = el hocico). */
  order: number;
  /** Se mueve: cola, orejas o cabeza (ángulo máximo en grados y punto de giro). */
  wob?: { deg: number; px: number; py: number; speed: number; phase: number };
}

const cap = (len: number, thick: number): Shape => ({ kind: 'cap', len, thick });
const ell = (rx: number, ry: number): Shape => ({ kind: 'ell', rx, ry });

/** El perrito mirando a la izquierda (como en los vasos), en una caja de 1000 × 800. De atrás hacia adelante. */
const BUBBLES: Bubble[] = [
  { id: 'pata-trasera-lejos', cx: 690, cy: 648, rot: 93, shape: cap(205, 80), order: 8 },
  { id: 'pata-delantera-lejos', cx: 400, cy: 652, rot: 87, shape: cap(205, 78), order: 5 },
  { id: 'cola', cx: 888, cy: 302, rot: -54, shape: cap(190, 66), order: 9, wob: { deg: 9, px: 830, py: 385, speed: 7, phase: 0 } },
  { id: 'cuarto-trasero', cx: 762, cy: 418, rot: 0, shape: ell(118, 106), order: 7 },
  { id: 'cuerpo', cx: 562, cy: 428, rot: -5, shape: cap(400, 185), order: 6 },
  { id: 'pecho', cx: 376, cy: 458, rot: 0, shape: ell(125, 112), order: 4 },
  { id: 'pata-trasera', cx: 790, cy: 650, rot: 93, shape: cap(205, 86), order: 8 },
  { id: 'pata-delantera', cx: 330, cy: 652, rot: 87, shape: cap(205, 84), order: 5 },
  { id: 'cuello', cx: 292, cy: 335, rot: 50, shape: cap(235, 112), order: 3 },
  // Las dos orejas van DETRÁS de la cabeza (arriba y atrás, redondas y chicas), como en los vasos.
  { id: 'oreja-atras', cx: 372, cy: 178, rot: 38, shape: ell(34, 52), order: 2, wob: { deg: 8, px: 340, py: 215, speed: 9, phase: 1.3 } },
  { id: 'oreja', cx: 322, cy: 126, rot: 14, shape: ell(37, 56), order: 2, wob: { deg: 6, px: 305, py: 180, speed: 8, phase: 0.4 } },
  { id: 'cabeza', cx: 226, cy: 222, rot: -8, shape: ell(112, 96), order: 1 },
  { id: 'hocico', cx: 94, cy: 292, rot: -18, shape: cap(200, 78), order: 0 },
];

const HEART = 'M0 -4 C-7 -13 -17 -3 0 10 C17 -3 7 -13 0 -4 Z';
const STAR = 'M0 -11 L3 -3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3 -3 Z';

const Pattern: React.FC<{ id: string; kind: DogPattern; color: string }> = ({ id, kind, color }) => {
  switch (kind) {
    case 'puntos':
      return <pattern id={id} width={46} height={46} patternUnits="userSpaceOnUse"><circle cx={12} cy={12} r={6.5} fill={color} /><circle cx={35} cy={35} r={6.5} fill={color} /></pattern>;
    case 'corazones':
      return <pattern id={id} width={58} height={58} patternUnits="userSpaceOnUse"><path transform="translate(14 15)" d={HEART} fill={color} /><path transform="translate(43 44)" d={HEART} fill={color} /></pattern>;
    case 'cuadricula':
      return <pattern id={id} width={44} height={44} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={44} height={4.5} fill={color} /><rect width={4.5} height={44} fill={color} /></pattern>;
    case 'manchas':
      return (
        <pattern id={id} width={150} height={150} patternUnits="userSpaceOnUse">
          <ellipse cx={34} cy={40} rx={22} ry={14} transform="rotate(30 34 40)" fill={color} />
          <ellipse cx={105} cy={58} rx={15} ry={24} transform="rotate(-20 105 58)" fill={color} />
          <ellipse cx={58} cy={116} rx={24} ry={13} transform="rotate(10 58 116)" fill={color} />
          <circle cx={134} cy={132} r={11} fill={color} />
        </pattern>
      );
    case 'rayas':
      return <pattern id={id} width={40} height={40} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width={40} height={14} fill={color} /></pattern>;
    case 'cuadros':
      return <pattern id={id} width={64} height={64} patternUnits="userSpaceOnUse"><rect width={32} height={32} fill={color} /><rect x={32} y={32} width={32} height={32} fill={color} /></pattern>;
    case 'estrellas':
      return <pattern id={id} width={64} height={64} patternUnits="userSpaceOnUse"><path transform="translate(16 16)" d={STAR} fill={color} /><path transform="translate(48 48)" d={STAR} fill={color} /></pattern>;
    default:
      return null;
  }
};

const Shapes: React.FC<{ shape: Shape; fill?: string; stroke?: string; strokeWidth?: number }> = ({ shape, fill = 'none', stroke, strokeWidth }) =>
  shape.kind === 'cap'
    ? <rect x={-shape.len / 2} y={-shape.thick / 2} width={shape.len} height={shape.thick} rx={shape.thick / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
    : <ellipse rx={shape.rx} ry={shape.ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;

export const DOG_BOX = { width: 1000, height: 800, feet: 752 } as const;

export interface DogProps {
  /** Ancho en px de la caja de 1000 × 800. */
  width: number;
  color: MascotColor;
  pattern: DogPattern;
  /** 0 = desinflado, 1 = inflado (puede pasarse un poco: rebote). */
  inflate: number;
  /** Aplastamiento en el pulso (0 a 1). */
  squash?: number;
  /** Vuelta sobre sí mismo, en radianes (la acumulada de los cortes). */
  turn?: number;
  /** Mira a la derecha (por defecto, a la izquierda como en los vasos). */
  flip?: boolean;
  /** Cuadros de desfase para que dos perritos no muevan la cola a la vez. */
  phase?: number;
}

export const PlayroomDog: React.FC<DogProps> = ({ width, color, pattern, inflate, squash = 0, turn = 0, flip = false, phase = 0 }) => {
  const frame = useCurrentFrame() + phase;
  const uid = useId().replace(/:/g, '');
  const theme = dogTheme(color);
  const patId = `pat-${uid}`;
  const height = (width * DOG_BOX.height) / DOG_BOX.width;
  const outline = theme.gloss ? 9 : 10;
  // Da una vuelta entera: se achata hasta quedar de canto y vuelve a abrirse (la mitad de la vuelta lo muestra de espaldas).
  const sx = (flip ? -1 : 1) * Math.cos(turn);
  const sway = Math.sin(frame / 38) * 1.4;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${DOG_BOX.width} ${DOG_BOX.height}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        {pattern !== 'liso' && <Pattern id={patId} kind={pattern} color={theme.pat} />}
      </defs>
      {/* Todo el perrito: pivote en el piso, al centro (se aplasta hacia abajo y gira sobre sí mismo). */}
      <g transform={`translate(500 ${DOG_BOX.feet}) rotate(${sway}) scale(${sx * (1 + 0.05 * squash)} ${1 - 0.085 * squash}) translate(-500 -${DOG_BOX.feet})`}>
        {BUBBLES.map((b, i) => {
          // Cada burbuja se infla desde su centro, una después de otra (el hocico primero, la cola al final).
          const p = interpolate(inflate, [b.order * 0.05, b.order * 0.05 + 0.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'extend' });
          if (p <= 0.001) return null;
          const wob = b.wob ? Math.sin(frame / b.wob.speed + b.wob.phase) * b.wob.deg : 0;
          const fill = theme.multi ? MULTI[i % MULTI.length] : theme.fill;
          const hi = b.shape.kind === 'cap'
            ? <rect x={-b.shape.len * 0.36} y={-b.shape.thick * 0.36} width={b.shape.len * 0.6} height={b.shape.thick * 0.13} rx={b.shape.thick * 0.065} fill="#FFFFFF" opacity={0.55} />
            : <ellipse cx={-b.shape.rx * 0.28} cy={-b.shape.ry * 0.42} rx={b.shape.rx * 0.42} ry={b.shape.ry * 0.13} fill="#FFFFFF" opacity={0.55} />;
          return (
            <g key={b.id} transform={b.wob ? `rotate(${wob} ${b.wob.px} ${b.wob.py})` : undefined}>
              <g transform={`translate(${b.cx} ${b.cy}) rotate(${b.rot}) scale(${Math.max(0.001, p)})`}>
                <Shapes shape={b.shape} fill={fill} />
                {pattern !== 'liso' && <Shapes shape={b.shape} fill={`url(#${patId})`} />}
                {theme.gloss && hi}
                <Shapes shape={b.shape} stroke={theme.ink} strokeWidth={outline} />
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
};
