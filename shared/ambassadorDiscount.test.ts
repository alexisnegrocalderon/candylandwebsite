import { describe, expect, it } from 'vitest';
import { ambassadorBuyerDiscount, bestBuyerDiscount, normalizeBuyerDiscountPercent } from './ambassadorDiscount';

const lines = [
  { ticketTypeId: 1, category: 'acceso', unitPrice: 20000, quantity: 2 },
  { ticketTypeId: 2, category: 'extra', unitPrice: 5000, quantity: 1 },
];

describe('descuento al comprador del embajador', () => {
  it('descuenta solo el acceso, nunca los extras', () => {
    expect(ambassadorBuyerDiscount(10, lines)).toBe(4000);
  });
  it('sin porcentaje (null, vacío o 0) no descuenta', () => {
    expect(ambassadorBuyerDiscount(null, lines)).toBe(0);
    expect(ambassadorBuyerDiscount('0.00', lines)).toBe(0);
  });
  it('acepta el decimal guardado como texto y respeta el tope de 30 %', () => {
    expect(ambassadorBuyerDiscount('15.00', lines)).toBe(6000);
    expect(normalizeBuyerDiscountPercent(80)).toBe(30);
    expect(ambassadorBuyerDiscount(80, lines)).toBe(12000);
  });
  it('con un código de descuento gana el mayor y no se suman', () => {
    expect(bestBuyerDiscount(3000, 4000)).toEqual({ amount: 4000, ambassadorWins: true });
    expect(bestBuyerDiscount(5000, 4000)).toEqual({ amount: 5000, ambassadorWins: false });
    expect(bestBuyerDiscount(4000, 4000)).toEqual({ amount: 4000, ambassadorWins: false });
  });
});
