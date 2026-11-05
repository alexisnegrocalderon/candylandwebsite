import { describe, expect, it, vi, beforeEach } from "vitest";
import { ops, orders, orderItems, ticketTypes, lockerItems, discountCodes, kitchenTickets, customers } from "../../drizzle/schema";

// `createCajaSale` toca Playcoins, saldo prepagado y descuentos vía ../db,
// que abre conexión real. Acá solo se prueba la lógica de la venta (precio,
// stock, idempotencia, descuento, guardarropía, pago con saldo), así que se
// reemplazan por dobles.
const validateDiscountCode = vi.fn(async (_code: string, _eventId: number) => ({ valid: false, message: "Código no encontrado" }));
const redeemPlaycoinsAuthoritative = vi.fn(async () => ({ ok: true as const, redeemed: 0, balanceAfter: 0 }));
const verifyCardPin = vi.fn(async (_p: { email: string; pin: string }) => ({ ok: true as const, customerId: 1 }));
const spendPrepaidAuthoritative = vi.fn(async (_p: { customerId: number; amountClp: number; reason: string; opId: string; note?: string }) => ({ ok: true as const, balanceAfter: 0 }));
const refundPrepaidForVoidedSale = vi.fn(async (_p: { customerId: number; amountClp: number; voidOpId: string; note: string }) => {});
const ensureCustomerIdForEmail = vi.fn(async (email?: string | null) => (email ? 7 : null));
vi.mock("../db", () => ({
  ensureCustomerIdForEmail: (...args: [string | null | undefined]) => ensureCustomerIdForEmail(...args),
  awardPlaycoins: vi.fn(async () => {}),
  refundPrepaidForVoidedSale: (...args: [{ customerId: number; amountClp: number; voidOpId: string; note: string }]) => refundPrepaidForVoidedSale(...args),
  redeemPlaycoinsAuthoritative: (...args: any[]) => redeemPlaycoinsAuthoritative(...(args as [])),
  validateDiscountCode: (...args: [string, number]) => validateDiscountCode(...args),
  verifyCardPin: (...args: [{ email: string; pin: string }]) => verifyCardPin(...args),
  spendPrepaidAuthoritative: (...args: [{ customerId: number; amountClp: number; reason: string; opId: string; note?: string }]) => spendPrepaidAuthoritative(...args),
}));

// El QR/token de pago vive en la base: se simula consumir/liberar y se deja real lo puro (parseo del token de
// supervisor y su tope).
const consumePayToken = vi.fn(async (_t: string, email: string, _opId: string) => ({ ok: true as const, email }));
const releasePayToken = vi.fn(async () => {});
vi.mock("../memberPay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../memberPay")>()),
  consumePayToken: (...args: [string, string, string]) => consumePayToken(...args),
  releasePayToken: (...args: []) => releasePayToken(...args),
}));

// El descuento de insumos tiene sus propias pruebas (shared/insumos.test.ts):
// acá solo importa que la venta lo pida una vez, con su opId.
const descontarVenta = vi.fn(async (_db: unknown, _p: { opId: string; eventId: number; operatorId: number; items: { ticketTypeId: number; quantity: number }[] }) => {});
vi.mock("../insumos", () => ({ descontarVenta: (...args: [unknown, any]) => descontarVenta(...args) }));

// Evento de colaboración sin sistema PlayCard: la caja no cobra con saldo ni canjea Playcoins (server/coproduction.ts).
const colabBlocksPlaycard = vi.fn(async (_eventId: number) => false);
vi.mock("../coproduction", () => ({ colabBlocksPlaycard: (...args: [number]) => colabBlocksPlaycard(...args) }));

const { createCajaSale, resolveCajaBuyerName } = await import("./sale");

/* Doble de la cadena de drizzle. El orden de consultas de `createCajaSale`
 * es fijo: tipos de producto -> ledger de ops -> [si hay percha: lockerItems]
 * -> [si hay comanda: kitchenTickets] -> [si hay descuento válido: update
 * discountCodes] -> insert de la orden -> [insert de lockerItems] ->
 * [insert de kitchenTickets] -> insert de cada ítem + update de soldCount ->
 * insert de la op. */
