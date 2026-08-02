import { describe, expect, it, vi } from "vitest";
import { ops, orders, orderItems, ticketTypes } from "../../drizzle/schema";

// `createCajaSale` toca Playcoins vía ../db, que abre conexión real. Acá solo
// se prueba la lógica de la venta (precio, stock, idempotencia), así que se
// reemplazan por dobles que no hacen nada.
vi.mock("../db", () => ({
  awardPlaycoins: vi.fn(async () => {}),
  redeemPlaycoinsAuthoritative: vi.fn(async () => ({ ok: true, redeemed: 0 })),
}));

const { createCajaSale } = await import("./sale");

/* Doble de la cadena de drizzle. El orden de consultas de `createCajaSale`
 * es fijo: tipos de producto -> ledger de ops -> insert de la orden ->
 * insert de cada ítem + update de soldCount -> insert de la op. */
function makeFakeDb(state: {
  products: Record<string, unknown>[];
  existingOp?: { result: string; conflictNote?: string | null };
}) {
  const calls = {
    order: null as Record<string, unknown> | null,
    items: [] as Record<string, unknown>[],
    op: null as Record<string, unknown> | null,
    soldCountUpdates: 0,
  };

  const db: any = {
    select: () => {
      let table: unknown;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => {
          // La consulta de productos no lleva .limit(), así que el await cae
          // directo sobre el builder: se resuelve como thenable.
          if (table === ticketTypes) return Promise.resolve(state.products);
          return builder;
        },
        limit: async () => {
          if (table === ops) return state.existingOp ? [state.existingOp] : [];
          return [];
        },
      };
      return builder;
    },
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === orders) { calls.order = values; return [{ insertId: 777 }]; }
        if (table === orderItems) { calls.items.push(values); return [{ insertId: 1 }]; }
        if (table === ops) { calls.op = values; return [{ insertId: 1 }]; }
        return [{ insertId: 0 }];
      },
    }),
    update: () => ({
      set: () => ({ where: async () => { calls.soldCountUpdates += 1; } }),
    }),
  };

  return { db, calls };
}

const baseParams = {
  opId: "op-venta-1",
  eventId: 10,
  operatorId: 5,
  registerId: 2,
  paymentMethod: "efectivo" as const,
  clientAt: new Date("2026-08-08T23:30:00Z"),
};

const piscola = { id: 1, name: "Piscola", price: "5000", costPrice: "1800", totalStock: 100, soldCount: 10 };
const cerveza = { id: 2, name: "Cerveza", price: "4000", costPrice: null, totalStock: 50, soldCount: 50 };

describe("createCajaSale", () => {
  it("cobra con el precio del servidor, no con lo que mande el cliente", async () => {
    const { db, calls } = makeFakeDb({ products: [piscola] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 3 }] });

    expect(res.result).toBe("applied");
    expect(calls.order).toMatchObject({ subtotal: "15000", total: "15000", channel: "caja", paymentStatus: "approved" });
    expect(calls.items[0]).toMatchObject({ quantity: 3, unitPrice: "5000", totalPrice: "15000", unitCost: "1800" });
    expect(calls.soldCountUpdates).toBe(1);
  });

  it("deja vender aunque no quede stock, y lo avisa en vez de bloquear", async () => {
    const { db, calls } = makeFakeDb({ products: [cerveza] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 2, quantity: 2 }] });

    // Lo que importa: NO lanza y la venta queda aplicada.
    expect(res.result).toBe("applied");
    expect(res.conflictNote).toContain("Cerveza");
    expect(calls.order).toMatchObject({ total: "8000" });
    // La discrepancia queda en el ledger para poder auditarla después.
    expect(calls.op?.payload).toMatchObject({
      stockWarnings: [{ ticketTypeId: 2, name: "Cerveza", requested: 2, available: 0 }],
    });
  });

  it("no deja stockWarnings cuando sí había stock", async () => {
    const { db, calls } = makeFakeDb({ products: [piscola] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }] });

    expect(res.conflictNote).toBeUndefined();
    expect(calls.op?.payload).not.toHaveProperty("stockWarnings");
  });

  it("reenviar el mismo opId no duplica la venta", async () => {
    const { db, calls } = makeFakeDb({
      products: [piscola],
      existingOp: { result: "applied", conflictNote: null },
    });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }] });

    expect(res.result).toBe("applied");
    expect(calls.order).toBeNull();
    expect(calls.items).toHaveLength(0);
    expect(calls.soldCountUpdates).toBe(0);
  });

  it("rechaza una venta vacía o con un producto que no existe", async () => {
    const { db } = makeFakeDb({ products: [] });

    await expect(createCajaSale(db, { ...baseParams, items: [] })).rejects.toThrow(/al menos un producto/);
    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 99, quantity: 1 }] })
    ).rejects.toThrow(/no encontrado/);
  });
});
