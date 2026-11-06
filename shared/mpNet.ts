/* «Llega a tu cuenta» de Ventas Web: del total cobrado en línea, lo que Mercado Pago se queda y lo que realmente llega.
 * Si Mercado Pago ya informó el pago (la sincronización guarda bruto, neto y comisión de cada cobro), se usa la comisión REAL;
 * si no, se estima con el porcentaje que Mercado Pago viene cobrando en los pagos ya conocidos (o el de Ajustes si hay muy
 * pocos). Lógica pura: la consulta vive en server/webNet.ts. */

export interface NetOrder {
  total: number | string;
  channel: string | null;
  paymentMethod: string | null;
  /** Id del pago en Mercado Pago (lo guarda el webhook al aprobar). */
  paymentId: string | null;
}

export interface WebNet {
  /** Total cobrado (el mismo «Ingresos Totales» de la pantalla). */
  gross: number;
  /** Lo que se queda Mercado Pago. */
  fee: number;
  /** Lo que llega a la cuenta. */
  net: number;
  /** Porcentaje efectivo sobre lo que pasó por Mercado Pago (0 si nada pasó por ahí). */
  feePercent: number;
  /** Cuántos pagos tienen la comisión real y cuántos se estimaron. */
  realCount: number;
  estimatedCount: number;
  /** De dónde sale el % que se usó para estimar. */
  estimateSource: 'real' | 'ajustes' | null;
  /** Cuánto de lo cobrado no pasó por Mercado Pago (invitaciones, transferencias, importadas): no paga comisión. */
  notMercadoPago: number;
}

/** Con menos pagos reales que esto, el % de lo que ya se conoce no es confiable y se usa el de Ajustes. */
export const MIN_REAL_FOR_PERCENT = 5;

/** ¿Pasó por el checkout de Mercado Pago? Mismo criterio de la comisión del P&L del evento (server/db.ts). */
export function paidThroughMercadoPago(o: Pick<NetOrder, 'channel' | 'paymentMethod'>): boolean {
  const isManual = (o.paymentMethod ?? '').startsWith('Manual') || o.paymentMethod === 'Prueba';
  return o.channel === 'web' && !isManual;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `realFees`: comisión real por id de pago de Mercado Pago. `configuredPercent`: el % de Ajustes (respaldo). */
export function computeWebNet(orders: NetOrder[], realFees: Map<string, number>, configuredPercent: number): WebNet {
  let gross = 0, notMercadoPago = 0, realFee = 0, realGross = 0, realCount = 0;
  const unknown: number[] = [];
  for (const o of orders) {
    const total = Number(o.total);
    if (!(total > 0)) continue;
    gross += total;
    if (!paidThroughMercadoPago(o)) { notMercadoPago += total; continue; }
    const real = o.paymentId ? realFees.get(String(o.paymentId)) : undefined;
    if (real !== undefined) { realFee += real; realGross += total; realCount++; } else unknown.push(total);
  }
  const useReal = realCount >= MIN_REAL_FOR_PERCENT && realGross > 0;
  const percent = useReal ? round2((realFee / realGross) * 100) : Math.max(0, configuredPercent);
  const estimatedFee = unknown.reduce((s, t) => s + Math.round((t * percent) / 100), 0);
  const fee = Math.round(realFee) + estimatedFee;
  const throughMp = realGross + unknown.reduce((s, t) => s + t, 0);
  return {
    gross: Math.round(gross), fee, net: Math.round(gross) - fee,
    feePercent: throughMp > 0 ? round2((fee / throughMp) * 100) : 0,
    realCount, estimatedCount: unknown.length,
    estimateSource: unknown.length === 0 ? null : useReal ? 'real' : 'ajustes',
    notMercadoPago: Math.round(notMercadoPago),
  };
}
