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
export type TandaPhase = {
  percent: number;
  untilDate?: string | null;
  /** Precio EXACTO de cada acceso en esta fase, por `accesoSlug` (ej. { duo: 40000, soltera: 12500 }). Cuando una fase lo trae, manda
   * sobre el `percent` parejo: sirve cuando cada entrada tiene su propia escala de precios (PLAYMORE) y cuando el precio no es múltiplo
   * de mil. Un acceso que no figura ahí usa el `percent` de siempre. */
  prices?: Record<string, number>;
};

/** Escala por defecto (números del dueño). Editable por evento desde el
 * admin: se guarda en `events.tandaDiscountSchedule`, esto es solo la
 * semilla cuando el evento todavía no tiene una propia. */
export const DEFAULT_TANDA_SCHEDULE: TandaPhase[] = [
  { percent: 60 }, { percent: 50 }, { percent: 40 }, { percent: 30 }, { percent: 0 },
];

/** Precio de la fase, a partir del precio general y el % de descuento de esa
 * fase. Sin redondeo al millar (decisión del dueño): el precio es el % exacto,
 * así $25.000 al 50 % queda en $12.500 y al 30 % en $17.500. Solo se redondea
 * al peso entero, que es lo que guarda la columna `price` (escala 0); el
 * `toFixed` evita que el flotante deje $17.499,99999 donde va $17.500. */
export function computePhasePrice(originalPrice: number, discountPercent: number): number {
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) return 0;
  const raw = originalPrice * (1 - discountPercent / 100);
  return Math.round(Number(raw.toFixed(6)));
}

/** Solo precios válidos por acceso (clave tipo `duo`, `duo_mujeres`; valor entero ≥ 0). Vacío = sin precios exactos. */
export function cleanPhasePrices(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z0-9_]{1,40}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = Math.round(v);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Precio de un acceso en una fase: el exacto de `phase.prices[accesoSlug]` si lo tiene; si no, el % parejo sobre el precio general. */
export function phasePriceFor(phase: TandaPhase, accesoSlug: string | null | undefined, originalPrice: number): number {
  const exact = accesoSlug ? phase.prices?.[accesoSlug] : undefined;
  if (typeof exact === 'number' && Number.isFinite(exact) && exact >= 0) return Math.round(exact);
  return computePhasePrice(originalPrice, phase.percent);
}

/** % de descuento exacto (con 2 decimales) de un precio de tanda respecto del precio general. */
export function discountPercent(general: number, price: number): number {
  if (!Number.isFinite(general) || general <= 0 || !Number.isFinite(price)) return 0;
  return Math.round((1 - price / general) * 10000) / 100;
}

/** Acepta tanto el arreglo de números viejo (`[60,50,40,30,0]`, la forma que
 * ya quedó guardada en producción antes de esta ronda) como el nuevo de
 * objetos -- sin esto, un evento ya configurado se rompería con este cambio.
 * Vive acá (no en server/ambassadorProgram.ts junto a `parseJsonArray`, que
 * es genérica para JSON plano) porque conoce la forma específica de una
 * fase, y la necesitan tanto cliente como servidor. */
export function normalizeTandaSchedule(raw: unknown): TandaPhase[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TANDA_SCHEDULE;
  return raw.map((x): TandaPhase => {
    if (typeof x === 'number') return { percent: x };
    const prices = cleanPhasePrices((x as any)?.prices);
    return { percent: Number((x as any)?.percent ?? 0), untilDate: (x as any)?.untilDate ?? null, ...(prices ? { prices } : {}) };
  });
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
