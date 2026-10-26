import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffManualAcceptances, staffManuals } from "../drizzle/schema";

vi.mock("./db", () => ({ getDb: vi.fn() }));
import * as db from "./db";
import { acceptManuals, manualForStaff, publishManual } from "./staffManuals";

const sec = [{ title: "Reglas", kind: "text", text: "No celular", items: [] }];

/** Doble de la cadena de drizzle: `manuals` y `accepts` son las filas que «hay»; lo insertado queda anotado. */
function fake(manuals: any[], accepts: any[]) {
  const inserted: { table: unknown; values: any }[] = [];
  const rows = (t: unknown) => (t === staffManuals ? manuals : t === staffManualAcceptances ? accepts : []);
  return {
    inserted,
    select: () => {
      let table: unknown;
      const b: any = {
        from: (t: unknown) => { table = t; return b; },
        where: () => b,
        orderBy: () => b,
        limit: async () => rows(table).slice(0, 1),
        then: (res: any) => res(rows(table)),
      };
      return b;
    },
    insert: (t: unknown) => ({ values: (v: any) => { inserted.push({ table: t, values: v }); return { onDuplicateKeyUpdate: async () => {} , then: (r: any) => r() }; } }),
  };
}

beforeEach(() => vi.resetAllMocks());

describe("manual del staff en la base", () => {
  it("publicar crea la versión siguiente y exige contenido", async () => {
    const f = fake([{ v: 2, version: 2 }], []);
    vi.mocked(db.getDb).mockResolvedValue(f as any);
    expect(await publishManual({ key: "cocina", title: "Cocina", sections: sec })).toEqual({ version: 3 });
    expect(f.inserted[0].values).toMatchObject({ manualKey: "cocina", version: 3, title: "Cocina" });
    await expect(publishManual({ key: "cocina", title: "Cocina", sections: [] })).rejects.toThrow(/sección/);
    await expect(publishManual({ key: "cocina", title: "  ", sections: sec })).rejects.toThrow(/título/);
  });

  it("aceptar guarda solo lo vigente que falta y nunca duplica", async () => {
    const manuals = [
      { manualKey: "general", version: 2, title: "General", sections: sec, changeNote: null, publishedAt: new Date() },
      { manualKey: "cocina", version: 1, title: "Cocina", sections: sec, changeNote: null, publishedAt: new Date() },
    ];
    // Lo que devuelve el select con alias: { staffId, key, v }.
    const accepts = [{ staffId: 7, key: "general", v: 2 }];
    const f = fake(manuals, accepts);
    vi.mocked(db.getDb).mockResolvedValue(f as any);
    const res = await acceptManuals({ id: 7, cargo: "cocina", name: "MaxKay", rut: "1-9" }, { userAgent: "UA", ip: "1.1.1.1" });
    expect(res.added).toBe(1);
    expect(f.inserted).toHaveLength(1);
    expect(f.inserted[0].values).toMatchObject({ staffId: 7, manualKey: "cocina", version: 1, fullName: "MaxKay" });
  });

  it("sin manual publicado no hay nada que aceptar", async () => {
    vi.mocked(db.getDb).mockResolvedValue(fake([], []) as any);
    await expect(acceptManuals({ id: 7, cargo: "cocina", name: "M", rut: null }, {})).rejects.toThrow(/manual publicado/);
    expect((await manualForStaff({ id: 7, cargo: "cocina" })).status).toBe("sin_manual");
  });
});
