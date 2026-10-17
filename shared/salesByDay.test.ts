import { describe, expect, it } from 'vitest';
import { groupSalesByChileDay } from './salesByDay';

describe('groupSalesByChileDay', () => {
  it('agrupa por día de Chile, no de UTC', () => {
    // 01:30 UTC del 9 = 21:30 del 8 en Chile (UTC-4 en agosto).
    const out = groupSalesByChileDay([
      { createdAt: new Date('2026-08-09T01:30:00Z'), total: '20000' },
      { createdAt: new Date('2026-08-08T15:00:00Z'), total: 10000 },
    ]);
    expect(out).toEqual([{ day: '2026-08-08', orders: 2, revenue: 30000 }]);
  });

  it('rellena con ceros los días sin ventas', () => {
    const out = groupSalesByChileDay([
      { createdAt: new Date('2026-08-01T15:00:00Z'), total: 5000 },
      { createdAt: new Date('2026-08-04T15:00:00Z'), total: 7000 },
    ]);
    expect(out.map((d) => d.day)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']);
    expect(out[1]).toEqual({ day: '2026-08-02', orders: 0, revenue: 0 });
  });

  it('sin ventas devuelve vacío', () => {
    expect(groupSalesByChileDay([])).toEqual([]);
  });
});
