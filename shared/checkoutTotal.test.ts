import { describe, expect, it } from 'vitest';
import { cardPaymentProblem, MIN_ADDON_PAYMENT } from './addon';
import { computeCodeDiscount } from './discountCode';

const acceso = [{ ticketTypeId: 1, category: 'acceso', unitPrice: 45000, quantity: 1 }];

describe('total de la compra', () => {
  it('un código 100% deja el total en $0 y eso se puede comprar (orden gratis)', () => {
    const d = computeCodeDiscount({ discountType: 'percentage', discountValue: 100 }, acceso, 'web');
    expect(Math.max(0, 45000 - d)).toBe(0);
    expect(cardPaymentProblem(0)).toBeNull();
  });
  it('un monto fijo mayor al acceso nunca pasa del precio', () => {
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 99999 }, acceso, 'web')).toBe(45000);
  });
  it('sin código se cobra normal', () => {
    expect(cardPaymentProblem(45000)).toBeNull();
    expect(cardPaymentProblem(MIN_ADDON_PAYMENT)).toBeNull();
  });
  it('un total bajo el mínimo se avisa antes de crear la orden', () => {
    expect(cardPaymentProblem(100)).toMatch(/mínimo/);
    expect(cardPaymentProblem(MIN_ADDON_PAYMENT - 1)).not.toBeNull();
  });
});
