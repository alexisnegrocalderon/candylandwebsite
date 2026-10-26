/* El atajo «Regalar cupón» del «+» (celular) abre «Cupones y pagos» con el diálogo ya abierto. Vive aparte
 * para que el panel no tenga que descargar la sección entera solo por el atajo. */
let pending = false;
export function requestGiftCoupon() { pending = true; }
/** Lo consume la sección al montarse: true una sola vez después del atajo. */
export function takeGiftCouponRequest(): boolean {
  const was = pending;
  pending = false;
  return was;
}
