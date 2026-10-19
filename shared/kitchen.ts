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
 * Los retrocesos permitidos son los del "Deshacer" de la pantalla, para
 * cuando se aprieta un botón por error con el pedido de al lado:
 * entregado -> aprobado (deshacer un Entregado) y aprobado -> pendiente
 * (deshacer un Aprobar; el servidor borra quién/cuándo lo aprobó). Desde
 * "entregado" no se vuelve a "pendiente" ni se re-entrega dos veces. */
export function canTransitionKitchenTicket(from: KitchenTicketStatus, to: KitchenTicketStatus): boolean {
  if (from === "pendiente") return to === "aprobado" || to === "entregado";
  if (from === "aprobado") return to === "entregado" || to === "pendiente";
  if (from === "entregado") return to === "aprobado";
  return false;
}

export interface KitchenItem { name: string; quantity: number }

/** Total de cada producto entre varias comandas ("5× Hamburguesa, 3×
 * Papas"), para cocinar en tandas. Los más pedidos primero; a igual cantidad,
 * por nombre. */
export function summarizeKitchenItems(tickets: { items: KitchenItem[] }[]): KitchenItem[] {
  const totals = new Map<string, number>();
  for (const t of tickets) {
    for (const it of t.items) totals.set(it.name, (totals.get(it.name) ?? 0) + it.quantity);
  }
  return Array.from(totals, ([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

/** Segundos que tardó cada comanda entregada (creada -> entregada),
 * promediados. `null` si no hay ninguna entregada con hora de entrega. */
export function averageWaitSeconds(delivered: { createdAt: Date | string; deliveredAt: Date | string | null }[]): number | null {
  const waits = delivered
    .filter((t) => t.deliveredAt)
    .map((t) => (new Date(t.deliveredAt as Date | string).getTime() - new Date(t.createdAt).getTime()) / 1000)
    .filter((w) => Number.isFinite(w) && w >= 0);
  if (waits.length === 0) return null;
  return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
}

/** `m:ss` (ej. 125 -> "2:05"). */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
