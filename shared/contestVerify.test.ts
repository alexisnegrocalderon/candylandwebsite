import { describe, expect, it } from 'vitest';
import { ageOn, isVerifyComplete, missingVerifyFields, parseVerifyReply } from './contestVerify';

describe('parseVerifyReply', () => {
  it('lee RUT, fecha y ACEPTO en un solo mensaje', () => {
    const d = parseVerifyReply('Mi rut 11.111.111-1, nací el 05/03/1995. Acepto');
    expect(d).toEqual({ rut: '11111111-1', birthDate: '1995-03-05', accepted: true });
    expect(isVerifyComplete(d)).toBe(true);
  });
  it('acepta RUT sin puntos y fecha con guiones', () => {
    const d = parseVerifyReply('11111111-1 / 5-3-1995');
    expect(d.rut).toBe('11111111-1');
    expect(d.birthDate).toBe('1995-03-05');
    expect(d.accepted).toBe(false);
  });
  it('descarta RUT con dígito verificador malo y fechas imposibles', () => {
    const d = parseVerifyReply('12.345.678-0 31/02/1990');
    expect(d.rut).toBeNull();
    expect(d.birthDate).toBeNull();
  });
  it('no confunde el RUT con una fecha', () => {
    expect(parseVerifyReply('11.111.111-1').birthDate).toBeNull();
  });
  it('dice qué falta', () => {
    expect(missingVerifyFields(parseVerifyReply('acepto'))).toHaveLength(2);
    expect(missingVerifyFields(parseVerifyReply('11.111.111-1 05/03/1995 acepto'))).toEqual([]);
  });
});

describe('ageOn', () => {
  it('cuenta años cumplidos', () => {
    const day = new Date(Date.UTC(2026, 9, 30));
    expect(ageOn('2008-10-30', day)).toBe(18);
    expect(ageOn('2008-10-31', day)).toBe(17);
    expect(ageOn('1990-01-01', day)).toBe(36);
  });
});
