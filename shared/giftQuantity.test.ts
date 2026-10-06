import { describe, expect, it } from 'vitest';
import { giftQuantityForOrder } from './giftQuantity';

const acceso = (accesoSlug: string, quantity = 1) => ({ category: 'acceso', accesoSlug, quantity });

describe('giftQuantityForOrder', () => {
  it('por compra siempre es 1', () => {
    expect(giftQuantityForOrder(false, [acceso('grupo', 3)])).toBe(1);
  });
  it('por persona: una por cada persona que entra', () => {
    expect(giftQuantityForOrder(true, [acceso('soltera')])).toBe(1);
    expect(giftQuantityForOrder(true, [acceso('duo')])).toBe(2);
    expect(giftQuantityForOrder(true, [acceso('trio')])).toBe(3);
    expect(giftQuantityForOrder(true, [acceso('grupo')])).toBe(4);
    expect(giftQuantityForOrder(true, [acceso('duo', 2), acceso('soltero')])).toBe(5);
  });
  it('los extras no cuentan como personas y nunca baja de 1', () => {
    expect(giftQuantityForOrder(true, [{ category: 'extra', accesoSlug: null, quantity: 3 }])).toBe(1);
    expect(giftQuantityForOrder(true, [])).toBe(1);
  });
});
