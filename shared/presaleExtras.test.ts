import { describe, it, expect } from 'vitest';
import { presaleAllows } from './presaleExtras';

const only = { presaleParkingOnly: 1 };
describe('presaleAllows', () => {
  it('sin el interruptor todo se vende como siempre', () => {
    expect(presaleAllows({ presaleParkingOnly: 0 }, { category: 'extra', name: 'Piscolón' })).toBe(true);
    expect(presaleAllows(null, { category: 'extra', name: 'Piscolón' })).toBe(true);
  });
  it('con el interruptor solo pasan accesos y estacionamiento', () => {
    expect(presaleAllows(only, { category: 'acceso', name: 'Entrada General' })).toBe(true);
    expect(presaleAllows(only, { category: 'extra', name: 'Estacionamiento' })).toBe(true);
    expect(presaleAllows(only, { category: 'extra', name: 'Estacionamiento VIP' })).toBe(true);
    expect(presaleAllows(only, { category: 'extra', name: 'Piscolón' })).toBe(false);
    expect(presaleAllows(only, { category: 'extra', name: 'Recarga $10.000' })).toBe(false);
  });
});
