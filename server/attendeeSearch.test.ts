import { describe, expect, it } from 'vitest';
import { findMatchedAttendee } from './db';

const data = JSON.stringify({
  campos: {
    buyer__nombre: 'Ana Pérez', buyer__rut: '11.111.111-1',
    acomp1_nombre: 'José Núñez', acomp1_rut: '12.345.678-K',
    acomp2_nombre: 'Luz Soto',
  },
});

describe('findMatchedAttendee', () => {
  it('encuentra al acompañante por nombre sin tildes ni mayúsculas', () => {
    expect(findMatchedAttendee(data, 'Ana Pérez', 'jose nunez')?.name).toBe('José Núñez');
  });
  it('encuentra por RUT con o sin puntos y guion', () => {
    for (const t of ['12.345.678-K', '12345678-k', '123456780'.slice(0, 8), '2345678k']) {
      const m = findMatchedAttendee(data, 'Ana Pérez', t);
      expect(m?.name, t).toBe('José Núñez');
    }
  });
  it('marca al titular', () => {
    expect(findMatchedAttendee(data, 'Ana Pérez', '11111111')?.isBuyer).toBe(true);
  });
  it('null si no coincide ninguna persona', () => {
    expect(findMatchedAttendee(data, 'Ana Pérez', 'zzz')).toBeNull();
  });
});
