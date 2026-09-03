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

export type PossibleDuplicate = { total: number; paymentMethod: string | null; count: number; firstAt: Date; lastAt: Date };

/** Ventas repetidas sospechosas: mismo monto, mismo medio de pago, dentro de
 * una ventana corta.
 *
 * El POS de tarjetas es una máquina APARTE de la tablet: la tablet solo
 * registra lo que ya se cobró. Un doble toque en "Confirmar venta" generaba
 * dos ventas con opId distinto (así que `applyOp` no las deduplica) contra un
 * solo cobro real, y cada repetición inflaba el esperado del cierre sin que
 * hubiera entrado un peso más. La guarda del botón ya evita que vuelva a
 * pasar; esto sirve para encontrar las que ya quedaron registradas.
 *
 * Es una SOSPECHA, no un veredicto: dos clientes distintos pueden pagar lo
 * mismo casi al mismo tiempo, sobre todo con un producto de precio fijo. */
export function findPossibleDuplicateSales(
  sales: ShiftSale[],
  windowSeconds = 90,
): PossibleDuplicate[] {
  const groups = new Map<string, ShiftSale[]>();
  for (const s of sales) {
    const key = `${Number(s.total)}|${s.paymentMethod ?? ''}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const out: PossibleDuplicate[] = [];
  for (const list of Array.from(groups.values())) {
    const ordered = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let run: ShiftSale[] = [];
    const flush = () => {
      if (run.length > 1) {
        out.push({
          total: Number(run[0].total),
          paymentMethod: run[0].paymentMethod,
          count: run.length,
          firstAt: run[0].createdAt,
          lastAt: run[run.length - 1].createdAt,
        });
      }
      run = [];
    };
    for (const s of ordered) {
      if (run.length === 0) { run = [s]; continue; }
      const gap = (s.createdAt.getTime() - run[run.length - 1].createdAt.getTime()) / 1000;
      if (gap <= windowSeconds) run.push(s);
      else { flush(); run = [s]; }
    }
    flush();
  }
  // Lo más caro primero: es donde está la plata que hay que explicar.
  return out.sort((a, b) => (b.total * (b.count - 1)) - (a.total * (a.count - 1)));
}

export type CardTotals = { counted: number; expected: number; diff: number };

/** Débito y crédito SUMADOS.
 *
 * El desglose por tipo de tarjeta depende de que la cajera haya elegido bien
 * el medio de pago en la tablet, y la noche de Candyland demostró que eso no
 * se puede dar por hecho: cerró con $0 esperados en crédito y $200.500 de
 * crédito en el voucher, porque el selector venía en "débito" y nadie lo
 * movió. Leído por separado eso se ve como "faltan $977.000 en débito y
 * sobran $200.500 en crédito"; sumado, el hueco real de tarjetas queda a la
 * vista sin el ruido de la mala clasificación.
 *
 * El desglose se sigue mostrando: cuando el dato es confiable, sirve para
 * cuadrar contra cada línea del voucher. Este total es el que manda para
 * saber si falta plata. */
export function cardTotals(r: {
  countedDebit: number; countedCredit: number;
  expectedDebit: number; expectedCredit: number;
}): CardTotals {
  const counted = r.countedDebit + r.countedCredit;
  const expected = r.expectedDebit + r.expectedCredit;
  return { counted, expected, diff: counted - expected };
}

/** ¿El desglose débito/crédito es creíble?
 *
 * Si el sistema no registró NADA de un tipo pero el voucher sí trae plata de
 * ese tipo, el selector no se movió en toda la noche: las diferencias por
 * separado son ruido y hay que mirar el total. */
export function cardSplitLooksUnreliable(r: {
  countedDebit: number; countedCredit: number;
  expectedDebit: number; expectedCredit: number;
}): boolean {
  return (r.expectedCredit === 0 && r.countedCredit > 0) || (r.expectedDebit === 0 && r.countedDebit > 0);
}
