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

export type LockerItemStatus = "pendiente" | "guardado" | "retirado";

/** Transiciones válidas de una prenda: pendiente -> guardado (primera
 * confirmación física en /guardarropia, recién cobrada en caja) ->
 * retirado -> guardado -> retirado ... -- la misma persona puede entrar y
 * sacar su prenda las veces que quiera en la noche, siempre con el mismo
 * `tagNumber`. Nunca se vuelve a 'pendiente'. `retirado -> guardado` sirve
 * doble función: reingreso real, o "deshacer" un Entregado apretado por
 * error (mismo criterio que canTransitionKitchenTicket). */
export function canTransitionLockerItem(from: LockerItemStatus, to: LockerItemStatus): boolean {
  if (from === "pendiente") return to === "guardado";
  if (from === "guardado") return to === "retirado";
  if (from === "retirado") return to === "guardado";
  return false;
}
