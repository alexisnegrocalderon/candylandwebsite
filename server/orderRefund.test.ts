import { describe, expect, it } from 'vitest';
import { cashCollectedFromOrders } from '../shared/expenses';

describe('ingreso de una compra devuelta desde Ventas Web', () => {
  it('solo cuenta lo retenido (total - devuelto)', () => {
    expect(cashCollectedFromOrders([{ total: '20000', refundAmount: '10000' }])).toBe(10000);
  });

  it('una compra normal no cambia', () => {
    expect(cashCollectedFromOrders([{ total: '20000' }, { total: '5000', refundAmount: null }])).toBe(25000);
  });

  it('incluye el copago de Misión 300 antes de descontar lo devuelto', () => {
    expect(cashCollectedFromOrders([{ total: '10000', missionTopupStatus: 'paid', missionTopupAmount: '8000', refundAmount: '9000' }])).toBe(9000);
  });

  it('suma varias órdenes, devueltas y no', () => {
    expect(cashCollectedFromOrders([
      { total: '20000', refundAmount: '10000' },
      { total: '30000' },
    ])).toBe(40000);
  });
});
