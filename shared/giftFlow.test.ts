import { describe, expect, it } from 'vitest';
import { cleanGiftMessage, giftMessageData, giftMessageOf, giftSummary, initialOf, lastVisitLabel, GIFT_MESSAGE_MAX } from './giftFlow';

describe('mensaje personalizado', () => {
  it('se limpia, se corta en 200 y vacío es null', () => {
    expect(cleanGiftMessage('  ¡Feliz   cumple!  ')).toBe('¡Feliz cumple!');
    expect(cleanGiftMessage('   ')).toBeNull();
    expect(cleanGiftMessage(null)).toBeNull();
    expect(cleanGiftMessage('x'.repeat(250))).toHaveLength(GIFT_MESSAGE_MAX);
    expect(cleanGiftMessage('a\n\n\n\nb')).toBe('a\n\nb');
  });
  it('viaja en attendeeData y se lee de vuelta', () => {
    expect(giftMessageOf(giftMessageData('Te queremos 💖'))).toBe('Te queremos 💖');
    expect(giftMessageData(null)).toBeUndefined();
    expect(giftMessageOf('{"campos":{"a":"b"}}')).toBeNull();
    expect(giftMessageOf('roto')).toBeNull();
    expect(giftMessageOf(null)).toBeNull();
  });
});

describe('lastVisitLabel e initialOf', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  it('dice cuándo vino por última vez', () => {
    expect(lastVisitLabel(null, now)).toBe('Sin visitas');
    expect(lastVisitLabel('2026-10-29T08:00:00Z', now)).toBe('Visto hoy');
    expect(lastVisitLabel('2026-10-28T08:00:00Z', now)).toBe('Visto ayer');
    expect(lastVisitLabel('2026-10-19T12:00:00Z', now)).toBe('Visto hace 10 días');
    expect(lastVisitLabel('2026-08-29T12:00:00Z', now)).toBe('Visto hace 2 meses');
    expect(lastVisitLabel('2024-01-01T12:00:00Z', now)).toBe('Visto hace más de un año');
  });
  it('usa la inicial del nombre o del correo', () => {
    expect(initialOf('ángela', 'a@b.cl')).toBe('Á');
    expect(initialOf(null, 'zoe@b.cl')).toBe('Z');
  });
});

describe('giftSummary', () => {
  it('pase a elección y tragos, en lenguaje natural', () => {
    expect(giftSummary({ to: 'Camila', mode: 'pase', anyAccessQty: 1, items: [{ name: 'Piscolas', quantity: 2, kind: 'trago' }], eventTitle: '2do Aniversario', validity: 'hasta el evento' }))
      .toBe('Le regalas a Camila 1 pase de acceso a elección y 2 Piscolas para 2do Aniversario. El pase queda en sus Cupones para canjearlo y vale hasta el evento. El trago queda en sus Cupones con un QR para la barra.');
  });
  it('entrada directa', () => {
    expect(giftSummary({ to: 'Javier', mode: 'directo', items: [{ name: 'Acceso Dúo', quantity: 1, kind: 'acceso' }] }))
      .toBe('Le regalas a Javier 1 Acceso Dúo. La entrada le llega por correo con su QR.');
  });
  it('sin nada elegido', () => {
    expect(giftSummary({ to: 'Ana', mode: 'directo', items: [] })).toBe('Todavía no elegiste qué regalarle a Ana.');
  });
});
