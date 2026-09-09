import { describe, expect, it } from "vitest";
import {
  isTopupProduct,
  topupChargeForLines,
  topupCreditForLines,
  clampSpendAmount,
} from "./prepaid";

describe("isTopupProduct", () => {
  it("reconoce un producto con topupAmount positivo", () => {
    expect(isTopupProduct({ topupAmount: 10000 })).toBe(true);
  });

  it("no es carga de saldo sin topupAmount, con 0, o con null", () => {
    expect(isTopupProduct({})).toBe(false);
    expect(isTopupProduct({ topupAmount: undefined })).toBe(false);
    expect(isTopupProduct({ topupAmount: null })).toBe(false);
    expect(isTopupProduct({ topupAmount: 0 })).toBe(false);
  });

  it("no es carga de saldo con un monto negativo o no finito (dato corrupto, nunca debería pasar)", () => {
    expect(isTopupProduct({ topupAmount: -5000 })).toBe(false);
    expect(isTopupProduct({ topupAmount: NaN })).toBe(false);
  });
});

describe("topupChargeForLines", () => {
  it("suma solo las líneas de carga, ignora entradas/extras normales", () => {
    const lines = [
      { topupAmount: 10000, unitPrice: 10000, quantity: 1 }, // carga
      { topupAmount: null, unitPrice: 15000, quantity: 2 }, // entrada normal
      { topupAmount: 5000, unitPrice: 5000, quantity: 2 }, // otra carga
    ];
    expect(topupChargeForLines(lines)).toBe(10000 + 5000 * 2);
  });

  it("sin líneas de carga, devuelve 0", () => {
    expect(
      topupChargeForLines([
        { topupAmount: null, unitPrice: 15000, quantity: 1 },
      ])
    ).toBe(0);
  });

  it("carrito vacío, devuelve 0", () => {
    expect(topupChargeForLines([])).toBe(0);
  });

  it("usa unitPrice (lo que se paga), no topupAmount, para el cargo", () => {
    // Caso de bonificación: se paga 10.000 pero se acreditan 11.000.
    const lines = [{ topupAmount: 11000, unitPrice: 10000, quantity: 1 }];
    expect(topupChargeForLines(lines)).toBe(10000);
  });
});

describe("topupCreditForLines", () => {
  it("normalmente coincide con topupChargeForLines (1 CLP = 1 CLP)", () => {
    const lines = [{ topupAmount: 10000, unitPrice: 10000, quantity: 3 }];
    expect(topupCreditForLines(lines)).toBe(topupChargeForLines(lines));
  });

  it("con bonificación, acredita más de lo que se pagó", () => {
    const lines = [{ topupAmount: 11000, unitPrice: 10000, quantity: 2 }];
    expect(topupCreditForLines(lines)).toBe(22000);
    expect(topupChargeForLines(lines)).toBe(20000);
  });

  it("ignora líneas que no son carga de saldo", () => {
    const lines = [{ topupAmount: null, unitPrice: 15000, quantity: 1 }];
    expect(topupCreditForLines(lines)).toBe(0);
  });
});

describe("clampSpendAmount", () => {
  it("deja pasar un pedido dentro del saldo disponible", () => {
    expect(clampSpendAmount(5000, 10000)).toBe(5000);
  });

  it("topea al saldo disponible si se pide de más", () => {
    expect(clampSpendAmount(20000, 10000)).toBe(10000);
  });

  it("nunca negativo, aunque se pida un monto negativo", () => {
    expect(clampSpendAmount(-100, 10000)).toBe(0);
  });

  it("con saldo 0, siempre da 0", () => {
    expect(clampSpendAmount(5000, 0)).toBe(0);
  });

  it("trunca decimales -- el saldo es en pesos enteros", () => {
    expect(clampSpendAmount(1500.75, 10000)).toBe(1500);
  });

  it("valores no finitos dan 0, nunca NaN/Infinity", () => {
    expect(clampSpendAmount(NaN, 10000)).toBe(0);
    expect(clampSpendAmount(5000, NaN)).toBe(0);
    expect(clampSpendAmount(Infinity, 10000)).toBe(0);
  });
});
