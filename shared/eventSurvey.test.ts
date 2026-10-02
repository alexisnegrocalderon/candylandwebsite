import { describe, expect, it } from 'vitest';
import {
  computeSurveyStats,
  isInSurveyWindow,
  isSurveySendHour,
  normalizeSurveyAnalysis,
  parseSurveyAnswer,
} from './eventSurvey';

const HOUR = 60 * 60 * 1000;

describe('isSurveySendHour', () => {
  it('solo de 12:00 a 20:59 (hora de Chile)', () => {
    expect(isSurveySendHour(11)).toBe(false);
    expect(isSurveySendHour(12)).toBe(true);
    expect(isSurveySendHour(20)).toBe(true);
    expect(isSurveySendHour(21)).toBe(false);
    expect(isSurveySendHour(3)).toBe(false);
  });
});

describe('isInSurveyWindow', () => {
  const event = new Date('2026-10-30T22:00:00Z');
  it('abre 12 horas después de empezar la fiesta y cierra a los 4 días', () => {
    expect(isInSurveyWindow(event, new Date(event.getTime() + 11 * HOUR))).toBe(false);
    expect(isInSurveyWindow(event, new Date(event.getTime() + 12 * HOUR))).toBe(true);
    expect(isInSurveyWindow(event, new Date(event.getTime() + 96 * HOUR))).toBe(true);
    expect(isInSurveyWindow(event, new Date(event.getTime() + 97 * HOUR))).toBe(false);
  });
  it('no abre antes de la fiesta', () => {
    expect(isInSurveyWindow(event, new Date(event.getTime() - 5 * HOUR))).toBe(false);
  });
});

describe('parseSurveyAnswer', () => {
  it('acepta una nota entera de 1 a 5 y limpia los comentarios', () => {
    expect(parseSurveyAnswer({ rating: 5, liked: '  la   música \n genial ', improve: undefined }))
      .toEqual({ rating: 5, liked: 'la música genial', improve: '' });
  });
  it('rechaza una nota fuera de rango, decimal o que no es número', () => {
    for (const rating of [0, 6, 2.5, -1, 'x', null, undefined, NaN]) {
      expect(parseSurveyAnswer({ rating })).toBeNull();
    }
  });
  it('recorta comentarios larguísimos', () => {
    expect(parseSurveyAnswer({ rating: 3, liked: 'a'.repeat(5000) })!.liked).toHaveLength(1000);
  });
});

describe('computeSurveyStats', () => {
  it('promedio con un decimal y distribución por estrella', () => {
    const s = computeSurveyStats([5, 5, 4, 3, 1]);
    expect(s.responses).toBe(5);
    expect(s.average).toBe(3.6);
    expect(s.distribution).toEqual([1, 0, 1, 1, 2]);
  });
  it('sin respuestas no inventa un promedio, e ignora notas inválidas', () => {
    expect(computeSurveyStats([])).toEqual({ responses: 0, average: null, distribution: [0, 0, 0, 0, 0] });
    expect(computeSurveyStats([9, 0, 2.5]).responses).toBe(0);
  });
});

describe('normalizeSurveyAnalysis', () => {
  it('acepta un análisis válido y limpia las listas', () => {
    const a = normalizeSurveyAnalysis({ generatedAt: '2026-11-01T00:00:00Z', basedOnResponses: 12, summary: 'Bien', praised: ['música', '', 3], complaints: [], improvements: ['filas'] })!;
    expect(a.praised).toEqual(['música']);
    expect(a.basedOnResponses).toBe(12);
  });
  it('null si falta lo esencial', () => {
    expect(normalizeSurveyAnalysis(null)).toBeNull();
    expect(normalizeSurveyAnalysis({ summary: 'x' })).toBeNull();
  });
});
