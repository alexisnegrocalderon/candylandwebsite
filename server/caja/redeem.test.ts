import { describe, expect, it } from "vitest";
import { ops, partyGifts, tickets } from "../../drizzle/schema";
import { redeemDisplayCode } from "./redeem";

/* Mismo doble de la cadena de drizzle que checkin.test.ts, más las
 * consultas a partyGifts que el canje agregó para poder aceptar un trago
 * regalado en una fiesta anterior. */
function makeFakeDb(state: {
  existingOp?: { result: string; conflictNote?: string | null };
  ticket?: Record<string, unknown>;
  gift?: Record<string, unknown>;
}) {
  const calls = {
    ticketUpdate: null as Record<string, unknown> | null,
    giftUpdate: null as Record<string, unknown> | null,
  };

  const db = {
    select: () => {
      let table: unknown;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => builder,
        limit: async () => {
          if (table === ops) return state.existingOp ? [state.existingOp] : [];
          if (table === tickets) return state.ticket ? [state.ticket] : [];
          if (table === partyGifts) return state.gift ? [state.gift] : [];
          return [];
        },
      };
      return builder;
    },
    update: (t: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (t === tickets) calls.ticketUpdate = values;
          if (t === partyGifts) calls.giftUpdate = values;
        },
      }),
    }),
    insert: () => ({ values: async () => {} }),
  };

  return { db, calls };
}

const params = {
  opId: "op-1",
  displayCode: "PIS-AAAA-1111",
  eventId: 10,
  operatorId: 5,
  registerId: 2,
  clientAt: new Date("2026-08-01T23:30:00Z"),
};

const validExtra = { id: 55, eventId: 10, status: "valid", ticketTypeId: 3 };

describe("redeemDisplayCode", () => {
  it("canjea un extra normal de este evento", async () => {
    const { db, calls } = makeFakeDb({ ticket: validExtra });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toMatchObject({ status: "used" });
  });

  it("rechaza un extra normal de otro evento", async () => {
    const { db, calls } = makeFakeDb({ ticket: { ...validExtra, eventId: 77 } });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toContain("no corresponde a este evento");
    expect(calls.ticketUpdate).toBeNull();
  });

  it("SÍ acepta un trago regalado en una fiesta anterior, y lo marca retirado", async () => {
    // El caso que motivó la excepción: el dueño decidió que un trago no
    // cobrado siga válido para la próxima fiesta.
    const { db, calls } = makeFakeDb({
      ticket: { ...validExtra, eventId: 77 },
      gift: { id: 9, ticketId: 55, status: "paid" },
    });

    const res = await redeemDisplayCode(db, params);

    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toMatchObject({ status: "used" });
    expect(calls.giftUpdate).toMatchObject({ status: "redeemed" });
  });

  it("un regalo anulado sigue sin poder canjearse", async () => {
    const { db, calls } = makeFakeDb({
      ticket: { ...validExtra, eventId: 77, status: "cancelled" },
      gift: { id: 9, ticketId: 55, status: "paid" },
    });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("rejected");
    expect(calls.ticketUpdate).toBeNull();
    expect(calls.giftUpdate).toBeNull();
  });

  it("un regalo ya retirado no se entrega dos veces", async () => {
    const { db, calls } = makeFakeDb({
      ticket: { ...validExtra, status: "used", usedAt: new Date("2026-08-01T23:00:00Z") },
      gift: { id: 9, ticketId: 55, status: "redeemed" },
    });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("conflict");
    expect(calls.ticketUpdate).toBeNull();
  });

  it("rechaza un código que no existe", async () => {
    const { db } = makeFakeDb({});
    const res = await redeemDisplayCode(db, params);
    expect(res).toEqual({ result: "rejected", conflictNote: "El código no existe" });
  });

  it("reenviar el mismo opId no vuelve a canjear", async () => {
    const { db, calls } = makeFakeDb({
      existingOp: { result: "applied", conflictNote: null },
      ticket: validExtra,
    });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toBeNull();
  });
});
