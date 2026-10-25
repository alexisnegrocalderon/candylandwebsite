import { describe, expect, it } from 'vitest';
import { EVENT_WRAPUP_HOURS, pickCurrentEvent } from './currentEvent';

const now = new Date('2026-10-25T19:00:00Z');
const day = 86_400_000;
const ev = (id: number, offsetDays: number, status = 'published') => ({ id, status, eventDate: new Date(now.getTime() + offsetDays * day) });

describe('pickCurrentEvent', () => {
  it('con una fiesta pasada más cerca que la próxima, muestra la próxima', () => {
    expect(pickCurrentEvent([ev(1, -20), ev(2, 26)], now)).toMatchObject({ event: { id: 2 }, past: false });
  });
  it('entre varias por venir, la más cercana', () => {
    expect(pickCurrentEvent([ev(3, 40), ev(2, 5), ev(1, -3)], now).event?.id).toBe(2);
  });
  it('la fiesta de anoche sigue «en curso» de madrugada, pero no un día después', () => {
    expect(pickCurrentEvent([ev(1, -0.25), ev(2, 20)], now).event?.id).toBe(1);
    expect(pickCurrentEvent([ev(1, -1), ev(2, 20)], now).event?.id).toBe(2);
  });
  it('en las pantallas de trabajo la fiesta que acaba de pasar sigue 48 horas (el cierre se revisa al otro día)', () => {
    expect(pickCurrentEvent([ev(1, -1), ev(2, 20)], now, EVENT_WRAPUP_HOURS).event?.id).toBe(1);
    expect(pickCurrentEvent([ev(1, -3), ev(2, 20)], now, EVENT_WRAPUP_HOURS).event?.id).toBe(2);
  });
  it('sin nada por venir, la última que pasó y lo dice', () => {
    expect(pickCurrentEvent([ev(1, -40), ev(2, -10)], now)).toMatchObject({ event: { id: 2 }, past: true });
  });
  it('ignora borradores y cancelados, y no se cae sin eventos', () => {
    expect(pickCurrentEvent([ev(1, 3, 'draft'), ev(2, 9, 'cancelled'), ev(3, 30)], now).event?.id).toBe(3);
    expect(pickCurrentEvent([], now)).toEqual({ event: null, past: false });
    expect(pickCurrentEvent(undefined, now)).toEqual({ event: null, past: false });
  });
});
