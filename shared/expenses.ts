/**
 * Reglas de los gastos de la productora, compartidas entre cliente y servidor
 * (el servidor las necesita para congelar neto/IVA al guardar y para calcular
 * el resultado de cada evento; el cliente para mostrar en vivo "Neto $X ·
 * IVA $Y" mientras se carga la boleta).
 *
 * Toda la matemática de plata vive acá y no en la UI ni en db.ts: son las
 * reglas que hay que poder testear sin base de datos, igual que
 * shared/mission300.ts.
 */

/** IVA chileno. Los precios al público se manejan SIEMPRE con IVA incluido,
 * así que la tasa se usa para EXTRAER el impuesto de un monto bruto, no para
 * agregárselo. */
export const IVA_RATE = 0.19;

export type ExpenseScope = 'evento' | 'general';
export type ExpenseCategory =
  | 'decoracion' | 'barra' | 'merch' | 'staff' | 'produccion' | 'arriendo'
  | 'marketing' | 'transporte' | 'suscripciones' | 'comisiones' | 'otros';
export type ExpenseDocumentType = 'boleta' | 'factura' | 'boleta_honorarios' | 'sin_documento';
export type ExpensePaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; emoji: string }[] = [
  { value: 'produccion', label: 'Producción', emoji: '🎛️' },
  { value: 'barra', label: 'Barra', emoji: '🍸' },
  { value: 'staff', label: 'Staff', emoji: '🧑‍🤝‍🧑' },
  { value: 'decoracion', label: 'Decoración', emoji: '🎈' },
  { value: 'arriendo', label: 'Arriendo', emoji: '🏠' },
  { value: 'marketing', label: 'Marketing', emoji: '📣' },
  { value: 'transporte', label: 'Transporte', emoji: '🚚' },
  { value: 'merch', label: 'Merch', emoji: '👕' },
  { value: 'suscripciones', label: 'Apps y suscripciones', emoji: '🔁' },
  { value: 'comisiones', label: 'Comisiones', emoji: '🏦' },
  { value: 'otros', label: 'Otros', emoji: '📦' },
];

export const EXPENSE_DOCUMENT_TYPES: { value: ExpenseDocumentType; label: string; short: string }[] = [
  { value: 'boleta', label: 'Boleta', short: 'Boleta' },
  { value: 'factura', label: 'Factura (da crédito fiscal)', short: 'Factura' },
  { value: 'boleta_honorarios', label: 'Boleta de honorarios', short: 'Honorarios' },
  { value: 'sin_documento', label: 'Sin documento', short: 'Sin doc' },
];

export const EXPENSE_PAYMENT_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
];

export function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
export function documentTypeLabel(value: string): string {
  return EXPENSE_DOCUMENT_TYPES.find((d) => d.value === value)?.short ?? value;
}
export function paymentMethodLabel(value: string): string {
  return EXPENSE_PAYMENT_METHODS.find((p) => p.value === value)?.label ?? value;
}

/** IVA contenido en un monto que YA lo incluye: 19/119, no 19/100. Se redondea
 * porque el peso chileno no tiene decimales. */
export function ivaFromGross(gross: number): number {
  return Math.round((gross * 19) / 119);
}

/** Monto sin IVA. Se calcula restando el IVA ya redondeado (en vez de dividir
 * por 1,19 y redondear aparte) para que neto + IVA dé exactamente el bruto y
 * no se pierda un peso en el camino. */
export function netFromGross(gross: number): number {
  return gross - ivaFromGross(gross);
}

/** Regla del SII: solo la factura da crédito fiscal. La boleta de compra no,
 * la boleta de honorarios tampoco (no lleva IVA sino retención), y una factura
 * EXENTA tampoco aunque sea factura. Sin esta última distinción se inventaría
 * un crédito que el SII después rechaza. */
export function givesCreditoFiscal(e: { documentType: string; ivaExempt?: number | boolean | null }): boolean {
  return e.documentType === 'factura' && !e.ivaExempt;
}

/** Neto e IVA que se congelan en la fila al guardar. Se guardan (en vez de
 * recalcularse al leer) para que el historial no se reescriba si mañana cambia
 * la tasa, y para poder corregir a mano una factura donde el proveedor redondeó
 * distinto. */
