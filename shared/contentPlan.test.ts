import { describe, expect, it } from 'vitest';
import { addDaysIso, chileIsoDate, cleanContentPieces, contentPlanWindow, normalizeContentPlan } from './contentPlan';

describe('chileIsoDate', () => {
  it('usa el día de Chile, no el de UTC', () => {
    // 01:30 UTC del 5 de octubre = 22:30 del 4 de octubre en Chile (UTC-3)
    expect(chileIsoDate(new Date('2026-10-05T01:30:00Z'))).toBe('2026-10-04');
    expect(chileIsoDate(new Date('2026-10-05T15:00:00Z'))).toBe('2026-10-05');
  });
});

describe('addDaysIso', () => {
  it('suma días cruzando de mes y de año', () => {
    expect(addDaysIso('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('contentPlanWindow', () => {
  const now = new Date('2026-10-02T12:00:00Z'); // viernes 2 de octubre, Chile

  it('va de mañana hasta el día del evento si falta poco', () => {
    expect(contentPlanWindow(now, new Date('2026-10-09T01:00:00Z'))).toEqual({ from: '2026-10-03', to: '2026-10-08', days: 6 });
  });

  it('se corta a 21 días aunque el evento esté más lejos', () => {
    const w = contentPlanWindow(now, new Date('2026-12-20T22:00:00Z'))!;
    expect(w.from).toBe('2026-10-03');
    expect(w.to).toBe('2026-10-23');
    expect(w.days).toBe(21);
  });

  it('el evento es mañana: una sola publicación posible', () => {
    expect(contentPlanWindow(now, new Date('2026-10-03T22:00:00Z'))).toEqual({ from: '2026-10-03', to: '2026-10-03', days: 1 });
  });

  it('si el evento es hoy o ya pasó, no hay nada que planificar', () => {
    expect(contentPlanWindow(now, new Date('2026-10-02T23:00:00Z'))).toBeNull();
    expect(contentPlanWindow(now, new Date('2026-09-30T22:00:00Z'))).toBeNull();
  });
});

describe('cleanContentPieces', () => {
  const window = { from: '2026-10-03', to: '2026-10-10' };
  const piece = (over: Record<string, unknown> = {}) => ({
    date: '2026-10-05', time: '19:30', format: 'reel', goal: 'awareness', hook: 'Gancho', caption: 'Texto', visual: 'Grabar la entrada', hashtags: ['MansionPlayroom', '#fiesta'], keyword: '', ...over,
  });

  it('acepta piezas válidas y normaliza hashtags', () => {
    const [p] = cleanContentPieces([piece()], window);
    expect(p).toMatchObject({ date: '2026-10-05', time: '19:30', format: 'reel', hashtags: ['#MansionPlayroom', '#fiesta'] });
  });

  it('descarta fechas fuera de la ventana, inventadas o mal escritas', () => {
    const out = cleanContentPieces([
      piece({ date: '2026-10-02' }),   // antes de la ventana
      piece({ date: '2026-10-11' }),   // después
      piece({ date: '2026-02-30' }),   // no existe
      piece({ date: '5 de octubre' }), // mal formato
      piece({ date: '2026-10-06' }),   // válida
    ], window);
    expect(out.map((p) => p.date)).toEqual(['2026-10-06']);
  });

  it('descarta formatos y objetivos desconocidos y textos vacíos', () => {
    expect(cleanContentPieces([piece({ format: 'tiktok' }), piece({ goal: 'viral' }), piece({ hook: '  ' }), piece({ caption: '' })], window)).toEqual([]);
  });

  it('una hora rara pasa a 19:00 y se ordena por fecha y hora', () => {
    const out = cleanContentPieces([piece({ date: '2026-10-07', time: '25:99' }), piece({ date: '2026-10-05', time: '21:00' }), piece({ date: '2026-10-05', time: '9:05' })], window);
    expect(out.map((p) => `${p.date} ${p.time}`)).toEqual(['2026-10-05 09:05', '2026-10-05 21:00', '2026-10-07 19:00']);
  });

  it('máximo dos por día', () => {
    const out = cleanContentPieces([piece({ time: '10:00' }), piece({ time: '12:00' }), piece({ time: '14:00' })], window);
    expect(out).toHaveLength(2);
  });

  it('no revienta con basura', () => {
    expect(cleanContentPieces(null, window)).toEqual([]);
    expect(cleanContentPieces([null, 5, 'x', {}], window)).toEqual([]);
  });
});

describe('normalizeContentPlan', () => {
  const valid = { generatedAt: '2026-10-02T12:00:00Z', eventId: 7, eventTitle: 'Halloween', eventDate: '2026-10-30T22:00:00Z', from: '2026-10-03', to: '2026-10-23', summary: 'Idea', pieces: [{ date: '2026-10-05', time: '19:00', format: 'post', goal: 'confianza', hook: 'h', caption: 'c' }] };
  it('acepta un plan guardado válido', () => {
    expect(normalizeContentPlan(valid)?.pieces).toHaveLength(1);
  });
  it('rechaza uno roto (por ejemplo, un localStorage viejo o editado)', () => {
    expect(normalizeContentPlan(null)).toBeNull();
    expect(normalizeContentPlan({ ...valid, from: 'ayer' })).toBeNull();
    expect(normalizeContentPlan({ ...valid, eventId: 'x' })).toBeNull();
  });
});
