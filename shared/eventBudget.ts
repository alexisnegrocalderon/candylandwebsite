/**
 * Simulador de presupuesto PRE-evento: "¿conviene hacer esta fiesta, y
 * cuánto podemos gastar sin perder el margen mínimo?". Corre con números
 * hipotéticos (todavía no existe el evento en el sistema), así que reusa la
 * cascada real de `computePnl` (shared/expenses.ts) para no duplicar la
 * matemática de plata, pero agrega dos cálculos que el P&L real nunca
 * necesitó -- ese parte siempre de ventas/gastos ya consumados:
 *
 * - `maxDirectExpenses`: el techo de gasto que todavía permite llegar a la
 *   meta de margen neto mínimo (`marginTargetPercent`) -- es el número
 *   detrás de la barra verde/amarilla/roja del admin.
 * - `breakevenTickets`: cuántas entradas hay que vender (al precio/aforo
 *   promedio de las tandas cargadas) para llegar a $0 de utilidad.
 *
 * Todo acá es puro (sin base de datos), mismo criterio que el resto de
 * `shared/`.
 */
import { computePnl, type PnlExpense, type PnlResult } from './expenses';

export interface RevenueTier {
  label: string;
  /** Precio de esa tanda, IVA incluido si el evento aplica IVA. */
  price: number;
  /** Cuántas entradas se espera vender a este precio. */
  expectedQty: number;
  /** Personas cubiertas por CADA entrada (1 = individual, 2 = Dúo, etc). */
  personasPorEntrada: number;
}

export interface BudgetExpenseLine {
  /** Un ExpenseCategory de shared/expenses.ts (mismo catálogo del gasto real). */
  category: string;
  label: string;
  amount: number;
}

export interface BudgetSimulationInput {
  ivaApplies: boolean;
  marginTargetPercent: number;
  cardFeePercent: number;
  commissionPercent: number;
  variableCostPerPerson: number;
  otherRevenuePerPerson: number;
  revenueTiers: RevenueTier[];
  expenseLines: BudgetExpenseLine[];
}

export interface BudgetResult {
  ticketsSold: number;
  attendance: number;
  ticketRevenue: number;
  otherRevenue: number;
  grossIncome: number;
  variableCostTotal: number;
  pnl: PnlResult;
  /** Techo de gasto fijo que todavía permite llegar a `marginTargetPercent`.
   * Puede dar negativo: significa que ni con $0 de gasto fijo se llega a la
   * meta (los costos variables + comisión + tarjeta ya se la comen sola). */
  maxDirectExpenses: number;
  /** null si no hay tandas cargadas o el margen por ticket es negativo
   * (nunca se llega a punto de equilibrio, venda lo que venda). */
  breakevenTickets: number | null;
  avgTicketPrice: number | null;
  status: 'ok' | 'warning' | 'danger';
}

function toPnlExpense(line: BudgetExpenseLine): PnlExpense {
  // Estimación conservadora a propósito: una simulación no tiene boleta/
  // factura todavía, así que nunca se le asume crédito fiscal (eso solo lo
  // da una factura real, ver givesCreditoFiscal en shared/expenses.ts).
  return {
    amountTotal: line.amount,
    netAmount: line.amount,
    ivaAmount: 0,
    documentType: 'sin_documento',
    category: line.category,
  };
}

export function attendanceForTiers(tiers: RevenueTier[]): number {
  return tiers.reduce((sum, t) => sum + t.expectedQty * (t.personasPorEntrada || 1), 0);
}

export function ticketsSoldForTiers(tiers: RevenueTier[]): number {
  return tiers.reduce((sum, t) => sum + t.expectedQty, 0);
}

export function ticketRevenueForTiers(tiers: RevenueTier[]): number {
  return tiers.reduce((sum, t) => sum + t.price * t.expectedQty, 0);
}

/** Cuántas entradas hacen falta vender (al precio/aforo promedio de las
 * tandas cargadas) para llegar a $0 de utilidad, dado un gasto fijo total.
 * Álgebra: netProfit(N) = N·[precioPromedio·(k − (comisión+tarjeta)/100) −
 * costoVariablePromedio] − gastoFijo, con k = 100/119 si aplica IVA (el
 * débito fiscal sale del ingreso) o 1 si no. Se despeja N y se redondea
 * hacia arriba -- no se puede vender media entrada. */
