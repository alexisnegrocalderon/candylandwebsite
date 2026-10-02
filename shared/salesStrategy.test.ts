import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  normalizeSalesStrategyReport,
  normalizeSalesStrategyState,
  projectFinalUnits,
  unitsSoldAtDaysOut,
  weeklyPace,
  type SaleRow,
} from './salesStrategy';

const DAY = 24 * 60 * 60 * 1000;
const EVENT = new Date('2026-10-30T22:00:00Z');
const sale = (daysBefore: number, units = 1): SaleRow => ({ at: new Date(EVENT.getTime() - daysBefore * DAY), units, revenue: units * 20000 });

describe('daysUntil', () => {
  it('redondea hacia arriba y llega a 0 el mismo día', () => {
    expect(daysUntil(EVENT, new Date(EVENT.getTime() - 2.3 * DAY))).toBe(3);
    expect(daysUntil(EVENT, EVENT)).toBe(0);
    expect(daysUntil(EVENT, new Date(EVENT.getTime() + 2 * DAY))).toBe(-2);
  });
});

describe('unitsSoldAtDaysOut', () => {
  it('cuenta solo lo vendido con al menos esa anticipación', () => {
    const rows = [sale(30, 4), sale(10, 6), sale(2, 5), sale(0, 3)];
    expect(unitsSoldAtDaysOut(rows, EVENT, 10)).toBe(10); // las de 30 y 10 días antes
    expect(unitsSoldAtDaysOut(rows, EVENT, 0)).toBe(18);
    expect(unitsSoldAtDaysOut(rows, EVENT, 40)).toBe(0);
  });
});

describe('weeklyPace', () => {
  it('separa los últimos 7 días de los 7 anteriores e ignora lo futuro', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    const at = (daysAgo: number, units: number): SaleRow => ({ at: new Date(now.getTime() - daysAgo * DAY), units, revenue: 0 });
    const rows = [at(1, 5), at(6.5, 2), at(8, 4), at(13, 1), at(20, 9), at(-1, 7)];
    expect(weeklyPace(rows, now)).toEqual({ last7: 7, prev7: 5 });
  });
});

describe('projectFinalUnits', () => {
  it('escala por cómo cerró el evento anterior cuando hay base comparable', () => {
    // llevamos 60; el anterior llevaba 40 a esta fecha y cerró en 100 -> 150
    expect(projectFinalUnits({ unitsSoFar: 60, daysOut: 10, last7: 20, previous: { atSameDaysOut: 40, finalUnits: 100 } }))
      .toEqual({ projectedFinalUnits: 150, method: 'comparado' });
  });

  it('no compara contra un evento que a esa fecha llevaba casi nada (ruido)', () => {
    const p = projectFinalUnits({ unitsSoFar: 30, daysOut: 14, last7: 14, previous: { atSameDaysOut: 3, finalUnits: 200 } });
    expect(p).toEqual({ projectedFinalUnits: 58, method: 'ritmo' }); // 30 + 2/día * 14
  });

  it('sin evento anterior extiende el ritmo de la última semana', () => {
    expect(projectFinalUnits({ unitsSoFar: 10, daysOut: 7, last7: 7, previous: null }))
      .toEqual({ projectedFinalUnits: 17, method: 'ritmo' });
  });

  it('devuelve null si no hay base para ninguna de las dos', () => {
    expect(projectFinalUnits({ unitsSoFar: 0, daysOut: 7, last7: 0, previous: null })).toBeNull();
    expect(projectFinalUnits({ unitsSoFar: 12, daysOut: 0, last7: 5, previous: null })).toBeNull();
  });
});

describe('normalizeSalesStrategyReport / State', () => {
  const valid = {
    generatedAt: '2026-10-05T12:00:00.000Z',
    eventId: 3,
    eventTitle: 'Halloween',
    eventDate: '2026-10-30T22:00:00.000Z',
    daysOut: 25,
    numbers: { unitsSold: 40, revenue: 800000, unitsLast7: 10, unitsPrev7: 6, previousEvent: { title: 'Anterior', unitsAtSameDaysOut: 30, finalUnits: 120 }, projectedFinalUnits: 160, projectionMethod: 'comparado' },
    summary: 'Vamos bien.',
    recommendations: [
      { title: 'Flash promo', why: 'porque sí', action: 'hazla', urgency: 'alta' },
      { title: '', why: 'sin título se descarta', action: '', urgency: 'baja' },
      { title: 'Urgencia rara', why: '', action: '', urgency: 'cualquiera' },
    ],
    risks: ['uno', '', 5],
  };

  it('acepta un reporte válido y limpia lo que viene sucio', () => {
    const r = normalizeSalesStrategyReport(valid)!;
    expect(r.recommendations.map((x) => x.title)).toEqual(['Flash promo', 'Urgencia rara']);
    expect(r.recommendations[1].urgency).toBe('media');
    expect(r.risks).toEqual(['uno']);
    expect(r.numbers.projectionMethod).toBe('comparado');
  });

  it('devuelve null si está roto', () => {
    expect(normalizeSalesStrategyReport(null)).toBeNull();
    expect(normalizeSalesStrategyReport({ summary: 'x' })).toBeNull();
  });

  it('el estado arranca con el correo de los lunes prendido y sin reporte', () => {
    expect(normalizeSalesStrategyState(null)).toEqual({ weeklyEnabled: true, report: null });
    expect(normalizeSalesStrategyState({ weeklyEnabled: false, report: valid }).weeklyEnabled).toBe(false);
    expect(normalizeSalesStrategyState({ report: valid }).report?.eventTitle).toBe('Halloween');
  });
});
