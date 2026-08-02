import { describe, expect, it, vi } from "vitest";
import { formatKitchenTicketNumber, canTransitionKitchenTicket } from "../shared/kitchen";
import { ops, kitchenTickets } from "../drizzle/schema";

describe("formatKitchenTicketNumber", () => {
  it("prefija con el número de caja y rellena el correlativo a 3 dígitos", () => {
    expect(formatKitchenTicketNumber(1, 42)).toBe("1-042");
    expect(formatKitchenTicketNumber(2, 7)).toBe("2-007");
    expect(formatKitchenTicketNumber(1, 1000)).toBe("1-1000");
  });

  it("usa el prefijo 0 cuando la cajera no tiene caja asignada", () => {
    expect(formatKitchenTicketNumber(null, 5)).toBe("0-005");
  });
});

describe("canTransitionKitchenTicket", () => {
  it("permite el camino normal: pendiente -> aprobado -> entregado", () => {
    expect(canTransitionKitchenTicket("pendiente", "aprobado")).toBe(true);
    expect(canTransitionKitchenTicket("aprobado", "entregado")).toBe(true);
  });

  it("permite pendiente -> entregado directo", () => {
    expect(canTransitionKitchenTicket("pendiente", "entregado")).toBe(true);
  });

  it("permite deshacer un entregado (vuelve a aprobado)", () => {
    expect(canTransitionKitchenTicket("entregado", "aprobado")).toBe(true);
  });

  it("rechaza volver a pendiente desde cualquier lado", () => {
    expect(canTransitionKitchenTicket("aprobado", "pendiente")).toBe(false);
    expect(canTransitionKitchenTicket("entregado", "pendiente")).toBe(false);
  });

  it("rechaza re-entregar o re-aprobar (mismo estado)", () => {
    expect(canTransitionKitchenTicket("entregado", "entregado")).toBe(false);
    expect(canTransitionKitchenTicket("aprobado", "aprobado")).toBe(false);
    expect(canTransitionKitchenTicket("pendiente", "pendiente")).toBe(false);
  });
});

/* Doble de la cadena de drizzle para `updateKitchenTicket`. Mismo patrón que
 * server/caja/checkin.test.ts: alcanza con distinguir por tabla porque el
 * orden de consultas es fijo (ledger de ops -> comanda -> update). */
function makeFakeDb(state: {
  existingOp?: { result: string; conflictNote?: string | null };
  ticket?: Record<string, unknown>;
}) {
  const calls = { updated: null as Record<string, unknown> | null, insertedOp: null as Record<string, unknown> | null };

  const db: any = {
    select: () => {
      let table: unknown;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => builder,
        limit: async () => {
          if (table === ops) return state.existingOp ? [state.existingOp] : [];
          if (table === kitchenTickets) return state.ticket ? [state.ticket] : [];
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
  opId: "op-cocina-1",
  eventId: 10,
  ticketNumber: "1-042",
  operatorId: 9,
  clientAt: new Date("2026-08-08T23:45:00Z"),
};

const { updateKitchenTicket } = await import("./kitchen");

describe("updateKitchenTicket", () => {
  it("aprueba una comanda pendiente", async () => {
    const { db, calls } = makeFakeDb({ ticket: { id: 1, status: "pendiente" } });

    const res = await updateKitchenTicket(db, { ...baseParams, to: "aprobado" });

    expect(res.result).toBe("applied");
    expect(calls.updated).toMatchObject({ status: "aprobado", approvedByOperatorId: 9 });
  });

  it("entrega una comanda ya aprobada", async () => {
    const { db, calls } = makeFakeDb({ ticket: { id: 1, status: "aprobado" } });

    const res = await updateKitchenTicket(db, { ...baseParams, to: "entregado" });

    expect(res.result).toBe("applied");
    expect(calls.updated).toMatchObject({ status: "entregado", deliveredByOperatorId: 9 });
  });

  it("permite entregar directo desde pendiente", async () => {
    const { db, calls } = makeFakeDb({ ticket: { id: 1, status: "pendiente" } });

    const res = await updateKitchenTicket(db, { ...baseParams, to: "entregado" });

    expect(res.result).toBe("applied");
    expect(calls.updated).toMatchObject({ status: "entregado" });
  });

  it("rechaza re-entregar una comanda ya entregada, como conflict", async () => {
    const { db, calls } = makeFakeDb({ ticket: { id: 1, status: "entregado" } });

    const res = await updateKitchenTicket(db, { ...baseParams, to: "entregado" });

    expect(res.result).toBe("conflict");
    expect(calls.updated).toBeNull();
  });

  it("deshace un entregado y limpia la marca de entrega", async () => {
    const { db, calls } = makeFakeDb({ ticket: { id: 1, status: "entregado" } });

    const res = await updateKitchenTicket(db, { ...baseParams, to: "aprobado" });

    expect(res.result).toBe("applied");
    expect(calls.updated).toMatchObject({ status: "aprobado", deliveredAt: null, deliveredByOperatorId: null });
  });

  it("rechaza una comanda que no existe", async () => {
    const { db } = makeFakeDb({});

    const res = await updateKitchenTicket(db, { ...baseParams, to: "aprobado" });

    expect(res.result).toBe("rejected");
  });

  it("reenviar el mismo opId no vuelve a aplicar el cambio", async () => {
    const { db, calls } = makeFakeDb({
      ticket: { id: 1, status: "pendiente" },
      existingOp: { result: "applied", conflictNote: null },
    });

    const res = await updateKitchenTicket(db, { ...baseParams, to: "aprobado" });

    expect(res.result).toBe("applied");
    expect(calls.updated).toBeNull();
  });
});

/* La comanda mixta (tragos + comida) se prueba desde `createCajaSale`
 * directamente en server/caja/sale.test.ts -- acá solo se prueban las
 * partes propias de este módulo. */
