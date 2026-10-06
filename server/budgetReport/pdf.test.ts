import { describe, expect, it } from "vitest";
import { sample } from "../../shared/budgetSample.fixture";
import { fillTokens, sanitizeNote } from "./narrative";
import { comparisonPdf, singlePdf } from "./index";

const sim = { id: 1, name: "PlayRoom x Dalmore", input: sample };
const other = { id: 2, name: "Aniversario 2", input: { ...sample, venueBarSharePercent: 0 } };
const pages = (b: Buffer) => (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("informes PDF", () => {
  it("genera cada versión individual como PDF válido", async () => {
    const full = await singlePdf(sim, "completa");
    const summary = await singlePdf(sim, "resumen");
    const ext = await singlePdf(sim, "externa");
    for (const b of [full, summary, ext]) expect(b.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(summary)).toBe(2);
    expect(pages(full)).toBeGreaterThan(pages(ext));
  }, 60000);

  it("genera la comparación completa y resumida", async () => {
    const full = await comparisonPdf([sim, other], "completa");
    const summary = await comparisonPdf([sim, other], "resumen");
    expect(full.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(full)).toBeGreaterThan(pages(summary));
  }, 60000);

  it("funciona sin ingresos adicionales ni porcentaje del local", async () => {
    const plain = { id: 3, name: "Simple", input: { ...sample, extraIncomes: [], venueBarSharePercent: 0 } };
    expect((await singlePdf(plain, "completa")).length).toBeGreaterThan(5000);
  }, 60000);
});

describe("texto de la IA", () => {
  it("reemplaza marcadores y rechaza los desconocidos", () => {
    expect(fillTokens("Utilidad {{utilidad}}", { utilidad: "$1" })).toBe("Utilidad $1");
    expect(fillTokens("Hola {{inventado}}", { utilidad: "$1" })).toBeNull();
  });
  it("descarta notas con cifras sueltas", () => {
    expect(sanitizeNote("Esto sube $500.000 seguro")).toBeNull();
    expect(sanitizeNote("Pide una segunda cotización")).toBe("Pide una segunda cotización");
  });
});