export function deriveAmounts(input: {
  amountTotal: number;
  documentType: string;
  ivaExempt?: number | boolean | null;
}): { netAmount: number; ivaAmount: number } {
  if (!givesCreditoFiscal(input)) {
    return { netAmount: input.amountTotal, ivaAmount: 0 };
  }
  const ivaAmount = ivaFromGross(input.amountTotal);
  return { netAmount: input.amountTotal - ivaAmount, ivaAmount };
}

/** Cuánto pesa este gasto en el resultado del evento.
 *
 * Cuando el evento se declara al SII, el IVA de una factura NO es gasto: es un
 * activo que se recupera contra el débito, así que la factura entra NETA. El
 * IVA de una boleta sí es costo puro y entra completo -- que es exactamente la
 * razón por la que conviene pedir factura.
 *
 * Cuando el evento va "sin movimiento" no hay nada que recuperar y todo entra
 * bruto. */
export function expenseCostForPnl(
  expense: { amountTotal: number; netAmount: number; documentType: string; ivaExempt?: number | boolean | null },
  ivaApplies: boolean,
): number {
  if (ivaApplies && givesCreditoFiscal(expense)) return expense.netAmount;
  return expense.amountTotal;
}

/** Débito fiscal de las ventas: los precios de las entradas son IVA incluido,
 * así que el impuesto se extrae del bruto recaudado. */
export function debitoFiscalFromIncome(grossIncome: number): number {
  return ivaFromGross(grossIncome);
}

/* ─── Ingreso: cuánta plata entró de verdad ─────────────────── */

export type CollectedOrder = {
  total: string | number;
  missionTopupStatus?: string | null;
  missionTopupAmount?: string | number | null;
};

/** Plata EFECTIVAMENTE recaudada por un conjunto de órdenes.
 *
 * No es `subtotal` ni la suma de `unitPrice * quantity` (que ignora los
 * descuentos de orden y el recargo por servicio): es `total`, MÁS el copago de
 * Misión 300 cuando ya se pagó.
 *
 * Ese segundo pago hay que sumarlo a mano porque el abono y la diferencia son
 * dos pagos sobre la MISMA orden: al aprobarse el copago, server/webhooks.ts
 * solo marca `missionTopupStatus='paid'` y nunca toca `total`. Sin esto, una
 * orden de $10.000 de abono + $8.000 de diferencia figura como $10.000 y el
 * ingreso de cualquier evento con preventa queda corto.
 *
 * Los topup en 'pending' no se cuentan (plata que todavía no entró), y cuando
 * la meta se cumple webhooks.ts deja el monto en '0', así que tampoco hay
 * riesgo de contar de más. */
export function cashCollectedFromOrders(rows: CollectedOrder[]): number {
  let sum = 0;
  for (const o of rows) {
    sum += Number(o.total);
    if (o.missionTopupStatus === 'paid') sum += Number(o.missionTopupAmount ?? 0);
  }
  return sum;
}

/* ─── Prorrateo de los gastos generales ─────────────────────── */

/** Cuánto le toca a cada evento de los gastos de la empresa de ese mes.
 *
 * Se reparte según cuánto ingreso hizo cada uno: si una fiesta trajo el 70%
 * de la plata del mes, absorbe el 70% de los costos fijos. Dos bordes que
 * importan porque si no la plata se evapora del reporte:
 *  - Mes con eventos pero sin ventas (todos en 0): se reparte en partes
 *    iguales, porque dividir por cero no reparte nada.
 *  - Mes sin eventos: devuelve vacío, y quien llama debe mostrar esos gastos
 *    como "sin asignar" en vez de tirarlos.
 */
export function prorationWeights(
  incomes: { eventId: number; grossIncome: number }[],
): Map<number, number> {
  const weights = new Map<number, number>();
  if (incomes.length === 0) return weights;

  const total = incomes.reduce((s, e) => s + e.grossIncome, 0);
  if (total <= 0) {
    for (const e of incomes) weights.set(e.eventId, 1 / incomes.length);
    return weights;
  }
  for (const e of incomes) weights.set(e.eventId, e.grossIncome / total);
  return weights;
}

/* ─── Resultado de un evento ────────────────────────────────── */

