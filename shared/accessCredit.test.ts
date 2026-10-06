import { describe, expect, it } from 'vitest';
import { creditAvailability, creditDiscount, generateCreditCode, normalizeCreditCode } from './accessCredit';

describe('generateCreditCode', () => {
  it('arma CREDITO- + 6 caracteres sin ambiguos', () => {
    const code = generateCreditCode(() => 0.5);
    expect(code).toMatch(/^CREDITO-[A-HJ-NP-Z2-9]{6}$/);
    expect(generateCreditCode(Math.random)).toMatch(/^CREDITO-[A-HJ-NP-Z2-9]{6}$/);
  });
  it('normaliza lo que escribe la persona', () => {
    expect(normalizeCreditCode('  credito-k7m2qx ')).toBe('CREDITO-K7M2QX');
  });
});

describe('creditAvailability', () => {
  const now = new Date('2026-10-06T20:00:00Z');
  const base = { usedOrderId: null as number | null, reservedAt: null as Date | null };
  it('disponible, usado y cancelado', () => {
    expect(creditAvailability({ ...base, status: 'available' }, null, now)).toBe('available');
    expect(creditAvailability({ ...base, status: 'used' }, null, now)).toBe('used');
    expect(creditAvailability({ ...base, status: 'cancelled' }, null, now)).toBe('cancelled');
  });
  it('reservado con orden pagada = usado; rechazada = disponible', () => {
    const c = { status: 'reserved', usedOrderId: 5, reservedAt: new Date('2026-10-06T19:50:00Z') };
    expect(creditAvailability(c, { paymentStatus: 'approved', createdAt: new Date('2026-10-06T19:50:00Z') }, now)).toBe('used');
    expect(creditAvailability(c, { paymentStatus: 'rejected', createdAt: new Date('2026-10-06T19:50:00Z') }, now)).toBe('available');
  });
  it('reservado con orden sin pagar: vuelve a estar disponible pasadas 2 horas', () => {
    const c = { status: 'reserved', usedOrderId: 5, reservedAt: new Date('2026-10-06T19:00:00Z') };
    expect(creditAvailability(c, { paymentStatus: 'pending', createdAt: new Date('2026-10-06T19:00:00Z') }, now)).toBe('used');
    expect(creditAvailability(c, { paymentStatus: 'pending', createdAt: new Date('2026-10-06T17:00:00Z') }, now)).toBe('available');
  });
  it('reservado sin orden (checkout caído): disponible pasados 15 min', () => {
    expect(creditAvailability({ status: 'reserved', usedOrderId: null, reservedAt: new Date('2026-10-06T19:55:00Z') }, null, now)).toBe('used');
    expect(creditAvailability({ status: 'reserved', usedOrderId: null, reservedAt: new Date('2026-10-06T19:30:00Z') }, null, now)).toBe('available');
  });
});

describe('creditDiscount', () => {
  const line = (ticketTypeId: number, accesoSlug: string, unitPrice: number, quantity = 1, category = 'acceso') => ({ ticketTypeId, accesoSlug, category, unitPrice, quantity });
  it('descuenta una sola unidad del mismo acceso, aunque compren varias', () => {
    expect(creditDiscount('duo', [line(1, 'duo', 31900, 3)])).toEqual({ amount: 31900, ticketTypeId: 1 });
  });
  it('sin ese acceso en el carrito no aplica', () => {
    expect(creditDiscount('duo', [line(2, 'soltera', 15000)])).toBeNull();
    expect(creditDiscount('duo', [line(3, 'duo', 5000, 1, 'extra')])).toBeNull();
  });
  it('si hay varias tandas del mismo acceso, usa la más barata', () => {
    expect(creditDiscount('duo', [line(1, 'duo', 40000), line(4, 'duo', 35000)])).toEqual({ amount: 35000, ticketTypeId: 4 });
  });
});
