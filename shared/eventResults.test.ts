import { describe, it, expect } from 'vitest';
import { productKey, buildProductRows, buildWhoRows, columnOf } from './eventResults';

describe('productKey', () => {
  it('junta mayúsculas y tildes', () => {
    expect(productKey('FIREROOM')).toBe(productKey('FireRoom'));
    expect(productKey('Energética Score')).toBe(productKey('energetica  score'));
    expect(productKey('Gin con Gin')).not.toBe(productKey('Gin Beefeater'));
  });
});

describe('buildProductRows', () => {
  it('suma las cajas y junta los duplicados', () => {
    const rows = buildProductRows([
      { name: 'FIREROOM', category: 'consumo', quantity: 4, revenue: 4000, column: 'r:1' },
      { name: 'FireRoom', category: 'consumo', quantity: 1, revenue: 1000, column: 'r:1' },
      { name: 'Cuba Liberal', category: 'consumo', quantity: 16, revenue: 16000, column: 'r:2' },
      { name: 'Cuba Liberal', category: 'consumo', quantity: 7, revenue: 7000, column: 'r:1' },
    ]);
    expect(rows[0]).toMatchObject({ name: 'Cuba Liberal', units: 23, byColumn: { 'r:1': 7, 'r:2': 16 } });
    const fire = rows.find((r) => r.key === 'fireroom')!;
    expect(fire.units).toBe(5);
    expect(fire.variants).toEqual(['FIREROOM', 'FireRoom']);
  });
});

describe('columnOf', () => {
  it('web, caja y caja sin asignar', () => {
    expect(columnOf({ channel: 'web', registerId: null })).toBe('web');
    expect(columnOf({ channel: 'caja', registerId: 3 })).toBe('r:3');
    expect(columnOf({ channel: 'caja', registerId: null })).toBe('none');
  });
});

describe('buildWhoRows', () => {
  const base = { channel: 'caja', operatorId: 1, refundAmount: null, paymentMethod: 'efectivo' };
  it('separa lo vendido de lo anulado, por caja', () => {
    const rows = buildWhoRows([
      { ...base, registerId: 1, total: 5000, paymentStatus: 'approved' },
      { ...base, registerId: 1, total: 3000, paymentStatus: 'refunded' },
      { ...base, registerId: 2, total: 7000, paymentStatus: 'approved', paymentMethod: 'debito' },
      { ...base, channel: 'web', registerId: null, total: 9999, paymentStatus: 'approved' },
    ], 'register', new Map([[1, 'Caja Negro'], [2, 'Kalulo']]), 'Sin caja');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Kalulo', sales: 1, total: 7000, voided: 0 });
    expect(rows[1]).toMatchObject({ name: 'Caja Negro', sales: 1, total: 5000, voided: 1, voidedTotal: 3000 });
  });
});
