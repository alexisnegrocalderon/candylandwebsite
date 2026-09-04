import { describe, expect, it } from "vitest";
import { filterShiftSales, computeExpectedTotals, shiftCashDiff, expectedCashWithOpening, findPossibleDuplicateSales, cardTotals, cardSplitLooksUnreliable } from "./shiftMath";

/* El evento pasado cerró con una diferencia enorme y nunca hubo un test del
 * arqueo. Estos casos son exactamente los escenarios que la produjeron o que
 * la habrían producido con las 2 cajas del próximo evento. */

const openedAt = new Date("2026-10-30T22:00:00-03:00");
const closedAt = new Date("2026-10-31T05:00:00-03:00");

function sale(over: Partial<Parameters<typeof computeExpectedTotals>[0][number]> & { at?: string } = {}) {
  const { at, ...rest } = over as any;
  return {
    total: "10000",
    paymentMethod: "efectivo",
    createdAt: at ? new Date(at) : new Date("2026-10-31T01:00:00-03:00"),
    registerId: 1,
    ...rest,
  };
}

describe("filterShiftSales", () => {
  const shift = { openedAt, closedAt, registerId: 1 };

  it("deja pasar una venta de esta caja dentro de la ventana", () => {
    expect(filterShiftSales([sale()], shift)).toHaveLength(1);
  });

  it("descarta una venta anterior a la apertura del turno", () => {
    expect(filterShiftSales([sale({ at: "2026-10-30T20:00:00-03:00" })], shift)).toHaveLength(0);
  });

  it("descarta una venta que sincroniza DESPUÉS del cierre", () => {
    // El caso real: una tablet sin señal manda su cola justo mientras se
    // procesa el cierre. Esa plata no está en el conteo físico del cajón,
    // así que no puede sumar al esperado.
    expect(filterShiftSales([sale({ at: "2026-10-31T05:30:00-03:00" })], shift)).toHaveLength(0);
  });

  it("incluye los bordes exactos de la ventana", () => {
    const bordes = [sale({ at: openedAt.toISOString() }), sale({ at: closedAt.toISOString() })];
    expect(filterShiftSales(bordes, shift)).toHaveLength(2);
  });

  it("no cuenta las ventas de la otra caja (2 cajas en paralelo)", () => {
    const ventas = [sale({ registerId: 1 }), sale({ registerId: 2 }), sale({ registerId: 2 })];
    const propias = filterShiftSales(ventas, shift);
    expect(propias).toHaveLength(1);
    expect(propias[0].registerId).toBe(1);
  });

  it("un turno sin caja asignada cuenta SOLO lo que tampoco tiene caja", () => {
    // Antes no se filtraba nada acá: un turno sin caja se tragaba las ventas
    // de todas las cajas del evento y su arqueo no significaba nada.
    const ventas = [sale({ registerId: null }), sale({ registerId: 1 }), sale({ registerId: 2 })];
    const propias = filterShiftSales(ventas, { openedAt, closedAt, registerId: null });
    expect(propias).toHaveLength(1);
    expect(propias[0].registerId).toBeNull();
  });
});

describe("computeExpectedTotals", () => {
  it("separa por medio de pago, incluido QR/transferencia", () => {
    const totals = computeExpectedTotals([
      sale({ total: "10000", paymentMethod: "efectivo" }),
      sale({ total: "5000", paymentMethod: "efectivo" }),
      sale({ total: "20000", paymentMethod: "debito" }),
      sale({ total: "30000", paymentMethod: "credito" }),
      sale({ total: "7000", paymentMethod: "qr" }),
    ]);
    expect(totals).toEqual({ expectedCash: 15000, expectedDebit: 20000, expectedCredit: 30000, expectedQr: 7000 });
  });

  it("resta del efectivo esperado los gastos pagados del cajón", () => {
    // Sin esta resta, la plata que salió para pagarle al proveedor aparecía
    // como faltante en el cierre.
    const totals = computeExpectedTotals([sale({ total: "50000", paymentMethod: "efectivo" })], 12000);
    expect(totals.expectedCash).toBe(38000);
  });

  it("ignora un medio de pago desconocido en vez de sumarlo a efectivo", () => {
    const totals = computeExpectedTotals([sale({ total: "9000", paymentMethod: "canje" })]);
    expect(totals).toEqual({ expectedCash: 0, expectedDebit: 0, expectedCredit: 0, expectedQr: 0 });
  });

  it("no rompe con un total no numérico", () => {
    const totals = computeExpectedTotals([sale({ total: "", paymentMethod: "efectivo" }), sale({ total: "1000" })]);
    expect(totals.expectedCash).toBe(1000);
  });
});

