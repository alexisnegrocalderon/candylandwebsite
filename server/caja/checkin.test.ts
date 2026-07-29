import { describe, expect, it } from "vitest";
import { ops, tickets, ticketTypes } from "../../drizzle/schema";
import { checkInTicket } from "./checkin";

/* Doble de la cadena de drizzle que usa `checkInTicket`: alcanza con
 * distinguir por tabla, porque el orden de consultas es fijo (ledger de ops
 * -> ticket -> tipo de entrada -> update). Así se prueba la lógica real de
 * validación sin levantar una base de datos. */
function makeFakeDb(state: {
  existingOp?: { result: string; conflictNote?: string | null };
  ticket?: Record<string, unknown>;
  ticketType?: Record<string, unknown>;
}) {
  const calls = { updated: null as Record<string, unknown> | null, insertedOp: null as Record<string, unknown> | null };

  const db = {
    select: () => {
      let table: unknown;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => builder,
        limit: async () => {
          if (table === ops) return state.existingOp ? [state.existingOp] : [];
          if (table === tickets) return state.ticket ? [state.ticket] : [];
          if (table === ticketTypes) return state.ticketType ? [state.ticketType] : [];
          return [];
        },
      };
      return builder;
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => { calls.updated = values; },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => { calls.insertedOp = values; },
    }),
  };

  return { db, calls };
}

const baseParams = {
  opId: "op-1",
  ticketCode: "TKT-ABC123",
  eventId: 10,
  operatorId: 5,
  registerId: 2,
  clientAt: new Date("2026-08-01T23:30:00Z"),
};

const acceso = { category: "acceso" };
const validTicket = { id: 99, eventId: 10, status: "valid", ticketTypeId: 1 };

describe("checkInTicket", () => {
  it("marca la entrada de un acceso válido", async () => {
    const { db, calls } = makeFakeDb({ ticket: validTicket, ticketType: acceso });

    const res = await checkInTicket(db, baseParams);

    expect(res.result).toBe("applied");
    expect(calls.updated).toMatchObject({ status: "used", usedByOperatorId: 5, usedAtRegisterId: 2 });
    expect(calls.updated?.usedAt).toBeInstanceOf(Date);
  });

  it("deja el ledger de ops con el tipo checkin y el código normalizado", async () => {
    const { db, calls } = makeFakeDb({ ticket: validTicket, ticketType: acceso });

    await checkInTicket(db, { ...baseParams, ticketCode: "  tkt-abc123  " });

    expect(calls.insertedOp).toMatchObject({ type: "checkin", targetType: "ticket", targetId: "TKT-ABC123", result: "applied" });
  });

  it("reenviar el mismo opId devuelve el resultado guardado sin volver a marcar", async () => {
    const { db, calls } = makeFakeDb({
      existingOp: { result: "applied", conflictNote: null },
      ticket: validTicket,
      ticketType: acceso,
    });

    const res = await checkInTicket(db, baseParams);

    expect(res.result).toBe("applied");
    expect(calls.updated).toBeNull();   // no volvió a tocar el ticket
    expect(calls.insertedOp).toBeNull(); // ni a duplicar la fila del ledger
  });

  it("un segundo intento con otro opId es conflicto, no un doble ingreso", async () => {
    const { db, calls } = makeFakeDb({
      ticket: { ...validTicket, status: "used", usedAt: new Date("2026-08-01T23:00:00Z") },
      ticketType: acceso,
    });

    const res = await checkInTicket(db, { ...baseParams, opId: "op-2" });

    expect(res.result).toBe("conflict");
    expect(res.conflictNote).toContain("ya entró");
    expect(calls.updated).toBeNull();
  });

  it("rechaza un código que no existe", async () => {
    const { db } = makeFakeDb({});
    const res = await checkInTicket(db, baseParams);
    expect(res).toEqual({ result: "rejected", conflictNote: "El código no existe" });
  });

  it("rechaza un acceso de otro evento", async () => {
    const { db, calls } = makeFakeDb({ ticket: { ...validTicket, eventId: 77 }, ticketType: acceso });
    const res = await checkInTicket(db, baseParams);
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toContain("no corresponde a este evento");
    expect(calls.updated).toBeNull();
  });

  it("rechaza un acceso anulado", async () => {
    const { db, calls } = makeFakeDb({ ticket: { ...validTicket, status: "cancelled" }, ticketType: acceso });
    const res = await checkInTicket(db, baseParams);
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toContain("anulado");
    expect(calls.updated).toBeNull();
  });

  it("rechaza el código de un extra: un trago no sirve para marcar entrada", async () => {
    const { db, calls } = makeFakeDb({ ticket: validTicket, ticketType: { category: "extra" } });
    const res = await checkInTicket(db, baseParams);
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toContain("es de un extra");
    expect(calls.updated).toBeNull();
  });
});
