/**
 * Arma los datos de un informe (motor de cifras + redacción) y entrega PDF/CSV.
 * Todas las cifras salen de `shared/budgetInsights.ts`; la IA solo redacta.
 */
import type { BudgetSimulationInput } from "../../shared/eventBudget";
import {
  buildRecommendations, buildScenarios, buildSensitivity, compareSimulations, profitCurve, verdictFor,
} from "../../shared/budgetInsights";
import { computeBudgetResult } from "../../shared/eventBudget";
import { writeNarrative } from "./narrative";
import { buildComparisonPdf, buildSingleReportPdf, type ReportVersion } from "./pdf";
import { buildComparisonCsv, buildSimulationCsv } from "./csv";

export type SimRow = { id: number; name: string; input: BudgetSimulationInput; eventTitle?: string | null };

export async function singlePdf(sim: SimRow, version: ReportVersion): Promise<Buffer> {
  const result = computeBudgetResult(sim.input);
  const verdict = verdictFor(result);
  const recommendations = buildRecommendations(sim.input);
  // La versión externa no lleva recomendaciones ni texto interno: no gastamos IA.
  const narrative = await writeNarrative({ name: sim.name, result, marginTarget: sim.input.marginTargetPercent, verdict, recommendations }, version === "externa" ? 1 : undefined);
  return buildSingleReportPdf({
    name: sim.name, eventTitle: sim.eventTitle, input: sim.input, result, verdict,
    scenarios: buildScenarios(sim.input), sensitivity: buildSensitivity(sim.input), curve: profitCurve(sim.input),
    recommendations, narrative, emittedAt: new Date(),
  }, version);
}

export async function comparisonPdf(sims: SimRow[], version: Exclude<ReportVersion, "externa">): Promise<Buffer> {
  const cmp = compareSimulations(sims.map(({ id, name, input }) => ({ id, name, input })));
  const w = cmp.sims[cmp.winnerIndex];
  const recommendations = buildRecommendations(w.input);
  const winnerNarrative = await writeNarrative({ name: w.name, result: w.result, marginTarget: w.input.marginTargetPercent, verdict: w.verdict, recommendations });
  return buildComparisonPdf({
    sims: cmp.sims.map((s) => ({ ...s, scenarios: buildScenarios(s.input) })),
    winnerIndex: cmp.winnerIndex, reasons: cmp.reasons, best: cmp.best,
    winnerRecommendations: recommendations, winnerNarrative, emittedAt: new Date(),
  }, version);
}

const BOM = "﻿";
export const singleCsv = (sim: SimRow) => BOM + buildSimulationCsv(sim.name, sim.input);
export const comparisonCsv = (sims: SimRow[]) => BOM + buildComparisonCsv(sims.map(({ id, name, input }) => ({ id, name, input })));

/* ─── Carga desde la base ─── */
import * as eventBudget from "../eventBudget";
import * as db from "../db";

type SimDbRow = NonNullable<Awaited<ReturnType<typeof eventBudget.getSimulation>>>;

export function rowToInput(r: SimDbRow): BudgetSimulationInput {
  return {
    ivaApplies: !!r.ivaApplies,
    onlineSalesNoIva: !!r.ivaApplies && !!r.onlineSalesNoIva,
    marginTargetPercent: Number(r.marginTargetPercent),
    cardFeePercent: Number(r.cardFeePercent),
    commissionPercent: Number(r.commissionPercent),
    variableCostPerPerson: Number(r.variableCostPerPerson),
    otherRevenuePerPerson: Number(r.otherRevenuePerPerson),
    venueBarSharePercent: Number(r.venueBarSharePercent),
    extraIncomes: (r.extraIncomes as BudgetSimulationInput["extraIncomes"]) ?? [],
    revenueTiers: r.revenueTiers as BudgetSimulationInput["revenueTiers"],
    expenseLines: r.expenseLines as BudgetSimulationInput["expenseLines"],
  };
}

export async function loadSims(ids: number[]): Promise<SimRow[]> {
  const out: SimRow[] = [];
  for (const id of ids) {
    const row = await eventBudget.getSimulation(id);
    if (!row) throw new Error(`Simulación #${id} no existe`);
    const ev = row.eventId ? await db.getEventById(row.eventId) : null;
    out.push({ id: row.id, name: row.name, input: rowToInput(row), eventTitle: ev?.title ?? null });
  }
  return out;
}

export const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "simulacion";

/* ─── Informe REAL de un evento (mismos gráficos, datos reales) ─── */
import { getEventFinanceReport } from "../finance";

export async function realEventPdf(eventId: number): Promise<{ pdf: Buffer; title: string } | null> {
  const rep = await getEventFinanceReport(eventId);
  if (!rep) return null;
  const narrative = await writeNarrative({ name: rep.eventTitle, result: rep.result, marginTarget: rep.input.marginTargetPercent, verdict: rep.verdict, recommendations: rep.recommendations });
  const pdf = await buildSingleReportPdf({
    name: rep.eventTitle, eventTitle: rep.eventTitle, real: true, input: rep.input, result: rep.result, verdict: rep.verdict,
    scenarios: rep.scenarios, sensitivity: rep.sensitivity, curve: rep.curve, recommendations: rep.recommendations, narrative, emittedAt: new Date(),
  }, "completa");
  return { pdf, title: rep.eventTitle };
}
