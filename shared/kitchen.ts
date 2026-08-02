/** Número de comanda de cocina: `<nº de caja>-<correlativo local>` (ej.
 * "1-042"). Lo genera la propia tablet al confirmar la venta (nunca el
 * servidor) -- el correlativo lo lleva Dexie en `caja/db.ts` y el prefijo de
 * caja es lo que garantiza que dos tablets sin señal nunca asignen el mismo
 * número, sin coordinación entre ellas. `registerId` es `null` cuando la
 * cajera no tiene una caja física asignada -- se usa "0" como prefijo. */
export function formatKitchenTicketNumber(registerId: number | null, counter: number): string {
  return `${registerId ?? 0}-${String(counter).padStart(3, "0")}`;
}

export type KitchenTicketStatus = "pendiente" | "aprobado" | "entregado";

/** Transiciones válidas del pedido: pendiente -> aprobado -> entregado, más
 * pendiente -> entregado directo (la persona llega justo cuando cocina
 * todavía no alcanzó a apretar "Aprobar" -- exigir el paso intermedio
 * siempre obligaría a dos toques seguidos y en la práctica nadie lo hace).
 *
 * El único retroceso permitido es entregado -> aprobado: es el "deshacer"
 * de la pantalla, para cuando se aprieta "Entregado" por error con el
 * pedido de al lado. No se permite volver a "pendiente" desde ningún lado
 * ni re-entregar dos veces. */
export function canTransitionKitchenTicket(from: KitchenTicketStatus, to: KitchenTicketStatus): boolean {
  if (from === "pendiente") return to === "aprobado" || to === "entregado";
  if (from === "aprobado") return to === "entregado";
  if (from === "entregado") return to === "aprobado";
  return false;
}
