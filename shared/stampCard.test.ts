import { describe, expect, it } from 'vitest';
import { stampCardState, stampRewardCode, visitCompletingCard, type StampVisit } from './stampCard';

const visits = (n: number): StampVisit[] => Array.from({ length: n }, (_, i) => ({ eventId: i + 1, title: `Fiesta ${i + 1}`, date: null }));

describe('tarjeta de sellos', () => {
  it('parte con 1 sello de regalo y faltan 5', () => {
    const s = stampCardState([]);
    expect(s.filled).toBe(1);
    expect(s.remaining).toBe(5);
    expect(s.completedCards).toBe(0);
    expect(s.slots.map((x) => x.kind)).toEqual(['regalo', 'vacio', 'vacio', 'vacio', 'vacio', 'vacio']);
  });

  it('cada fiesta suma un sello', () => {
    const s = stampCardState(visits(3));
    expect(s.filled).toBe(4);
    expect(s.remaining).toBe(2);
    expect(s.slots[3]).toEqual({ kind: 'visita', visit: { eventId: 3, title: 'Fiesta 3', date: null } });
  });

  it('con 5 fiestas se completa la primera tarjeta y empieza una nueva vacía', () => {
    const s = stampCardState(visits(5));
    expect(s.completedCards).toBe(1);
    expect(s.filled).toBe(0);
    expect(s.remaining).toBe(6);
    expect(visitCompletingCard(visits(5), 1)?.eventId).toBe(5);
  });

  it('las tarjetas siguientes no traen regalo: la segunda se completa con 6 fiestas más', () => {
    expect(stampCardState(visits(10)).completedCards).toBe(1);
    const s = stampCardState(visits(11));
    expect(s.completedCards).toBe(2);
    expect(visitCompletingCard(visits(11), 2)?.eventId).toBe(11);
    expect(stampCardState(visits(13)).slots.map((x) => x.kind)).toEqual(['visita', 'visita', 'vacio', 'vacio', 'vacio', 'vacio']);
  });

  it('el código del premio es siempre el mismo para el mismo cliente y premio', () => {
    expect(stampRewardCode(42, 1)).toBe('SELLOS-42-1');
    expect(stampRewardCode(42, 2)).not.toBe(stampRewardCode(42, 1));
  });
});
