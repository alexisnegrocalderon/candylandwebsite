import { describe, expect, it } from 'vitest';
import { couponStatus, isMemberEarlyAccess, normalizeMemberConfig } from './memberConfig';

describe('memberConfig', () => {
  it('arranca todo apagado y acota los valores', () => {
    const c = normalizeMemberConfig(null);
    expect([c.welcome.enabled, c.birthday.enabled, c.recurrente.enabled, c.vip.enabled]).toEqual([false, false, false, false]);
    expect(c.pushOnGrant).toBe(true);
    expect(normalizeMemberConfig({ welcome: { enabled: true, percent: 999, days: 1 } }).welcome).toEqual({ enabled: true, percent: 10, days: 30 });
    expect(normalizeMemberConfig({ vip: { enabled: true, percent: 25, days: 45 } }).vip).toEqual({ enabled: true, percent: 25, days: 45 });
    expect(normalizeMemberConfig({ pushOnGrant: false }).pushOnGrant).toBe(false);
  });
  it('preventa anticipada', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(isMemberEarlyAccess({ memberEarlyUntil: null }, now)).toBe(false);
    expect(isMemberEarlyAccess({ memberEarlyUntil: '2026-10-22T00:00:00Z' }, now)).toBe(true);
    expect(isMemberEarlyAccess({ memberEarlyUntil: '2026-10-21T11:59:00Z' }, now)).toBe(false);
  });
  it('estado de un cupón', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    const base = { usedCount: 0, maxUses: 1, validUntil: '2026-11-01T00:00:00Z', isActive: 1 };
    expect(couponStatus(base, now)).toBe('disponible');
    expect(couponStatus({ ...base, usedCount: 1 }, now)).toBe('usado');
    expect(couponStatus({ ...base, validUntil: '2026-10-01T00:00:00Z' }, now)).toBe('vencido');
    expect(couponStatus({ ...base, isActive: 0 }, now)).toBe('vencido');
  });
});
