import { describe, expect, it } from "vitest";
import { computeOrderDeleteEffects, excludeCustomersByTags } from "./db";

describe("computeOrderDeleteEffects", () => {
  it("decrementa soldCount y totales del cliente para una orden web aprobada", () => {
    const effects = computeOrderDeleteEffects({ paymentStatus: "approved", channel: "web" }, []);
    expect(effects.decrementSoldCount).toBe(true);
    expect(effects.decrementCustomerTotals).toBe(true);
  });

  it("decrementa soldCount pero no los totales del cliente para una orden reembolsada", () => {
    const effects = computeOrderDeleteEffects({ paymentStatus: "refunded", channel: "web" }, []);
    expect(effects.decrementSoldCount).toBe(true);
    expect(effects.decrementCustomerTotals).toBe(false);
  });

  it("no decrementa nada para una orden pendiente (nunca sumó stock ni cliente)", () => {
    const effects = computeOrderDeleteEffects({ paymentStatus: "pending", channel: "web" }, []);
    expect(effects.decrementSoldCount).toBe(false);
    expect(effects.decrementCustomerTotals).toBe(false);
  });

  it("no decrementa nada para una orden rechazada", () => {
    const effects = computeOrderDeleteEffects({ paymentStatus: "rejected", channel: "web" }, []);
    expect(effects.decrementSoldCount).toBe(false);
    expect(effects.decrementCustomerTotals).toBe(false);
  });

  it("una venta de caja aprobada decrementa soldCount pero no toca customers (no tiene proyección)", () => {
    const effects = computeOrderDeleteEffects({ paymentStatus: "approved", channel: "caja" }, []);
    expect(effects.decrementSoldCount).toBe(true);
    expect(effects.decrementCustomerTotals).toBe(false);
  });

  it("invierte el signo de cada entrada del ledger de playcoins ligada a la orden", () => {
    const effects = computeOrderDeleteEffects(
      { paymentStatus: "approved", channel: "web" },
      [{ customerId: 7, delta: 250 }],
    );
    expect(effects.playcoinsReversals).toEqual([{ customerId: 7, delta: -250 }]);
  });

  it("ignora entradas de ledger con delta 0", () => {
    const effects = computeOrderDeleteEffects(
      { paymentStatus: "approved", channel: "web" },
      [{ customerId: 7, delta: 0 }],
    );
    expect(effects.playcoinsReversals).toEqual([]);
  });

  it("reversa varias entradas de ledger si hubiera más de una", () => {
    const effects = computeOrderDeleteEffects(
      { paymentStatus: "approved", channel: "web" },
      [{ customerId: 7, delta: 100 }, { customerId: 7, delta: -20 }],
    );
    expect(effects.playcoinsReversals).toEqual([
      { customerId: 7, delta: -100 },
      { customerId: 7, delta: 20 },
    ]);
  });
});

describe("excludeCustomersByTags", () => {
  const customers = [
    { id: 1, tags: ["vip", "masivocandyland2"] },
    { id: 2, tags: ["masivocandyland2"] },
    { id: 3, tags: ["cumpleaños"] },
    { id: 4, tags: [] },
    { id: 5, tags: null },
  ];

  it("no filtra nada si no se pasan etiquetas a excluir", () => {
    expect(excludeCustomersByTags(customers, undefined)).toEqual(customers);
    expect(excludeCustomersByTags(customers, [])).toEqual(customers);
  });

  it("excluye a quien tenga cualquiera de las etiquetas dadas", () => {
    const result = excludeCustomersByTags(customers, ["masivocandyland2"]);
    expect(result.map((c) => c.id)).toEqual([3, 4, 5]);
  });

  it("excluye con más de una etiqueta a la vez", () => {
    const result = excludeCustomersByTags(customers, ["masivocandyland2", "cumpleaños"]);
    expect(result.map((c) => c.id)).toEqual([4, 5]);
  });

  it("nunca excluye a un cliente sin etiquetas o con tags no-array", () => {
    const result = excludeCustomersByTags(customers, ["vip", "masivocandyland2", "cumpleaños"]);
    expect(result.map((c) => c.id)).toEqual([4, 5]);
  });
});
