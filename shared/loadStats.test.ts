import { describe, expect, it } from 'vitest';
import { expectedRps, percentile, requestsPerSecondPerUser, summarize, verdict, type Sample } from './loadStats';

const s = (endpoint: string, ms: number, ok = true, status = 200): Sample => ({ endpoint, ms, ok, status });

describe('percentile', () => {
  it('rango más cercano, y 0 sin datos', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile([], 95)).toBe(0);
    expect(percentile([7], 99)).toBe(7);
  });
});

describe('summarize y verdict', () => {
  const samples = [...Array.from({ length: 98 }, () => s('party.getSession', 120)), s('party.getSession', 900), s('party.swipeDeck', 2500, false, 500)];
  it('resume por endpoint, con errores y estados', () => {
    const r = summarize(samples);
    expect(r[0]).toMatchObject({ endpoint: 'party.getSession', count: 99, errors: 0 });
    expect(r[1]).toMatchObject({ endpoint: 'party.swipeDeck', errors: 1, errorRate: 1, statuses: { '500': 1 } });
  });
  it('aprueba si el p95 y los errores están dentro de la meta', () => {
    expect(verdict(Array.from({ length: 200 }, () => s('a', 300))).pass).toBe(true);
  });
  it('reprueba con latencia alta o muchos errores, y dice por qué', () => {
    const slow = verdict(Array.from({ length: 100 }, () => s('a', 1800)));
    expect(slow.pass).toBe(false);
    expect(slow.reasons[0]).toContain('p95 1800 ms');
    const bad = verdict([...Array.from({ length: 90 }, () => s('a', 100)), ...Array.from({ length: 10 }, () => s('a', 100, false, 500))]);
    expect(bad.pass).toBe(false);
    expect(bad.reasons.join(' ')).toContain('10.0 % de errores');
    expect(verdict([]).pass).toBe(false);
  });
});

describe('carga esperada', () => {
  it('una persona con la App abierta hace unos 0,5 pedidos por segundo; 120 personas, unos 80', () => {
    expect(requestsPerSecondPerUser()).toBeCloseTo(0.5, 1);
    expect(expectedRps(120)).toBeGreaterThan(60);
    expect(expectedRps(120)).toBeLessThan(100);
  });
});
