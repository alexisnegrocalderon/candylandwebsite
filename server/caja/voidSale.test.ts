import { describe, expect, it, vi, beforeEach } from "vitest";
import { ops, orders, orderItems, ticketTypes, discountCodes, kitchenTickets, lockerItems, playcoinsLedger, prepaidLedger } from "../../drizzle/schema";

const adjustPlaycoinsManually = vi.fn(async (_customerId: number, _delta: number, _note: string) => {});
const refundPrepaidForVoidedSale = vi.fn(async (_p: { customerId: number; amountClp: number; voidOpId: string; note: string }) => {});
vi.mock("../db", () => ({
  adjustPlaycoinsManually: (...args: [number, number, string]) => adjustPlaycoinsManually(...args),
  refundPrepaidForVoidedSale: (...args: [{ customerId: number; amountClp: number; voidOpId: string; note: string }]) => refundPrepaidForVoidedSale(...args),
}));

const { voidCajaSale, saleOpIdFromPaymentId } = await import("./voidSale");

type State = {
  order?: Record<string, any> | null;
  items?: Record<string, any>[];
  existingVoidOp?: { result: string; conflictNote?: string | null };
  saleOp?: Record<string, any> | null;
  playcoins?: Record<string, any>[];
  prepaid?: Record<string, any>[];
  affectedRows?: number;
};

/* Doble mínimo de drizzle: cada select se resuelve según la tabla, ya sea con
 * `.limit()` o haciendo await directo sobre `.where()`. */
function makeFakeDb(state: State) {
  const calls = { updates: [] as { table: unknown; values: Record<string, unknown> }[], op: null as Record<string, any> | null };
  const rowsFor = (table: unknown, limited: boolean): any[] => {
    if (table === orders) return state.order ? [state.order] : [];
    if (table === orderItems) return state.items ?? [];
    if (table === ops) {
      // Primer select a `ops` con limit: chequeo de idempotencia del op de
      // anulación (applyOp). Después: el op de la venta original.
      if (limited && !calls.op && !opChecked) { opChecked = true; return state.existingVoidOp ? [state.existingVoidOp] : []; }
      return state.saleOp ? [state.saleOp] : [];
    }
    if (table === playcoinsLedger) return state.playcoins ?? [];
    if (table === prepaidLedger) return state.prepaid ?? [];
    return [];
  };
  let opChecked = false;
  const db: any = {
    select: () => {
      let table: unknown;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => {
          const thenable: any = Promise.resolve(rowsFor(table, false));
          thenable.limit = async () => rowsFor(table, true);
          return thenable;
        },
      };
      return builder;
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          calls.updates.push({ table, values });
          return [{ affectedRows: table === orders ? (state.affectedRows ?? 1) : 1 }];
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, any>) => { if (table === ops) calls.op = values; return [{ insertId: 1 }]; },
    }),
  };
  return { db, calls };
}

const baseOrder = {
  id: 10, orderNumber: "CAJA-ABC", eventId: 5, channel: "caja", paymentStatus: "approved",
  paymentId: "CAJA-sale-op-1", total: "9500", paymentMethod: "debito", buyerName: "Camila", operatorId: 3, createdAt: new Date(),
};
const params = { opId: "void-op-1", orderNumber: "caja-abc", eventId: 5, operatorId: 3, reason: "Cobro duplicado", ip: "1.2.3.4", clientAt: new Date() };

beforeEach(() => {
  adjustPlaycoinsManually.mockClear();
  refundPrepaidForVoidedSale.mockClear();
});

describe("saleOpIdFromPaymentId", () => {
  it("extrae el opId de la venta", () => {
    expect(saleOpIdFromPaymentId("CAJA-1234-uuid")).toBe("1234-uuid");
    expect(saleOpIdFromPaymentId("mp-999")).toBeNull();
    expect(saleOpIdFromPaymentId(null)).toBeNull();
  });
});

describe("voidCajaSale", () => {
  it("anula la venta, devuelve stock, Playcoins, saldo y descuento, y lo deja en el ledger", async () => {
    const { db, calls } = makeFakeDb({
      order: baseOrder,
      items: [{ ticketTypeId: 7, quantity: 2, unitPrice: "4000" }],
      saleOp: { id: "sale-op-1", payload: { discountCode: "PROMO10" } },
      playcoins: [{ customerId: 44, delta: 237 }, { customerId: 44, delta: -500 }],
      prepaid: [{ customerId: 44, delta: -9500 }],
    });
    const res = await voidCajaSale(db, params);

    expect(res.result).toBe("applied");
    expect(calls.updates.find((u) => u.table === orders)?.values).toEqual({ paymentStatus: "refunded" });
    expect(calls.updates.filter((u) => u.table === ticketTypes)).toHaveLength(1);
    expect(calls.updates.filter((u) => u.table === discountCodes)).toHaveLength(1);
    expect(calls.updates.find((u) => u.table === kitchenTickets)?.values).toEqual({ status: "anulado" });
    expect(calls.updates.find((u) => u.table === lockerItems)?.values).toEqual({ status: "anulado" });
    expect(adjustPlaycoinsManually.mock.calls.map((c) => c[1])).toEqual([-237, 500]);
    expect(refundPrepaidForVoidedSale).toHaveBeenCalledWith(expect.objectContaining({ customerId: 44, amountClp: 9500, voidOpId: "void-op-1" }));

    expect(calls.op).toMatchObject({ type: "void_sale", targetType: "order", targetId: "CAJA-ABC", result: "applied" });
    expect(calls.op!.payload).toMatchObject({ reason: "Cobro duplicado", total: 9500, paymentMethod: "debito", ip: "1.2.3.4" });
  });

  it("rechaza una venta ya anulada sin revertir nada", async () => {
    const { db, calls } = makeFakeDb({ order: { ...baseOrder, paymentStatus: "refunded" } });
    const res = await voidCajaSale(db, params);
    expect(res.result).toBe("rejected");
    expect(res.conflictNote).toMatch(/ya estaba anulada/);
    expect(calls.updates).toHaveLength(0);
    expect(calls.op).toMatchObject({ result: "rejected" });
  });

  it("si otra tablet la anuló al mismo tiempo, no revierte dos veces", async () => {
    const { db, calls } = makeFakeDb({ order: baseOrder, items: [{ ticketTypeId: 7, quantity: 1, unitPrice: "1" }], affectedRows: 0 });
    const res = await voidCajaSale(db, params);
    expect(res.result).toBe("rejected");
    expect(calls.updates.filter((u) => u.table === ticketTypes)).toHaveLength(0);
  });

  it("rechaza ventas web y de otro evento", async () => {
    expect((await voidCajaSale(makeFakeDb({ order: { ...baseOrder, channel: "web" } }).db, params)).result).toBe("rejected");
    expect((await voidCajaSale(makeFakeDb({ order: { ...baseOrder, eventId: 99 } }).db, params)).result).toBe("rejected");
    expect((await voidCajaSale(makeFakeDb({ order: null }).db, params)).conflictNote).toMatch(/no existe/);
  });

  it("reenviar el mismo opId devuelve el resultado guardado sin volver a anular", async () => {
    const { db, calls } = makeFakeDb({ order: baseOrder, existingVoidOp: { result: "applied" } });
    const res = await voidCajaSale(db, params);
    expect(res.result).toBe("applied");
    expect(calls.updates).toHaveLength(0);
    expect(calls.op).toBeNull();
  });
});
