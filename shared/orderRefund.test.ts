import { describe, expect, it } from 'vitest';
import { DEFAULT_REFUND_PERCENT, isPastRefundDeadline, refundAmountForPercent, refundPercentForAmount, retainedAmount } from './orderRefund';

describe('orderRefund (reglas puras)', () => {
  it('el estándar es 50%', () => {
    expect(DEFAULT_REFUND_PERCENT).toBe(50);
    expect(refundAmountForPercent(20000, DEFAULT_REFUND_PERCENT)).toBe(10000);
  });

  it('redondea a pesos enteros y acota el porcentaje a 0-100', () => {
    expect(refundAmountForPercent(9999, 50)).toBe(5000);
    expect(refundAmountForPercent(10000, 150)).toBe(10000);
    expect(refundAmountForPercent(10000, -5)).toBe(0);
  });

  it('porcentaje a partir de un monto corregido a mano', () => {
    expect(refundPercentForAmount(20000, 10000)).toBe(50);
    expect(refundPercentForAmount(30000, 10000)).toBe(33.33);
    expect(refundPercentForAmount(0, 0)).toBe(0);
  });

  it('lo retenido nunca es negativo', () => {
    expect(retainedAmount(20000, 10000)).toBe(10000);
    expect(retainedAmount(20000, 25000)).toBe(0);
  });

  it('plazo: hasta 5 días antes se acepta, después no', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    expect(isPastRefundDeadline(new Date('2026-10-10T12:00:00Z'), now)).toBe(false);
    expect(isPastRefundDeadline(new Date('2026-10-06T12:00:00Z'), now)).toBe(false); // justo 5 días
    expect(isPastRefundDeadline(new Date('2026-10-06T11:59:00Z'), now)).toBe(true);
    expect(isPastRefundDeadline(new Date('2026-09-30T12:00:00Z'), now)).toBe(true); // ya pasó
  });
});
