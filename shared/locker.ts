/** Número de percha de guardarropía: `<nº de caja>-<correlativo local>` (ej.
 * "1-007"). Lo genera la propia tablet al confirmar la venta (nunca el
 * servidor) -- mismo patrón y mismo motivo que el número de comanda de
 * cocina (ver shared/kitchen.ts): el correlativo lo lleva Dexie en
 * caja/db.ts y el prefijo de caja es lo que garantiza que dos tablets sin
 * señal nunca asignen el mismo número, sin coordinación entre ellas.
 * `registerId` es `null` cuando la cajera no tiene una caja física asignada
 * -- se usa "0" como prefijo. */
export function formatLockerTagNumber(registerId: number | null, counter: number): string {
  return `${registerId ?? 0}-${String(counter).padStart(3, "0")}`;
}