function makeFakeDb(state: {
  products: Record<string, unknown>[];
  existingOp?: { result: string; conflictNote?: string | null };
  existingLockerTag?: boolean;
  existingKitchenTicketNumber?: boolean;
  failOrderInsert?: boolean;
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
        orderBy: () => builder,
        where: () => {
          // La consulta de productos no lleva .limit(), así que el await cae
          // directo sobre el builder: se resuelve como thenable.
          if (table === ticketTypes) return Promise.resolve(state.products);
          return builder;
        },
        limit: async () => {
          if (table === ops) return state.existingOp ? [state.existingOp] : [];
          if (table === lockerItems) return state.existingLockerTag ? [{ id: 1 }] : [];
          if (table === kitchenTickets) return state.existingKitchenTicketNumber ? [{ id: 1 }] : [];
          if (table === customers) return [{ id: 42 }];
          return [];
        },
      };
      return builder;
    },
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === orders) { if (state.failOrderInsert) throw new Error("Failed query: insert orders"); calls.order = values; return [{ insertId: 777 }]; }
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
  describe("evento de colaboración sin sistema PlayCard", () => {
    beforeEach(() => { colabBlocksPlaycard.mockReset(); colabBlocksPlaycard.mockResolvedValue(true); });

    it("rechaza cobrar con saldo y no toca el saldo del cliente", async () => {
      spendPrepaidAuthoritative.mockClear();
      const { db, calls } = makeFakeDb({ products: [piscola] });
      await expect(createCajaSale(db, { ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "1234", items: [{ ticketTypeId: 1, quantity: 1 }] }))
        .rejects.toThrow(/colaboración/);
      expect(spendPrepaidAuthoritative).not.toHaveBeenCalled();
      expect(calls.order).toBeNull();
    });

    it("rechaza el cobro mixto, el QR de «Pagar en caja» y el canje de Playcoins", async () => {
      const mk = () => makeFakeDb({ products: [piscola] }).db;
      await expect(createCajaSale(mk(), { ...baseParams, paymentMethod: "efectivo", saldoAmount: 2000, buyerEmail: "c@test.cl", cardPin: "1234", items: [{ ticketTypeId: 1, quantity: 1 }] })).rejects.toThrow(/colaboración/);
      await expect(createCajaSale(mk(), { ...baseParams, paymentMethod: "debito", payToken: "tok", buyerEmail: "c@test.cl", items: [{ ticketTypeId: 1, quantity: 1 }] })).rejects.toThrow(/colaboración/);
      await expect(createCajaSale(mk(), { ...baseParams, paymentMethod: "debito", redeemPlaycoins: 500, buyerEmail: "c@test.cl", items: [{ ticketTypeId: 1, quantity: 1 }] })).rejects.toThrow(/colaboración/);
    });

    it("una venta en efectivo sigue pasando", async () => {
      const { db, calls } = makeFakeDb({ products: [piscola] });
      const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }] });
      expect(res.result).toBe("applied");
      expect(calls.order).toMatchObject({ paymentStatus: "approved" });
    });

    it("un evento normal sigue cobrando con saldo", async () => {
      colabBlocksPlaycard.mockResolvedValue(false);
      const { db } = makeFakeDb({ products: [piscola] });
      const res = await createCajaSale(db, { ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "1234", items: [{ ticketTypeId: 1, quantity: 1 }] });
      expect(res.result).toBe("applied");
    });
  });

  it("cobra con el precio del servidor, no con lo que mande el cliente", async () => {
    const { db, calls } = makeFakeDb({ products: [piscola] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 3 }] });

    expect(res.result).toBe("applied");
    expect(calls.order).toMatchObject({ subtotal: "15000", total: "15000", channel: "caja", paymentStatus: "approved" });
    expect(calls.items[0]).toMatchObject({ quantity: 3, unitPrice: "5000", totalPrice: "15000", unitCost: "1800" });
    expect(calls.soldCountUpdates).toBe(1);
  });

  it("descuenta los insumos de la barra una vez, ligado al opId de la venta", async () => {
    descontarVenta.mockClear();
    const { db } = makeFakeDb({ products: [piscola] });
    await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 2 }] });
    expect(descontarVenta).toHaveBeenCalledTimes(1);
    expect(descontarVenta.mock.calls[0][1]).toMatchObject({ opId: "op-venta-1", eventId: 10, items: [{ ticketTypeId: 1, quantity: 2 }] });

    // Reintento de la cola offline: la op ya existe, no se vuelve a descontar.
    descontarVenta.mockClear();
    const retry = makeFakeDb({ products: [piscola], existingOp: { result: "applied" } });
    await createCajaSale(retry.db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 2 }] });
    expect(descontarVenta).not.toHaveBeenCalled();
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

  it("rechaza vender una carga de saldo en caja, aunque llegue en el carrito (defensa en profundidad)", async () => {
    const cargaSaldo = { id: 5, name: "Cargar $10.000", price: "10000", costPrice: null, category: "extra", topupAmount: 10000, totalStock: 999, soldCount: 0 };
    const { db, calls } = makeFakeDb({ products: [cargaSaldo] });

    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 5, quantity: 1 }] })
    ).rejects.toThrow(/solo se compra desde el sitio web/);
    expect(calls.order).toBeNull();
  });

  it("aplica la promo relámpago (código con lista de productos) y suma usedCount una sola vez", async () => {
    validateDiscountCode.mockResolvedValueOnce({ valid: true, discount: { id: 5, discountType: "percentage", discountValue: "10", applicableTicketTypeIds: [1] } });
    const { db, calls } = makeFakeDb({ products: [piscola] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }], discountCode: "PROMO10" });

    expect(res.result).toBe("applied");
    expect(calls.order).toMatchObject({ subtotal: "5000", discount: "500", total: "4500" });
    expect(calls.discountUsedCountUpdates).toBe(1);
  });

  it("en caja un código SIN lista de productos no descuenta nada (no hay descuentos, solo promo relámpago)", async () => {
    validateDiscountCode.mockResolvedValueOnce({ valid: true, discount: { id: 5, discountType: "percentage", discountValue: "50", applicableTicketTypeIds: null } });
    const { db, calls } = makeFakeDb({ products: [piscola] });

    const res = await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }], discountCode: "TODO50" });

    expect(res.result).toBe("applied");
    expect(calls.order).toMatchObject({ subtotal: "5000", discount: "0", total: "5000" });
    expect(calls.discountUsedCountUpdates).toBe(0);
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

  it("la venta con correo queda ligada al cliente (orders.customerId)", async () => {
    const { db, calls } = makeFakeDb({ products: [piscola] });
    await createCajaSale(db, { ...baseParams, buyerEmail: "ana@test.cl", items: [{ ticketTypeId: 1, quantity: 1 }] });
    expect(ensureCustomerIdForEmail).toHaveBeenCalledWith("ana@test.cl", expect.anything());
    expect(calls.order).toMatchObject({ customerId: 7 });
  });

  it("sin correo, la venta queda sin cliente", async () => {
    const { db, calls } = makeFakeDb({ products: [piscola] });
    await createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 1, quantity: 1 }] });
    expect(calls.order).toMatchObject({ customerId: null });
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

  it("rechaza una comanda ya usada esta noche SIN crear la orden (evita dejarla huérfana)", async () => {
    const papas = { id: 4, name: "Papas fritas", price: "3000", costPrice: null, category: "consumo", totalStock: 50, soldCount: 0, toKitchen: 1 };
    const { db, calls } = makeFakeDb({ products: [papas], existingKitchenTicketNumber: true });

    await expect(
      createCajaSale(db, { ...baseParams, items: [{ ticketTypeId: 4, quantity: 1 }], kitchenTicketNumber: "1-003" })
    ).rejects.toThrow(/ya está en uso/);
    expect(calls.order).toBeNull();
  });

  describe("pago con saldo prepagado", () => {
    // Los mocks de ../db acumulan llamadas entre tests (vitest no los limpia
    // solo) -- varios de estos casos aseveran "no se llamó", así que hay que
    // arrancar cada uno en limpio.
    beforeEach(() => {
      verifyCardPin.mockClear();
      spendPrepaidAuthoritative.mockClear();
      redeemPlaycoinsAuthoritative.mockClear();
    });

    it("cobra con saldo: verifica el PIN, descuenta el 100% y crea la orden con paymentMethod='saldo'", async () => {
      verifyCardPin.mockResolvedValueOnce({ ok: true, customerId: 42 });
      spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 5000 });
      const { db, calls } = makeFakeDb({ products: [piscola] });

      const res = await createCajaSale(db, {
        ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "1234",
        items: [{ ticketTypeId: 1, quantity: 1 }],
      });

      expect(res.result).toBe("applied");
      expect(verifyCardPin).toHaveBeenCalledWith({ email: "cliente@test.cl", pin: "1234" });
      expect(spendPrepaidAuthoritative).toHaveBeenCalledWith({
        customerId: 42, amountClp: 5000, reason: "spend_caja", opId: baseParams.opId,
      });
      expect(calls.order).toMatchObject({ paymentMethod: "saldo", total: "5000", customerId: 42 });
    });

    describe("cobro mixto: parte con saldo y el resto con otro medio", () => {
      beforeEach(() => { spendPrepaidAuthoritative.mockClear(); verifyCardPin.mockClear(); });

      it("descuenta solo la parte pedida del saldo y la orden queda por el resto, con el medio de la diferencia", async () => {
        verifyCardPin.mockResolvedValueOnce({ ok: true, customerId: 42 });
        spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 0 });
        const { db, calls } = makeFakeDb({ products: [piscola] }); // $5.000

        const res = await createCajaSale(db, {
          ...baseParams, paymentMethod: "efectivo", saldoAmount: 2000, buyerEmail: "cliente@test.cl", cardPin: "1234",
          items: [{ ticketTypeId: 1, quantity: 1 }],
        });

        expect(res.result).toBe("applied");
        expect(spendPrepaidAuthoritative).toHaveBeenCalledWith(expect.objectContaining({ customerId: 42, amountClp: 2000, reason: "spend_caja" }));
        expect(calls.order).toMatchObject({ paymentMethod: "efectivo", subtotal: "5000", total: "3000", discount: "2000", customerId: 42 });
        expect(calls.op?.payload).toMatchObject({ saldoAmount: 2000 });
      });

      it("con el QR de la app tampoco se fuerza a saldo total: respeta el medio de la diferencia", async () => {
        spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 0 });
        const { db, calls } = makeFakeDb({ products: [piscola] });
        await createCajaSale(db, {
          ...baseParams, paymentMethod: "debito", saldoAmount: 1500, buyerEmail: "cliente@test.cl",
          payToken: "PLAYPAY:v1:AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe", items: [{ ticketTypeId: 1, quantity: 1 }],
        });
        expect(spendPrepaidAuthoritative).toHaveBeenCalledWith(expect.objectContaining({ amountClp: 1500 }));
        expect(calls.order).toMatchObject({ paymentMethod: "debito", total: "3500" });
      });

      it("si el saldo pedido cubre todo el total, es un cobro 100% saldo", async () => {
        verifyCardPin.mockResolvedValueOnce({ ok: true, customerId: 42 });
        spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 0 });
        const { db, calls } = makeFakeDb({ products: [piscola] });
        await createCajaSale(db, { ...baseParams, paymentMethod: "efectivo", saldoAmount: 9000, buyerEmail: "cliente@test.cl", cardPin: "1234", items: [{ ticketTypeId: 1, quantity: 1 }] });
        expect(spendPrepaidAuthoritative).toHaveBeenCalledWith(expect.objectContaining({ amountClp: 5000 }));
        expect(calls.order).toMatchObject({ paymentMethod: "saldo", total: "5000", discount: "0" });
      });

      it("sin PIN ni QR no hay cobro mixto y no se toca el saldo", async () => {
        const { db } = makeFakeDb({ products: [piscola] });
        await expect(
          createCajaSale(db, { ...baseParams, paymentMethod: "efectivo", saldoAmount: 2000, buyerEmail: "cliente@test.cl", items: [{ ticketTypeId: 1, quantity: 1 }] })
        ).rejects.toThrow();
        expect(spendPrepaidAuthoritative).not.toHaveBeenCalled();
      });

      it("el canje de Playcoins no se mezcla con el saldo", async () => {
        verifyCardPin.mockResolvedValueOnce({ ok: true, customerId: 42 });
        spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 0 });
        redeemPlaycoinsAuthoritative.mockClear();
        const { db } = makeFakeDb({ products: [piscola] });
        await createCajaSale(db, { ...baseParams, paymentMethod: "efectivo", saldoAmount: 2000, redeemPlaycoins: 3000, buyerEmail: "cliente@test.cl", cardPin: "1234", items: [{ ticketTypeId: 1, quantity: 1 }] });
        expect(redeemPlaycoinsAuthoritative).not.toHaveBeenCalled();
      });
    });

    describe("QR de la app (payToken) con otro medio de pago seleccionado", () => {
      const appToken = "PLAYPAY:v1:AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe";

      it("siempre cobra con saldo: la caja se quedaba con el último medio (débito/QR/efectivo) y no descontaba", async () => {
        spendPrepaidAuthoritative.mockClear();
        spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 1000 });
        for (const method of ["efectivo", "debito", "credito", "qr"] as const) {
          const { db, calls } = makeFakeDb({ products: [piscola] });
          await createCajaSale(db, { ...baseParams, opId: `op-${method}`, paymentMethod: method, buyerEmail: "cliente@test.cl", payToken: appToken, items: [{ ticketTypeId: 1, quantity: 1 }] });
          expect(calls.order).toMatchObject({ paymentMethod: "saldo", total: "5000" });
          expect(calls.op?.payload).toMatchObject({ paymentMethod: "saldo" });
        }
        expect(spendPrepaidAuthoritative).toHaveBeenCalled();
        expect(spendPrepaidAuthoritative.mock.calls[0][0]).toMatchObject({ amountClp: 5000, reason: "spend_caja" });
      });
    });

    it("si algo falla después de descontar el saldo, lo devuelve y libera el QR (no queda plata cobrada sin venta)", async () => {
      refundPrepaidForVoidedSale.mockClear();
      releasePayToken.mockClear();
      spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 0 });
      const { db } = makeFakeDb({ products: [piscola], failOrderInsert: true });
      await expect(
        createCajaSale(db, { ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", payToken: "PLAYPAY:v1:AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe", items: [{ ticketTypeId: 1, quantity: 1 }] })
      ).rejects.toThrow();
      expect(refundPrepaidForVoidedSale).toHaveBeenCalledWith(expect.objectContaining({ customerId: 42, amountClp: 5000, voidOpId: baseParams.opId }));
      expect(releasePayToken).toHaveBeenCalled();
    });

    it("no devuelve nada si el cobro con saldo ya había sido rechazado", async () => {
      refundPrepaidForVoidedSale.mockClear();
      spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: false, conflictNote: "Saldo insuficiente para cubrir el 100% de esta venta" } as any);
      const { db } = makeFakeDb({ products: [piscola] });
      await expect(
        createCajaSale(db, { ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "1234", items: [{ ticketTypeId: 1, quantity: 1 }] })
      ).rejects.toThrow(/insuficiente/);
      expect(refundPrepaidForVoidedSale).not.toHaveBeenCalled();
    });

    describe("autorización de supervisor (cliente que olvidó el PIN)", () => {
      const supToken = "PLAYPAY:v1:SUPAUTH_12_AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe";

      it("cobra sin PIN, deja nota con el supervisor y no verifica el PIN de la tarjeta", async () => {
        consumePayToken.mockClear();
        verifyCardPin.mockClear();
        spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 1000 });
        const { db, calls } = makeFakeDb({ products: [piscola] });

        const res = await createCajaSale(db, {
          ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", payToken: supToken,
          items: [{ ticketTypeId: 1, quantity: 1 }],
        });

        expect(res.result).toBe("applied");
        expect(verifyCardPin).not.toHaveBeenCalled();
        expect(spendPrepaidAuthoritative).toHaveBeenLastCalledWith(
          expect.objectContaining({ customerId: 42, amountClp: 5000, note: "Sin PIN: autorizado por supervisor #12" }),
        );
        expect(calls.order).toMatchObject({ paymentMethod: "saldo", customerId: 42 });
      });

      it("rechaza sobre el tope por venta sin consumir el token ni cobrar", async () => {
        consumePayToken.mockClear();
        spendPrepaidAuthoritative.mockClear();
        const { db, calls } = makeFakeDb({ products: [piscola] });

        await expect(
          createCajaSale(db, { ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", payToken: supToken, items: [{ ticketTypeId: 1, quantity: 11 }] })
        ).rejects.toThrow(/hasta \$50\.000/);
        expect(consumePayToken).not.toHaveBeenCalled();
        expect(spendPrepaidAuthoritative).not.toHaveBeenCalled();
        expect(calls.order).toBeNull();
      });

      it("un QR normal de la app no lleva nota ni tope de supervisor", async () => {
        spendPrepaidAuthoritative.mockClear();
        spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 0 });
        const { db } = makeFakeDb({ products: [piscola] });

        await createCajaSale(db, {
          ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl",
          payToken: "PLAYPAY:v1:AbCdEfGhIjKlMnOp.ZyXwVuTsRqPoNmLkJiHgFe", items: [{ ticketTypeId: 1, quantity: 11 }],
        });
        expect(spendPrepaidAuthoritative).toHaveBeenLastCalledWith(expect.objectContaining({ amountClp: 55000, note: undefined }));
      });
    });

    it("rechaza sin email o sin PIN, sin llegar a verificar nada ni crear la orden", async () => {
      const { db, calls } = makeFakeDb({ products: [piscola] });

      await expect(
        createCajaSale(db, { ...baseParams, paymentMethod: "saldo", items: [{ ticketTypeId: 1, quantity: 1 }] })
      ).rejects.toThrow(/email y el PIN/);
      expect(verifyCardPin).not.toHaveBeenCalled();
      expect(calls.order).toBeNull();
    });

    it("rechaza con PIN incorrecto, sin crear la orden", async () => {
      verifyCardPin.mockResolvedValueOnce({ ok: false, reason: "PIN incorrecto" } as any);
      const { db, calls } = makeFakeDb({ products: [piscola] });

      await expect(
        createCajaSale(db, { ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "0000", items: [{ ticketTypeId: 1, quantity: 1 }] })
      ).rejects.toThrow(/PIN incorrecto/);
      expect(spendPrepaidAuthoritative).not.toHaveBeenCalled();
      expect(calls.order).toBeNull();
    });

    it("rechaza con saldo insuficiente -- 100% o nada, nunca cobra parcial", async () => {
      verifyCardPin.mockResolvedValueOnce({ ok: true, customerId: 42 });
      spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: false, conflictNote: "Saldo insuficiente para cubrir el 100% de esta venta" } as any);
      const { db, calls } = makeFakeDb({ products: [piscola] });

      await expect(
        createCajaSale(db, { ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "1234", items: [{ ticketTypeId: 1, quantity: 1 }] })
      ).rejects.toThrow(/Saldo insuficiente/);
      expect(calls.order).toBeNull();
    });

    it("pagando con saldo, no se intenta canjear Playcoins aunque se manden ambos", async () => {
      verifyCardPin.mockResolvedValueOnce({ ok: true, customerId: 42 });
      spendPrepaidAuthoritative.mockResolvedValueOnce({ ok: true, balanceAfter: 0 });
      const { db } = makeFakeDb({ products: [piscola] });
      redeemPlaycoinsAuthoritative.mockClear();

      await createCajaSale(db, {
        ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "1234", redeemPlaycoins: 1000,
        items: [{ ticketTypeId: 1, quantity: 1 }],
      });

      expect(redeemPlaycoinsAuthoritative).not.toHaveBeenCalled();
    });

    it("reenviar el mismo opId de una venta con saldo no vuelve a descontar (idempotencia de applyOp)", async () => {
      const { db, calls } = makeFakeDb({
        products: [piscola],
        existingOp: { result: "applied", conflictNote: null },
      });

      const res = await createCajaSale(db, {
        ...baseParams, paymentMethod: "saldo", buyerEmail: "cliente@test.cl", cardPin: "1234",
        items: [{ ticketTypeId: 1, quantity: 1 }],
      });

      expect(res.result).toBe("applied");
      expect(verifyCardPin).not.toHaveBeenCalled();
      expect(spendPrepaidAuthoritative).not.toHaveBeenCalled();
      expect(calls.order).toBeNull();
    });
  });
});

describe("resolveCajaBuyerName", () => {
  it("prefiere el nombre registrado del cliente asociado", () => {
    expect(resolveCajaBuyerName({ knownName: "Camila Rojas", customerName: "Cami", lockerCustomerName: "C" })).toBe("Camila Rojas");
  });
  it("usa el nombre de cocina y luego el de guardarropía", () => {
    expect(resolveCajaBuyerName({ knownName: null, customerName: " Pedro ", lockerCustomerName: "Juan" })).toBe("Pedro");
    expect(resolveCajaBuyerName({ lockerCustomerName: "Juan" })).toBe("Juan");
  });
  it("cae al placeholder solo si no hay ningún nombre", () => {
    expect(resolveCajaBuyerName({ knownName: "  ", customerName: "" })).toBe("Venta en caja");
    expect(resolveCajaBuyerName({ knownName: "Venta en caja" })).toBe("Venta en caja");
  });
});
