import { describe, expect, it, vi } from "vitest";
import { honorariosBreakdown, retentionRateForYear, sumBreakdowns } from "../shared/honorarios";
vi.mock("./db", () => ({ getDb: vi.fn(), getPnlComparison: vi.fn(), getParkingReport: vi.fn() }));

describe("tasa de retención por año", () => {
  it("sigue el calendario de la ley", () => {
    expect(retentionRateForYear(2025)).toBe(14.5);
    expect(retentionRateForYear(2026)).toBe(15.25);
    expect(retentionRateForYear(2027)).toBe(16);
    expect(retentionRateForYear(2028)).toBe(17);
    expect(retentionRateForYear(2040)).toBe(17);
    expect(retentionRateForYear(2019)).toBe(10);
  });
});

describe("honorariosBreakdown (2026, 15,25 %)", () => {
  it("líquido $100.000: la persona recibe exacto y la boleta sube", () => {
    const b = honorariosBreakdown({ amount: 100000, paymentType: "boleta_honorarios", amountMode: "liquido", year: 2026 });
    expect(b).toMatchObject({ gross: 117994, retention: 17994, net: 100000, cost: 117994, ratePercent: 15.25 });
  });
  it("bruto $100.000: se descuenta la retención a la persona", () => {
    const b = honorariosBreakdown({ amount: 100000, paymentType: "boleta_honorarios", amountMode: "bruto", year: 2026 });
    expect(b).toMatchObject({ gross: 100000, retention: 15250, net: 84750, cost: 100000 });
  });
  it("transferencia: sin retención, costo = monto", () => {
    const b = honorariosBreakdown({ amount: 100000, paymentType: "transferencia", amountMode: "liquido", year: 2026 });
    expect(b).toMatchObject({ gross: 100000, retention: 0, net: 100000, cost: 100000, ratePercent: 0 });
  });
  it("la retención más lo que recibe siempre suma el bruto (sin perder un peso)", () => {
    for (const mode of ["liquido", "bruto"] as const) {
      for (const amount of [1, 999, 33333, 87654, 250001]) {
        const b = honorariosBreakdown({ amount, paymentType: "boleta_honorarios", amountMode: mode, year: 2026 });
        expect(b.net + b.retention).toBe(b.gross);
        expect(b.cost).toBe(b.gross);
      }
    }
  });
  it("monto 0 o inválido da 0", () => {
    expect(honorariosBreakdown({ amount: 0, paymentType: "boleta_honorarios", amountMode: "liquido", year: 2026 }).cost).toBe(0);
    expect(honorariosBreakdown({ amount: NaN, paymentType: "boleta_honorarios", amountMode: "bruto", year: 2026 }).cost).toBe(0);
  });
  it("cambia con el año", () => {
    const a = honorariosBreakdown({ amount: 100000, paymentType: "boleta_honorarios", amountMode: "bruto", year: 2025 });
    expect(a.retention).toBe(14500);
  });
});

describe("sumBreakdowns", () => {
  it("suma los turnos", () => {
    const a = honorariosBreakdown({ amount: 100000, paymentType: "boleta_honorarios", amountMode: "liquido", year: 2026 });
    const b = honorariosBreakdown({ amount: 50000, paymentType: "transferencia", amountMode: "liquido", year: 2026 });
    expect(sumBreakdowns([a, b])).toEqual({ gross: 167994, retention: 17994, net: 150000, cost: 167994 });
  });
});

import { staffTotals } from "../shared/honorarios";
import { f29DueDate } from "./financeCompany";

describe("compatibilidad: los turnos ya cargados no cambian", () => {
  it("sin forma de pago (datos viejos) cuentan como transferencia: costo = monto", () => {
    const t = staffTotals([{ amountClp: 50000 }, { amountClp: "30000", paymentType: null, amountMode: null }], 2026);
    expect(t).toMatchObject({ cost: 80000, retention: 0, net: 80000, gross: 80000 });
  });
  it("mezcla transferencia y boleta: el costo es el bruto de la boleta", () => {
    const t = staffTotals([
      { amountClp: 50000, paymentType: "transferencia" },
      { amountClp: 100000, paymentType: "boleta_honorarios", amountMode: "liquido" },
    ], 2026);
    expect(t.cost).toBe(167994);
    expect(t.net).toBe(150000);
    expect(t.retention).toBe(17994);
  });
});

describe("f29DueDate", () => {
  it("vence el 12 del mes siguiente", () => {
    expect(f29DueDate("2026-10-30T22:00:00-03:00")).toBe("2026-11-12");
  });
  it("diciembre pasa a enero del año siguiente", () => {
    expect(f29DueDate("2026-12-20T22:00:00-03:00")).toBe("2027-01-12");
  });
});