describe("shiftCashDiff y expectedCashWithOpening", () => {
  it("el fondo inicial se suma una sola vez, y ambas funciones concuerdan", () => {
    // El bug del CSV: exportaba `expectedCash` SIN el fondo al lado de una
    // diferencia que SÍ lo restaba, así que en Excel
    // `Contado − Esperado ≠ Diferencia` y la brecha era el fondo exacto.
    const expectedCash = 150000, openingCash = 50000, countedCash = 200000;
    expect(expectedCashWithOpening(expectedCash, openingCash)).toBe(200000);
    expect(shiftCashDiff(countedCash, expectedCash, openingCash)).toBe(0);
    expect(countedCash - expectedCashWithOpening(expectedCash, openingCash))
      .toBe(shiftCashDiff(countedCash, expectedCash, openingCash));
  });

  it("marca faltante y sobrante con el signo correcto", () => {
    expect(shiftCashDiff(190000, 150000, 50000)).toBe(-10000);
    expect(shiftCashDiff(215000, 150000, 50000)).toBe(15000);
  });

  it("el arqueo cuadra de punta a punta con gastos del cajón", () => {
    // Noche completa: fondo 50.000, 200.000 en ventas de efectivo, 12.000
    // que salieron del cajón para pagar hielo. En el cajón tiene que haber
    // 238.000 y la diferencia tiene que ser cero.
    const { expectedCash } = computeExpectedTotals([sale({ total: "200000", paymentMethod: "efectivo" })], 12000);
    expect(expectedCashWithOpening(expectedCash, 50000)).toBe(238000);
    expect(shiftCashDiff(238000, expectedCash, 50000)).toBe(0);
  });
});

describe("findPossibleDuplicateSales", () => {
  it("marca dos ventas iguales seguidas (el doble toque en el POS)", () => {
    const dups = findPossibleDuplicateSales([
      sale({ total: "35000", paymentMethod: "debito", at: "2026-10-31T01:00:00-03:00" }),
      sale({ total: "35000", paymentMethod: "debito", at: "2026-10-31T01:00:12-03:00" }),
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({ total: 35000, paymentMethod: "debito", count: 2 });
  });

  it("no marca dos ventas iguales separadas por horas", () => {
    const dups = findPossibleDuplicateSales([
      sale({ total: "35000", paymentMethod: "debito", at: "2026-10-31T01:00:00-03:00" }),
      sale({ total: "35000", paymentMethod: "debito", at: "2026-10-31T03:00:00-03:00" }),
    ]);
    expect(dups).toHaveLength(0);
  });

  it("no mezcla montos ni medios de pago distintos", () => {
    const dups = findPossibleDuplicateSales([
      sale({ total: "35000", paymentMethod: "debito", at: "2026-10-31T01:00:00-03:00" }),
      sale({ total: "35000", paymentMethod: "efectivo", at: "2026-10-31T01:00:10-03:00" }),
      sale({ total: "20000", paymentMethod: "debito", at: "2026-10-31T01:00:20-03:00" }),
    ]);
    expect(dups).toHaveLength(0);
  });

  it("cuenta una ráfaga de tres como una sola sospecha de 3", () => {
    const dups = findPossibleDuplicateSales([
      sale({ total: "10000", paymentMethod: "debito", at: "2026-10-31T02:00:00-03:00" }),
      sale({ total: "10000", paymentMethod: "debito", at: "2026-10-31T02:00:20-03:00" }),
      sale({ total: "10000", paymentMethod: "debito", at: "2026-10-31T02:00:40-03:00" }),
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0].count).toBe(3);
  });

  it("ordena por la plata que habría de más, no por el monto suelto", () => {
    const dups = findPossibleDuplicateSales([
      // 3 repeticiones de 10.000 = 20.000 de más
      sale({ total: "10000", paymentMethod: "debito", at: "2026-10-31T02:00:00-03:00" }),
      sale({ total: "10000", paymentMethod: "debito", at: "2026-10-31T02:00:20-03:00" }),
      sale({ total: "10000", paymentMethod: "debito", at: "2026-10-31T02:00:40-03:00" }),
      // 2 repeticiones de 15.000 = 15.000 de más
      sale({ total: "15000", paymentMethod: "debito", at: "2026-10-31T03:00:00-03:00" }),
      sale({ total: "15000", paymentMethod: "debito", at: "2026-10-31T03:00:30-03:00" }),
    ]);
    expect(dups.map((d) => d.total)).toEqual([10000, 15000]);
  });

  it("una venta sola nunca es sospechosa", () => {
    expect(findPossibleDuplicateSales([sale()])).toHaveLength(0);
  });
});

describe("cardTotals / cardSplitLooksUnreliable", () => {
  // Los números reales del cierre de Candyland (08-08-2026).
  const candyland = { countedDebit: 1227000, countedCredit: 200500, expectedDebit: 2204000, expectedCredit: 0 };

  it("el total de tarjetas muestra el hueco real, sin el ruido del desglose", () => {
    // Por separado se lee "faltan 977.000 en débito, sobran 200.500 en
    // crédito". El hueco de verdad es la resta de los totales.
    expect(cardTotals(candyland)).toEqual({ counted: 1427500, expected: 2204000, diff: -776500 });
  });

  it("detecta que el desglose no es creíble cuando el sistema no anotó nada de un tipo", () => {
    expect(cardSplitLooksUnreliable(candyland)).toBe(true);
  });

  it("un desglose normal no se marca como sospechoso", () => {
    const ok = { countedDebit: 1000000, countedCredit: 500000, expectedDebit: 1000000, expectedCredit: 500000 };
    expect(cardSplitLooksUnreliable(ok)).toBe(false);
    expect(cardTotals(ok).diff).toBe(0);
  });

  it("sin nada de crédito por ningún lado, el desglose sigue siendo creíble", () => {
    const soloDebito = { countedDebit: 800000, countedCredit: 0, expectedDebit: 800000, expectedCredit: 0 };
    expect(cardSplitLooksUnreliable(soloDebito)).toBe(false);
  });
});
