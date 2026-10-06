import { describe, expect, it } from "vitest";
import { computeBudgetResult, type BudgetSimulationInput } from "./eventBudget";
import { sample } from "./budgetSample.fixture";
import {
  buildRecommendations, recommendationScore, buildScenarios, buildSensitivity, compareSimulations, profitCurve, scaleOccupancy, verdictFor, waterfallSteps,
} from "./budgetInsights";

describe("verdictFor", () => {
  it("clasifica por margen y pérdida", () => {
    expect(verdictFor(computeBudgetResult(sample)).key).toMatch(/ok|warning|danger/);
    const loss = computeBudgetResult({ ...sample, expenseLines: [{ category: "otros", label: "Gigante", amount: 99_000_000 }] });
    expect(verdictFor(loss).key).toBe("loss");
  });
});

describe("waterfallSteps", () => {
  it("la cascada cierra exactamente en la utilidad", () => {
    const r = computeBudgetResult(sample);
    const steps = waterfallSteps(r);
    const profit = steps[steps.length - 1];
    expect(profit.kind).toBe("total");
    const rebuilt = steps[0].amount - steps.filter((s) => s.kind === "cost").reduce((sum, s) => sum + s.amount, 0);
    expect(Math.round(rebuilt)).toBe(Math.round(profit.amount));
    expect(Math.round(profit.amount)).toBe(Math.round(r.pnl.netProfit));
  });
  it("omite los pasos que valen cero", () => {
    const r = computeBudgetResult({ ...sample, ivaApplies: false, extraIncomes: [], venueBarSharePercent: 0, cardFeePercent: 0 });
    const keys = waterfallSteps(r).map((s) => s.key);
    expect(keys).not.toContain("iva");
    expect(keys).not.toContain("card");
    expect(keys).not.toContain("venue");
  });
});

describe("escenarios", () => {
  it("el 100% coincide con el resultado base y la utilidad crece con la ocupación", () => {
    const sc = buildScenarios(sample);
    const base = computeBudgetResult(sample);
    expect(sc.map((s) => s.label)).toEqual(["70%", "85%", "100%", "115%"]);
    expect(sc[2].netProfit).toBe(base.pnl.netProfit);
    for (let i = 1; i < sc.length; i++) expect(sc[i].netProfit).toBeGreaterThan(sc[i - 1].netProfit);
  });
  it("escala entradas y autos pero no los gastos fijos", () => {
    const s = scaleOccupancy(sample, 0.5);
    expect(s.revenueTiers[0].expectedQty).toBe(100);
    expect(s.extraIncomes![0].quantity).toBe(60);
    expect(s.expenseLines).toEqual(sample.expenseLines);
  });
  it("la curva de equilibrio parte en pérdida (gastos fijos) y sube", () => {
    const curve = profitCurve(sample);
    expect(curve[0].netProfit).toBeLessThan(0);
    expect(curve[curve.length - 1].netProfit).toBeGreaterThan(curve[0].netProfit);
  });
});

describe("sensibilidad", () => {
  it("viene ordenada por impacto y con pérdidas y ganancias del lado correcto", () => {
    const rows = buildSensitivity(sample);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const mag = (r: (typeof rows)[number]) => Math.max(Math.abs(r.worseProfit), Math.abs(r.betterProfit));
    for (let i = 1; i < rows.length; i++) expect(mag(rows[i - 1])).toBeGreaterThanOrEqual(mag(rows[i]));
    for (const r of rows) { expect(r.worseProfit).toBeLessThanOrEqual(0); expect(r.betterProfit).toBeGreaterThanOrEqual(0); }
  });
  it("no incluye barra ni local si no hay barra", () => {
    const ids = buildSensitivity({ ...sample, otherRevenuePerPerson: 0 }).map((r) => r.id);
    expect(ids).not.toContain("bar");
    expect(ids).not.toContain("venue");
  });
});

