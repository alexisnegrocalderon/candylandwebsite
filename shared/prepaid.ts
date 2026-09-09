/** Saldo prepagado en PLATA (pedido explícito del dueño) -- fuente única
 * compartida entre server (cargar/gastar) y client (previews del checkout y de
 * la tarjeta de membresía). Espejo de shared/playcoins.ts, pero para dinero:
 *
 *  - 1 CLP = 1 CLP, sin conversión ni tasa. No hay "mínimo para poder gastar"
 *    (Playcoins sí lo tiene, 5.000): la plata que cargaste es tuya desde el
 *    primer peso.
 *  - Convive con Playcoins en la misma tarjeta sin mezclarse: son dos saldos
 *    distintos, con dos ledgers distintos.
 *  - Un producto de carga NO paga el recargo por servicio y NO otorga
 *    Playcoins (si no, cargar saldo regalaría puntos y volvería a darlos al
 *    gastar ese mismo saldo). Las dos exclusiones usan `topupChargeForLines`.
 */

/** Forma mínima de un producto para saber si es una carga de saldo. Sirve
 * tanto para una fila cruda de `ticketTypes` como para lo que el checkout
 * recibe por tRPC. */
export type TopupProductLike = { topupAmount?: number | null };

/** Una línea del carrito/orden, con el precio que se cobra y el saldo que
 * acredita. `unitPrice` y `topupAmount` se separan a propósito: permiten
 * promos de bonificación (pagar $10.000 y acreditar $11.000). */
export type TopupLineLike = TopupProductLike & {
  quantity: number;
  unitPrice: number;
};

/** ¿Este producto acredita saldo en vez de dar un derecho canjeable? */
export function isTopupProduct(product: TopupProductLike): boolean {
  const amount = product.topupAmount;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0;
}

/** Lo que el comprador PAGA por las líneas de carga de saldo. Es la base que
 * hay que restar antes de calcular el recargo por servicio y antes de calcular
 * los Playcoins de la orden. */
export function topupChargeForLines(lines: TopupLineLike[]): number {
  return lines.reduce(
    (sum, line) =>
      isTopupProduct(line) ? sum + line.unitPrice * line.quantity : sum,
    0
  );
}

/** Lo que se ACREDITA como saldo por esas mismas líneas. Normalmente igual a
 * `topupChargeForLines`, y distinto solo si hay bonificación. */
export function topupCreditForLines(lines: TopupLineLike[]): number {
  return lines.reduce(
    (sum, line) =>
      isTopupProduct(line)
        ? sum + (line.topupAmount as number) * line.quantity
        : sum,
    0
  );
}

/** Clamp de un gasto pedido: nunca más que el saldo disponible, nunca
 * negativo. A diferencia de clampRedeemAmount (Playcoins), no hay saldo mínimo
 * que habilite el gasto. El clamp es solo para la UI: el descuento real es
 * server-authoritative y atómico (UPDATE ... WHERE prepaidBalance >= ?). */
export function clampSpendAmount(requested: number, balance: number): number {
  if (!Number.isFinite(requested) || !Number.isFinite(balance)) return 0;
  return Math.max(0, Math.min(Math.floor(requested), Math.max(0, balance)));
}
