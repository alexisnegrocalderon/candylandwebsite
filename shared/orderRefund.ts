/* Devolución de una compra web (server/orderRefund.ts): las reglas puras de la
 * política de reembolso (client/src/pages/RefundPolicy.tsx) -- porcentaje
 * estándar, plazo y cuánto se devuelve / se retiene. */

/** Porcentaje estándar de devolución del valor pagado. */
export const DEFAULT_REFUND_PERCENT = 50;
/** Días antes del evento hasta los que se aceptan devoluciones. */
export const REFUND_DEADLINE_DAYS = 5;

/** `true` si ya no se alcanza a devolver según la política (faltan menos de
 * `REFUND_DEADLINE_DAYS` días, o el evento ya pasó). */
export function isPastRefundDeadline(eventDate: Date | string, now: Date = new Date()): boolean {
  const msLeft = new Date(eventDate).getTime() - now.getTime();
  return msLeft < REFUND_DEADLINE_DAYS * 24 * 3_600_000;
}

/** Monto a devolver para un porcentaje del total pagado, en pesos enteros. */
export function refundAmountForPercent(paid: number, percent: number): number {
  const pct = Math.min(100, Math.max(0, percent));
  return Math.round((paid * pct) / 100);
}

/** Porcentaje equivalente a un monto (para guardar junto al monto corregido a
 * mano). Dos decimales, como la columna `refundPercent`. */
export function refundPercentForAmount(paid: number, amount: number): number {
  if (paid <= 0) return 0;
  return Math.round((amount / paid) * 10_000) / 100;
}

/** Lo que se queda el negocio: es lo único que cuenta como ingreso. */
export function retainedAmount(paid: number, refundAmount: number): number {
  return Math.max(0, paid - refundAmount);
}
