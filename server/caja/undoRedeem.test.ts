import { describe, expect, it } from "vitest";
import { ops, partyGifts, tickets } from "../../drizzle/schema";
import { undoRedeemDisplayCode } from "./undoRedeem";

/* Mismo doble de la cadena de drizzle que redeem.test.ts. Dos lecturas distintas a `ops`: la de idempotencia de
 * applyOp (sin orderBy) y la del canje original (con orderBy). */
function makeFakeDb(state: {
  existingOp?: { result: string; conflictNote?: string | null };
  ticket?: Record<string, unknown>;
  gift?: Record<string, unknown>;
  redeemOp?: { clientAt: Date };
}) {
  const calls = { ticketUpdate: null as Record<string, unknown> | null, ledger: [] as Record<string, unknown>[] };
  const db = {
    select: () => {
      let table: unknown;
      let ordered = false;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => builder,
        orderBy: () => { ordered = true; return builder; },
        limit: async () => {
          if (table === ops) return ordered ? (state.redeemOp ? [state.redeemOp] : []) : (state.existingOp ? [state.existingOp] : []);
          if (table === tickets) return state.ticket ? [state.ticket] : [];
          if (table === partyGifts) return state.gift ? [state.gift] : [];
          return [];
        },
      };
      return builder;
    },
    update: (t: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => { if (t === tickets) calls.ticketUpdate = values; } }) }),
    insert: () => ({ values: async (v: Record<string, unknown>) => { calls.ledger.push(v); } }),
  };
  return { db, calls };
}

const t0 = new Date("2026-10-30T23:30:00Z");
const params = { opId: "undo-1", displayCode: "pis-aaaa-1111", eventId: 10, operatorId: 5, registerId: 2, clientAt: new Date(t0.getTime() + 20_000) };
const used = { id: 55, status: "used", usedByOperatorId: 5, usedAt: t0, carriedFromEventId: null };

describe("undoRedeemDisplayCode", () => {
  it("deshace un canje reciente del mismo operador: el código vuelve a quedar por canjear", async () => {
    const { db, calls } = makeFakeDb({ ticket: used, redeemOp: { clientAt: t0 } });
    const res = await undoRedeemDisplayCode(db, params);
    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toMatchObject({ status: "valid", usedAt: null, usedByOperatorId: null, usedAtRegisterId: null });
  });

  it("queda en el ledger como nota con el tipo de lo que se deshizo", async () => {
    const { db, calls } = makeFakeDb({ ticket: used, redeemOp: { clientAt: t0 } });
    await undoRedeemDisplayCode(db, params);
    expect(calls.ledger[0]).toMatchObject({ id: "undo-1", type: "note", targetId: "PIS-AAAA-1111", result: "applied", payload: { kind: "undo_redeem", displayCode: "PIS-AAAA-1111" } });
  });

  it("rechaza si pasó la ventana de 60 segundos (más la holgura)", async () => {
    const { db, calls } = makeFakeDb({ ticket: used, redeemOp: { clientAt: t0 } });
    const res = await undoRedeemDisplayCode(db, { ...params, clientAt: new Date(t0.getTime() + 5 * 60_000) });
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toMatch(/60 segundos/);
    expect(calls.ticketUpdate).toBeNull();
  });

  it("vale también si el deshacer se sincroniza tarde: cuenta la hora de la tablet, no la del servidor", async () => {
    // El canje y el deshacer se hicieron con 30 s de diferencia, aunque lleguen al servidor horas después.
    const { db } = makeFakeDb({ ticket: { ...used, usedAt: new Date(t0.getTime() + 3 * 3_600_000) }, redeemOp: { clientAt: t0 } });
    const res = await undoRedeemDisplayCode(db, { ...params, clientAt: new Date(t0.getTime() + 30_000) });
    expect(res.result).toBe("applied");
  });

  it("solo quien lo canjeó puede deshacerlo", async () => {
    const { db, calls } = makeFakeDb({ ticket: { ...used, usedByOperatorId: 9 }, redeemOp: { clientAt: t0 } });
    const res = await undoRedeemDisplayCode(db, params);
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toMatch(/supervisor/);
    expect(calls.ticketUpdate).toBeNull();
  });

  it("no deshace un trago regalado ni un extra arrastrado de otra fiesta", async () => {
    const gift = makeFakeDb({ ticket: used, redeemOp: { clientAt: t0 }, gift: { id: 1, ticketId: 55 } });
    expect((await undoRedeemDisplayCode(gift.db, params)).result).toBe("rejected");
    expect(gift.calls.ticketUpdate).toBeNull();
    const carried = makeFakeDb({ ticket: { ...used, carriedFromEventId: 3 }, redeemOp: { clientAt: t0 } });
    expect((await undoRedeemDisplayCode(carried.db, params)).result).toBe("rejected");
    expect(carried.calls.ticketUpdate).toBeNull();
  });

  it("si ya estaba por canjear no hace nada (el canje nunca llegó): no es un error", async () => {
    const { db, calls } = makeFakeDb({ ticket: { ...used, status: "valid" } });
    const res = await undoRedeemDisplayCode(db, params);
    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toBeNull();
  });

  it("rechaza un código que no existe o está anulado", async () => {
    expect((await undoRedeemDisplayCode(makeFakeDb({}).db, params)).result).toBe("rejected");
    expect((await undoRedeemDisplayCode(makeFakeDb({ ticket: { ...used, status: "cancelled" } }).db, params)).result).toBe("rejected");
  });

  it("reenviar el mismo opId devuelve lo guardado y no vuelve a tocar el ticket", async () => {
    const { db, calls } = makeFakeDb({ existingOp: { result: "applied" }, ticket: used, redeemOp: { clientAt: t0 } });
    const res = await undoRedeemDisplayCode(db, params);
    expect(res.result).toBe("applied");
    expect(calls.ticketUpdate).toBeNull();
  });
});
