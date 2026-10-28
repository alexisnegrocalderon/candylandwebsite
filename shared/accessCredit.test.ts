import { describe, expect, it } from 'vitest';
import { ANY_ACCESS_SLUG, creditAvailability, creditDiscount, generateCreditCode, giftNote, giftPassError, normalizeCreditCode, parseGiftNote } from './accessCredit';

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

describe('pases regalados', () => {
  const note = giftNote({ eventId: 7, eventTitle: '2º Aniversario', validUntil: '2026-10-31T12:00:00.000Z', reason: 'Cumpleaños', by: 'contacto@mansionplayroom.cl' });
  const credit = { status: 'available', usedOrderId: null, reservedAt: null, note };

  it('guarda y lee los datos del regalo en la nota; una nota de texto de siempre no es un regalo', () => {
    expect(parseGiftNote(note)).toMatchObject({ gift: 1, eventId: 7, eventTitle: '2º Aniversario', reason: 'Cumpleaños' });
    expect(parseGiftNote('Dejado para otra fecha (orden MP-1)')).toBeNull();
    expect(parseGiftNote(null)).toBeNull();
    expect(parseGiftNote('{roto')).toBeNull();
  });

  it('el pase vence, pero uno de siempre no', () => {
    expect(creditAvailability(credit, null, new Date('2026-10-30T00:00:00Z'))).toBe('available');
    expect(creditAvailability(credit, null, new Date('2026-11-02T00:00:00Z'))).toBe('expired');
    expect(creditAvailability({ ...credit, note: 'texto' }, null, new Date('2030-01-01T00:00:00Z'))).toBe('available');
    expect(creditAvailability({ ...credit, status: 'cancelled' }, null, new Date('2026-10-30T00:00:00Z'))).toBe('cancelled');
  });

  it('solo sirve para su evento y mientras no venza', () => {
    expect(giftPassError(credit, 7, new Date('2026-10-30T00:00:00Z'))).toBeNull();
    expect(giftPassError(credit, 8, new Date('2026-10-30T00:00:00Z'))).toBe('Este pase es para 2º Aniversario.');
    expect(giftPassError(credit, 7, new Date('2026-11-02T00:00:00Z'))).toBe('Este pase venció.');
    expect(giftPassError({ note: 'texto de siempre' }, 99)).toBeNull();
  });

  it('un pase «a elección» descuenta UNA unidad del acceso que elijan (la más barata)', () => {
    const lines = [
      { ticketTypeId: 1, accesoSlug: 'duo', category: 'acceso', unitPrice: 20000, quantity: 1 },
      { ticketTypeId: 2, accesoSlug: 'trio', category: 'acceso', unitPrice: 28000, quantity: 2 },
      { ticketTypeId: 3, accesoSlug: null, category: 'extra', unitPrice: 3000, quantity: 1 },
    ];
    expect(creditDiscount(ANY_ACCESS_SLUG, lines)).toEqual({ amount: 20000, ticketTypeId: 1 });
    expect(creditDiscount(ANY_ACCESS_SLUG, [lines[2]])).toBeNull();
    expect(creditDiscount('trio', lines)).toEqual({ amount: 28000, ticketTypeId: 2 });
  });
});

describe('mensaje del pase regalado', () => {
  it('viaja en la nota y la nota nunca pasa de 500 caracteres', () => {
    const n = giftNote({ eventId: 1, eventTitle: 'x'.repeat(200), validUntil: '2026-10-31T12:00:00.000Z', reason: 'r'.repeat(200), by: 'a@b.cl', message: '"comillas" ' + 'ñ'.repeat(300) });
    expect(n.length).toBeLessThanOrEqual(500);
    const meta = parseGiftNote(n)!;
    expect(meta.message?.startsWith('"comillas"')).toBe(true);
    expect(parseGiftNote(giftNote({ eventId: 1, eventTitle: null, validUntil: null, reason: null, by: null, message: '¡Feliz cumple!' }))?.message).toBe('¡Feliz cumple!');
  });
});
