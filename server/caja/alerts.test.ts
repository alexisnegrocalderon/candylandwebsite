import { describe, expect, it, vi } from "vitest";

// Las reglas son puras; se aíslan de la base, el push, la IA y el correo.
vi.mock("../db", () => ({ getDb: vi.fn(async () => null), getSiteSettings: vi.fn(async () => ({})) }));
vi.mock("../push", () => ({ sendPushToAdmins: vi.fn(async () => {}) }));
vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn(), extractContent: vi.fn(() => "") }));
vi.mock("../email", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));

const { stockAlertsAfterSale, unusualSaleAlerts, shiftCloseAlerts, idleRegisterAlerts, manyVoidsAlerts } = await import("./alerts");

describe("stockAlertsAfterSale", () => {
  it("avisa stock bajo solo al cruzar el umbral", () => {
    const crossed = stockAlertsAfterSale([{ id: 1, name: "Piscola", totalStock: 50, soldCountAfter: 41, quantitySold: 2 }], 10);
    expect(crossed).toHaveLength(1);
    expect(crossed[0]).toMatchObject({ kind: "stock_low", dedupeKey: "stock_low:1:10" });
    expect(crossed[0].body).toContain("9");

    const alreadyBelow = stockAlertsAfterSale([{ id: 1, name: "Piscola", totalStock: 50, soldCountAfter: 45, quantitySold: 1 }], 10);
    expect(alreadyBelow).toHaveLength(0);
  });

  it("avisa agotado (crítico) al vender la última o pasarse", () => {
    const out = stockAlertsAfterSale([{ id: 2, name: "Gin", totalStock: 10, soldCountAfter: 12, quantitySold: 3 }], 5);
    expect(out).toEqual([expect.objectContaining({ kind: "stock_out", severity: "critical", dedupeKey: "stock_out:2" })]);
    expect(out[0].body).toContain("2 por sobre");
  });

  it("no avisa si sigue sobre el umbral o el umbral es 0", () => {
    expect(stockAlertsAfterSale([{ id: 3, name: "Agua", totalStock: 100, soldCountAfter: 20, quantitySold: 1 }], 10)).toEqual([]);
    expect(stockAlertsAfterSale([{ id: 3, name: "Agua", totalStock: 100, soldCountAfter: 95, quantitySold: 10 }], 0)).toEqual([]);
  });
});

describe("unusualSaleAlerts", () => {
  const sale = { orderNumber: "CAJA-1", subtotal: 20000, discount: 0, total: 20000, operatorName: "Ana", paymentMethod: "efectivo" };
  it("avisa venta sobre el monto configurado", () => {
    expect(unusualSaleAlerts({ ...sale, subtotal: 150000, total: 150000 }, 100000)).toEqual([expect.objectContaining({ kind: "sale_high" })]);
    expect(unusualSaleAlerts(sale, 100000)).toEqual([]);
  });
  it("avisa descuento mayor al 50%", () => {
    const out = unusualSaleAlerts({ ...sale, discount: 15000, total: 5000 }, 100000);
    expect(out).toEqual([expect.objectContaining({ kind: "sale_discount" })]);
    expect(out[0].title).toContain("75%");
  });
});

describe("shiftCloseAlerts", () => {
  const base = { id: 9, registerName: "Caja 1", operatorName: "Ana", cashDiff: 0, debitDiff: 0, creditDiff: 0, qrDiff: 0 };
  it("no avisa si cuadra", () => {
    expect(shiftCloseAlerts(base)).toEqual([]);
  });
  it("avisa faltante de efectivo", () => {
    const out = shiftCloseAlerts({ ...base, cashDiff: -5000 });
    expect(out[0]).toMatchObject({ kind: "shift_diff", severity: "critical" });
    expect(out[0].body).toContain("faltan $5.000");
  });
  it("débito/crédito cruzados que suman cero no son descuadre", () => {
    expect(shiftCloseAlerts({ ...base, debitDiff: 4000, creditDiff: -4000 })).toEqual([]);
  });
  it("informa las anulaciones del turno", () => {
    const out = shiftCloseAlerts({ ...base, voids: [{ total: 3000 }, { total: 2000 }] });
    expect(out).toEqual([expect.objectContaining({ kind: "shift_voids" })]);
    expect(out[0].body).toContain("$5.000");
  });
});

describe("idleRegisterAlerts", () => {
  const now = new Date("2026-10-10T03:00:00Z");
  it("avisa cajas sin movimiento por más de 45 minutos, una vez por hora", () => {
    const out = idleRegisterAlerts([
      { shiftId: 1, registerName: "Caja 1", operatorName: "Ana", lastActivityAt: new Date(now.getTime() - 50 * 60_000) },
      { shiftId: 2, registerName: "Caja 2", operatorName: "Bea", lastActivityAt: new Date(now.getTime() - 10 * 60_000) },
    ], now);
    expect(out).toHaveLength(1);
    expect(out[0].dedupeKey).toBe("register_idle:1:0");
  });
});

describe("manyVoidsAlerts", () => {
  it("avisa desde 3 anulaciones de la misma persona", () => {
    const out = manyVoidsAlerts([
      { operatorId: 1, operatorName: "Ana", count: 3, total: 12000 },
      { operatorId: 2, operatorName: "Bea", count: 1, total: 2000 },
    ], 5);
    expect(out).toEqual([expect.objectContaining({ kind: "many_voids", dedupeKey: "many_voids:5:1:3" })]);
  });
});
