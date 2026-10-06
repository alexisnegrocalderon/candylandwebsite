import { personasForAccesoSlug } from './mission300';

/** Cuántas unidades del producto regalado corresponden a una orden.
 * Por compra = 1. Por persona = personas que entran: Dúo 2, Trío 3, Grupo 4,
 * Soltera/o 1 (`ACCESO_PERSONAS`), por la cantidad comprada de cada acceso.
 * Siempre al menos 1, para no dejar sin regalo a una orden rara. */
export function giftQuantityForOrder(
  perPerson: boolean,
  items: Array<{ category: string | null | undefined; accesoSlug: string | null | undefined; quantity: number }>,
): number {
  if (!perPerson) return 1;
  const personas = items.reduce((sum, i) => (i.category === 'acceso' ? sum + personasForAccesoSlug(i.accesoSlug) * i.quantity : sum), 0);
  return Math.max(1, personas);
}
