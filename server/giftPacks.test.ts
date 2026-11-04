import { beforeEach, describe, expect, it, vi } from "vitest";

const saved: any[] = [];
const deleted: any[] = [];
let rows: any[] = [];

vi.mock("./db", () => ({
  getDb: async () => ({
    execute: async () => {},
    select: () => ({ from: async () => rows }),
    insert: () => ({ values: (v: any) => ({ onDuplicateKeyUpdate: async () => { saved.push(v); } }) }),
    delete: () => ({ where: async (w: any) => { deleted.push(w); } }),
  }),
}));

const data = { vigencia: "libre" as const, mode: "pase" as const, anyAccess: true, anyQty: 2, validDays: null, items: [] };

beforeEach(() => { saved.length = 0; deleted.length = 0; rows = []; });

describe("paquetes de regalo guardados en la cuenta", () => {
  it("los lista en orden alfabético con sus datos", async () => {
    rows = [{ id: 2, name: "Puerta", data }, { id: 1, name: "Barra", data: { ...data, vigencia: "evento", items: [{ name: "Tropical Gin", qty: 2 }] } }];
    const { listPacks } = await import("./giftPacks");
    const list = await listPacks();
    expect(list.map((p) => p.name)).toEqual(["Barra", "Puerta"]);
    expect(list[0]).toMatchObject({ id: 1, vigencia: "evento", items: [{ name: "Tropical Gin", qty: 2 }] });
  });

  it("guarda con el nombre recortado", async () => {
    const { savePack } = await import("./giftPacks");
    await savePack("  Invitado VIP  ", data);
    expect(saved[0]).toMatchObject({ name: "Invitado VIP", data });
  });

  it("borrar pasa por la base", async () => {
    const { deletePack } = await import("./giftPacks");
    await deletePack(3);
    expect(deleted).toHaveLength(1);
  });
});
