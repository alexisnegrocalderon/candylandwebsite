import { describe, expect, it } from "vitest";
import { computeBudgetResult, expenseLineAmounts, type BudgetSimulationInput } from "./eventBudget";

// 100 entradas de $10.000 (1 persona c/u) y $10.000 de barra por persona:
// aforo 100, entradas $1.000.000, barra $1.000.000, ingreso bruto $2.000.000.
const base: BudgetSimulationInput = {
  ivaApplies: false,
  marginTargetPercent: 30,
  cardFeePercent: 0,
  commissionPercent: 0,
  variableCostPerPerson: 0,
  otherRevenuePerPerson: 10000,
  revenueTiers: [{ label: "General", price: 10000, expectedQty: 100, personasPorEntrada: 1 }],
  expenseLines: [],
};

describe("parte de la barra para el local", () => {
  it("calcula el % sobre la venta bruta de barra y lo resta del resultado", () => {
    const sin = computeBudgetResult(base);
    const con = computeBudgetResult({ ...base, venueBarSharePercent: 10 });
    expect(sin.venueBarShare).toBe(0);
    expect(con.venueBarShare).toBe(100000); // 10% de $1.000.000 de barra
    expect(con.pnl.netProfit).toBe(sin.pnl.netProfit - 100000);
    expect(con.pnl.extraCostsTotal).toBe(100000);
  });

  it("baja el techo de gasto exactamente por lo que se lleva el local", () => {
    const sin = computeBudgetResult(base);
    const con = computeBudgetResult({ ...base, venueBarSharePercent: 10 });
    expect(sin.maxDirectExpenses - con.maxDirectExpenses).toBe(100000);
  });

  it("no cuenta la parte del local como gasto fijo", () => {
    const con = computeBudgetResult({ ...base, venueBarSharePercent: 10, expenseLines: [{ category: "arriendo", label: "Local", amount: 500000 }] });
    expect(con.pnl.directExpensesTotal).toBe(500000);
    expect(con.fixedExpensesGross).toBe(500000);
  });

  it("sin venta de barra no hay parte del local, aunque haya %", () => {
    const r = computeBudgetResult({ ...base, otherRevenuePerPerson: 0, venueBarSharePercent: 25 });
    expect(r.venueBarShare).toBe(0);
  });

  it("acota el % entre 0 y 100", () => {
    expect(computeBudgetResult({ ...base, venueBarSharePercent: 250 }).venueBarShare).toBe(1000000);
    expect(computeBudgetResult({ ...base, venueBarSharePercent: -5 }).venueBarShare).toBe(0);
  });

  it("sube el punto de equilibrio porque cada persona deja menos margen", () => {
    const lines = [{ category: "arriendo", label: "Local", amount: 1000000 }];
    const sin = computeBudgetResult({ ...base, expenseLines: lines });
    const con = computeBudgetResult({ ...base, expenseLines: lines, venueBarSharePercent: 20 });
    expect(con.breakevenTickets!).toBeGreaterThan(sin.breakevenTickets!);
    // Verificación directa: contribución por entrada = 10.000 + 10.000·(1 − 20%) − 0
    expect(con.breakevenTickets).toBe(Math.ceil(1000000 / (10000 + 10000 * 0.8)) );
  });

  it("una simulación guardada antes de existir el campo da lo mismo que con 0%", () => {
    const { venueBarSharePercent: _omit, ...legacy } = { ...base, venueBarSharePercent: undefined };
    expect(computeBudgetResult(legacy as BudgetSimulationInput)).toEqual(computeBudgetResult({ ...base, venueBarSharePercent: 0 }));
  });
});

describe("gastos fijos '+ IVA'", () => {
  const arriendo = { category: "arriendo", label: "Arriendo Hipódromo", amount: 2000000 };

  it("calcula neto, IVA y total", () => {
    expect(expenseLineAmounts({ ...arriendo, ivaMode: "mas_iva" })).toEqual({ total: 2380000, net: 2000000, iva: 380000 });
    expect(expenseLineAmounts({ ...arriendo, ivaMode: "incluido" })).toEqual({ total: 2000000, net: 2000000, iva: 0 });
    expect(expenseLineAmounts(arriendo)).toEqual({ total: 2000000, net: 2000000, iva: 0 });
  });

  it("si el evento aplica IVA, el IVA del arriendo se recupera: entra neto al resultado", () => {
    const r = computeBudgetResult({ ...base, ivaApplies: true, expenseLines: [{ ...arriendo, ivaMode: "mas_iva" }] });
    expect(r.pnl.directExpensesTotal).toBe(2000000);
    expect(r.fixedExpensesGross).toBe(2380000);
    expect(r.pnl.iva.creditoFiscal).toBe(380000);
  });

  it("si el evento NO aplica IVA, todo el arriendo con IVA es costo", () => {
    const r = computeBudgetResult({ ...base, ivaApplies: false, expenseLines: [{ ...arriendo, ivaMode: "mas_iva" }] });
    expect(r.pnl.directExpensesTotal).toBe(2380000);
    expect(r.pnl.iva.creditoFiscal).toBe(0);
  });

  it("una línea 'IVA incluido' se comporta igual que antes", () => {
    const a = computeBudgetResult({ ...base, ivaApplies: true, expenseLines: [arriendo] });
    const b = computeBudgetResult({ ...base, ivaApplies: true, expenseLines: [{ ...arriendo, ivaMode: "incluido" }] });
    expect(a).toEqual(b);
    expect(a.pnl.directExpensesTotal).toBe(2000000);
    expect(a.pnl.iva.creditoFiscal).toBe(0);
  });
});
