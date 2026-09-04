/* Escala de descuentos de las tandas de un evento (Fase 1 = 60%, Fase 2 =
 * 50%...). Vive en `shared/` porque tanto el servidor (precarga el precio al
 * cerrar tanda, y ahora también decide cuándo pasar de fase sola) como el
 * admin (precarga el mismo precio en el diálogo) necesitan la MISMA fórmula
 * de redondeo y la misma forma de dato -- si viviera solo en uno de los dos,
 * tarde o temprano se desincronizarían. Mismo patrón que
 * shared/ambassadorProgram.ts. */

/** Una fase de la escala: % de descuento sobre el precio general, y
 * opcionalmente la fecha hasta la que rige -- pasada esa fecha, el sistema
 * pasa solo a la fase siguiente (ver server/tandaAutoAdvance.ts). Sin fecha,
 * esa fase solo avanza con el botón manual "Cerrar tanda", en cualquier
 * momento. */
export type TandaPhase = { percent: number; untilDate?: string | null };

/** Escala por defecto (números del dueño). Editable por evento desde el
 * admin: se guarda en `events.tandaDiscountSchedule`, esto es solo la
 * semilla cuando el evento todavía no tiene una propia. */
export const DEFAULT_TANDA_SCHEDULE: TandaPhase[] = [
  { percent: 60 }, { percent: 50 }, { percent: 40 }, { percent: 30 }, { percent: 0 },
];

/** Precio de la fase, a partir del precio general y el % de descuento de esa
 * fase. Redondea al millar más cercano -- todos los precios de este negocio
 * ya vienen en miles ($12.000, $20.000, $30.000...), un redondeo más fino
 * generaría precios como $17.850 que no calzan con esa convención. */
export function computePhasePrice(originalPrice: number, discountPercent: number): number {
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) return 0;
  const raw = originalPrice * (1 - discountPercent / 100);
  return Math.round(raw / 1000) * 1000;
}

/** Acepta tanto el arreglo de números viejo (`[60,50,40,30,0]`, la forma que
 * ya quedó guardada en producción antes de esta ronda) como el nuevo de
 * objetos -- sin esto, un evento ya configurado se rompería con este cambio.
 * Vive acá (no en server/ambassadorProgram.ts junto a `parseJsonArray`, que
 * es genérica para JSON plano) porque conoce la forma específica de una
 * fase, y la necesitan tanto cliente como servidor. */
export function normalizeTandaSchedule(raw: unknown): TandaPhase[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TANDA_SCHEDULE;
  return raw.map((x) =>
    typeof x === 'number'
      ? { percent: x }
      : { percent: Number((x as any)?.percent ?? 0), untilDate: (x as any)?.untilDate ?? null },
  );
}

/** Fase que corresponde tras avanzar una tanda, o `null` si ya se llegó al
 * final de la escala (precio general, no hay más fases que activar). */
export function nextPhase(
  currentPhaseIndex: number,
  schedule: TandaPhase[] = DEFAULT_TANDA_SCHEDULE,
): { index: number; phase: TandaPhase } | null {
  const nextIndex = currentPhaseIndex + 1;
  if (nextIndex >= schedule.length) return null;
  return { index: nextIndex, phase: schedule[nextIndex] };
}
