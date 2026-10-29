import { beforeEach, describe, expect, it, vi } from "vitest";
import { customers, discountCodes, events, memberCoupons } from "../drizzle/schema";

// Solo importa la regla del bono (cuándo se entrega, a quién, con qué vencimiento): la base y el aviso push son dobles.
const state = {
  config: {} as unknown,
  customer: { id: 5, email: "ana@x.cl", fullName: "Ana Pérez", memberSince: new Date() } as any,
  hasTicket: false,
  claimedKeys: new Set<string>(),
  insertedCodes: [] as Record<string, unknown>[],
};
const pushToEmail = vi.fn(async (_e: string, _p: unknown) => 1);

vi.mock("./db", () => ({
  getSiteSettings: vi.fn(async () => ({ memberConfig: state.config })),
  hasApprovedOrderForEvent: vi.fn(async () => state.hasTicket),
  getDb: vi.fn(async () => {
    const select = () => {
      let table: unknown;
      const b: any = {
        from: (t: unknown) => { table = t; return b; },
        where: () => b,
        limit: async () => {
          if (table === customers) return state.customer ? [state.customer] : [];
          if (table === events) return [{ title: "2º Aniversario" }];
          return [];
        },
      };
      return b;
    };
    return {
      select,
      insert: (table: unknown) => ({
        values: async (v: Record<string, unknown>) => {
          if (table === memberCoupons) {
            if (state.claimedKeys.has(String(v.grantKey))) { const e: any = new Error("dup"); e.code = "ER_DUP_ENTRY"; throw e; }
            state.claimedKeys.add(String(v.grantKey));
            return [{ insertId: 1 }];
          }
          if (table === discountCodes) { state.insertedCodes.push(v); return [{ insertId: 9 }]; }
          return [{ insertId: 0 }];
        },
      }),
      update: () => ({ set: () => ({ where: async () => ({}) }) }),
      delete: () => ({ where: async () => ({}) }),
    };
  }),
}));
vi.mock("./customerPush", () => ({ pushToEmail: (e: string, p: unknown) => pushToEmail(e, p), reportAppOpen: vi.fn() }));

const { claimAppBonus } = await import("./members");

const NOW = new Date("2026-10-30T11:00:00Z");
const open = { appBonus: { enabled: true, amountClp: 10000, eventId: 7, validUntil: "2026-10-31T02:59:00Z" } };

beforeEach(() => {
  state.config = open;
  state.customer = { id: 5, email: "ana@x.cl", fullName: "Ana Pérez", memberSince: new Date() };
  state.hasTicket = false;
  state.claimedKeys.clear();
  state.insertedCodes.length = 0;
  pushToEmail.mockClear();
});

describe("bono por instalar la app", () => {
  it("entrega un cupón de $10.000 para esa fiesta, de un solo uso, que vence a la hora fijada", async () => {
    const r = await claimAppBonus("Ana@X.cl", NOW);

    expect(r).toMatchObject({ status: "granted", amountClp: 10000, validUntil: "2026-10-31T02:59:00.000Z", eventTitle: "2º Aniversario" });
    expect(state.insertedCodes[0]).toMatchObject({ discountType: "fixed", discountValue: "10000", maxUses: 1, eventId: 7 });
    expect(new Date(state.insertedCodes[0].validUntil as Date).toISOString()).toBe("2026-10-31T02:59:00.000Z");
    expect(pushToEmail).toHaveBeenCalledTimes(1);
  });

  it("es uno por persona: la segunda vez responde 'already' y no crea otro cupón", async () => {
    await claimAppBonus("ana@x.cl", NOW);
    const again = await claimAppBonus("ana@x.cl", NOW);

    expect(again).toEqual({ status: "already" });
    expect(state.insertedCodes).toHaveLength(1);
  });

  it("apagado, vencido o sin fiesta no entrega nada", async () => {
    state.config = { appBonus: { ...open.appBonus, enabled: false } };
    expect(await claimAppBonus("ana@x.cl", NOW)).toEqual({ status: "disabled" });
    state.config = open;
    expect(await claimAppBonus("ana@x.cl", new Date("2026-10-31T03:00:00Z"))).toEqual({ status: "ended" });
    state.config = { appBonus: { ...open.appBonus, eventId: null } };
    expect(await claimAppBonus("ana@x.cl", NOW)).toEqual({ status: "ended" });
    expect(state.insertedCodes).toHaveLength(0);
  });

  it("no se da a quien ya tiene entrada de esa fiesta ni a un correo sin cuenta", async () => {
    state.hasTicket = true;
    expect(await claimAppBonus("ana@x.cl", NOW)).toEqual({ status: "has_ticket" });
    state.hasTicket = false;
    state.customer = null;
    expect(await claimAppBonus("nadie@x.cl", NOW)).toEqual({ status: "no_account" });
    expect(state.insertedCodes).toHaveLength(0);
  });

  it("si el aviso push falla, el bono igual queda entregado", async () => {
    pushToEmail.mockRejectedValueOnce(new Error("sin push"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await claimAppBonus("ana@x.cl", NOW)).status).toBe("granted");
  });
});
