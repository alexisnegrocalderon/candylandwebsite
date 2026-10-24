import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
import * as db from "./db";
import { operators, staffMembers } from "../drizzle/schema";
import { backfillStaffUnify, NO_PIN, setStaffPinHash } from "./staff";
import { verifyPin } from "./caja/auth";

/** Base falsa: los select devuelven la tabla tal cual y los update quedan anotados. */
function fakeDb(tables: Map<unknown, any[]>) {
  const updates: { table: unknown; set: Record<string, unknown> }[] = [];
  return {
    updates,
    select: () => ({
      from: (t: unknown) => {
        const p: any = Promise.resolve(tables.get(t) ?? []);
        p.where = () => p;
        p.limit = () => p;
        p.orderBy = () => p;
        return p;
      },
    }),
    update: (table: unknown) => ({ set: (set: Record<string, unknown>) => ({ where: async () => { updates.push({ table, set }); } }) }),
  };
}

describe("ficha única del staff", () => {
  it("completa cargo y correo de antes y enlaza los operadores por correo o nombre", async () => {
    const fake = fakeDb(new Map<unknown, any[]>([
      [staffMembers, [
        { id: 1, name: "Ana Pérez", role: "Seguridad", cargo: null, email: null },
        { id: 2, name: "Beto", role: "Bartender", cargo: "barra", email: "beto@x.cl" },
        { id: 3, name: "Carla", role: null, cargo: null, email: null },
      ]],
      [operators, [
        { id: 10, name: "Otra persona", email: "beto@x.cl" },
        { id: 11, name: "  ana  pérez ", email: null },
        { id: 12, name: "Desconocido", email: null },
      ]],
    ]));
    vi.mocked(db.getDb).mockResolvedValue(fake as any);

    const r = await backfillStaffUnify({ 1: "ana@x.cl", 2: "otro@x.cl" });

    expect(r.linked).toBe(2);
    const staffSets = fake.updates.filter((u) => u.table === staffMembers).map((u) => u.set);
    // Ana: cargo desde el texto y correo del JSON viejo. Beto ya tenía todo: no se toca.
    expect(staffSets).toEqual([{ cargo: "puerta", email: "ana@x.cl" }]);
    const opSets = fake.updates.filter((u) => u.table === operators).map((u) => u.set);
    expect(opSets).toEqual([{ staffId: 2 }, { staffId: 1 }]);
  });

  it("el PIN de la persona pasa a todos sus accesos, y al borrarlo dejan de abrir", async () => {
    const fake = fakeDb(new Map());
    vi.mocked(db.getDb).mockResolvedValue(fake as any);

    await setStaffPinHash(1, "salt:hash");
    expect(fake.updates[1]).toEqual({ table: operators, set: { pinHash: "salt:hash", failedPinAttempts: 0, lockedUntil: null } });

    fake.updates.length = 0;
    await setStaffPinHash(1, null);
    expect(fake.updates[0].set).toMatchObject({ pinHash: null, pinSetAt: null });
    expect(fake.updates[1].set.pinHash).toBe(NO_PIN);
    expect(verifyPin("1234", NO_PIN)).toBe(false);
  });
});
