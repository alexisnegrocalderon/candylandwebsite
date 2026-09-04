import { describe, expect, it } from "vitest";
import { isParkingTicketType, classifyParkingOrigin, summarizeParkingCounts } from "./parking";

describe("isParkingTicketType", () => {
  it("reconoce Estacionamiento y Parking, ignorando mayúsculas", () => {
    expect(isParkingTicketType("Estacionamiento")).toBe(true);
    expect(isParkingTicketType("parking")).toBe(true);
    expect(isParkingTicketType("ESTACIONAMIENTO")).toBe(true);
  });

  it("excluye la variante VIP -- es otro producto", () => {
    expect(isParkingTicketType("Estacionamiento VIP")).toBe(false);
  });

  it("no matchea productos que no son estacionamiento", () => {
    expect(isParkingTicketType("Trago")).toBe(false);
    expect(isParkingTicketType("Cover")).toBe(false);
  });
});

describe("classifyParkingOrigin", () => {
  it("puerta: paymentId con el prefijo de sellParkingAtDoor", () => {
    expect(classifyParkingOrigin({ orderPaymentMethod: "efectivo", orderPaymentId: "PUERTA-PARKING-abc123" }))
      .toBe("puerta");
    expect(classifyParkingOrigin({ orderPaymentMethod: "debito", orderPaymentId: "PUERTA-PARKING-xyz" }))
      .toBe("puerta");
  });

  it("staff: invitación manual gratis", () => {
    expect(classifyParkingOrigin({ orderPaymentMethod: "Manual: Invitación", orderPaymentId: null }))
      .toBe("staff");
  });

  it("online: cualquier otro caso (web checkout, venta de mostrador)", () => {
    expect(classifyParkingOrigin({ orderPaymentMethod: "approved_payment", orderPaymentId: "MP-12345" }))
      .toBe("online");
    expect(classifyParkingOrigin({ orderPaymentMethod: "efectivo", orderPaymentId: "CAJA-abc" }))
      .toBe("online");
  });

  it("el paymentId puerta manda incluso si el paymentMethod también matchea otra regla", () => {
    // No debería pasar en la práctica, pero confirma el orden de prioridad.
    expect(classifyParkingOrigin({ orderPaymentMethod: "Manual: Invitación", orderPaymentId: "PUERTA-PARKING-x" }))
      .toBe("puerta");
  });
});

describe("summarizeParkingCounts", () => {
  it("cuenta cada balde y suma los totales correctamente", () => {
    const r = summarizeParkingCounts(["online", "online", "puerta", "staff", "puerta", "online"]);
    expect(r).toEqual({ online: 3, puerta: 2, staff: 1, totalPaid: 5, totalCars: 6 });
  });

  it("sin registros, todo en cero", () => {
    expect(summarizeParkingCounts([])).toEqual({ online: 0, puerta: 0, staff: 0, totalPaid: 0, totalCars: 0 });
  });
});
