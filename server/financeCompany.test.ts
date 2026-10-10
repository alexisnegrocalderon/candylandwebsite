import { describe, expect, it } from "vitest";
import { buildMonthRows } from "./financeCompany";

describe("buildMonthRows", () => {
  const events = [
    { id: 1, title: "Octubre", monthKey: "2026-10", grossIncome: 1_000_000, netProfit: 300_000 },
    { id: 2, title: "Diciembre", monthKey: "2026-12", grossIncome: 500_000, netProfit: -50_000 },
  ];
  const generalExpenses = [
    { monthKey: "2026-10", cost: 100_000, prorate: true },   // ya está dentro de la ganancia del evento
    { monthKey: "2026-10", cost: 40_000, prorate: false },   // "no prorratear": queda afuera de los eventos
    { monthKey: "2026-11", cost: 70_000, prorate: true },    // mes sin eventos: nadie lo absorbe
  ];
  const rows = buildMonthRows({ year: 2026, events, generalExpenses });
  const m = (k: string) => rows.find((r) => r.monthKey === k)!;

  it("siempre devuelve los 12 meses", () => expect(rows).toHaveLength(12));
  it("no resta dos veces el gasto que un evento ya absorbió", () => {
    expect(m("2026-10").unassignedExpenses).toBe(40_000);
    expect(m("2026-10").result).toBe(260_000);
  });
  it("un mes sin eventos igual muestra su gasto", () => {
    expect(m("2026-11").events).toHaveLength(0);
    expect(m("2026-11").result).toBe(-70_000);
  });
  it("el año suma todo", () => {
    expect(rows.reduce((s, r) => s + r.result, 0)).toBe(260_000 - 70_000 - 50_000);
  });
});
