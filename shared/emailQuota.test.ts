import { describe, expect, it } from 'vitest';
import { emailAlertDayKey, emailAlertThreshold, isEmailAlertDue } from './emailQuota';

describe('alerta del cupo diario de correos', () => {
  it('avisa desde 95 por defecto', () => {
    expect(emailAlertThreshold(undefined)).toBe(95);
    expect(emailAlertThreshold('')).toBe(95);
    expect(emailAlertThreshold('abc')).toBe(95);
    expect(emailAlertThreshold('0')).toBe(95);
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