export type PnlExpense = {
  amountTotal: number;
  netAmount: number;
  ivaAmount: number;
  documentType: string;
  ivaExempt?: number | boolean | null;
  category: string;
};

export type PnlInput = {
  ivaApplies: boolean;
  /** Plata efectivamente recaudada, IVA incluido. */
  grossIncome: number;
  /** Costo de la mercadería vendida, desde orderItems.unitCost. */
  cogs: number;
  /** Comisiones de embajadores devengadas por este evento. */
  ambassadorCommissions: number;
  /** Gastos imputados directamente a este evento. */
  directExpenses: PnlExpense[];
  /** Gastos generales prorrateables del mes (los del mes COMPLETO, no la
   * parte que le toca -- el peso se aplica acá adentro). */
  generalExpenses: PnlExpense[];
  /** Participación de este evento en los ingresos del mes (0..1). */
  prorationWeight: number;
};

export type PnlResult = {
  grossIncome: number;
  cogs: number;
  directExpensesTotal: number;
  directByCategory: { category: string; amount: number }[];
  generalExpensesMonthTotal: number;
  generalExpensesAssigned: number;
  prorationWeight: number;
  ambassadorCommissions: number;
  iva: { debitoFiscal: number; creditoFiscal: number; ivaAPagar: number; remanenteCredito: number };
  netIncome: number;
  netProfit: number;
  marginPercent: number | null;
};

/** Cascada completa del resultado de un evento.
 *
 * ⚠️ El error clásico acá es restar `ivaAPagar` del resultado. NO se resta: el
 * débito fiscal ya salió del ingreso (netIncome = bruto - débito) y el crédito
 * de las facturas ya salió de los gastos (entran netos). Volver a restarlo
 * cuenta el mismo impuesto dos veces. `ivaAPagar` se devuelve solo como dato
 * de caja: "esto hay que girárselo al SII".
 */
export function computePnl(input: PnlInput): PnlResult {
  const { ivaApplies, grossIncome, cogs, ambassadorCommissions, prorationWeight } = input;

  // Gastos directos, al costo que corresponde según si el evento declara.
  let directExpensesTotal = 0;
  const byCategory = new Map<string, number>();
  for (const e of input.directExpenses) {
    const cost = expenseCostForPnl(e, ivaApplies);
    directExpensesTotal += cost;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + cost);
  }

  // Gastos generales del mes: se suma el mes completo y recién al final se
  // aplica el peso, para no ir arrastrando redondeos gasto por gasto.
  let generalMonthTotal = 0;
  for (const e of input.generalExpenses) {
    generalMonthTotal += expenseCostForPnl(e, ivaApplies);
  }
  const generalAssigned = Math.round(generalMonthTotal * prorationWeight);

  // IVA: solo corre si el evento se declara.
  let debitoFiscal = 0;
  let creditoFiscal = 0;
  if (ivaApplies) {
    debitoFiscal = debitoFiscalFromIncome(grossIncome);
    const creditoDirecto = input.directExpenses
      .filter((e) => givesCreditoFiscal(e))
      .reduce((s, e) => s + e.ivaAmount, 0);
    const creditoGeneralMes = input.generalExpenses
      .filter((e) => givesCreditoFiscal(e))
      .reduce((s, e) => s + e.ivaAmount, 0);
    creditoFiscal = creditoDirecto + Math.round(creditoGeneralMes * prorationWeight);
  }
  const ivaAPagar = Math.max(0, debitoFiscal - creditoFiscal);
  const remanenteCredito = Math.max(0, creditoFiscal - debitoFiscal);

  const netIncome = ivaApplies ? grossIncome - debitoFiscal : grossIncome;
  const netProfit = netIncome - cogs - directExpensesTotal - generalAssigned - ambassadorCommissions;

  return {
    grossIncome,
    cogs,
    directExpensesTotal,
    directByCategory: Array.from(byCategory.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    generalExpensesMonthTotal: generalMonthTotal,
    generalExpensesAssigned: generalAssigned,
    prorationWeight,
    ambassadorCommissions,
    iva: { debitoFiscal, creditoFiscal, ivaAPagar, remanenteCredito },
    netIncome,
    netProfit,
    marginPercent: netIncome > 0 ? Math.round((netProfit / netIncome) * 1000) / 10 : null,
  };
}
