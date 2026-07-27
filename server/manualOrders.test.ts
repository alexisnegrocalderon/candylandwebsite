import { describe, expect, it } from "vitest";
import { priceManualOrderItems, buildManualPaymentMethod } from "./db";

const accesoType = { id: 1, name: "Dúo", category: "acceso", accesoSlug: "duo", price: "30000", totalStock: 10, soldCount: 8 };
const extraType = { id: 2, name: "Estacionamiento", category: "extra", accesoSlug: null, price: "5000", totalStock: 20, soldCount: 0 };

describe("priceManualOrderItems", () => {
  it("una invitación sale a $0 sin importar el tipo de entrada", () => {
    const { unitPrices, subtotal, missionDeposit } = priceManualOrderItems(
      [{ ticketTypeId: 1, quantity: 2 }, { ticketTypeId: 2, quantity: 1 }],
      [accesoType, extraType],
      "invitation",
      false,
    );
    expect(unitPrices.get(1)).toBe(0);
    expect(unitPrices.get(2)).toBe(0);
    expect(subtotal).toBe(0);
    expect(missionDeposit).toBe(false);
  });

  it("un acceso pagado con la ventana de Misión 300 cerrada usa el precio de lista", () => {
    const { unitPrices, subtotal, missionDeposit } = priceManualOrderItems(
      [{ ticketTypeId: 1, quantity: 2 }],
      [accesoType],
      "paid",
      false,
    );
    expect(unitPrices.get(1)).toBe(30000);
    expect(subtotal).toBe(60000);
    expect(missionDeposit).toBe(false);
  });

  it("un acceso pagado con la ventana de Misión 300 abierta usa el precio de abono", () => {
    const { unitPrices, subtotal, missionDeposit } = priceManualOrderItems(
      [{ ticketTypeId: 1, quantity: 2 }],
      [accesoType],
      "paid",
      true,
    );
    // Dúo = 2 personas -> $10.000 * 2 = $20.000 de abono.
    expect(unitPrices.get(1)).toBe(20000);
    expect(subtotal).toBe(40000);
    expect(missionDeposit).toBe(true);
  });

  it("un extra pagado nunca usa precio de abono aunque la ventana esté abierta", () => {
    const { unitPrices, missionDeposit } = priceManualOrderItems(
      [{ ticketTypeId: 2, quantity: 1 }],
      [extraType],
      "paid",
      true,
    );
    expect(unitPrices.get(2)).toBe(5000);
    expect(missionDeposit).toBe(false);
  });

  it("tira un error si no hay stock suficiente", () => {
    expect(() => priceManualOrderItems(
      [{ ticketTypeId: 1, quantity: 5 }], // quedan 10-8=2 disponibles
      [accesoType],
      "paid",
      false,
    )).toThrow(/Not enough stock/);
  });

  it("tira un error si el tipo de entrada no pertenece al evento", () => {
    expect(() => priceManualOrderItems(
      [{ ticketTypeId: 999, quantity: 1 }],
      [accesoType],
      "invitation",
      false,
    )).toThrow(/Ticket type 999 not found/);
  });
});

describe("buildManualPaymentMethod", () => {
  it("una invitación siempre se guarda igual", () => {
    expect(buildManualPaymentMethod("invitation", "esto se ignora")).toBe("Manual: Invitación");
  });

  it("un pago usa el método elegido con el prefijo fijo", () => {
    expect(buildManualPaymentMethod("paid", "Efectivo")).toBe("Manual: Efectivo");
  });

  it("un pago sin método elegido cae a Transferencia por defecto", () => {
    expect(buildManualPaymentMethod("paid", undefined)).toBe("Manual: Transferencia");
    expect(buildManualPaymentMethod("paid", "   ")).toBe("Manual: Transferencia");
  });
});
