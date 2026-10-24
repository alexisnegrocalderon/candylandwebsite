import { describe, expect, it } from 'vitest';
import { fromPrice } from './fromPrice';
import { buildIcs, icsDate } from './calendar';

const ev = { eventDate: '2026-10-31T01:00:00Z', missionForceClosed: 1 };
const t = (accesoSlug: string, price: number, extra: Record<string, unknown> = {}) => ({ accesoSlug, name: accesoSlug, category: 'acceso', status: 'active', price: String(price), totalStock: 100, soldCount: 0, ...extra });

describe('fromPrice', () => {
  it('el acceso más barato que se puede comprar, sin extras ni agotados', () => {
    const tickets = [t('duo', 42000), t('soltera', 15000), t('grupo', 9000, { status: 'soldout' }), t('trio', 8000, { totalStock: 5, soldCount: 5 }), { ...t('parking', 5000), category: 'extra' }];
    expect(fromPrice(tickets, ev)).toBe(15000);
  });
  it('sin evento o sin entradas, nada', () => {
    expect(fromPrice([], ev)).toBeNull();
    expect(fromPrice([t('duo', 42000)], null)).toBeNull();
  });
});

describe('calendario', () => {
  it('arma un evento con alarma el día antes y escapa el texto', () => {
    const ics = buildIcs({ uid: 'ev-7', title: 'Aniversario, Halloween', start: new Date('2026-10-31T01:00:00Z'), location: 'La Mansión; Valparaíso' }, new Date('2026-10-24T12:00:00Z'));
    expect(ics).toContain('DTSTART:20261031T010000Z');
    expect(ics).toContain('DTEND:20261031T070000Z');
    expect(ics).toContain('SUMMARY:Aniversario\\, Halloween');
    expect(ics).toContain('LOCATION:La Mansión\\; Valparaíso');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(icsDate(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z');
  });
});

import { isBackSwipe } from './edgeSwipeBack';

describe('volver deslizando', () => {
  const s = { x: 10, y: 400, t: 0 };
  it('desde el borde hacia la derecha, rápido y recto, vuelve', () => {
    expect(isBackSwipe(s, { x: 120, y: 420, t: 300 })).toBe(true);
  });
  it('no vuelve si empieza lejos del borde, es corto, se tuerce o es lento', () => {
    expect(isBackSwipe({ ...s, x: 60 }, { x: 200, y: 400, t: 300 })).toBe(false);
    expect(isBackSwipe(s, { x: 50, y: 400, t: 300 })).toBe(false);
    expect(isBackSwipe(s, { x: 150, y: 520, t: 300 })).toBe(false);
    expect(isBackSwipe(s, { x: 150, y: 400, t: 1200 })).toBe(false);
  });
});
