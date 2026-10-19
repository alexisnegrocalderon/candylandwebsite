import { describe, expect, it } from "vitest";
import { isParkingTicketType, isAnyParkingTicketType, classifyParkingOrigin, summarizeParkingCounts, cashChange, listDoorParkingOptions, doorParkingScript, summarizeDoorParking, type DoorParkingCharge } from "./parking";

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

describe("isAnyParkingTicketType", () => {
  // Pedido explícito del dueño (14/09): para la contabilidad, el VIP
  // también cuenta como un auto -- solo isParkingTicketType (usado para
  // cobrar en la puerta) lo excluye.
  it("incluye la variante VIP, a diferencia de isParkingTicketType", () => {
    expect(isAnyParkingTicketType("Estacionamiento VIP")).toBe(true);
    expect(isParkingTicketType("Estacionamiento VIP")).toBe(false);
  });

  it("reconoce Estacionamiento y Parking sin importar mayúsculas", () => {
    expect(isAnyParkingTicketType("ESTACIONAMIENTO")).toBe(true);
    expect(isAnyParkingTicketType("parking")).toBe(true);
  });

  it("no matchea productos que no son estacionamiento", () => {
    expect(isAnyParkingTicketType("Trago")).toBe(false);
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


describe('listDoorParkingOptions', () => {
  const tt = (id: number, name: string, price: number, category = 'extra', status = 'active') => ({ id, name, category, price, status });
  it('devuelve el normal y el VIP, del más barato al más caro', () => {
    const out = listDoorParkingOptions([tt(2, 'Estacionamiento VIP', 10000), tt(1, 'Estacionamiento', 5000), tt(3, 'Cover', 3000)]);
    expect(out).toEqual([
      { ticketTypeId: 1, name: 'Estacionamiento', priceClp: 5000, isVip: false },
      { ticketTypeId: 2, name: 'Estacionamiento VIP', priceClp: 10000, isVip: true },
    ]);
  });
  it('ignora los ocultos y los que no son extras; precio como texto de la base', () => {
    expect(listDoorParkingOptions([tt(1, 'Estacionamiento', 5000, 'extra', 'hidden'), tt(2, 'Estacionamiento', 5000, 'acceso')])).toEqual([]);
    expect(listDoorParkingOptions([{ id: 1, name: 'Parking', category: 'extra', price: '5000', status: 'active' }])[0].priceClp).toBe(5000);
  });
});

describe('doorParkingScript', () => {
  it('con dos opciones: la frase exacta para el cliente', () => {
    expect(doorParkingScript([{ name: 'Estacionamiento', priceClp: 5000 }, { name: 'Estacionamiento VIP', priceClp: 10000 }]))
      .toBe('Tenemos dos estacionamientos: Estacionamiento $5.000 y Estacionamiento VIP $10.000. ¿Cuál prefiere?');
  });
  it('con una sola no pregunta; sin ninguna, vacío', () => {
    expect(doorParkingScript([{ name: 'Estacionamiento', priceClp: 5000 }])).toBe('El Estacionamiento cuesta $5.000.');
    expect(doorParkingScript([])).toBe('');
  });
});

describe('summarizeDoorParking', () => {
  const c = (method: DoorParkingCharge['method'], amount: number | null, status: DoorParkingCharge['status'] = 'ok'): DoorParkingCharge => ({ method, amount, status });

  it('suma autos, total, desglose, efectivo a entregar y lo del local ($3.000 por auto)', () => {
    const s = summarizeDoorParking([c('efectivo', 5000), c('efectivo', 5000, 'pendiente'), c('debito', 5000), c('credito', 5000)], 3000);
    expect(s.cars).toBe(4);
    expect(s.total).toBe(20000);
    expect(s.byMethod.efectivo).toEqual({ count: 2, total: 10000 });
    expect(s.cashToHandOver).toBe(10000);
    expect(s.venueShare).toBe(12000);
  });

  it('los rechazados no cuentan, ni para el total ni para lo del local', () => {
    const s = summarizeDoorParking([c('efectivo', 5000), c('debito', 5000, 'rechazado')], 3000);
    expect(s.cars).toBe(1);
    expect(s.total).toBe(5000);
    expect(s.rejected).toBe(1);
    expect(s.venueShare).toBe(3000);
  });

  it('sin cobros todo en cero; monto desconocido cuenta el auto pero no suma pesos', () => {
    expect(summarizeDoorParking([], 3000)).toMatchObject({ cars: 0, total: 0, cashToHandOver: 0, venueShare: 0, byOption: [] });
    expect(summarizeDoorParking([c('efectivo', null)], 3000)).toMatchObject({ cars: 1, total: 0, venueShare: 3000 });
  });
});

describe('summarizeDoorParking por tipo', () => {
  it('separa normal y VIP, cada uno suma al local ($3.000 por auto)', () => {
    const ch = (optionName: string, amount: number): DoorParkingCharge => ({ method: 'efectivo', optionName, amount, status: 'ok' });
    const s = summarizeDoorParking([ch('Estacionamiento', 5000), ch('Estacionamiento', 5000), ch('Estacionamiento VIP', 10000)], 3000);
    expect(s.byOption).toEqual([{ name: 'Estacionamiento', count: 2, total: 10000 }, { name: 'Estacionamiento VIP', count: 1, total: 10000 }]);
    expect(s.total).toBe(20000);
    expect(s.venueShare).toBe(9000);
  });
});

describe('cashChange', () => {
  it('vuelto cuando alcanza; null si no alcanza o no hay monto', () => {
    expect(cashChange(10000, 5000)).toBe(5000);
    expect(cashChange(5000, 5000)).toBe(0);
    expect(cashChange(2000, 5000)).toBeNull();
    expect(cashChange(10000, null)).toBeNull();
    expect(cashChange(NaN, 5000)).toBeNull();
  });
});
