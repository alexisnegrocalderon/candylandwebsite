/**
 * Análisis de una simulación de evento para el informe (PDF/CSV): escenarios,
 * sensibilidad, curva de equilibrio, cascada de dinero, recomendaciones para
 * subir el margen y comparación entre simulaciones.
 *
 * Regla de oro: NADA se aproxima a mano. Cada número sale de volver a correr
 * `computeBudgetResult` con la entrada modificada, así el informe y la pantalla
 * nunca discrepan. Todo es puro (sin base de datos ni IA), para poder testearlo.
 */
import {
  computeBudgetResult, expenseLineAmounts,
  type BudgetExpenseLine, type BudgetResult, type BudgetSimulationInput, type ExtraIncomeLine, type RevenueTier,
} from './eventBudget';
import { categoryLabel, netFromGross } from './expenses';

export type Sim = BudgetSimulationInput;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`);
export { pct as formatPercent };

/* ─── Veredicto ────────────────────────────────────────────── */

export type VerdictKey = 'ok' | 'warning' | 'danger' | 'loss';
export type Verdict = { key: VerdictKey; label: string; short: string };

/** "Cumple la meta de margen", "Cerca del límite", "Bajo la meta" o "Pérdida". */
export function verdictFor(result: BudgetResult): Verdict {
  if (result.pnl.netProfit < 0) return { key: 'loss', label: 'La fiesta da pérdida', short: 'Pérdida' };
  if (result.status === 'danger') return { key: 'danger', label: 'Gana, pero bajo la meta de margen', short: 'Bajo la meta' };
  if (result.status === 'warning') return { key: 'warning', label: 'Cumple la meta, con poco margen de maniobra', short: 'Cerca del límite' };
  return { key: 'ok', label: 'Cumple la meta de margen', short: 'Dentro del margen' };
}

/* ─── Cascada: del ingreso a la utilidad ───────────────────── */

export type WaterfallStep = { key: string; label: string; amount: number; kind: 'income' | 'cost' | 'total' };

/** De cuánta plata entra a cuánta se queda, paso a paso. Cada paso de costo es
 * positivo (lo que se resta); la suma cierra exactamente en la utilidad. */
export function waterfallSteps(result: BudgetResult): WaterfallStep[] {
  const p = result.pnl;
  const steps: WaterfallStep[] = [{ key: 'gross', label: 'Ingreso bruto', amount: result.grossIncome, kind: 'income' }];
  const costs: [string, string, number][] = [
    ['iva', 'IVA de las ventas', p.iva.debitoFiscal],
    ['variable', 'Costo por persona', p.cogs],
    ['commissions', 'Comisión embajadores', p.ambassadorCommissions],
    ['card', 'Comisión de tarjeta', p.cardFeeAmount],
    ['venue', 'Parte del local', p.extraCostsTotal],
    ['fixed', 'Gastos fijos', p.directExpensesTotal],
  ];
  for (const [key, label, amount] of costs) if (Math.round(amount) > 0) steps.push({ key, label, amount, kind: 'cost' });
  steps.push({ key: 'profit', label: 'Utilidad', amount: p.netProfit, kind: 'total' });
  return steps;
}

/* ─── Escenarios de ocupación ──────────────────────────────── */

export const SCENARIO_OCCUPANCIES = [0.7, 0.85, 1, 1.15] as const;

/** Escala lo que depende de cuánta gente va: entradas y autos. La barra y el
 * costo por persona se recalculan solos desde el aforo; los gastos fijos no. */
export function scaleOccupancy(input: Sim, factor: number): Sim {
  const out = clone(input);
  out.revenueTiers = out.revenueTiers.map((t: RevenueTier) => ({ ...t, expectedQty: Math.round(t.expectedQty * factor) }));
  out.extraIncomes = (out.extraIncomes ?? []).map((l: ExtraIncomeLine) => ({ ...l, quantity: Math.round(l.quantity * factor) }));
  return out;
}

export type Scenario = {
  occupancy: number;
  label: string;
  attendance: number;
  ticketsSold: number;
  grossIncome: number;
  netProfit: number;
  marginPercent: number | null;
  verdict: Verdict;
};

export function buildScenarios(input: Sim, occupancies: readonly number[] = SCENARIO_OCCUPANCIES): Scenario[] {
  return occupancies.map((occupancy) => {
    const r = computeBudgetResult(scaleOccupancy(input, occupancy));
    return {
      occupancy,
      label: `${Math.round(occupancy * 100)}%`,
      attendance: r.attendance,
      ticketsSold: r.ticketsSold,
      grossIncome: r.grossIncome,
      netProfit: r.pnl.netProfit,
      marginPercent: r.pnl.marginPercent,
      verdict: verdictFor(r),
    };
  });
}

/** Curva utilidad vs. entradas vendidas (de 0 a 130 % del plan) para el
 * gráfico del punto de equilibrio. */
export function profitCurve(input: Sim, steps = 13): { ticketsSold: number; netProfit: number }[] {
  const points: { ticketsSold: number; netProfit: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const factor = (1.3 * i) / (steps - 1);
    const r = computeBudgetResult(scaleOccupancy(input, factor));
    points.push({ ticketsSold: r.ticketsSold, netProfit: r.pnl.netProfit });
  }
  return points;
}

/* ─── Sensibilidad ("qué mueve más el margen") ─────────────── */

export type SensitivityRow = {
  id: string;
  label: string;
  /** Qué se movió, en palabras ("±10%"). */
  change: string;
  /** Cambio en la utilidad si el factor empeora / mejora (negativo = pierde). */
  worseProfit: number;
  betterProfit: number;
};

export function buildSensitivity(input: Sim): SensitivityRow[] {
  const base = computeBudgetResult(input).pnl.netProfit;
  const profitOf = (s: Sim) => computeBudgetResult(s).pnl.netProfit - base;
  const rows: SensitivityRow[] = [];
  const add = (id: string, label: string, change: string, worse: Sim, better: Sim) => {
    const w = profitOf(worse), b = profitOf(better);
    if (Math.abs(w) < 1 && Math.abs(b) < 1) return;
    rows.push({ id, label, change, worseProfit: Math.min(w, b), betterProfit: Math.max(w, b) });
  };

  const prices = (f: number): Sim => { const o = clone(input); o.revenueTiers = o.revenueTiers.map((t: RevenueTier) => ({ ...t, price: t.price * f })); return o; };
  add('price', 'Precio de las entradas', '±10%', prices(0.9), prices(1.1));
  add('occupancy', 'Gente que asiste', '±10%', scaleOccupancy(input, 0.9), scaleOccupancy(input, 1.1));
  if (input.otherRevenuePerPerson > 0) {
    const bar = (f: number): Sim => ({ ...clone(input), otherRevenuePerPerson: input.otherRevenuePerPerson * f });
    add('bar', 'Venta de barra por persona', '±10%', bar(0.9), bar(1.1));
  }
  const fixed = (f: number): Sim => { const o = clone(input); o.expenseLines = o.expenseLines.map((l: BudgetExpenseLine) => ({ ...l, amount: l.amount * f })); return o; };
  add('fixed', 'Gastos fijos', '±10%', fixed(1.1), fixed(0.9));
  const share = input.venueBarSharePercent ?? 0;
  if (share > 0 && input.otherRevenuePerPerson > 0) {
    add('venue', 'Porcentaje de barra del local', '±2 puntos',
      { ...clone(input), venueBarSharePercent: Math.min(100, share + 2) },
      { ...clone(input), venueBarSharePercent: Math.max(0, share - 2) });
  }
  if (input.cardFeePercent > 0) {
    add('card', 'Comisión de tarjeta', '±1 punto',
      { ...clone(input), cardFeePercent: input.cardFeePercent + 1 },
      { ...clone(input), cardFeePercent: Math.max(0, input.cardFeePercent - 1) });
  }
  return rows.sort((a, b) => Math.max(Math.abs(b.worseProfit), Math.abs(b.betterProfit)) - Math.max(Math.abs(a.worseProfit), Math.abs(a.betterProfit)));
}

/* ─── Recomendaciones para subir el margen ─────────────────── */

export type RecommendationArea = 'ingresos' | 'barra' | 'costos' | 'impuestos';
/** Qué tanto puede notarlo el invitado. 'medio' = hay que negociar precio, nunca recortar el servicio. */
export type QualityRisk = 'ninguno' | 'bajo' | 'medio';
export type Effort = 'bajo' | 'medio' | 'alto';

export const AREA_LABEL: Record<RecommendationArea, string> = {
  ingresos: 'Ingresos', barra: 'Barra y consumo', costos: 'Costos y proveedores', impuestos: 'Impuestos y comisiones',
};

export type Recommendation = {
  id: string;
  area: RecommendationArea;
  title: string;
  /** Cómo hacerlo, en palabras simples. */
  how: string;
  /** Utilidad adicional estimada (re-simulada), en pesos. */
  gainClp: number;
  /** Puntos de margen que suma. */
  marginPtsGain: number;
  quality: QualityRisk;
  effort: Effort;
  /** El supuesto detrás de la cifra, para no prometer de más. */
  assumption: string;
};

/** Rubros que el invitado SÍ nota: no se recortan, solo se negocia el precio. */
const GUEST_FACING_CATEGORIES = new Set(['staff', 'produccion', 'decoracion']);

const PARKING = /estacion|parking|auto/i;

type Lever = { meta: Omit<Recommendation, 'gainClp' | 'marginPtsGain'>; apply: (s: Sim) => Sim };

function leversFor(input: Sim): Lever[] {
  const levers: Lever[] = [];
  const tiers = input.revenueTiers.filter((t) => t.price > 0 && t.expectedQty > 0);

  // — Ingresos —
  if (tiers.length > 0) {
    levers.push({
      meta: { id: 'price-all', area: 'ingresos', title: 'Subir 5% el precio de las entradas', quality: 'ninguno', effort: 'bajo',
        how: 'Ajusta cada tanda hacia arriba, redondeando a un precio limpio (por ejemplo, de $40.000 a $42.000).',
        assumption: 'Se asume que no baja la asistencia por el alza.' },
      apply: (s) => { const o = clone(s); o.revenueTiers = o.revenueTiers.map((t: RevenueTier) => ({ ...t, price: t.price * 1.05 })); return o; },
    });
    const topTiers = [...tiers].sort((a, b) => b.price * b.expectedQty - a.price * a.expectedQty).slice(0, 2);
    for (const tier of topTiers) {
      levers.push({
        meta: { id: `price-${tier.label}`, area: 'ingresos', title: `Subir 5% solo «${tier.label}»`, quality: 'ninguno', effort: 'bajo',
          how: `Es la entrada que más ingreso aporta; tocar solo esa deja el resto de los precios intactos.`,
          assumption: 'Se asume que no baja la asistencia por el alza.' },
        apply: (s) => { const o = clone(s); o.revenueTiers = o.revenueTiers.map((t: RevenueTier) => (t.label === tier.label ? { ...t, price: t.price * 1.05 } : t)); return o; },
      });
    }
    levers.push({
      meta: { id: 'occupancy', area: 'ingresos', title: 'Llenar 5 puntos más del aforo', quality: 'ninguno', effort: 'alto',
        how: 'Más difusión, embajadores y recordatorios a quienes dejaron su correo. Requiere esfuerzo de marketing.',
        assumption: 'No incluye gasto extra de publicidad: si lo hay, súmalo a los gastos fijos.' },
      apply: (s) => scaleOccupancy(s, 1.05),
    });
  }
  if ((input.extraIncomes ?? []).some((l) => PARKING.test(l.label) && l.quantity > 0)) {
    levers.push({
      meta: { id: 'parking-price', area: 'ingresos', title: 'Subir $500 el estacionamiento', quality: 'ninguno', effort: 'bajo',
        how: 'Un ajuste pequeño por auto; ofrece venta anticipada para asegurar los cupos.',
        assumption: 'Se asume la misma cantidad de autos.' },
      apply: (s) => { const o = clone(s); o.extraIncomes = (o.extraIncomes ?? []).map((l: ExtraIncomeLine) => (PARKING.test(l.label) ? { ...l, unitPrice: l.unitPrice + 500 } : l)); return o; },
    });
  }

  // — Barra —
  if (input.otherRevenuePerPerson > 0) {
    levers.push({
      meta: { id: 'bar-upsell', area: 'barra', title: 'Sumar $1.000 de consumo por persona', quality: 'ninguno', effort: 'medio',
        how: 'Combos de botella para grupos, preventa de tragos con la entrada, y un trago de la casa bien visible en la barra.',
        assumption: 'Se asume el mismo costo de mercadería por trago.' },
      apply: (s) => ({ ...clone(s), otherRevenuePerPerson: s.otherRevenuePerPerson + 1000 }),
    });
    if ((input.venueBarSharePercent ?? 0) >= 1) {
      levers.push({
        meta: { id: 'venue-share', area: 'barra', title: 'Negociar 1 punto menos de barra para el local', quality: 'ninguno', effort: 'medio',
          how: 'Proponer a cambio algo que al local le sirva: consumo mínimo, más horas de evento o difusión conjunta.',
          assumption: 'Depende de que el local acepte.' },
        apply: (s) => ({ ...clone(s), venueBarSharePercent: Math.max(0, (s.venueBarSharePercent ?? 0) - 1) }),
      });
    }
  }

  // — Costos y proveedores —
  const lines = input.expenseLines
    .map((l, i) => ({ l, i, total: expenseLineAmounts(l).total }))
    .filter((x) => x.l.amount > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  for (const { l, i } of lines) {
    const guestFacing = GUEST_FACING_CATEGORIES.has(l.category);
    levers.push({
      meta: {
        id: `cost-${i}`, area: 'costos', quality: guestFacing ? 'medio' : 'bajo', effort: 'medio',
        title: `Negociar 10% menos en «${l.label || categoryLabel(l.category)}»`,
        how: guestFacing
          ? 'Negociar el precio (por ejemplo, pidiendo cotizaciones o pago anticipado), nunca recortar el servicio: este rubro lo nota el invitado.'
          : 'Pedir una segunda cotización o cerrar el precio con antelación; no cambia lo que vive el invitado.',
        assumption: 'Depende de que el proveedor acepte; el servicio queda igual.',
      },
      apply: (s) => { const o = clone(s); o.expenseLines = o.expenseLines.map((x: BudgetExpenseLine, idx: number) => (idx === i ? { ...x, amount: x.amount * 0.9 } : x)); return o; },
    });
  }

  // — Impuestos y comisiones —
  if (input.ivaApplies && input.expenseLines.some((l) => l.ivaMode !== 'mas_iva' && l.amount > 0)) {
    levers.push({
      meta: { id: 'invoice', area: 'impuestos', title: 'Pedir factura en los gastos con IVA incluido', quality: 'ninguno', effort: 'bajo',
        how: 'Con factura, el IVA de cada gasto se recupera contra el IVA de las ventas; con boleta o sin documento, se pierde.',
        assumption: 'Se asume que todos los proveedores pueden emitir factura.' },
      apply: (s) => {
        const o = clone(s);
        o.expenseLines = o.expenseLines.map((l: BudgetExpenseLine) => (l.ivaMode === 'mas_iva' || l.amount <= 0 ? l : { ...l, ivaMode: 'mas_iva', amount: netFromGross(l.amount) }));
        return o;
      },
    });
  }
  if (input.cardFeePercent > 0) {
    levers.push({
      meta: { id: 'card-mix', area: 'impuestos', title: 'Pasar 30% de las ventas a transferencia o efectivo', quality: 'ninguno', effort: 'medio',
        how: 'Ofrecer un pequeño beneficio por pagar con transferencia, y priorizar efectivo y transferencia en la puerta.',
        assumption: 'El 30% de las ventas deja de pagar comisión de tarjeta.' },
      apply: (s) => ({ ...clone(s), cardFeePercent: s.cardFeePercent * 0.7 }),
    });
  }
  return levers;
}

const EFFORT_WEIGHT: Record<Effort, number> = { bajo: 1, medio: 1.5, alto: 2.5 };

/** Prioridad: cuánto suma por unidad de esfuerzo. Así lo fácil y rentable va
 * antes que algo que suma lo mismo pero cuesta mucho más conseguir. */
export function recommendationScore(r: Pick<Recommendation, 'gainClp' | 'effort'>): number {
  return r.gainClp / EFFORT_WEIGHT[r.effort];
}

export type RecommendationSet = {
  /** Sin riesgo para la calidad (o bajo), de mayor a menor prioridad (ganancia por esfuerzo). */
  recommended: Recommendation[];
  /** Riesgo medio: solo negociando precio, jamás recortando. */
  withCare: Recommendation[];
  /** Qué pasa si se aplican juntas las 3 mejores. */
  topThree: { ids: string[]; profitGain: number; marginBefore: number | null; marginAfter: number | null } | null;
};

export function buildRecommendations(input: Sim): RecommendationSet {
  const base = computeBudgetResult(input);
  const levers = leversFor(input);
  const evaluated = levers.map((lv) => {
    const after = computeBudgetResult(lv.apply(clone(input)));
    return {
      lever: lv,
      rec: {
        ...lv.meta,
        gainClp: Math.round(after.pnl.netProfit - base.pnl.netProfit),
        marginPtsGain: Math.round(((after.pnl.marginPercent ?? 0) - (base.pnl.marginPercent ?? 0)) * 10) / 10,
      } as Recommendation,
    };
  }).filter((x) => x.rec.gainClp > 0);

  const bySize = (a: { rec: Recommendation }, b: { rec: Recommendation }) => recommendationScore(b.rec) - recommendationScore(a.rec);
  const recommendedAll = evaluated.filter((x) => x.rec.quality !== 'medio').sort(bySize);
  // El mismo tipo de palanca de precio no debe copar toda la lista.
  const recommended: typeof recommendedAll = [];
  let priceCount = 0;
  for (const x of recommendedAll) {
    if (x.rec.id.startsWith('price-')) { if (priceCount >= 2) continue; priceCount++; }
    recommended.push(x);
  }
  const withCare = evaluated.filter((x) => x.rec.quality === 'medio').sort(bySize);

  // Las 3 mejores y distintas (no "todas las entradas" junto con "solo una entrada").
  const picked: Lever[] = [];
  for (const x of recommended) {
    if (picked.length >= 3) break;
    if (x.rec.id.startsWith('price-') && picked.some((p) => p.meta.id.startsWith('price-'))) continue;
    picked.push(x.lever);
  }
  let topThree: RecommendationSet['topThree'] = null;
  if (picked.length > 0) {
    const combined = computeBudgetResult(picked.reduce((s, lv) => lv.apply(s), clone(input)));
    topThree = {
      ids: picked.map((p) => p.meta.id),
      profitGain: Math.round(combined.pnl.netProfit - base.pnl.netProfit),
      marginBefore: base.pnl.marginPercent,
      marginAfter: combined.pnl.marginPercent,
    };
  }
  return { recommended: recommended.map((x) => x.rec), withCare: withCare.map((x) => x.rec), topThree };
}

/* ─── Comparación entre simulaciones ───────────────────────── */

export type ComparedSim = { id: number; name: string; input: Sim; result: BudgetResult; verdict: Verdict };

export function compareSimulations(items: { id: number; name: string; input: Sim }[]): {
  sims: ComparedSim[];
  winnerIndex: number;
  /** Por qué ganó, en frases simples (con las cifras ya calculadas). */
  reasons: string[];
  /** Qué fila de cada métrica es la mejor (índice), para marcarla en la tabla. */
  best: { grossIncome: number; netProfit: number; marginPercent: number; maxDirectExpenses: number; breakevenTickets: number | null };
} {
  const sims: ComparedSim[] = items.map((it) => {
    const result = computeBudgetResult(it.input);
    return { ...it, result, verdict: verdictFor(result) };
  });
  const argMax = (f: (s: ComparedSim) => number) => sims.reduce((best, s, i) => (f(s) > f(sims[best]) ? i : best), 0);
  const meetsTarget = sims.map((s) => s.result.pnl.netProfit > 0 && s.result.status !== 'danger');
  const candidates = sims.map((_, i) => i).filter((i) => meetsTarget[i]);
  const winnerIndex = candidates.length > 0
    ? candidates.reduce((best, i) => (sims[i].result.pnl.netProfit > sims[best].result.pnl.netProfit ? i : best), candidates[0])
    : argMax((s) => s.result.pnl.marginPercent ?? -Infinity);

  const w = sims[winnerIndex];
  const reasons: string[] = [];
  if (candidates.length > 0) {
    reasons.push(candidates.length === sims.length
      ? `Todas cumplen la meta de margen; «${w.name}» deja la mayor utilidad: ${clp(w.result.pnl.netProfit)}.`
      : `Solo ${candidates.length === 1 ? 'esta opción cumple' : 'algunas cumplen'} la meta de margen, y «${w.name}» deja la mayor utilidad: ${clp(w.result.pnl.netProfit)}.`);
  } else {
    reasons.push(`Ninguna cumple la meta de margen; «${w.name}» es la que más se acerca, con ${pct(w.result.pnl.marginPercent)} de margen.`);
  }
  if (sims.length > 1) {
    const others = sims.filter((_, i) => i !== winnerIndex);
    const runnerUp = others.reduce((best, s) => (s.result.pnl.netProfit > best.result.pnl.netProfit ? s : best), others[0]);
    const totalCosts = (s: ComparedSim) => s.result.pnl.netIncome - s.result.pnl.netProfit;
    const incomeDiff = Math.round(w.result.pnl.netIncome - runnerUp.result.pnl.netIncome);
    const costDiff = Math.round(totalCosts(w) - totalCosts(runnerUp));
    reasons.push(`Frente a «${runnerUp.name}»: ingresa ${clp(Math.abs(incomeDiff))} ${incomeDiff >= 0 ? 'más' : 'menos'} (sin IVA) y gasta ${clp(Math.abs(costDiff))} ${costDiff >= 0 ? 'más' : 'menos'}.`);
    if (Math.abs(incomeDiff) >= Math.abs(costDiff)) reasons.push('La diferencia la explican sobre todo los ingresos.');
    else reasons.push('La diferencia la explican sobre todo los costos.');
  }
  const be = sims.map((s) => s.result.breakevenTickets);
  const beValid = be.filter((v): v is number => v != null);
  return {
    sims, winnerIndex, reasons,
    best: {
      grossIncome: argMax((s) => s.result.grossIncome),
      netProfit: argMax((s) => s.result.pnl.netProfit),
      marginPercent: argMax((s) => s.result.pnl.marginPercent ?? -Infinity),
      maxDirectExpenses: argMax((s) => s.result.maxDirectExpenses),
      breakevenTickets: beValid.length ? be.indexOf(Math.min(...beValid)) : null,
    },
  };
}

/** Ordena los gastos para el informe: más grandes primero, con su etiqueta. */
export function expenseBreakdown(result: BudgetResult): { label: string; amount: number }[] {
  return result.pnl.directByCategory.map((c) => ({ label: categoryLabel(c.category), amount: c.amount })).filter((c) => c.amount > 0);
}

