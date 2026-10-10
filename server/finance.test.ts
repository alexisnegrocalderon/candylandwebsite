import { describe, expect, it } from "vitest";
import { sample } from "../shared/budgetSample.fixture";
import { computeBudgetResult } from "../shared/eventBudget";
import { buildRecommendations, buildScenarios, buildSensitivity, profitCurve, verdictFor } from "../shared/budgetInsights";
import { buildSingleReportPdf } from "./budgetReport/pdf";
import { realToSimulationInput } from "./finance";

const fakePnl: any = {
  ivaApplies: true, grossIncome: 1_000_000, cogs: 100_000, ambassadorCommissions: 20_000,
};

describe("realToSimulationInput", () => {
  it("traduce el evento real: personas, barra y costos por persona", () => {
    const input = realToSimulationInput({
      pnl: fakePnl, cardFeePercent: 3.5,
      tiers: [{ label: "General", price: 10000, qty: 60, personas: 1 }, { label: "Dúo", price: 18000, qty: 20, personas: 2 }],
      extraIncomes: [{ label: "Estacionamiento", unitPrice: 5000, quantity: 10, venueCostPerUnit: 3000 }],
      expenseLines: [{ category: "produccion", label: "DJ", amount: 200000 }],
    });
    // 60 + 20*2 = 100 personas; entradas = 600k + 360k = 960k; extras 50k → barra 0
    expect(input.revenueTiers.reduce((s, t) => s + t.expectedQty * t.personasPorEntrada, 0)).toBe(100);
    expect(input.variableCostPerPerson).toBe(1000);
    expect(input.otherRevenuePerPerson).toBe(0);
    expect(input.expenseLines[0].ivaMode).toBe("incluido");
    expect(() => computeBudgetResult(input)).not.toThrow();
  });
});

describe("informe real en PDF", () => {
  it("genera el PDF con la portada de informe real", async () => {
    const result = computeBudgetResult(sample);
    const pdf = await buildSingleReportPdf({
      name: "2do Aniversario", eventTitle: "2do Aniversario", real: true, input: sample, result, verdict: verdictFor(result),
      scenarios: buildScenarios(sample), sensitivity: buildSensitivity(sample), curve: profitCurve(sample),
      recommendations: buildRecommendations(sample),
      narrative: { headline: "Resumen", summary: "Texto de prueba.", recNotes: {}, source: "plantilla" },
      emittedAt: new Date(),
    }, "completa");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
  }, 60000);
});
