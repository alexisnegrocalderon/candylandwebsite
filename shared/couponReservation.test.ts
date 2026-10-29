import { describe, expect, it } from 'vitest';
import { COUPON_RESERVATION_MS, reservedCouponUses } from './couponReservation';
import { appBonusOpen, normalizeAppBonus, normalizeMemberConfig } from './memberConfig';

const NOW = new Date('2026-10-30T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('reserva de un cupón de un solo uso', () => {
  it('una orden aprobada lo gasta, siempre', () => {
    expect(reservedCouponUses([{ paymentStatus: 'approved', createdAt: ago(5 * 86_400_000) }], NOW)).toBe(1);
  });
  it('una pendiente reciente lo reserva; una pendiente vieja lo libera', () => {
    expect(reservedCouponUses([{ paymentStatus: 'pending', createdAt: ago(5 * 60_000) }], NOW)).toBe(1);
    expect(reservedCouponUses([{ paymentStatus: 'pending', createdAt: ago(COUPON_RESERVATION_MS + 1) }], NOW)).toBe(0);
  });
  it('rechazada o reembolsada no lo gastan', () => {
    expect(reservedCouponUses([{ paymentStatus: 'rejected', createdAt: ago(1000) }, { paymentStatus: 'refunded', createdAt: ago(1000) }], NOW)).toBe(0);
  });
});

describe('bono por instalar la app', () => {
  it('arranca apagado y no se puede reclamar', () => {
    const c = normalizeMemberConfig({});
    expect(c.appBonus).toEqual({ enabled: false, amountClp: 10000, eventId: null, validUntil: null });
    expect(appBonusOpen(c.appBonus, NOW)).toBe(false);
  });
  it('se puede reclamar prendido, con fiesta y antes de la hora límite', () => {
    const b = normalizeAppBonus({ enabled: true, amountClp: 10000, eventId: 7, validUntil: '2026-10-31T02:59:00Z' });
    expect(appBonusOpen(b, NOW)).toBe(true);
    expect(appBonusOpen(b, new Date('2026-10-31T03:00:00Z'))).toBe(false);
  });
  it('sin fiesta o sin hora límite no abre; los valores raros se corrigen', () => {
    expect(appBonusOpen(normalizeAppBonus({ enabled: true, validUntil: '2026-10-31T02:59:00Z' }), NOW)).toBe(false);
    expect(appBonusOpen(normalizeAppBonus({ enabled: true, eventId: 7 }), NOW)).toBe(false);
    expect(normalizeAppBonus({ enabled: 'yes', amountClp: 5, eventId: -2, validUntil: 'xx' })).toEqual({ enabled: false, amountClp: 10000, eventId: null, validUntil: null });
  });
});
