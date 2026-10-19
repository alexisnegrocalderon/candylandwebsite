import { describe, expect, it } from "vitest";
import { computeAmbassadorCommissionBase, computeAmbassadorCommission } from "./db";

describe("computeAmbassadorCommissionBase", () => {
  it("resta el descuento del subtotal de accesos", () => {
    expect(computeAmbassadorCommissionBase(100000, 10000)).toBe(90000);
  });

  it("nunca queda negativa aunque el descuento supere el subtotal", () => {
    expect(computeAmbassadorCommissionBase(5000, 10000)).toBe(0);
  });

  it("sin descuento, la base es el subtotal completo", () => {
    expect(computeAmbassadorCommissionBase(50000, 0)).toBe(50000);
  });
});

describe("computeAmbassadorCommission", () => {
  it("calcula el % exacto sobre la base", () => {
    expect(computeAmbassadorCommission(100000, 10)).toBe(10000);
  });

  it("redondea al entero más cercano (misma convención que el resto del proyecto)", () => {
    expect(computeAmbassadorCommission(10000, 12.5)).toBe(1250);
    expect(computeAmbassadorCommission(33333, 15)).toBe(5000);
  });

  it("una comisión de 0% no genera nada", () => {
    expect(computeAmbassadorCommission(100000, 0)).toBe(0);
  });

  it("una base de 0 no genera comisión aunque el % sea alto", () => {
    expect(computeAmbassadorCommission(0, 50)).toBe(0);
  });

  it("soporta porcentajes con decimales (decimal(5,2) del schema)", () => {
    expect(computeAmbassadorCommission(200000, 7.5)).toBe(15000);
  });
});

import { ambassadorBuyerDiscount } from "../shared/ambassadorDiscount";
describe("descuento del embajador y su comisión", () => {
  it("la comisión se calcula sobre lo que pagó el comprador (acceso menos el descuento del embajador)", () => {
    const lines = [{ ticketTypeId: 1, category: "acceso", unitPrice: 20000, quantity: 1 }, { ticketTypeId: 2, category: "extra", unitPrice: 5000, quantity: 1 }];
    const discount = ambassadorBuyerDiscount(10, lines); // 2.000, los extras no cuentan
    const base = computeAmbassadorCommissionBase(20000, discount);
    expect(base).toBe(18000);
    expect(computeAmbassadorCommission(base, 40)).toBe(7200);
  });
});
