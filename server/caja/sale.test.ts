import { describe, expect, it, vi } from "vitest";
import { ops, orders, orderItems, ticketTypes, lockerItems, discountCodes, kitchenTickets } from "../../drizzle/schema";

// `createCajaSale` toca Playcoins y descuentos vía ../db, que abre conexión
// real. Acá solo se prueba la lógica de la venta (precio, stock,
// idempotencia, descuento, guardarropía), así que se reemplazan por dobles.
const validateDiscountCode = vi.fn(async (_code: string, _eventId: number) => ({ valid: false, message: "Código no encontrado" }));
vi.mock("../db", () => ({
  awardPlaycoins: vi.fn(async () => {}),
  redeemPlaycoinsAuthoritative: vi.fn(async () => ({ ok: true, redeemed: 0 })),
  validateDiscountCode: (...args: [string, number]) => validateDiscountCode(...args),
}));

const { createCajaSale } = await import("./sale");

/* Doble de la cadena de drizzle. El orden de consultas de `createCajaSale`
 * es fijo: tipos de producto -> ledger de ops -> [si hay percha: lockerItems]
 * -> [si hay descuento válido: update discountCodes] -> insert de la orden
 * -> [insert de lockerItems] -> insert de cada ítem + update de soldCount ->
 * insert de la op. */
