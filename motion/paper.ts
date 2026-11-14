import { seededRandom } from '../shared/motionVariety';

/* Ayudas para los estilos de papel (Collage) y de dibujo a mano (Pizarra). Todo es una función pura de la semilla y del
 * cuadro: dos dibujos con los mismos datos salen idénticos en la vista previa, en las láminas y en el MP4. */

const pct = (n: number) => `${n.toFixed(1)}%`;

/** Recorte de papel rasgado para un rectángulo: bordes dentados, más en los costados. Es un `clip-path: polygon(...)`. */
export function tornClip(seed: number, teeth = 9, depth = 7): string {
  const r = seededRandom(Math.floor(seed) * 97 + 13);
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= teeth; k++) pts.push([(k / teeth) * 100, r() * depth * 0.55]);
  const side = Math.max(2, Math.round(teeth / 2));
  for (let k = 1; k <= side; k++) pts.push([100 - r() * depth, (k / side) * 100]);
  for (let k = teeth - 1; k >= 0; k--) pts.push([(k / teeth) * 100, 100 - r() * depth * 0.55]);
  for (let k = side - 1; k >= 1; k--) pts.push([r() * depth, (k / side) * 100]);
  return `polygon(${pts.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(', ')})`;
}

/** Borde dentado vertical en px (para las tiras de papel que cruzan el cuadro): devuelve los puntos de `x` según `y`. */
export function jaggedEdge(seed: number, height: number, x: number, teeth = 16, depth = 34): Array<[number, number]> {
  const r = seededRandom(Math.floor(seed) * 131 + 7);
  const out: Array<[number, number]> = [];
  for (let k = 0; k <= teeth; k++) out.push([x + (k % 2 ? r() * depth : r() * depth * 0.3), (k / teeth) * height]);
  return out;
}

export type DoodleKind = 'estrella' | 'circulo' | 'flecha' | 'garabato' | 'espiral' | 'corazon' | 'rayo' | 'cruz';
export const DOODLE_KINDS: DoodleKind[] = ['estrella', 'circulo', 'flecha', 'garabato', 'espiral', 'corazon', 'rayo', 'cruz'];

type Pt = [number, number];

/** Puntos de cada garabato en una caja de -1 a 1. */
function basePoints(kind: DoodleKind): Pt[][] {
  const poly = (n: number, f: (t: number) => Pt): Pt[] => Array.from({ length: n + 1 }, (_, k) => f(k / n));
  switch (kind) {
    case 'estrella': {
      // Estrella de cinco puntas dibujada de un solo trazo (pentagrama): se salta de a dos vértices.
      return [Array.from({ length: 6 }, (_, k) => {
        const a = -Math.PI / 2 + ((k * 2) % 5) * ((Math.PI * 2) / 5);
        return [Math.cos(a), Math.sin(a)] as Pt;
      })];
    }
    case 'circulo':
      // Un poco más de una vuelta: el trazo se pasa de largo, como al encerrar una palabra con el marcador.
      return [poly(30, (t) => [Math.cos(-2.2 + t * Math.PI * 2.18) * 1.0, Math.sin(-2.2 + t * Math.PI * 2.18) * 0.72])];
    case 'flecha':
      return [[[-1, 0.2], [-0.35, -0.12], [0.3, 0.1], [0.9, -0.05]], [[0.55, -0.45], [0.95, -0.04], [0.5, 0.38]]];
    case 'garabato':
      return [poly(32, (t) => [-1 + t * 2, Math.sin(t * Math.PI * 6) * 0.38])];
    case 'espiral':
      return [poly(44, (t) => [Math.cos(t * Math.PI * 5.5) * t, Math.sin(t * Math.PI * 5.5) * t])];
    case 'corazon':
      return [poly(36, (t) => {
        const a = t * Math.PI * 2;
        return [(16 * Math.sin(a) ** 3) / 17, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17];
      })];
    case 'rayo':
      return [[[0.25, -1], [-0.45, 0.1], [0.05, 0.1], [-0.3, 1], [0.6, -0.2], [0.1, -0.2], [0.25, -1]]];
    case 'cruz':
      return [[[-0.7, -0.7], [0.7, 0.7]], [[0.7, -0.7], [-0.7, 0.7]]];
  }
}

/** El camino SVG de un garabato, con el temblor de una mano: cada punto se mueve un poco con la semilla y con `boil`
 * (cambia cada 3 cuadros: así la línea «hierve» como en una animación dibujada de verdad). */
export function doodlePath(kind: DoodleKind, seed: number, boil: number, wobble = 0.045): string {
  const r = seededRandom(Math.floor(seed) * 211 + boil * 17 + 5);
  return basePoints(kind)
    .map((stroke) => stroke.map(([x, y], k) => `${k ? 'L' : 'M'} ${(x + (r() - 0.5) * wobble * 2).toFixed(3)} ${(y + (r() - 0.5) * wobble * 2).toFixed(3)}`).join(' '))
    .join(' ');
}

/** Línea subrayada con temblor, de 0 a 1 en x (para el subrayado del marcador). */
export function roughLine(seed: number, boil: number, segments = 7, amp = 0.09): string {
  const r = seededRandom(Math.floor(seed) * 53 + boil * 29 + 1);
  return Array.from({ length: segments + 1 }, (_, k) => `${k ? 'L' : 'M'} ${(k / segments).toFixed(3)} ${(0.5 + (r() - 0.5) * amp * 2).toFixed(3)}`).join(' ');
}
