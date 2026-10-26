import { describe, expect, it } from 'vitest';
import { buildWalletCards, type CardEvent } from './walletCards';

const ev = (eventId: number, day: number, tickets: [string, string][], extra: Partial<CardEvent> = {}): CardEvent => ({
  eventId, eventDate: new Date(Date.UTC(2026, 10, day)), tickets: tickets.map(([ticketCode, kind]) => ({ ticketCode, kind })), ...extra,
});
const keys = (e: CardEvent[]) => buildWalletCards(e).map((c) => c.key);

describe('buildWalletCards', () => {
  it('sin entradas queda solo la PlayCard', () => {
    expect(keys([])).toEqual(['playcard']);
    expect(buildWalletCards(null).map((c) => c.type)).toEqual(['playcard']);
  });
  it('dentro de una fiesta: accesos, estacionamiento, extras, guardarropía, y la PlayCard al final', () => {
    const e = ev(1, 20, [['L', 'guardarropia'], ['X', 'extra'], ['P', 'estacionamiento'], ['A2', 'acceso'], ['C', 'consumo'], ['A1', 'acceso']]);
    expect(keys([e])).toEqual(['t-A2', 't-A1', 't-P', 't-C', 't-X', 't-L', 'playcard']);
  });
  it('mantiene el orden de las entradas del mismo tipo (una por persona)', () => {
    expect(keys([ev(1, 20, [['B', 'acceso'], ['A', 'acceso'], ['C', 'acceso']])])).toEqual(['t-B', 't-A', 't-C', 'playcard']);
  });
  it('las fiestas van de la más próxima a la más lejana, cada una con lo suyo', () => {
    const later = ev(2, 27, [['A9', 'acceso']]);
    const sooner = ev(1, 20, [['A1', 'acceso'], ['P1', 'estacionamiento']]);
    expect(keys([later, sooner])).toEqual(['t-A1', 't-P1', 't-A9', 'playcard']);
  });
  it('guardarropía y cocina de caja van después de los extras de su fiesta', () => {
    const e = ev(1, 20, [['A', 'acceso'], ['X', 'extra']], { lockers: [{ tagNumber: '14' }], kitchen: [{ ticketNumber: 'B-3' }] });
    expect(keys([e])).toEqual(['t-A', 't-X', 'l-1-14', 'k-1-B-3', 'playcard']);
  });
  it('un tipo desconocido se trata como extra', () => {
    expect(keys([ev(1, 20, [['Z', 'raro'], ['A', 'acceso']])])).toEqual(['t-A', 't-Z', 'playcard']);
  });
});
