/* Escala de descuentos de las tandas de un evento (Fase 1 = 60%, Fase 2 =
 * 50%...). Vive en `shared/` porque tanto el servidor (precarga el precio al
 * cerrar tanda) como el admin (precarga el mismo precio en el diálogo)
 * necesitan la MISMA fórmula de redondeo -- si viviera solo en uno de los
 * dos, tarde o temprano se desincronizarían. Mismo patrón que
 * shared/ambassadorProgram.ts. */

/** Escala por defecto (números del dueño). Editable por evento desde el
 * admin: se guarda en `events.tandaDiscountSchedule`, esto es solo la
 * semilla cuando el evento todavía no tiene una propia. */
export const DEFAULT_TANDA_SCHEDULE: number[] = [60, 50, 40, 30, 0];

/** Precio de la fase, a partir del precio general y el % de descuento de esa
 * fase. Redondea al millar más cercano -- todos los precios de este negocio
 * ya vienen en miles ($12.000, $20.000, $30.000...), un redondeo más fino
 * generaría precios como $17.850 que no calzan con esa convención. */
export function computePhasePrice(originalPrice: number, discountPercent: number): number {
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) return 0;
  const raw = originalPrice * (1 - discountPercent / 100);
  return Math.round(raw / 1000) * 1000;
}

/** Fase que corresponde tras avanzar una tanda, o `null` si ya se llegó al
 * final de la escala (precio general, no hay más fases que activar). */
export function nextPhase(
  currentPhaseIndex: number,
  schedule: number[] = DEFAULT_TANDA_SCHEDULE,
): { index: number; percent: number } | null {
  const nextIndex = currentPhaseIndex + 1;
  if (nextIndex >= schedule.length) return null;
  return { index: nextIndex, percent: schedule[nextIndex] };
}
