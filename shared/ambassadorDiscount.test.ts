import { describe, expect, it } from 'vitest';
import { ambassadorBuyerDiscount, bestBuyerDiscount, effectiveBuyerDiscountPercent, generalDiscountActive, normalizeBuyerDiscountPercent } from './ambassadorDiscount';

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

describe('descuento general para todos los embajadores', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const on = { enabled: true, percent: '5.00', endsAt: null };
  it('no modifica a quien ya tiene su propio %, solo se agrega a quienes no tienen', () => {
    expect(effectiveBuyerDiscountPercent(10, on, now)).toBe(10);
    expect(effectiveBuyerDiscountPercent(null, on, now)).toBe(5);
    expect(effectiveBuyerDiscountPercent('0.00', on, now)).toBe(5);
  });
  it('apagado, en 0 o vencido no aplica', () => {
    expect(effectiveBuyerDiscountPercent(null, { ...on, enabled: false }, now)).toBe(0);
    expect(effectiveBuyerDiscountPercent(null, { ...on, percent: 0 }, now)).toBe(0);
    expect(generalDiscountActive({ ...on, endsAt: '2026-10-20T00:00:00Z' }, now)).toBe(false);
    expect(generalDiscountActive({ ...on, endsAt: '2026-10-22T00:00:00Z' }, now)).toBe(true);
  });
  it('respeta el tope de 30 %', () => {
    expect(effectiveBuyerDiscountPercent(null, { enabled: true, percent: 80 }, now)).toBe(30);
  });
});
