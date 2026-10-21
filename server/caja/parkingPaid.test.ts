import { describe, expect, it } from "vitest";
import { ops, orders, orderItems, tickets, ticketTypes } from "../../drizzle/schema";
import { sellParkingAtDoor } from "./parkingPaid";

/* Cobro de estacionamiento en la puerta: el cliente elige el normal ($5.000)
 * o el VIP ($10.000) y se cobra ESE producto. Doble de la cadena de drizzle
 * por tabla (mismo estilo que sale.test.ts). */
const NORMAL = { id: 10, name: "Estacionamiento", category: "extra", price: "5000", costPrice: null, internalCode: "EST", status: "active" };
const VIP = { id: 11, name: "Estacionamiento VIP", category: "extra", price: "10000", costPrice: null, internalCode: "VIP", status: "active" };

function makeFakeDb(state: { types: unknown[]; alreadyHasParking?: boolean }) {
  const calls = { orderItems: [] as Record<string, unknown>[], tickets: [] as Record<string, unknown>[], orders: [] as Record<string, unknown>[] };
  const db: any = {
    select: () => {
      let table: unknown;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => ({
          limit: async () => {
            if (table === ops) return [];
            if (table === tickets) return [{ id: 1, ticketCode: "MP-AAA111", eventId: 1, orderId: 5, status: "valid" }];
            if (table === orders) return [{ id: 5, buyerName: "Ana", buyerEmail: "ana@x.cl", buyerPhone: null }];
            return [];
          },
          then: (res: any, rej: any) => Promise.resolve(
            table === ticketTypes ? state.types
            : table === orders ? [{ id: 5 }]
            : table === tickets ? (state.alreadyHasParking ? [{ id: 99 }] : [])
            : [],
          ).then(res, rej),
        }),
      };
      return builder;
    },
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === orders) { calls.orders.push(values); return [{ insertId: 55 }]; }
        if (table === orderItems) { calls.orderItems.push(values); return [{ insertId: 66 }]; }
        if (table === tickets) { calls.tickets.push(values); return [{ insertId: 77 }]; }
        return [{ insertId: 1 }];
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  };
  return { db, calls };
}

const base = { eventId: 1, ticketCode: "MP-AAA111", paymentMethod: "efectivo" as const, operatorId: 3, clientAt: new Date() };

describe("cobro de estacionamiento en la puerta (normal o VIP)", () => {
  it("cobra el VIP cuando el cliente lo elige: su precio y su producto", async () => {
    const { db, calls } = makeFakeDb({ types: [NORMAL, VIP] });
    const res = await sellParkingAtDoor(db, { ...base, opId: "op-vip", ticketTypeId: VIP.id });
    expect(res.result).toBe("applied");
    expect(calls.orders[0]).toMatchObject({ total: "10000", paymentMethod: "efectivo", paymentId: "PUERTA-PARKING-op-vip" });
    expect(calls.orderItems[0]).toMatchObject({ ticketTypeId: 11, unitPrice: "10000" });
    expect(calls.tickets[0]).toMatchObject({ ticketTypeId: 11, status: "used" });
  });

  it("cobra el normal cuando elige el normal", async () => {
    const { db, calls } = makeFakeDb({ types: [NORMAL, VIP] });
    const res = await sellParkingAtDoor(db, { ...base, opId: "op-normal", ticketTypeId: NORMAL.id });
    expect(res.result).toBe("applied");
    expect(calls.orders[0]).toMatchObject({ total: "5000" });
    expect(calls.orderItems[0]).toMatchObject({ ticketTypeId: 10 });
  });

  it("rechaza un estacionamiento que no existe en el evento (o que no es estacionamiento)", async () => {
    const { db, calls } = makeFakeDb({ types: [NORMAL, VIP, { id: 12, name: "Cover", category: "extra", price: "3000", status: "active" }] });
    const noExiste = await sellParkingAtDoor(db, { ...base, opId: "op-x", ticketTypeId: 999 });
    expect(noExiste).toMatchObject({ result: "rejected", conflictNote: "Ese estacionamiento no existe en este evento" });
    const cover = await sellParkingAtDoor(db, { ...base, opId: "op-y", ticketTypeId: 12 });
    expect(cover.result).toBe("rejected");
    expect(calls.orders).toHaveLength(0);
  });

  it("no cobra otro a quien ya tiene un estacionamiento (normal o VIP)", async () => {
    const { db, calls } = makeFakeDb({ types: [NORMAL, VIP], alreadyHasParking: true });
    const res = await sellParkingAtDoor(db, { ...base, opId: "op-dup", ticketTypeId: VIP.id });
    expect(res).toMatchObject({ result: "rejected", conflictNote: "Este ticket ya tiene estacionamiento pagado" });
    expect(calls.orders).toHaveLength(0);
  });

  it("sin elección (cobros viejos de la cola): el único Estacionamiento sin VIP, como antes", async () => {
    const { db, calls } = makeFakeDb({ types: [NORMAL, VIP] });
    const res = await sellParkingAtDoor(db, { ...base, opId: "op-viejo" });
    expect(res.result).toBe("applied");
    expect(calls.orderItems[0]).toMatchObject({ ticketTypeId: 10, unitPrice: "5000" });
  });
});
