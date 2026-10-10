/**
 * Boleta de honorarios (Chile): quien paga RETIENE un % y se lo entrega al SII;
 * la persona recibe el líquido. Todo se calcula acá, en un solo lugar, para que
 * el servidor, la pantalla y los informes den siempre el mismo número.
 *
 * Dos formas de pactar el monto:
 *  - `liquido`: la persona recibe EXACTO lo pactado. La boleta sale más alta
 *    (bruto = líquido ÷ (1 − tasa)) y la empresa asume la retención.
 *  - `bruto`: el monto es el de la boleta. A la persona se le descuenta la
 *    retención y recibe menos.
 * En ambos casos lo que le cuesta a la empresa es el BRUTO de la boleta.
 */

export type StaffPaymentType = 'transferencia' | 'boleta_honorarios';
export type StaffAmountMode = 'liquido' | 'bruto';

/** Tasa de retención por año (ley 21.133, gradual). Antes de 2020 era 10 %;
 * desde 2028 queda en 17 %. */
export const HONORARIOS_RETENTION_BY_YEAR: Record<number, number> = {
  2020: 10, 2021: 11.5, 2022: 12.25, 2023: 13, 2024: 13.75, 2025: 14.5, 2026: 15.25, 2027: 16, 2028: 17,
};

export function retentionRateForYear(year: number): number {
  if (!Number.isFinite(year) || year <= 2020) return HONORARIOS_RETENTION_BY_YEAR[2020];
  if (year >= 2028) return HONORARIOS_RETENTION_BY_YEAR[2028];
  return HONORARIOS_RETENTION_BY_YEAR[Math.floor(year)];
}

export type StaffPayBreakdown = {
  paymentType: StaffPaymentType;
  amountMode: StaffAmountMode;
  /** Tasa aplicada (0 si es transferencia). */
  ratePercent: number;
  /** Monto de la boleta (o lo transferido, si no hay boleta). */
  gross: number;
  /** Lo que se le entrega al SII. */
  retention: number;
  /** Lo que recibe la persona. */
  net: number;
  /** Lo que le cuesta a la empresa. */
  cost: number;
};

export function honorariosBreakdown(p: {
  amount: number;
  paymentType: StaffPaymentType;
  amountMode: StaffAmountMode;
  year: number;
}): StaffPayBreakdown {
  const amount = Math.max(0, Math.round(Number(p.amount) || 0));
  if (p.paymentType !== 'boleta_honorarios') {
    return { paymentType: 'transferencia', amountMode: p.amountMode, ratePercent: 0, gross: amount, retention: 0, net: amount, cost: amount };
  }
  const rate = retentionRateForYear(p.year);
  if (p.amountMode === 'bruto') {
    const retention = Math.round((amount * rate) / 100);
    return { paymentType: p.paymentType, amountMode: 'bruto', ratePercent: rate, gross: amount, retention, net: amount - retention, cost: amount };
  }
  const gross = Math.round(amount / (1 - rate / 100));
  return { paymentType: p.paymentType, amountMode: 'liquido', ratePercent: rate, gross, retention: gross - amount, net: amount, cost: gross };
}

/** Suma de varios turnos (totales del staff de un evento). */
export function sumBreakdowns(items: StaffPayBreakdown[]) {
  return items.reduce(
    (t, b) => ({ gross: t.gross + b.gross, retention: t.retention + b.retention, net: t.net + b.net, cost: t.cost + b.cost }),
    { gross: 0, retention: 0, net: 0, cost: 0 },
  );
}

/** Totales de un conjunto de turnos de UN evento (el año define la tasa). */
export function staffTotals(
  shifts: { amountClp: number | string; paymentType?: string | null; amountMode?: string | null }[],
  year: number,
) {
  const items = shifts.map((s) => honorariosBreakdown({
    amount: Number(s.amountClp),
    paymentType: s.paymentType === 'boleta_honorarios' ? 'boleta_honorarios' : 'transferencia',
    amountMode: s.amountMode === 'bruto' ? 'bruto' : 'liquido',
    year,
  }));
  return { items, ...sumBreakdowns(items) };
}
