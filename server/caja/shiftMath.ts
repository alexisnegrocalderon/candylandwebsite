/** Aritmética del arqueo de caja, separada de las consultas a la base.
 *
 * Vive acá y no dentro de `closeShift` (`server/db.ts`) porque `closeShift`
 * abre conexión real: mientras la cuenta estuvo enredada con el SQL, el
 * cuadre de un turno no se pudo probar nunca, y así se colaron los errores
 * que el dueño vio como una diferencia gigante al cerrar el evento pasado
 * (ventas de otra caja sumadas al esperado, el fondo inicial restado dos
 * veces según dónde se mirara, los gastos pagados del cajón leídos como
 * plata faltante).
 *
 * `closeShift` usa el SQL solo para traer menos filas; quien decide qué
 * venta es de este turno es `filterShiftSales`, que es lo que prueban los
 * tests. */

export type ShiftWindow = {
  openedAt: Date;
  closedAt: Date;
  /** `null`/`undefined` = turno sin caja asignada: cuenta solo las ventas
   * que tampoco tienen caja, nunca las de las otras cajas. */
  registerId?: number | null;
};

export type ShiftSale = {
  total: string | number;
  paymentMethod: string | null;
  createdAt: Date;
  registerId?: number | null;
};

/** Ventas que de verdad pertenecen a este turno.
 *
 * Las dos reglas son las que fallaban antes:
 * - **Ventana cerrada por arriba**: una venta que sincroniza desde una
 *   tablet offline JUSTO mientras se procesa el cierre no puede entrar al
 *   esperado, porque no está en el conteo físico del cajón.
 * - **Alcance por caja**: un turno con caja cuenta solo lo suyo; uno sin
 *   caja asignada cuenta solo lo que tampoco tiene caja. Antes no se
 *   filtraba nada y un turno sin caja se tragaba las ventas de todas las
 *   cajas del evento. */
export function filterShiftSales<T extends ShiftSale>(sales: T[], shift: ShiftWindow): T[] {
  const from = shift.openedAt.getTime();
  const to = shift.closedAt.getTime();
  return sales.filter((s) => {
    const at = s.createdAt.getTime();
    if (at < from || at > to) return false;
    return shift.registerId ? s.registerId === shift.registerId : s.registerId == null;
  });
}

export type ExpectedTotals = {
  expectedCash: number;
  expectedDebit: number;
  expectedCredit: number;
  expectedQr: number;
};

/** Lo que TIENE que haber por cada medio de pago al cerrar.
 *
 * `cashPaidOut` es el efectivo que salió del cajón durante el turno para
 * pagar gastos (`expenses.paidFromShiftId`): esa plata legítimamente ya no
 * está, así que se resta del esperado en vez de aparecer como faltante.
 * El fondo inicial NO entra acá -- `expectedCash` son ventas, y el fondo se
 * suma recién al comparar (ver `shiftCashDiff`). */
export function computeExpectedTotals(sales: ShiftSale[], cashPaidOut = 0): ExpectedTotals {
  const totals: ExpectedTotals = { expectedCash: 0, expectedDebit: 0, expectedCredit: 0, expectedQr: 0 };
  for (const s of sales) {
    const amount = Number(s.total);
    if (!Number.isFinite(amount)) continue;
    if (s.paymentMethod === 'efectivo') totals.expectedCash += amount;
    else if (s.paymentMethod === 'debito') totals.expectedDebit += amount;
    else if (s.paymentMethod === 'credito') totals.expectedCredit += amount;
    else if (s.paymentMethod === 'qr') totals.expectedQr += amount;
  }
  totals.expectedCash -= cashPaidOut;
  return totals;
}

/** Diferencia del efectivo: lo contado en el cajón contra ventas + fondo.
 *
 * El fondo inicial se suma una sola vez, acá. Ésta es la definición única:
 * el CSV exportaba `expectedCash` sin el fondo junto a esta diferencia que
 * sí lo restaba, así que en Excel `Contado − Esperado` nunca daba la
 * diferencia de la columna de al lado, y la brecha era exactamente el
 * fondo. */
export function shiftCashDiff(countedCash: number, expectedCash: number, openingCash: number): number {
  return countedCash - expectedCash - openingCash;
}

/** El número contra el que se compara lo que hay físicamente en el cajón. */
export function expectedCashWithOpening(expectedCash: number, openingCash: number): number {
  return expectedCash + openingCash;
}
