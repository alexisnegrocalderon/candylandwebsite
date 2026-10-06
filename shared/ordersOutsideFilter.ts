/* Ventas Web / Ventas Caja filtran por evento, estado y canal. Cuando una
 * búsqueda encuentra órdenes que esos filtros esconden, la pantalla las avisa
 * (client/src/pages/admin/Dashboard.tsx → OrdersView). */

export interface MatchedOrder {
  id: number;
  eventId: number;
  channel: string;
  paymentStatus: string;
}

export interface OrdersViewFilter {
  /** Pantalla: 'web' (todo lo que no es caja) o 'caja'. */
  channel: 'web' | 'caja';
  eventId?: number;
  /** undefined = todos los estados. */
  status?: string;
}

/** ¿La orden aparece con estos filtros? Mismo criterio que `getAllOrders`. */
export function orderVisibleWith(order: MatchedOrder, f: OrdersViewFilter): boolean {
  const channelOk = f.channel === 'caja' ? order.channel === 'caja' : order.channel !== 'caja';
  return channelOk && (!f.eventId || order.eventId === f.eventId) && (!f.status || order.paymentStatus === f.status);
}

/** Las coincidencias de la búsqueda que los filtros actuales esconden. */
export function ordersOutsideFilter<T extends MatchedOrder>(matches: T[], f: OrdersViewFilter): T[] {
  return matches.filter((o) => !orderVisibleWith(o, f));
}
