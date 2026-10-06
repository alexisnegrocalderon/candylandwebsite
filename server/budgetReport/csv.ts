/** CSV de las simulaciones (detalle completo). Secciones una debajo de otra,
 * con una fila en blanco entre cada una; se abre bien en Excel y en Google
 * Sheets. Los números van crudos (sin $ ni puntos) para poder sumarlos. */
import { csvEscape } from "../csv";
import { computeBudgetResult, expenseLineAmounts, extraIncomeTotalFor, extraVenueCostFor, type BudgetSimulationInput } from "../../shared/eventBudget";
import { buildScenarios, compareSimulations, verdictFor } from "../../shared/budgetInsights";
import { categoryLabel } from "../../shared/expenses";

type Cell = string | number | null | undefined;
const line = (cells: Cell[]) => cells.map((c) => csvEscape(typeof c === "number" ? Math.round(c * 100) / 100 : c)).join(",");
const yesNo = (v: boolean) => (v ? "Sí" : "No");

export function buildSimulationCsv(name: string, input: BudgetSimulationInput): string {
  const r = computeBudgetResult(input);
  const p = r.pnl;
  const out: string[] = [];
  const section = (title: string, header: Cell[], rows: Cell[][]) => {
    if (out.length > 0) out.push("");
    out.push(line([title]));
    if (header.length) out.push(line(header));
    rows.forEach((row) => out.push(line(row)));
  };

  section("INFORME DE SIMULACIÓN", [], [["Nombre", name]]);
  section("GENERAL", ["Dato", "Valor"], [
    ["Evento aplica IVA", yesNo(input.ivaApplies)],
    ["Meta de margen neto mínimo (%)", input.marginTargetPercent],
    ["Comisión de tarjeta (%)", input.cardFeePercent],
    ["Comisión de embajadores (%)", input.commissionPercent],
    ["Costo variable por persona", input.variableCostPerPerson],
    ["Venta de barra estimada por persona", input.otherRevenuePerPerson],
    ["% de la barra que se lleva el local", input.venueBarSharePercent ?? 0],
  ]);
  section("TANDAS DE ENTRADAS", ["Nombre", "Precio", "Entradas esperadas", "Personas por entrada", "Personas", "Ingreso"],
    input.revenueTiers.map((t) => [t.label, t.price, t.expectedQty, t.personasPorEntrada, t.expectedQty * t.personasPorEntrada, t.price * t.expectedQty]));
  section("OTROS INGRESOS (sin personas)", ["Nombre", "Precio", "Cantidad", "Pago al local por unidad", "Ingreso", "Pago al local"],
    (input.extraIncomes ?? []).map((l) => [l.label, l.unitPrice, l.quantity, l.venueCostPerUnit ?? 0, l.unitPrice * l.quantity, (l.venueCostPerUnit ?? 0) * l.quantity]));
  section("GASTOS FIJOS", ["Categoría", "Descripción", "Monto cargado", "IVA", "Neto", "IVA del gasto", "Total con IVA"],
    input.expenseLines.map((l) => {
      const a = expenseLineAmounts(l);
      return [categoryLabel(l.category), l.label, l.amount, l.ivaMode === "mas_iva" ? "+ IVA (factura)" : "IVA incluido", a.net, a.iva, a.total];
    }));
  section("RESULTADOS", ["Concepto", "Monto"], [
    ["Aforo estimado (personas)", r.attendance],
    ["Entradas vendidas", r.ticketsSold],
    ["Ingreso por entradas", r.ticketRevenue],
    ["Ingreso de barra", r.otherRevenue],
    ["Otros ingresos", r.extraIncomeTotal],
    ["Ingreso bruto", r.grossIncome],
    ["IVA de las ventas", p.iva.debitoFiscal],
    ["Costo variable por persona", p.cogs],
    ["Comisión de embajadores", p.ambassadorCommissions],
    ["Comisión de tarjeta", p.cardFeeAmount],
    ["Parte del local (barra)", r.venueBarShare],
    ["Pago al local (otros ingresos)", r.extraVenueCost],
    ["Gastos fijos (costo para el resultado)", p.directExpensesTotal],
    ["Gastos fijos con IVA", r.fixedExpensesGross],
    ["Utilidad neta", p.netProfit],
    ["Margen neto (%)", p.marginPercent],
    ["Techo de gasto", r.maxDirectExpenses],
    ["Punto de equilibrio (entradas)", r.breakevenTickets],
    ["Veredicto", verdictFor(r).label],
  ]);
  section("ESCENARIOS DE OCUPACIÓN", ["Ocupación", "Aforo", "Entradas", "Ingreso bruto", "Utilidad neta", "Margen (%)", "Veredicto"],
    buildScenarios(input).map((s) => [s.label, s.attendance, s.ticketsSold, s.grossIncome, s.netProfit, s.marginPercent, s.verdict.short]));
  return out.join("\r\n");
}

