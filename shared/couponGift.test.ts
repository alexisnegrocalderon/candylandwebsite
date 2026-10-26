import { describe, expect, it } from 'vitest';
import { couponGiftError, couponPushText, couponValueLabel, defaultCouponTitle, parseEmailList } from './couponGift';

describe('parseEmailList', () => {
  it('separa por comas, saltos y espacios; normaliza y no repite', () => {
    const r = parseEmailList('Ana@Mail.com, juan@mail.com\nana@mail.com;  "Pía" <pia@mail.cl>');
    expect(r.emails).toEqual(['ana@mail.com', 'juan@mail.com', 'pia@mail.cl']);
    expect(r.invalid).toEqual([]);
  });
  it('marca los que parecen correo pero no lo son, e ignora palabras sueltas', () => {
    const r = parseEmailList('hola juan@ x@y.cl');
    expect(r.emails).toEqual(['x@y.cl']);
    expect(r.invalid).toEqual(['juan@']);
  });
});

describe('etiquetas', () => {
  it('porcentaje y monto fijo', () => {
    expect(couponValueLabel('percentage', 15)).toBe('15%');
    expect(couponValueLabel('fixed', 5000)).toBe('$5.000');
    expect(defaultCouponTitle('fixed', 5000)).toBe('$5.000 de regalo');
  });
  it('texto de la push con nombre y fiesta', () => {
    expect(couponPushText({ name: 'Ana', title: '$5.000 de regalo', days: 7, eventTitle: 'Halloween' }).body)
      .toBe('Ana, $5.000 de regalo para Halloween. Míralo en tu cuenta: vale 7 días.');
  });
});

describe('couponGiftError', () => {
  it('rechaza valores fuera de rango', () => {
    expect(couponGiftError({ type: 'percentage', value: 120, days: 7 })).toMatch(/100/);
    expect(couponGiftError({ type: 'fixed', value: 0, days: 7 })).toMatch(/mayor a cero/);
    expect(couponGiftError({ type: 'fixed', value: 5000, days: 0 })).toMatch(/365/);
    expect(couponGiftError({ type: 'fixed', value: 5000, days: 30 })).toBeNull();
  });
});
