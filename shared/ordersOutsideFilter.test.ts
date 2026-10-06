import { describe, expect, it } from 'vitest';
import { ordersOutsideFilter } from './ordersOutsideFilter';

const o = (id: number, eventId: number, channel: string, paymentStatus: string) => ({ id, eventId, channel, paymentStatus });

describe('ordersOutsideFilter', () => {
  const matches = [o(1, 10, 'web', 'approved'), o(2, 11, 'web', 'approved'), o(3, 10, 'caja', 'approved'), o(4, 10, 'import', 'pending')];
  it('sin filtros, en Ventas Web solo queda fuera lo de caja', () => {
    expect(ordersOutsideFilter(matches, { channel: 'web' }).map((x) => x.id)).toEqual([3]);
  });
  it('filtro de evento: lo de otro evento queda fuera', () => {
    expect(ordersOutsideFilter(matches, { channel: 'web', eventId: 10 }).map((x) => x.id)).toEqual([2, 3]);
  });
  it('filtro de estado', () => {
    expect(ordersOutsideFilter(matches, { channel: 'web', status: 'approved' }).map((x) => x.id)).toEqual([3, 4]);
  });
  it('en Ventas Caja, lo web queda fuera', () => {
    expect(ordersOutsideFilter(matches, { channel: 'caja' }).map((x) => x.id)).toEqual([1, 2, 4]);
  });
});
