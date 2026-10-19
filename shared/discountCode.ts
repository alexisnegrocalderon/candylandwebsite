/* Cuánto descuenta un código de descuento. Un solo lugar para la regla, usado
 * por el cobro del servidor (createOrder en server/db.ts), la venta en caja
 * (server/caja/sale.ts) y la vista previa del checkout, así lo que se
 * muestra es lo mismo que se cobra.
 *
 * REGLA DEL DUEÑO: en la web un código descuenta SOLO el valor del acceso
 * (category="acceso"), nunca los extras (estacionamiento, cover, tragos,
 * guardarropía, merch), ya sea en % o en monto fijo. En caja no hay códigos
 * de descuento: solo la promo relámpago, que trae la lista de productos a
 * los que aplica. */

export interface DiscountRule {
  discountType: 'percentage' | 'fixed';
  discountValue: number | string;
  /** Promo relámpago: solo estas líneas. null/vacío = sin acotar. */
  applicableTicketTypeIds?: number[] | null;
  /** Códigos del programa Cumpleañeros: el % se calcula sobre el precio
   * general (`originalPrice`), no el de la tanda vigente. */
  basedOnOriginalPrice?: boolean | number | null;
}

export interface DiscountLine {
  ticketTypeId: number;
  category?: string | null;
  unitPrice: number;
  originalPrice?: number | null;
  quantity: number;
}

/** `web`: solo líneas de categoría `acceso` (y dentro de la lista, si el
 * código trae una). `caja`: solo si el código trae lista de productos (promo
 * relámpago), sobre esas líneas sea cual sea su categoría; un código sin
 * lista no descuenta nada. */
export function computeCodeDiscount(rule: DiscountRule, lines: DiscountLine[], mode: 'web' | 'caja'): number {
  const scopeIds = rule.applicableTicketTypeIds && rule.applicableTicketTypeIds.length > 0 ? rule.applicableTicketTypeIds : null;
  if (mode === 'caja' && !scopeIds) return 0;

  const eligible = lines.filter((l) =>
    (mode === 'caja' || l.category === 'acceso') && (!scopeIds || scopeIds.includes(l.ticketTypeId)),
  );
  const eligibleTotal = eligible.reduce((sum, l) => {
    const price = rule.basedOnOriginalPrice ? (l.originalPrice ?? l.unitPrice) : l.unitPrice;
    return sum + price * l.quantity;
  }, 0);

  const value = Number(rule.discountValue);
  if (!(value > 0) || eligibleTotal <= 0) return 0;
  return rule.discountType === 'percentage'
    ? Math.round(eligibleTotal * value / 100)
    : Math.min(value, eligibleTotal);
}
