import { describe, expect, it } from "vitest";
import { leads, customers } from "../drizzle/schema";
import { matchLeadForOrder, syncLeadsAsMailingAudience, LEADS_MAILING_TAG } from "./leadsMailing";

/* Doble de la cadena de drizzle -- mismo patrón que server/caja/sale.test.ts
 * y server/caja/redeem.test.ts: un fixture fijo por tabla para todo el test
 * (el `.where()` no se evalúa de verdad), así que cada escenario se arma con
 * los datos que la consulta real DEBERÍA devolver, en vez de intentar
 * reproducir el árbol SQL de drizzle. Soporta tanto `await builder.where()`
 * directo (sin `.limit()`) como `await builder.where().limit(n)`. */
function makeFakeDb(state: {
  leads?: Record<string, unknown>[];
  customers?: Record<string, unknown>[];
}) {
  let leadsRows = state.leads ? [...state.leads] : [];
  let customersRows = state.customers ? [...state.customers] : [];
  let nextCustomerId = 1 + Math.max(0, ...customersRows.map((c: any) => c.id ?? 0));

  const calls = {
    leadUpdates: [] as { id: number; convertedOrderId: number }[],
    customerInserts: [] as Record<string, unknown>[],
    tagUpdates: [] as { id: number; tags: string[] }[],
  };

  function rowsFor(table: unknown): Record<string, unknown>[] {
    if (table === leads) return leadsRows;
    if (table === customers) return customersRows;
    return [];
  }

  const db: any = {
    select: (_cols?: unknown) => {
      let table: unknown;
      const builder: any = {
        from: (t: unknown) => { table = t; return builder; },
        where: () => {
          const rows = rowsFor(table);
          return {
            limit: async (n: number) => rows.slice(0, n),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              Promise.resolve(rows).then(resolve, reject),
          };
        },
      };
      return builder;
    },
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === customers) {
          const row = { id: nextCustomerId, tags: [], ...values };
          customersRows.push(row);
          calls.customerInserts.push(values);
          return [{ insertId: nextCustomerId++ }];
        }
        return [{ insertId: 0 }];
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === leads && "convertedOrderId" in values) {
            // Como el `.where()` no se evalúa, se aplica a la primera fila
            // sin convertir todavía -- cada test de este archivo trabaja
            // con un lead abierto a la vez por escenario.
            const row = leadsRows.find((r: any) => r.convertedOrderId == null);
            if (row) {
              Object.assign(row, values);
              calls.leadUpdates.push({ id: (row as any).id, convertedOrderId: (values as any).convertedOrderId });
            }
          } else if (table === customers && "tags" in values) {
            // Mismo criterio: una sola fila de cliente por escenario de tag.
            const row = customersRows[customersRows.length - 1] as any;
            if (row) {
              Object.assign(row, values);
              calls.tagUpdates.push({ id: row.id, tags: (values as any).tags });
            }
          }
        },
      }),
    }),
  };

  return { db, calls, get customersRows() { return customersRows; }, get leadsRows() { return leadsRows; } };
}

describe("matchLeadForOrder", () => {
  const order = { buyerEmail: "camila@example.com", id: 777 };

  it("marca convertido el lead que dejó ese correo", async () => {
    const { db, calls } = makeFakeDb({
      leads: [{ id: 1, email: "camila@example.com", convertedOrderId: null }],
    });

    await matchLeadForOrder(db, order);

    expect(calls.leadUpdates).toEqual([{ id: 1, convertedOrderId: 777 }]);
  });

  it("le saca el tag \"leads\" al cliente si estaba marcado como audiencia sin convertir", async () => {
    const { db, calls } = makeFakeDb({
      leads: [{ id: 1, email: "camila@example.com", convertedOrderId: null }],
      customers: [{ id: 50, email: "camila@example.com", tags: [LEADS_MAILING_TAG, "vip"] }],
    });

    await matchLeadForOrder(db, order);

    expect(calls.tagUpdates).toEqual([{ id: 50, tags: ["vip"] }]);
  });

  it("un lead ya convertido no se toca (no hay lead sin convertir)", async () => {
    const { db, calls } = makeFakeDb({ leads: [] });

    await matchLeadForOrder(db, order);

    expect(calls.leadUpdates).toEqual([]);
    expect(calls.tagUpdates).toEqual([]);
  });

  it("una orden sin buyerEmail no revienta", async () => {
    const { db, calls } = makeFakeDb({ leads: [{ id: 1, email: "x@x.com", convertedOrderId: null }] });

    await matchLeadForOrder(db, { buyerEmail: "", id: 1 });

    expect(calls.leadUpdates).toEqual([]);
  });
});

describe("syncLeadsAsMailingAudience", () => {
  it("un lead nuevo se convierte en un customers mínimo, taggeado \"leads\"", async () => {
    const { db, calls, customersRows } = makeFakeDb({
      leads: [{ id: 1, email: "nueva@example.com", phone: "+56911112222", instagram: null, convertedOrderId: null }],
      customers: [],
    });

    const result = await syncLeadsAsMailingAudience(db, {});

    expect(calls.customerInserts).toHaveLength(1);
    expect(calls.customerInserts[0]).toMatchObject({ email: "nueva@example.com", phone: "+56911112222" });
    expect(calls.tagUpdates[0]).toMatchObject({ tags: [LEADS_MAILING_TAG] });
    expect(result).toHaveLength(1);
    expect(customersRows).toHaveLength(1);
  });

  it("un lead que ya es cliente real solo recibe el tag, sin pisar sus datos", async () => {
    const { db, calls } = makeFakeDb({
      leads: [{ id: 1, email: "cliente@example.com", phone: null, instagram: null, convertedOrderId: null }],
      customers: [{ id: 9, email: "cliente@example.com", fullName: "Ya Compró Antes", totalOrders: 3, tags: ["vip"] }],
    });

    await syncLeadsAsMailingAudience(db, {});

    // Nunca inserta uno nuevo si ya existe por email.
    expect(calls.customerInserts).toHaveLength(0);
    expect(calls.tagUpdates).toEqual([{ id: 9, tags: ["vip", LEADS_MAILING_TAG] }]);
  });

  it("no duplica el tag si el cliente ya lo tenía", async () => {
    const { db, calls } = makeFakeDb({
      leads: [{ id: 1, email: "repetido@example.com", convertedOrderId: null }],
      customers: [{ id: 9, email: "repetido@example.com", tags: [LEADS_MAILING_TAG] }],
    });

    await syncLeadsAsMailingAudience(db, {});

    expect(calls.tagUpdates).toEqual([]);
  });

  it("sin leads sin convertir, no inserta nada y devuelve vacío", async () => {
    const { db, calls } = makeFakeDb({ leads: [], customers: [] });

    const result = await syncLeadsAsMailingAudience(db, {});

    expect(result).toEqual([]);
    expect(calls.customerInserts).toHaveLength(0);
  });
});
