import { describe, expect, it } from 'vitest';
import { nextEventId, normalizeStatusCounts, pageCount, pageRange } from './ordersPagination';

describe('pageCount / pageRange', () => {
  it('cuenta páginas', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(143, 25)).toBe(6);
  });
  it('rango de la página', () => {
    expect(pageRange(1, 25, 143)).toEqual({ from: 1, to: 25 });
    expect(pageRange(2, 25, 143)).toEqual({ from: 26, to: 50 });
    expect(pageRange(6, 25, 143)).toEqual({ from: 126, to: 143 });
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe('normalizeStatusCounts', () => {
  it('agrupa por estado y suma el total (strings de MySQL incluidos)', () => {
    expect(normalizeStatusCounts([{ status: 'approved', count: '167' }, { status: 'pending', count: 150 }, { status: 'rejected', count: 4 }]))
      .toEqual({ approved: 167, pending: 150, rejected: 4, refunded: 0, total: 321 });
  });
});

describe('nextEventId', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const events = [
    { id: 1, status: 'past', eventDate: '2026-08-01T00:00:00Z' },
    { id: 2, status: 'published', eventDate: '2026-11-20T00:00:00Z' },
    { id: 3, status: 'published', eventDate: '2026-10-31T01:00:00Z' },
    { id: 4, status: 'draft', eventDate: '2026-10-10T00:00:00Z' },
  ];
  it('elige el publicado más cercano, ignorando pasados y borradores', () => {
    expect(nextEventId(events, now)).toBe(3);
  });
  it('sin eventos próximos devuelve undefined', () => {
    expect(nextEventId([events[0], events[3]], now)).toBeUndefined();
  });
});
