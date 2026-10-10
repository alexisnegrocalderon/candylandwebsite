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

import { vi } from "vitest";
vi.mock("./db", () => ({
  getEventPnl: vi.fn(), getDb: vi.fn(), getEventById: vi.fn(), listShiftClosings: vi.fn(), getParkingReport: vi.fn(), getSiteSettings: vi.fn().mockResolvedValue({}),
}));
import * as dbm from "./db";
import { getEventLive } from "./finance";

describe("getEventLive", () => {
  it("agrupa por minuto, ignora lo pagado con saldo y avisa de pérdida y caja descuadrada", async () => {
    const now = new Date("2026-10-30T23:30:30Z");
    const at = (m: number) => new Date(now.getTime() - m * 60_000);
    const sales = [
      { id: 1, total: "10000", channel: "web", paymentMethod: null, createdAt: at(2), buyerName: "A" },
      { id: 2, total: "5000", channel: "caja", paymentMethod: "efectivo", createdAt: at(2), buyerName: null },
      { id: 3, total: "8000", channel: "caja", paymentMethod: "saldo", createdAt: at(1), buyerName: null },
    ];
    const chain = (rows: any[]) => ({ from: () => ({ where: () => Promise.resolve(rows), innerJoin: () => ({ where: () => Promise.resolve([]) }) }) });
    vi.mocked(dbm.getDb).mockResolvedValue({ select: () => chain(sales) } as any);
    vi.mocked(dbm.getEventPnl).mockResolvedValue({ grossIncome: 15000, netProfit: -2000, marginPercent: -13, warnings: [] } as any);
    vi.mocked(dbm.getEventById).mockResolvedValue({ eventDate: new Date(now.getTime() - 60 * 60_000) } as any);
    vi.mocked(dbm.listShiftClosings).mockResolvedValue([{ registerName: "Caja 1", operatorName: "Ana", countedCash: 100, countedDebit: 0, countedCredit: 0, countedQr: 0, expectedCash: 150, expectedDebit: 0, expectedCredit: 0, expectedQr: 0, openingCash: 0 }] as any);
    const live = await getEventLive(1, 30, now);
    expect(live!.totals.sales).toBe(2);
    expect(live!.pace.last5).toBe(15000);
    expect(live!.perMinute).toHaveLength(30);
    expect(live!.perMinute.reduce((s, m) => s + m.amount, 0)).toBe(15000);
    expect(live!.alerts.map((a) => a.level)).toContain("danger");
    expect(live!.alerts.some((a) => a.text.includes("Caja descuadrada"))).toBe(true);
  });
});
