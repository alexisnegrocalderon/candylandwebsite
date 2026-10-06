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

/** Cómo se cargó el monto de un gasto fijo: con el IVA ya adentro, o neto
 * ("+ IVA", se le suma 19% encima). */
export type ExpenseIvaMode = 'incluido' | 'mas_iva';

export interface BudgetExpenseLine {
  /** Un ExpenseCategory de shared/expenses.ts (mismo catálogo del gasto real). */
  category: string;
  label: string;
  /** Monto tal como se cargó: con IVA incluido, o NETO si `ivaMode` es 'mas_iva'. */
  amount: number;
  /** Ausente = 'incluido' (simulaciones guardadas antes de existir esta opción). */
  ivaMode?: ExpenseIvaMode;
}

/** Ingreso adicional que NO son entradas ni barra (ej. estacionamiento: 120
 * autos × $5.000). No suma personas al aforo: de ahí cuelgan el costo variable,
 * la barra estimada y el punto de equilibrio, y un auto no es una persona más. */
export interface ExtraIncomeLine {
  label: string;
  /** Precio por unidad, IVA incluido (igual que las entradas). */
  unitPrice: number;
  quantity: number;
  /** Lo que se le paga al local por cada unidad (ej. $3.000 por auto). */
  venueCostPerUnit?: number;
}

export function extraIncomeTotalFor(lines: ExtraIncomeLine[] | null | undefined): number {
  return (lines ?? []).reduce((sum, l) => sum + (l.unitPrice || 0) * (l.quantity || 0), 0);
}

export function extraVenueCostFor(lines: ExtraIncomeLine[] | null | undefined): number {
  return (lines ?? []).reduce((sum, l) => sum + (l.venueCostPerUnit || 0) * (l.quantity || 0), 0);
}

export interface BudgetSimulationInput {
  ivaApplies: boolean;
  marginTargetPercent: number;
  cardFeePercent: number;
  commissionPercent: number;
  variableCostPerPerson: number;
  otherRevenuePerPerson: number;
  /** % de la venta bruta de barra que se lleva el local (0-100). Ausente = 0.
   * Es un costo aparte, sin IVA encima, que se suma al arriendo fijo. */
  venueBarSharePercent?: number;
  /** Ausente o null = sin ingresos adicionales (simulaciones guardadas antes). */
  extraIncomes?: ExtraIncomeLine[] | null;
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
  /** Parte de la barra que se lleva el local, en pesos. */
  venueBarShare: number;
  /** Ingresos adicionales (estacionamiento, etc.), IVA incluido. Ya están en `grossIncome`. */
  extraIncomeTotal: number;
  /** Lo que se le paga al local por esos ingresos adicionales (ej. por auto). */
  extraVenueCost: number;
  /** Gastos fijos sumados CON IVA (lo que realmente se paga), a diferencia de
   * `pnl.directExpensesTotal`, que descuenta el IVA recuperable de las facturas. */
  fixedExpensesGross: number;
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

/** Monto con IVA y neto de una línea de gasto fijo. */
export function expenseLineAmounts(line: BudgetExpenseLine): { total: number; net: number; iva: number } {
  if (line.ivaMode === 'mas_iva') {
    const iva = Math.round(line.amount * 0.19);
    return { total: line.amount + iva, net: line.amount, iva };
  }
  return { total: line.amount, net: line.amount, iva: 0 };
}

function toPnlExpense(line: BudgetExpenseLine): PnlExpense {
  // "+ IVA" significa que el proveedor emite factura: el IVA es crédito fiscal
  // y, si el evento se declara, el gasto entra neto (ver expenseCostForPnl).
  // Una línea "IVA incluido" sigue siendo una estimación conservadora sin
  // documento: una simulación no tiene boleta/factura todavía, así que nunca
  // se le asume crédito fiscal salvo que se marque explícitamente "+ IVA".
  if (line.ivaMode === 'mas_iva') {
    const { total, net, iva } = expenseLineAmounts(line);
    return { amountTotal: total, netAmount: net, ivaAmount: iva, documentType: 'factura', category: line.category };
  }
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
  venueBarSharePercent: number;
  variableCostPerPerson: number;
  commissionPercent: number;
  cardFeePercent: number;
  ivaApplies: boolean;
  fixedExpensesTotal: number;
  /** Aporte neto de los ingresos adicionales (monto fijo, no por entrada). */
  extraNetContribution: number;
}): number | null {
  const {
    avgPrice, avgPersonasPorEntrada, otherRevenuePerPerson, venueBarSharePercent, variableCostPerPerson,
    commissionPercent, cardFeePercent, ivaApplies, extraNetContribution,
  } = params;
  // Los ingresos adicionales (estacionamiento) cubren parte de los gastos
  // fijos antes de que haga falta vender una sola entrada; nunca da negativo.
  const fixedExpensesTotal = Math.max(0, params.fixedExpensesTotal - extraNetContribution);
  if (avgPrice <= 0) return null;

  const revenuePerTicket = avgPrice + otherRevenuePerPerson * avgPersonasPorEntrada;
  // La parte del local sale de la barra de cada persona, así que también es
  // un costo por entrada, no solo un total.
  const venueShareCostPerTicket = otherRevenuePerPerson * avgPersonasPorEntrada * venueBarSharePercent / 100;
  const variableCostPerTicket = variableCostPerPerson * avgPersonasPorEntrada + venueShareCostPerTicket;
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
  const extraIncomeTotal = Math.round(extraIncomeTotalFor(input.extraIncomes));
  const extraVenueCost = Math.round(extraVenueCostFor(input.extraIncomes));
  // Entradas + barra: la base de la comisión de embajadores. Los ingresos
  // adicionales (estacionamiento) suman al ingreso bruto pero NO a esta base.
  const entriesAndBarIncome = ticketRevenue + otherRevenue;
  const grossIncome = entriesAndBarIncome + extraIncomeTotal;
  const variableCostTotal = Math.round(input.variableCostPerPerson * attendance);
  const venueBarSharePercent = Math.min(100, Math.max(0, input.venueBarSharePercent ?? 0));
  const venueBarShare = Math.round(otherRevenue * venueBarSharePercent / 100);
  const ambassadorCommissions = Math.round(entriesAndBarIncome * input.commissionPercent / 100);
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
    extraCostsTotal: venueBarShare + extraVenueCost,
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
    extraCostsTotal: venueBarShare + extraVenueCost,
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
    venueBarSharePercent,
    variableCostPerPerson: input.variableCostPerPerson,
    commissionPercent: input.commissionPercent,
    cardFeePercent: input.cardFeePercent,
    ivaApplies: input.ivaApplies,
    fixedExpensesTotal: pnl.directExpensesTotal,
    extraNetContribution: extraIncomeTotal * ((input.ivaApplies ? 100 / 119 : 1) - input.cardFeePercent / 100) - extraVenueCost,
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
    venueBarShare,
    extraIncomeTotal,
    extraVenueCost,
    fixedExpensesGross: input.expenseLines.reduce((sum, l) => sum + expenseLineAmounts(l).total, 0),
    pnl,
    maxDirectExpenses,
    breakevenTickets,
    avgTicketPrice,
    status,
  };
}