describe("recomendaciones", () => {
  const set = buildRecommendations(sample);

  it("todas suman utilidad y vienen de mayor a menor prioridad (ganancia por esfuerzo)", () => {
    expect(set.recommended.length).toBeGreaterThan(3);
    for (const r of [...set.recommended, ...set.withCare]) { expect(r.gainClp).toBeGreaterThan(0); expect(r.marginPtsGain).toBeGreaterThanOrEqual(0); }
    for (let i = 1; i < set.recommended.length; i++) expect(recommendationScore(set.recommended[i - 1])).toBeGreaterThanOrEqual(recommendationScore(set.recommended[i]));
  });

  it("lo que el invitado nota (staff, producción) nunca sale como riesgo ninguno y va aparte", () => {
    expect(set.recommended.every((r) => r.quality !== "medio")).toBe(true);
    const careful = set.withCare.map((r) => r.title);
    expect(careful.some((t) => t.includes("Staff"))).toBe(true);
    expect(set.withCare.every((r) => r.how.toLowerCase().includes("nunca recortar") || r.how.toLowerCase().includes("no recortar") || r.how.includes("nunca"))).toBe(true);
    expect(set.recommended.some((r) => r.area === "costos" && /Staff|DJ/.test(r.title))).toBe(false);
  });

  it("las 3 mejores juntas suben el margen", () => {
    expect(set.topThree).not.toBeNull();
    expect(set.topThree!.profitGain).toBeGreaterThan(0);
    expect(set.topThree!.marginAfter!).toBeGreaterThan(set.topThree!.marginBefore!);
    expect(set.topThree!.ids.length).toBeLessThanOrEqual(3);
    expect(set.topThree!.ids.filter((id) => id.startsWith("price-")).length).toBeLessThanOrEqual(1);
  });

  it("'pedir factura' solo aparece si el evento aplica IVA", () => {
    expect(set.recommended.some((r) => r.id === "invoice")).toBe(true);
    const noIva = buildRecommendations({ ...sample, ivaApplies: false });
    expect([...noIva.recommended, ...noIva.withCare].some((r) => r.id === "invoice")).toBe(false);
  });

  it("estacionamiento, barra y local solo si existen en la simulación", () => {
    const bare = buildRecommendations({ ...sample, extraIncomes: [], otherRevenuePerPerson: 0, venueBarSharePercent: 0 });
    const ids = [...bare.recommended, ...bare.withCare].map((r) => r.id);
    expect(ids).not.toContain("parking-price");
    expect(ids).not.toContain("bar-upsell");
    expect(ids).not.toContain("venue-share");
  });

  it("una simulación mínima no rompe nada", () => {
    const empty = buildRecommendations({ ...sample, revenueTiers: [], expenseLines: [], extraIncomes: [], otherRevenuePerPerson: 0 });
    expect(empty.recommended).toEqual([]);
    expect(empty.topThree).toBeNull();
  });
});

describe("comparación", () => {
  const cheap: BudgetSimulationInput = { ...sample, expenseLines: [{ category: "arriendo", label: "Local", amount: 1_000_000 }] };
  const dear: BudgetSimulationInput = { ...sample, expenseLines: [{ category: "arriendo", label: "Local", amount: 9_000_000 }] };

  it("gana la de mayor utilidad que cumple la meta", () => {
    const c = compareSimulations([{ id: 1, name: "Cara", input: dear }, { id: 2, name: "Barata", input: cheap }]);
    expect(c.sims[c.winnerIndex].name).toBe("Barata");
    expect(c.reasons[0]).toContain("«Barata»");
    expect(c.best.netProfit).toBe(1);
  });
  it("si ninguna cumple, gana la de mayor margen", () => {
    const awful = { ...sample, expenseLines: [{ category: "otros", label: "x", amount: 40_000_000 }] };
    const worse = { ...sample, expenseLines: [{ category: "otros", label: "x", amount: 60_000_000 }] };
    const c = compareSimulations([{ id: 1, name: "Peor", input: worse }, { id: 2, name: "Mala", input: awful }]);
    expect(c.sims[c.winnerIndex].name).toBe("Mala");
    expect(c.reasons[0]).toContain("Ninguna cumple");
  });
  it("explica si la diferencia es de ingresos o de costos", () => {
    const c = compareSimulations([{ id: 1, name: "A", input: dear }, { id: 2, name: "B", input: cheap }]);
    expect(c.reasons.join(" ")).toMatch(/costos/);
  });
});
