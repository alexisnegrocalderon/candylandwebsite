import { describe, expect, it } from 'vitest';
import { cajaSaleChargesPlaycard, presaleParkingOnlyFor } from './colabPlaycard';

describe('presaleParkingOnlyFor', () => {
  it('sin sistema PlayCard la web vende solo entrada y estacionamiento', () => {
    expect(presaleParkingOnlyFor(false)).toBe(1);
    expect(presaleParkingOnlyFor(true)).toBe(0);
  });
});

describe('cajaSaleChargesPlaycard', () => {
  it('detecta cualquier cobro a la PlayCard', () => {
    expect(cajaSaleChargesPlaycard({ paymentMethod: 'saldo' })).toBe(true);
    expect(cajaSaleChargesPlaycard({ paymentMethod: 'efectivo', saldoAmount: 5000 })).toBe(true);
    expect(cajaSaleChargesPlaycard({ paymentMethod: 'debito', redeemPlaycoins: 300 })).toBe(true);
    expect(cajaSaleChargesPlaycard({ paymentMethod: 'qr', payToken: 'abc' })).toBe(true);
  });
  it('las ventas normales no se bloquean', () => {
    expect(cajaSaleChargesPlaycard({ paymentMethod: 'efectivo' })).toBe(false);
    expect(cajaSaleChargesPlaycard({ paymentMethod: 'debito', saldoAmount: 0, redeemPlaycoins: 0 })).toBe(false);
    expect(cajaSaleChargesPlaycard({})).toBe(false);
  });
});
