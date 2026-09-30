import { describe, expect, it } from "vitest";
import { ops, partyGifts, tickets, events } from "../../drizzle/schema";
import { redeemDisplayCode } from "./redeem";

/* Mismo doble de la cadena de drizzle que checkin.test.ts, más las
 * consultas a partyGifts (trago regalado en fiesta anterior) y a events
 * (extra normal arrastrado de una fiesta ya terminada). */
function makeFakeDb(state: {
  existingOp?: { result: string; conflictNote?: string | null };
  ticket?: Record<string, unknown>;
  gift?: Record<string, unknown>;
  originEvent?: Record<string, unknown>;
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
          if (table === events) return state.originEvent ? [state.originEvent] : [];
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

  it("rechaza un extra normal de otro evento todavía publicado (no terminado)", async () => {
    const { db, calls } = makeFakeDb({
      ticket: { ...validExtra, eventId: 77 },
      originEvent: { id: 77, status: "published" },
    });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toContain("no corresponde a este evento");
    expect(calls.ticketUpdate).toBeNull();
  });

  // El caso nuevo: un extra normal (sin regalo) de una fiesta que YA
  // TERMINÓ queda reservado para la próxima -- se arrastra al evento que lo
  // redime, guardando el origen real en carriedFromEventId.
  it("acepta un extra normal arrastrado de una fiesta que ya terminó, y lo marca del evento nuevo", async () => {
    const { db, calls } = makeFakeDb({
      ticket: { ...validExtra, id: 55, eventId: 77 },
      originEvent: { id: 77, status: "past" },
    });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toMatchObject({ status: "used", eventId: params.eventId, carriedFromEventId: 77 });
  });

  it("un extra ya arrastrado antes conserva el origen ORIGINAL, no el intermedio", async () => {
    const { db, calls } = makeFakeDb({
      ticket: { ...validExtra, id: 55, eventId: 77, carriedFromEventId: 10 },
      originEvent: { id: 77, status: "past" },
    });
    const res = await redeemDisplayCode(db, params);
    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toMatchObject({ carriedFromEventId: 10 });
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
