import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
import * as db from "./db";
import { operators, staffMembers, staffShifts } from "../drizzle/schema";
import { backfillStaffUnify, NO_PIN, setStaffPinHash, syncStaffAccess } from "./staff";
import { verifyPin } from "./caja/auth";

/** Base falsa: los select devuelven la tabla tal cual y los update quedan anotados. */
function fakeDb(tables: Map<unknown, any[]>) {
  const updates: { table: unknown; set: Record<string, unknown> }[] = [];
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  return {
    updates,
    inserts,
    select: () => ({
      from: (t: unknown) => {
        const p: any = Promise.resolve(tables.get(t) ?? []);
        p.where = () => p;
        p.limit = () => p;
        p.orderBy = () => p;
        p.innerJoin = () => p;
        return p;
      },
    }),
    update: (table: unknown) => ({ set: (set: Record<string, unknown>) => ({ where: async () => { updates.push({ table, set }); } }) }),
    insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { inserts.push({ table, values }); return [{ insertId: 99 }]; } }),
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

describe("accesos por noche", () => {
  const person = (over: Record<string, unknown> = {}) => ({ name: "Ana", email: "ana@x.cl", cargo: "puerta", pinHash: "salt:pin", active: 1, ...over });

  it("asignada a una noche: entra con su cargo y su PIN; se crea el acceso que falta", async () => {
    const fake = fakeDb(new Map<unknown, any[]>([
      [staffMembers, [person()]],
      [staffShifts, [{ eventId: 5 }, { eventId: 6 }]],
      [operators, [{ id: 1, eventId: 5, pinHash: NO_PIN, active: 0 }]],
    ]));
    vi.mocked(db.getDb).mockResolvedValue(fake as any);

    expect(await syncStaffAccess(7)).toEqual({ created: 1, updated: 1 });
    expect(fake.updates[0].set).toMatchObject({ role: "acceso", pinHash: "salt:pin", active: 1 });
    expect(fake.inserts[0].values).toMatchObject({ eventId: 6, staffId: 7, role: "acceso", pinHash: "salt:pin", active: 1 });
  });

  it("sin PIN propio: el acceso de antes sigue con el PIN del admin y el nuevo queda apagado", async () => {
    const fake = fakeDb(new Map<unknown, any[]>([
      [staffMembers, [person({ pinHash: null, cargo: "barra" })]],
      [staffShifts, [{ eventId: 5 }, { eventId: 6 }]],
      [operators, [{ id: 1, eventId: 5, pinHash: "salt:admin", active: 1 }]],
    ]));
    vi.mocked(db.getDb).mockResolvedValue(fake as any);

    await syncStaffAccess(7);
    expect(fake.updates[0].set).toMatchObject({ role: "barra", pinHash: "salt:admin", active: 1 });
    expect(fake.inserts[0].values).toMatchObject({ eventId: 6, pinHash: NO_PIN, active: 0 });
  });

  it("si su cargo ya no usa pantalla o se archiva, se apagan sus accesos", async () => {
    const dj = fakeDb(new Map<unknown, any[]>([
      [staffMembers, [person({ cargo: "dj" })]],
      [staffShifts, [{ eventId: 5 }]],
      [operators, [{ id: 1, eventId: 5, pinHash: "salt:pin", active: 1 }, { id: 2, eventId: 3, pinHash: "salt:pin", active: 1 }]],
    ]));
    vi.mocked(db.getDb).mockResolvedValue(dj as any);
    expect(await syncStaffAccess(7)).toEqual({ created: 0, updated: 1 });
    expect(dj.updates).toEqual([{ table: operators, set: { active: 0 } }]);
    expect(dj.inserts).toEqual([]);

    const archived = fakeDb(new Map<unknown, any[]>([[staffMembers, [person({ active: 0 })]]]));
    vi.mocked(db.getDb).mockResolvedValue(archived as any);
    await syncStaffAccess(7);
    expect(archived.updates).toEqual([{ table: operators, set: { active: 0 } }]);
  });
});
