import { describe, expect, it } from 'vitest';
import { computeCodeDiscount, type DiscountLine } from './discountCode';

const acceso: DiscountLine = { ticketTypeId: 1, category: 'acceso', unitPrice: 15000, originalPrice: 20000, quantity: 2 }; // $30.000
const parking: DiscountLine = { ticketTypeId: 2, category: 'extra', unitPrice: 5000, quantity: 1 };
const tragos: DiscountLine = { ticketTypeId: 3, category: 'consumo', unitPrice: 8000, quantity: 3 };
const merch: DiscountLine = { ticketTypeId: 4, category: 'merch', unitPrice: 12000, quantity: 1 };
const carrito = [acceso, parking, tragos, merch];

describe('computeCodeDiscount (web): el código solo descuenta el acceso, nunca extras', () => {
  it('porcentaje: solo sobre el valor del acceso', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 20 }, carrito, 'web')).toBe(6000); // 20% de 30.000, no de 71.000
  });

  it('porcentaje 100%: descuenta el acceso completo y deja los extras a precio completo', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 100 }, carrito, 'web')).toBe(30000);
  });

  it('monto fijo: no pasa del valor del acceso aunque el carrito tenga más', () => {
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 50000 }, carrito, 'web')).toBe(30000);
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 5000 }, carrito, 'web')).toBe(5000);
  });

  it('sin acceso en el carrito (solo extras) no descuenta nada, sea % o monto fijo', () => {
    const soloExtras = [parking, tragos, merch];
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 50 }, soloExtras, 'web')).toBe(0);
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 10000 }, soloExtras, 'web')).toBe(0);
  });

  it('con lista de productos, solo los accesos de esa lista', () => {
    const otro: DiscountLine = { ticketTypeId: 9, category: 'acceso', unitPrice: 10000, quantity: 1 };
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 10, applicableTicketTypeIds: [9] }, [acceso, otro, parking], 'web')).toBe(1000);
    // un extra en la lista tampoco cuenta en la web
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 10, applicableTicketTypeIds: [2] }, carrito, 'web')).toBe(0);
  });

  it('basedOnOriginalPrice (cumpleañeros): % sobre el precio general del acceso, igual sin tocar extras', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 50, basedOnOriginalPrice: true }, carrito, 'web')).toBe(20000); // 50% de 2 x 20.000
  });

  it('valor 0 o negativo no descuenta', () => {
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 0 }, carrito, 'web')).toBe(0);
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: -10 }, carrito, 'web')).toBe(0);
  });
});

describe('computeCodeDiscount (caja): solo promo relámpago, con lista de productos', () => {
  it('sin lista de productos no hay descuento', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 50 }, carrito, 'caja')).toBe(0);
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 5000 }, carrito, 'caja')).toBe(0);
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 50, applicableTicketTypeIds: [] }, carrito, 'caja')).toBe(0);
  });

  it('con lista: solo esos productos, cualquiera sea su categoría', () => {
    expect(computeCodeDiscount({ discountType: 'percentage', discountValue: 25, applicableTicketTypeIds: [3] }, carrito, 'caja')).toBe(6000); // 25% de 24.000 en tragos
    expect(computeCodeDiscount({ discountType: 'fixed', discountValue: 99999, applicableTicketTypeIds: [3] }, carrito, 'caja')).toBe(24000);
  });
});
