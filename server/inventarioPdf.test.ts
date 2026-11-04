import { describe, expect, it } from "vitest";
import { armarInventario } from "../shared/inventarioReporte";
import { buildInventarioPdf } from "./inventarioPdf";

const base = { unit: "ml" as const, containerSize: 750, containerLabel: "botella", reference: null, need: null, minimo: 0 };

describe("inventario PDF", () => {
  it("arma el PDF con datos completos", async () => {
    const insumos = Array.from({ length: 70 }, (_, i) => ({ ...base, id: i + 1, name: `Insumo ${i + 1} de nombre bastante largo para probar el recorte`, costPerContainer: i % 3 ? 9000 : null, stock: i * 120, level: (["ok", "bajo", "agotado", "sin_uso"] as const)[i % 4], grupo: (["bebida", "desechable", "limpieza", "otro"] as const)[i % 4], need: 1500 }));
    const inv = armarInventario({
      eventTitle: "Fiesta de prueba", emittedAt: new Date("2026-11-04T18:00:00Z"), personas: 300, insumos,
      consumo: [{ insumoId: 1, usado: 3000, merma: 100 }, { insumoId: 2, usado: 750, merma: 0 }],
      compras: [{ insumoId: 3, need: 3000, missing: 1500, containersToBuy: 2, cost: 18000 }],
    });
    const pdf = await buildInventarioPdf(inv);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeLessThan(1_500_000);
  });

  it("también sin consumo, sin compras y sin insumos", async () => {
    const inv = armarInventario({ eventTitle: "Vacío", emittedAt: new Date(), personas: 100, insumos: [], consumo: [], compras: [] });
    expect((await buildInventarioPdf(inv)).subarray(0, 5).toString()).toBe("%PDF-");
  });
});
