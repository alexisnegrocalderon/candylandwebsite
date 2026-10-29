/* Un cupón personal de un solo uso se «reserva» cuando alguien abre el pago (la orden nace pendiente). Si esa orden
 * nunca se paga, el cupón no puede quedar quemado: sobre todo uno que vence en un día, como el bono de la app.
 * Cuenta como usado lo que está APROBADO y lo que sigue pendiente dentro de la ventana de pago; lo demás se libera. */

/** Cuánto dura la reserva de una orden pendiente (el checkout se paga en minutos). */
export const COUPON_RESERVATION_MS = 30 * 60_000;

export function reservedCouponUses(
  usedOrders: { paymentStatus: string; createdAt: Date | string }[],
  now: Date = new Date(),
): number {
  return usedOrders.filter((o) =>
    o.paymentStatus === 'approved'
    || (o.paymentStatus === 'pending' && now.getTime() - new Date(o.createdAt).getTime() < COUPON_RESERVATION_MS),
  ).length;
}
