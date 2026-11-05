/* Reglas del sistema PlayCard en eventos de colaboración (PLAYMORE). Con el interruptor «Usar el sistema PlayCard» apagado
 * (lo normal en una colab) la PlayCard solo sirve de QR de ingreso: el saldo y los Playcoins se ven pero no se pueden usar
 * para pagar en ese evento, y por la web solo se venden entradas y estacionamiento. */

/** `events.presaleParkingOnly` que corresponde al interruptor: sin sistema PlayCard, solo entrada y estacionamiento. */
export function presaleParkingOnlyFor(usesPlaycard: boolean): 0 | 1 {
  return usesPlaycard ? 0 : 1;
}

/** ¿Esta venta de caja le cobra a la PlayCard de alguien? Con saldo (total o mixto), con el QR de «Pagar en caja» o
 * canjeando Playcoins. */
export function cajaSaleChargesPlaycard(p: { paymentMethod?: string; saldoAmount?: number; redeemPlaycoins?: number; payToken?: string }): boolean {
  return p.paymentMethod === 'saldo' || (p.saldoAmount ?? 0) > 0 || (p.redeemPlaycoins ?? 0) > 0 || !!p.payToken;
}

export const COLAB_NO_PLAYCARD_MESSAGE = 'Este evento es una colaboración: la PlayCard (saldo y Playcoins) no se puede usar para pagar.';
