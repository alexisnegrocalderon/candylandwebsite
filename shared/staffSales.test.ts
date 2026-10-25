import { describe, expect, it } from 'vitest';
import { hasSalesLink, salesCodeFor } from './staffSales';

describe('link de ventas del staff', () => {
  it('solo DJ y RRPP venden con link propio', () => {
    expect(hasSalesLink('dj')).toBe(true);
    expect(hasSalesLink('rrpp')).toBe(true);
    expect(hasSalesLink('caja')).toBe(false);
    expect(hasSalesLink(null)).toBe(false);
  });

  it('arma el código con el primer nombre, sin tildes ni símbolos', () => {
    expect(salesCodeFor('Aldo Medel · Love Carpet', [])).toBe('ALDO');
    expect(salesCodeFor('  Ñandú Pérez', [])).toBe('NANDU');
    expect(salesCodeFor('DJ-Kay', [])).toBe('DJKAY');
    expect(salesCodeFor('!!!', [])).toBe('STAFF');
  });

  it('si el código ya existe le suma un número', () => {
    expect(salesCodeFor('Aldo Medel', ['aldo'])).toBe('ALDO2');
    expect(salesCodeFor('Aldo', ['ALDO', 'ALDO2'])).toBe('ALDO3');
  });
});
