import { describe, expect, it } from 'vitest';
import {
  WINBACK_SEGMENTS,
  classifyWinback,
  isWinbackSegmentKey,
  winbackCampaignName,
  winbackCtaUrl,
  winbackDaysToSend,
} from './winback';

const TARGET = 100;
const LATEST = 3;

const p = (...events: number[]) => new Set(events);

describe('classifyWinback', () => {
  const classify = (participation: Record<string, Set<number>>) =>
    classifyWinback({ participation: new Map(Object.entries(participation)), latestPastEventId: LATEST, targetEventId: TARGET });

  it('clasifica a cada persona en un único grupo, por prioridad', () => {
    const r = classify({
      'fiel@x.cl': p(1, 2, 3, 4),      // 4 fiestas, incluida la última -> sigue siendo "de siempre"
      'fiel2@x.cl': p(1, 2, 5),        // 3 fiestas, ninguna la última
      'ultima@x.cl': p(3),             // solo la última
      'ultima2@x.cl': p(2, 3),         // 2 fiestas, una es la última
      'unavez@x.cl': p(1),             // una sola, anterior a la última
      'dormido@x.cl': p(1, 2),         // dos, ninguna la última
    });
    expect(r.segments.fieles).toEqual(['fiel2@x.cl', 'fiel@x.cl']);
    expect(r.segments.ultima).toEqual(['ultima2@x.cl', 'ultima@x.cl']);
    expect(r.segments.una_vez).toEqual(['unavez@x.cl']);
    expect(r.segments.dormidos).toEqual(['dormido@x.cl']);
  });

  it('nadie cae en dos grupos y nadie queda sin grupo', () => {
    const emails = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`u${i}@x.cl`, p(...[1, 2, 3, 4, 5].filter((e) => (i >> (e - 1)) & 1))]));
    const r = classify(emails);
    const all = Object.values(r.segments).flat();
    expect(new Set(all).size).toBe(all.length);
    const withPast = Object.values(emails).filter((s) => s.size > 0).length;
    expect(all.length + r.noPastEvents).toBe(Object.keys(emails).length);
    expect(withPast).toBe(all.length);
  });

  it('quien ya compró el evento al que se invita queda afuera, aunque sea de los de siempre', () => {
    const r = classify({ 'ya@x.cl': p(1, 2, 3, TARGET), 'no@x.cl': p(1) });
    expect(r.alreadyBought).toBe(1);
    expect(Object.values(r.segments).flat()).toEqual(['no@x.cl']);
  });

  it('quien solo compró el evento objetivo no es reactivación', () => {
    const r = classify({ 'solo@x.cl': p(TARGET) });
    expect(r.alreadyBought).toBe(1);
    expect(r.noPastEvents).toBe(0);
    const r2 = classify({ 'vacio@x.cl': p() });
    expect(r2.noPastEvents).toBe(1);
  });

  it('sin fiesta pasada con ventas, nadie es "de la última"', () => {
    const r = classifyWinback({ participation: new Map([['a@x.cl', p(1)], ['b@x.cl', p(1, 2)]]), latestPastEventId: null, targetEventId: TARGET });
    expect(r.segments.ultima).toEqual([]);
    expect(r.segments.una_vez).toEqual(['a@x.cl']);
    expect(r.segments.dormidos).toEqual(['b@x.cl']);
  });
});

describe('definiciones', () => {
  it('cada grupo tiene etiqueta, descripción y objetivo', () => {
    expect(WINBACK_SEGMENTS.map((s) => s.key)).toEqual(['fieles', 'ultima', 'una_vez', 'dormidos']);
    for (const s of WINBACK_SEGMENTS) {
      expect(s.label.length).toBeGreaterThan(3);
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.objective.length).toBeGreaterThan(40);
    }
  });
  it('isWinbackSegmentKey', () => {
    expect(isWinbackSegmentKey('fieles')).toBe(true);
    expect(isWinbackSegmentKey('otro')).toBe(false);
    expect(isWinbackSegmentKey(null)).toBe(false);
  });
});

describe('helpers', () => {
  it('días que tarda en salir una campaña', () => {
    expect(winbackDaysToSend(0, 60)).toBe(0);
    expect(winbackDaysToSend(60, 60)).toBe(1);
    expect(winbackDaysToSend(61, 60)).toBe(2);
    expect(winbackDaysToSend(200, 60)).toBe(4);
    expect(winbackDaysToSend(10, 0)).toBe(0);
  });
  it('link del botón con UTM propias por grupo', () => {
    const url = winbackCtaUrl('https://x.cl/', 'halloween', 'una_vez');
    expect(url).toBe('https://x.cl/checkout/halloween?utm_source=email&utm_medium=mailing&utm_campaign=reactivacion-una_vez');
  });
  it('nombre de campaña estable y acotado', () => {
    expect(winbackCampaignName('Los de siempre', 'Halloween')).toBe('Reactivación · Los de siempre · Halloween');
    expect(winbackCampaignName('x', 'y'.repeat(400))).toHaveLength(255);
  });
});
