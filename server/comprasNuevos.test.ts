import { beforeEach, describe, expect, it, vi } from "vitest";

const movimientos: any[] = [];
const creados: any[] = [];
const reglas: any[] = [];
const aliases: any[] = [];
let existentes: { id: number; name: string }[] = [];
let nextId = 100;

vi.mock("./db", () => ({
  getDb: async () => ({
    insert: () => ({ values: async (v: any) => { movimientos.push(v); } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    execute: async () => {},
    select: () => ({ from: async () => [] }),
  }),
  createExpense: async () => ({ id: 1 }),
}));
vi.mock("./insumos", () => ({
  listInsumos: async () => existentes,
  saveInsumo: async (d: any) => { const id = nextId++; creados.push({ id, ...d }); existentes = [...existentes, { id, name: d.name }]; return { id }; },
  saveRegla: async (id: number, r: any) => { reglas.push({ id, ...r }); },
  addInsumoAliases: async (a: any[]) => { aliases.push(...a); },
}));
vi.mock("./_core/llm", () => ({ invokeLLM: async () => ({}), extractContent: () => "" }));

const base = {
  opId: "op-12345678", eventId: 1, actualizarCostos: true, recordarNombres: true, userId: 1,
  gasto: { crear: false, proveedor: "Botillería", rut: "", fecha: "", documentType: "boleta" as const, numero: "55", total: 0, ivaExempt: false, receiptUrl: null },
};

beforeEach(() => { movimientos.length = 0; creados.length = 0; reglas.length = 0; aliases.length = 0; existentes = [{ id: 1, name: "Ron blanco" }]; nextId = 100; });

describe("compra con productos nuevos", () => {
  it("crea el producto nuevo con lo que dice la boleta y le suma la compra", async () => {
    const { aplicarCompra } = await import("./compras");
    const r = await aplicarCompra({
      ...base,
      lineas: [
        { insumoId: 1, agregar: 1500, costoParaInsumo: 8000, alias: null, detalle: "2 × 750 ml" },
        { insumoId: null, nuevo: { name: "Tequila Katrina", unit: "ml", containerSize: 1000, containerLabel: "botella", sizes: [1000], grupo: "bebida", costo: 12000 }, agregar: 3000, costoParaInsumo: 12000, alias: "TEQUILA KATRINA 1000CC", detalle: "3 × 1 L" },
        { insumoId: null, nuevo: { name: "Guantes nitrilo", unit: "un", containerSize: 1, containerLabel: "unidad", sizes: [], grupo: "desechable", costo: 60 }, agregar: 100, costoParaInsumo: 60, alias: "GUANTES NITRILO M", detalle: "100 un" },
      ],
    });
    expect(r.creados).toEqual(["Tequila Katrina", "Guantes nitrilo"]);
    expect(creados.map((c) => [c.name, c.unit, c.containerSize, c.sizes, c.costPerContainer])).toEqual([["Tequila Katrina", "ml", 1000, [1000], 12000], ["Guantes nitrilo", "un", 1, [], 60]]);
    expect(reglas).toEqual([{ id: 100, grupo: "bebida", modo: "receta", cantidad: 0, minimo: 0 }, { id: 101, grupo: "desechable", modo: "manual", cantidad: 0, minimo: 0 }]);
    expect(movimientos.map((m) => [m.insumoId, m.delta])).toEqual([[1, "1500"], [100, "3000"], [101, "100"]]);
    expect(aliases.map((a) => a.insumoId).sort()).toEqual([100, 101]);
  });

  it("si ya existe un insumo con ese nombre, lo usa y no crea otro (reintento o dos tamaños del mismo producto)", async () => {
    const { aplicarCompra } = await import("./compras");
    const nuevo = { name: "TEQUILA katrina", unit: "ml" as const, containerSize: 1000, containerLabel: "botella", sizes: [1000], grupo: "bebida" as const, costo: null };
    await aplicarCompra({ ...base, lineas: [{ insumoId: null, nuevo, agregar: 1000, costoParaInsumo: null, alias: null, detalle: "1 × 1 L" }, { insumoId: null, nuevo: { ...nuevo, name: "Tequila Katrina" }, agregar: 750, costoParaInsumo: null, alias: null, detalle: "1 × 750 ml" }] });
    expect(creados).toHaveLength(1);
    // Las dos líneas del mismo producto se suman en un solo movimiento.
    expect(movimientos.map((m) => [m.insumoId, m.delta])).toEqual([[100, "1750"]]);
    movimientos.length = 0;
    await aplicarCompra({ ...base, lineas: [{ insumoId: null, nuevo, agregar: 1000, costoParaInsumo: null, alias: null, detalle: "1 × 1 L" }] });
    expect(creados).toHaveLength(1);
  });

  it("una línea sin insumo ni datos para crearlo no se acepta", async () => {
    const { aplicarCompra } = await import("./compras");
    await expect(aplicarCompra({ ...base, lineas: [{ insumoId: null, agregar: 10, costoParaInsumo: null, alias: null, detalle: "x" }] })).rejects.toThrow(/no tiene insumo/);
    expect(movimientos).toHaveLength(0);
  });
});