function makeFakeDb(state: {
  products: Record<string, unknown>[];
  existingOp?: { result: string; conflictNote?: string | null };
  existingLockerTag?: boolean;
}) {
  const calls = {
    order: null as Record<string, unknown> | null,
    items: [] as Record<string, unknown>[],
    op: null as Record<string, unknown> | null,
    lockerInsert: null as Record<string, unknown> | null,
    kitchenInsert: null as Record<string, unknown> | null,
    discountUsedCountUpdates: 0,
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
          if (table === lockerItems) return state.existingLockerTag ? [{ id: 1 }] : [];
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
        if (table === lockerItems) { calls.lockerInsert = values; return [{ insertId: 1 }]; }
        if (table === kitchenTickets) { calls.kitchenInsert = values; return [{ insertId: 1 }]; }
        return [{ insertId: 0 }];
      },
    }),
    update: (table: unknown) => ({
      set: () => ({
        where: async () => {
          if (table === discountCodes) calls.discountUsedCountUpdates += 1;
          else calls.soldCountUpdates += 1;
        },
      }),
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

  it("aplica un código de descuento válido y suma usedCount una sola vez", async () => {
    validateDiscountCode.mockResolvedValueOnce({ valid: true, discount: { id: 5, discountType: "percentage", discountValue: "10" } });
    const { db, calls } = makeFakeDb({ products: [piscola] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }], discountCode: "PROMO10" });

    expect(res.result).toBe("applied");
    expect(calls.order).toMatchObject({ subtotal: "5000", discount: "500", total: "4500" });
    expect(calls.discountUsedCountUpdates).toBe(1);
  });

  it("ignora un código de descuento inválido sin tumbar la venta", async () => {
    validateDiscountCode.mockResolvedValueOnce({ valid: false, message: "Código no encontrado" });
    const { db, calls } = makeFakeDb({ products: [piscola] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }], discountCode: "NOEXISTE" });

    expect(res.result).toBe("applied");
    expect(calls.order).toMatchObject({ total: "5000" });
    expect(calls.discountUsedCountUpdates).toBe(0);
  });

  it("guardarropía: cobra y registra la percha con el número correlativo y el nombre del cliente", async () => {
    const abrigo = { id: 3, name: "Guardarropía", price: "2000", costPrice: null, category: "locker", totalStock: 999, soldCount: 0 };
    const { db, calls } = makeFakeDb({ products: [abrigo] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 3, quantity: 1 }], lockerTag: "42", lockerCustomerName: "Ana" });

    expect(res.result).toBe("applied");
    expect(calls.lockerInsert).toMatchObject({ tagNumber: "42", customerName: "Ana", orderId: 777 });
  });

  it("guardarropía: rechaza sin número de percha", async () => {
    const abrigo = { id: 3, name: "Guardarropía", price: "2000", costPrice: null, category: "locker", totalStock: 999, soldCount: 0 };
    const { db } = makeFakeDb({ products: [abrigo] });

    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 3, quantity: 1 }], lockerCustomerName: "Ana" })
    ).rejects.toThrow(/número de la percha/);
  });

  it("guardarropía: rechaza sin nombre del cliente", async () => {
    const abrigo = { id: 3, name: "Guardarropía", price: "2000", costPrice: null, category: "locker", totalStock: 999, soldCount: 0 };
    const { db } = makeFakeDb({ products: [abrigo] });

    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 3, quantity: 1 }], lockerTag: "42" })
    ).rejects.toThrow(/nombre del cliente/);
  });

  it("guardarropía: rechaza más de un abrigo por venta", async () => {
    const abrigo = { id: 3, name: "Guardarropía", price: "2000", costPrice: null, category: "locker", totalStock: 999, soldCount: 0 };
    const { db } = makeFakeDb({ products: [abrigo] });

    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 3, quantity: 2 }], lockerTag: "42", lockerCustomerName: "Ana" })
    ).rejects.toThrow(/de a uno/);
  });

  it("guardarropía: rechaza un número ya usado esta noche", async () => {
    const abrigo = { id: 3, name: "Guardarropía", price: "2000", costPrice: null, category: "locker", totalStock: 999, soldCount: 0 };
    const { db } = makeFakeDb({ products: [abrigo], existingLockerTag: true });

    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 3, quantity: 1 }], lockerTag: "42", lockerCustomerName: "Ana" })
    ).rejects.toThrow(/ya está en uso/);
  });

  it("una venta con tragos y comida genera una comanda SOLO con la comida", async () => {
    const cerveza = { id: 2, name: "Cerveza", price: "4000", costPrice: null, category: "consumo", totalStock: 50, soldCount: 0, toKitchen: 0 };
    const papas = { id: 4, name: "Papas fritas", price: "3000", costPrice: null, category: "consumo", totalStock: 50, soldCount: 0, toKitchen: 1 };
    const { db, calls } = makeFakeDb({ products: [cerveza, papas] });

    const res = await createCajaSale(db, {
      ...baseParams,
      items: [{ ticketTypeId: 2, quantity: 2 }, { ticketTypeId: 4, quantity: 1 }],
      kitchenTicketNumber: "1-003",
    });

    expect(res.result).toBe("applied");
    expect(calls.kitchenInsert).toMatchObject({
      ticketNumber: "1-003", orderId: 777,
      items: [{ name: "Papas fritas", quantity: 1 }],
    });
  });

  it("guarda el nombre del cliente en la comanda cuando se manda", async () => {
    const papas = { id: 4, name: "Papas fritas", price: "3000", costPrice: null, category: "consumo", totalStock: 50, soldCount: 0, toKitchen: 1 };
    const { db, calls } = makeFakeDb({ products: [papas] });

    await createCajaSale(db, {
      ...baseParams,
      items: [{ ticketTypeId: 4, quantity: 1 }],
      kitchenTicketNumber: "1-004",
      customerName: "  Camila  ",
    });

    expect(calls.kitchenInsert).toMatchObject({ customerName: "Camila" });
  });

  it("sin customerName, la comanda queda con customerName null", async () => {
    const papas = { id: 4, name: "Papas fritas", price: "3000", costPrice: null, category: "consumo", totalStock: 50, soldCount: 0, toKitchen: 1 };
    const { db, calls } = makeFakeDb({ products: [papas] });

    const res = await createCajaSale(db, {
      ...baseParams,
      items: [{ ticketTypeId: 4, quantity: 1 }],
      kitchenTicketNumber: "1-005",
    });

    expect(res.result).toBe("applied");
    expect(calls.kitchenInsert).toMatchObject({ customerName: null });
  });

  it("una venta sin ítems toKitchen no genera comanda", async () => {
    const cerveza = { id: 2, name: "Cerveza", price: "4000", costPrice: null, category: "consumo", totalStock: 50, soldCount: 0, toKitchen: 0 };
    const { db, calls } = makeFakeDb({ products: [cerveza] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 2, quantity: 1 }] });

    expect(res.result).toBe("applied");
    expect(calls.kitchenInsert).toBeNull();
  });

  it("rechaza vender algo de cocina sin número de comanda", async () => {
    const papas = { id: 4, name: "Papas fritas", price: "3000", costPrice: null, category: "consumo", totalStock: 50, soldCount: 0, toKitchen: 1 };
    const { db } = makeFakeDb({ products: [papas] });

    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 4, quantity: 1 }] })
    ).rejects.toThrow(/número de comanda/);
  });
});
