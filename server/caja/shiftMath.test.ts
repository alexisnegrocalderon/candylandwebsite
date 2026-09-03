import { describe, expect, it } from "vitest";
import { filterShiftSales, computeExpectedTotals, shiftCashDiff, expectedCashWithOpening } from "./shiftMath";

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
