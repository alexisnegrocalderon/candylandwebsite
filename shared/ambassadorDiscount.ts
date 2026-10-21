/* Descuento al comprador que trae el código/link de un embajador VIP. Un solo
 * lugar para la regla, usado por el cobro del servidor (createOrder en
 * server/db.ts) y la vista previa del checkout.
 *
 * Reglas del dueño:
 *  - Es un % por embajador (`exclusiveAmbassadors.buyerDiscountPercent`),
 *    sin descuento si está vacío o en 0.
 *  - Solo descuenta el valor del acceso, nunca los extras (misma función que
 *    los códigos de descuento).
 *  - Si el comprador además tiene un código de descuento, no se suman: se
 *    aplica el que dé más.
 *  - La comisión del embajador se calcula sobre lo que pagó el comprador (la
 *    base ya es acceso menos descuento), así que baja en la misma proporción. */
import { computeCodeDiscount, type DiscountLine } from './discountCode';

/** Tope para evitar un error de tipeo (ej. 100 en vez de 10). */
export const MAX_AMBASSADOR_BUYER_DISCOUNT = 30;

/** Normaliza el valor guardado ("10.00", null) a un % válido (0 = sin descuento). */
export function normalizeBuyerDiscountPercent(raw: number | string | null | undefined): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_AMBASSADOR_BUYER_DISCOUNT);
}

/** Monto que descuenta el embajador sobre el carrito (solo líneas `acceso`). */
export function ambassadorBuyerDiscount(percent: number | string | null | undefined, lines: DiscountLine[]): number {
  const value = normalizeBuyerDiscountPercent(percent);
  if (value <= 0) return 0;
  return computeCodeDiscount({ discountType: 'percentage', discountValue: value }, lines, 'web');
}

/** Con código de descuento y descuento de embajador a la vez, gana el mayor
 * (nunca se suman). `ambassadorWins` avisa que el código no se consume. */
export function bestBuyerDiscount(codeAmount: number, ambassadorAmount: number): { amount: number; ambassadorWins: boolean } {
  return ambassadorAmount > codeAmount ? { amount: ambassadorAmount, ambassadorWins: true } : { amount: codeAmount, ambassadorWins: false };
}

export interface GeneralBuyerDiscount {
  enabled: boolean;
  percent: number | string | null | undefined;
  /** Vence al terminar este instante; null = sin fecha de término. */
  endsAt?: Date | string | null;
}

/** El descuento general solo cuenta si está activo, con % > 0 y sin vencer. */
export function generalDiscountActive(g: GeneralBuyerDiscount | null | undefined, now: Date = new Date()): boolean {
  if (!g || !g.enabled || normalizeBuyerDiscountPercent(g.percent) <= 0) return false;
  return !g.endsAt || new Date(g.endsAt).getTime() >= now.getTime();
}

/** % final que recibe el comprador de un embajador: el propio si lo tiene
 * (el general NO lo modifica); si no, el general vigente; si no, 0. */
export function effectiveBuyerDiscountPercent(
  individual: number | string | null | undefined,
  general: GeneralBuyerDiscount | null | undefined,
  now: Date = new Date(),
): number {
  const own = normalizeBuyerDiscountPercent(individual);
  if (own > 0) return own;
  return generalDiscountActive(general, now) ? normalizeBuyerDiscountPercent(general!.percent) : 0;
}
