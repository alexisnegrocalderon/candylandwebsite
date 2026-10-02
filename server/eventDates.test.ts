import { describe, it, expect } from 'vitest';
import { normalizeEventDates } from './eventDates';

describe('normalizeEventDates', () => {
  it("convierte '' de puertas y fin en null en vez de dejar pasar el texto (bug toISOString)", () => {
    const out = normalizeEventDates({ title: 'RedRoom', doorsOpen: '', eventEnd: '' });
    expect(out.doorsOpen).toBeNull();
    expect(out.eventEnd).toBeNull();
    expect(out.title).toBe('RedRoom');
  });

  it('convierte textos con fecha a Date', () => {
    const out = normalizeEventDates({
      eventDate: '2026-10-30T22:00:00-03:00',
      doorsOpen: '2026-10-30T22:00:00-03:00',
      eventEnd: '2026-10-31T05:00:00-03:00',
    });
    expect(out.eventDate).toBeInstanceOf(Date);
    expect(out.doorsOpen).toBeInstanceOf(Date);
    expect((out.doorsOpen as Date).toISOString()).toBe('2026-10-31T01:00:00.000Z');
    expect(out.eventEnd).toBeInstanceOf(Date);
  });

  it('no toca los campos que no vienen (editar solo el flyer)', () => {
    const out = normalizeEventDates({ imageUrl: 'https://x/y.jpg' });
    expect('doorsOpen' in out).toBe(false);
    expect('eventEnd' in out).toBe(false);
    expect('eventDate' in out).toBe(false);
  });

  it('eventDate vacía se ignora para no borrar la fecha obligatoria', () => {
    const out = normalizeEventDates({ eventDate: '', title: 'x' });
    expect('eventDate' in out).toBe(false);
  });

  it('una fecha inválida falla con un mensaje claro', () => {
    expect(() => normalizeEventDates({ doorsOpen: 'mañana' })).toThrow(/doorsOpen/);
  });
});
