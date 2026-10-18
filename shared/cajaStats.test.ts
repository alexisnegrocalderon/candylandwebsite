import { describe, expect, it } from 'vitest';
import { salesByChileHour } from './cajaStats';

describe('salesByChileHour', () => {
  it('agrupa por hora de Chile y respeta el orden de la noche pasada la medianoche', () => {
    // Chile en diciembre = UTC-3: 22:10 → 01:10Z, 23:40 → 02:40Z, 00:20 → 03:20Z.
    const sales = [
      { createdAt: '2026-12-05T03:20:00Z', total: 5000 },
      { createdAt: '2026-12-05T01:10:00Z', total: 6000 },
      { createdAt: '2026-12-05T02:40:00Z', total: 4000 },
      { createdAt: '2026-12-05T01:50:00Z', total: 2000 },
    ];
    expect(salesByChileHour(sales)).toEqual([
      { hour: 22, total: 8000, count: 2 },
      { hour: 23, total: 4000, count: 1 },
      { hour: 0, total: 5000, count: 1 },
    ]);
  });

  it('sin ventas, vacío', () => {
    expect(salesByChileHour([])).toEqual([]);
  });
});