function computeBreakeven(params: {
  avgPrice: number;
  avgPersonasPorEntrada: number;
  otherRevenuePerPerson: number;
  variableCostPerPerson: number;
  commissionPercent: number;
  cardFeePercent: number;
  ivaApplies: boolean;
  fixedExpensesTotal: number;
}): number | null {
  const {
    avgPrice, avgPersonasPorEntrada, otherRevenuePerPerson, variableCostPerPerson,
    commissionPercent, cardFeePercent, ivaApplies, fixedExpensesTotal,
  } = params;
  if (avgPrice <= 0) return null;

  const revenuePerTicket = avgPrice + otherRevenuePerPerson * avgPersonasPorEntrada;
  const variableCostPerTicket = variableCostPerPerson * avgPersonasPorEntrada;
  const k = ivaApplies ? 100 / 119 : 1;
  const contributionMargin = revenuePerTicket * (k - (commissionPercent + cardFeePercent) / 100) - variableCostPerTicket;
  if (contributionMargin <= 0) return null;

  return Math.ceil(fixedExpensesTotal / contributionMargin);
}

export function computeBudgetResult(input: BudgetSimulationInput): BudgetResult {
  const attendance = attendanceForTiers(input.revenueTiers);
  const ticketsSold = ticketsSoldForTiers(input.revenueTiers);
  const ticketRevenue = ticketRevenueForTiers(input.revenueTiers);
  const otherRevenue = Math.round(input.otherRevenuePerPerson * attendance);
  const grossIncome = ticketRevenue + otherRevenue;
  const variableCostTotal = Math.round(input.variableCostPerPerson * attendance);
  const ambassadorCommissions = Math.round(grossIncome * input.commissionPercent / 100);
  const directExpenses = input.expenseLines.map(toPnlExpense);

  const pnl = computePnl({
    ivaApplies: input.ivaApplies,
    grossIncome,
    cogs: variableCostTotal,
    ambassadorCommissions,
    cardFeeBase: grossIncome,
    cardFeePercent: input.cardFeePercent,
    directExpenses,
    generalExpenses: [],
    prorationWeight: 1,
  });

  // Techo de gasto: mismo cálculo pero SIN los gastos fijos cargados, para
  // aislar cuánto margen queda disponible antes de que entre ningún gasto
  // fijo -- de ahí se despeja el máximo que se puede cargar.
  const pnlWithoutFixed = computePnl({
    ivaApplies: input.ivaApplies,
    grossIncome,
    cogs: variableCostTotal,
    ambassadorCommissions,
    cardFeeBase: grossIncome,
    cardFeePercent: input.cardFeePercent,
    directExpenses: [],
    generalExpenses: [],
    prorationWeight: 1,
  });
  const maxDirectExpenses = Math.round(
    pnlWithoutFixed.netProfit - pnlWithoutFixed.netIncome * input.marginTargetPercent / 100,
  );

  const avgTicketPrice = ticketsSold > 0 ? ticketRevenue / ticketsSold : null;
  const avgPersonasPorEntrada = ticketsSold > 0 ? attendance / ticketsSold : 1;
  const breakevenTickets = computeBreakeven({
    avgPrice: avgTicketPrice ?? 0,
    avgPersonasPorEntrada,
    otherRevenuePerPerson: input.otherRevenuePerPerson,
    variableCostPerPerson: input.variableCostPerPerson,
    commissionPercent: input.commissionPercent,
    cardFeePercent: input.cardFeePercent,
    ivaApplies: input.ivaApplies,
    fixedExpensesTotal: pnl.directExpensesTotal,
  });

  const status: BudgetResult['status'] =
    pnl.directExpensesTotal > maxDirectExpenses ? 'danger'
    : maxDirectExpenses > 0 && pnl.directExpensesTotal > maxDirectExpenses * 0.9 ? 'warning'
    : 'ok';

  return {
    ticketsSold,
    attendance,
    ticketRevenue,
    otherRevenue,
    grossIncome,
    variableCostTotal,
    pnl,
    maxDirectExpenses,
    breakevenTickets,
    avgTicketPrice,
    status,
  };
}