export function buildComparisonCsv(items: { id: number; name: string; input: BudgetSimulationInput }[]): string {
  const cmp = compareSimulations(items);
  const names = cmp.sims.map((s) => s.name);
  const out: string[] = [];
  const row = (label: string, f: (i: number) => Cell) => out.push(line([label, ...cmp.sims.map((_, i) => f(i))]));
  const blank = () => out.push("");
  const heading = (title: string) => { if (out.length) blank(); out.push(line([title, ...names])); };

  heading("COMPARACIÓN DE SIMULACIONES");
  row("Opción recomendada", (i) => (i === cmp.winnerIndex ? "Sí" : ""));
  row("Veredicto", (i) => cmp.sims[i].verdict.label);

  heading("SUPUESTOS");
  const inp = (i: number) => cmp.sims[i].input;
  row("Evento aplica IVA", (i) => yesNo(inp(i).ivaApplies));
  row("Meta de margen (%)", (i) => inp(i).marginTargetPercent);
  row("Venta de barra por persona", (i) => inp(i).otherRevenuePerPerson);
  row("% de la barra para el local", (i) => inp(i).venueBarSharePercent ?? 0);
  row("Otros ingresos (total)", (i) => extraIncomeTotalFor(inp(i).extraIncomes));
  row("Pago al local por otros ingresos", (i) => extraVenueCostFor(inp(i).extraIncomes));

  heading("RESULTADOS");
  const res = (i: number) => cmp.sims[i].result;
  row("Aforo estimado (personas)", (i) => res(i).attendance);
  row("Entradas vendidas", (i) => res(i).ticketsSold);
  row("Ingreso bruto", (i) => res(i).grossIncome);
  row("IVA de las ventas", (i) => res(i).pnl.iva.debitoFiscal);
  row("Costo variable por persona", (i) => res(i).pnl.cogs);
  row("Comisión de embajadores", (i) => res(i).pnl.ambassadorCommissions);
  row("Comisión de tarjeta", (i) => res(i).pnl.cardFeeAmount);
  row("Parte del local", (i) => res(i).pnl.extraCostsTotal);
  row("Gastos fijos", (i) => res(i).pnl.directExpensesTotal);
  row("Utilidad neta", (i) => res(i).pnl.netProfit);
  row("Margen neto (%)", (i) => res(i).pnl.marginPercent);
  row("Techo de gasto", (i) => res(i).maxDirectExpenses);
  row("Punto de equilibrio (entradas)", (i) => res(i).breakevenTickets);

  heading("UTILIDAD SEGÚN OCUPACIÓN");
  const scenarios = cmp.sims.map((s) => buildScenarios(s.input));
  scenarios[0].forEach((sc, k) => row(`Ocupación ${sc.label}`, (i) => scenarios[i][k].netProfit));

  blank();
  cmp.reasons.forEach((reason) => out.push(line([reason])));
  return out.join("\r\n");
}
