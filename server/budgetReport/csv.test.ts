import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import { sample } from "../../shared/budgetSample.fixture";
import { buildComparisonCsv, buildSimulationCsv } from "./csv";

const cell = (rows: string[][], label: string) => rows.find((r) => r[0] === label);

describe("buildSimulationCsv", () => {
  const rows = parseCsv(buildSimulationCsv("PlayRoom x Dalmore", sample));
  it("trae todas las secciones", () => {
    const titles = rows.map((r) => r[0]);
    for (const t of ["INFORME DE SIMULACIÓN", "GENERAL", "TANDAS DE ENTRADAS", "OTROS INGRESOS (sin personas)", "GASTOS FIJOS", "RESULTADOS", "ESCENARIOS DE OCUPACIÓN"]) expect(titles).toContain(t);
  });
  it("los números van crudos y cuadran con el simulador", () => {
    expect(cell(rows, "Aforo estimado (personas)")?.[1]).toBe("620");
    expect(Number(cell(rows, "Ingreso bruto")?.[1])).toBe(20300000);
    expect(cell(rows, "Utilidad neta")?.[1]).toMatch(/^\d+$/);
  });
  it("separa neto, IVA y total del arriendo + IVA", () => {
    const arriendo = rows.find((r) => r[1] === "Arriendo Hipódromo")!;
    expect(arriendo.slice(2)).toEqual(["2000000", "+ IVA (factura)", "2000000", "380000", "2380000"]);
  });
  it("escapa comas y comillas en los nombres", () => {
    const tricky = parseCsv(buildSimulationCsv('Fiesta "X", la mejor', sample));
    expect(tricky[1][1]).toBe('Fiesta "X", la mejor');
  });
});

describe("buildComparisonCsv", () => {
  const cheap = { ...sample, expenseLines: [{ category: "arriendo", label: "Local", amount: 1_000_000 }] };
  const rows = parseCsv(buildComparisonCsv([{ id: 1, name: "Con todo", input: sample }, { id: 2, name: "Austera", input: cheap }]));
  it("una columna por simulación y marca la recomendada", () => {
    expect(rows[0]).toEqual(["COMPARACIÓN DE SIMULACIONES", "Con todo", "Austera"]);
    const rec = cell(rows, "Opción recomendada")!;
    expect(rec.slice(1).filter(Boolean)).toEqual(["Sí"]);
  });
  it("trae la utilidad por ocupación y las razones", () => {
    expect(cell(rows, "Ocupación 70%")).toBeTruthy();
    expect(rows.some((r) => r[0].includes("Austera") || r[0].includes("Con todo"))).toBe(true);
  });
});
