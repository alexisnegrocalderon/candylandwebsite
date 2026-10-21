import { describe, expect, it } from 'vitest';
import { billingPeriodStart, emailAlertDayKey, emailAlertThreshold, emailMonthlyAlertKey, emailMonthlyThreshold, isEmailAlertDue, EMAIL_DAILY_ALERT_DEFAULT, EMAIL_MONTHLY_ALERT_DEFAULT } from './emailQuota';

describe('alerta del cupo diario de correos', () => {
  it('avisa desde 1.400 por defecto (Resend Pro, sin tope diario)', () => {
    expect(EMAIL_DAILY_ALERT_DEFAULT).toBe(1400);
    expect(emailAlertThreshold(undefined)).toBe(1400);
    expect(emailAlertThreshold('')).toBe(1400);
    expect(emailAlertThreshold('abc')).toBe(1400);
    expect(emailAlertThreshold('0')).toBe(1400);
    expect(emailAlertThreshold('80')).toBe(80);
  });
  it('se dispara al llegar al umbral, no antes', () => {
    expect(isEmailAlertDue(94, 95)).toBe(false);
    expect(isEmailAlertDue(95, 95)).toBe(true);
    expect(isEmailAlertDue(100, 95)).toBe(true);
  });
  it('la clave cambia con el día de Chile, no con el de UTC', () => {
    // 20/10 01:30 UTC = 19/10 22:30 en Chile (UTC-3): todavía es el 19.
    expect(emailAlertDayKey(new Date('2026-10-20T01:30:00Z'))).toBe('email-quota-alert:2026-10-19');
    expect(emailAlertDayKey(new Date('2026-10-20T12:00:00Z'))).toBe('email-quota-alert:2026-10-20');
  });
});

describe('cupo mensual de Resend Pro', () => {
  it('el período arranca el último día 21 (a las 00:00 UTC)', () => {
    expect(billingPeriodStart(new Date('2026-10-21T15:00:00Z')).toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(billingPeriodStart(new Date('2026-11-05T12:00:00Z')).toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(billingPeriodStart(new Date('2026-11-21T00:00:00Z')).toISOString()).toBe('2026-11-21T00:00:00.000Z');
    expect(billingPeriodStart(new Date('2027-01-10T12:00:00Z')).toISOString()).toBe('2026-12-21T00:00:00.000Z');
  });
  it('avisa una vez por período y desde el 80 % por defecto', () => {
    expect(emailMonthlyAlertKey(new Date('2026-11-05T12:00:00Z'))).toBe('email-monthly-alert:2026-10-21');
    expect(emailMonthlyAlertKey(new Date('2026-11-22T12:00:00Z'))).toBe('email-monthly-alert:2026-11-21');
    expect(EMAIL_MONTHLY_ALERT_DEFAULT).toBe(40_000);
    expect(emailMonthlyThreshold(undefined)).toBe(40_000);
    expect(emailMonthlyThreshold('30000')).toBe(30_000);
  });
});
