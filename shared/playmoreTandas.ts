/* Las 3 tandas de PLAYMORE: precio exacto de cada entrada en la 1ª tanda, en la 2ª y el precio general (3ª tanda, sin descuento).
 * El sistema de tandas guarda por cada fase el precio exacto de cada acceso (shared/tandaSchedule.ts · `prices`); acá se
 * arman esas fases desde esta tabla y se calcula el % de descuento exacto de cada entrada en cada tanda.
 *
 *  - «duo» es Pareja y Dos hombres (el mismo acceso); «duo_mujeres» es Dos mujeres.
 *  - «soltero» (hombre solo) tiene un único precio y pocos cupos: no participa de las tandas. */
import { discountPercent, type TandaPhase } from './tandaSchedule';

export interface PlaymoreTandaRow { slug: string; label: string; general: number; t1: number; t2: number }

export const PLAYMORE_TANDA_ROWS: PlaymoreTandaRow[] = [
  { slug: 'duo', label: 'Pareja y Dos hombres', general: 70000, t1: 40000, t2: 50000 },
  { slug: 'soltera', label: 'Vengo sola', general: 15000, t1: 10000, t2: 12500 },
  { slug: 'duo_mujeres', label: 'Dos mujeres', general: 25000, t1: 15000, t2: 20000 },
  { slug: 'trio', label: 'Trío', general: 80000, t1: 50000, t2: 60000 },
];
export const PLAYMORE_SOLTERO = { slug: 'soltero', label: 'Vengo solo', price: 50000, stock: 5 };

/** Una fila es coherente si la 1ª tanda es la más barata y el general la más cara. */
export function tandaRowProblem(r: PlaymoreTandaRow): string | null {
  const ok = [r.general, r.t1, r.t2].every((n) => Number.isInteger(n) && n > 0);
  if (!ok) return `${r.label}: los precios deben ser números enteros mayores a 0.`;
  if (!(r.t1 <= r.t2 && r.t2 <= r.general)) return `${r.label}: debe cumplirse 1ª tanda ≤ 2ª tanda ≤ general.`;
  return null;
}

/** % de descuento exacto de cada tanda respecto del precio general. */
export function exactPercents(r: PlaymoreTandaRow): { t1: number; t2: number; general: number } {
  return { t1: discountPercent(r.general, r.t1), t2: discountPercent(r.general, r.t2), general: 0 };
}

/** Las 3 fases del evento, con el precio exacto de cada acceso. `percent` de la fase = el de la entrada principal (el dúo), solo como referencia. */
export function buildPlaymorePhases(rows: PlaymoreTandaRow[], until: (string | null)[] = []): TandaPhase[] {
  const ref = rows.find((r) => r.slug === 'duo') ?? rows[0];
  const pct = ref ? exactPercents(ref) : { t1: 0, t2: 0, general: 0 };
  const prices = (k: 't1' | 't2' | 'general') => Object.fromEntries(rows.map((r) => [r.slug, r[k]]));
  return [
    { percent: pct.t1, untilDate: until[0] ?? null, prices: prices('t1') },
    { percent: pct.t2, untilDate: until[1] ?? null, prices: prices('t2') },
    // 3ª y 4ª tanda: precio general (la 4ª es la última, hasta el cierre de la venta).
    { percent: 0, untilDate: until[2] ?? null, prices: prices('general') },
    { percent: 0, untilDate: until[3] ?? null, prices: prices('general') },
  ];
}
