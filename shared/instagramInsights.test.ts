import { describe, expect, it } from 'vitest';
import { averagesByType, insightsPromptSummary, interestScore, parseInsightMetrics, topBy, type PostInsight } from './instagramInsights';

const post = (o: Partial<PostInsight>): PostInsight => ({
  id: 'x', type: 'image', caption: 'hola', permalink: 'https://instagram.com/p/x', thumbnail: null, timestamp: '2026-10-01T00:00:00Z',
  likes: 0, comments: 0, reach: null, views: null, saved: null, shares: null, ...o,
});

describe('instagramInsights', () => {
  it('lee los dos formatos de Meta', () => {
    expect(parseInsightMetrics({ data: [{ name: 'reach', values: [{ value: 120 }] }, { name: 'saved', total_value: { value: 4 } }] }))
      .toEqual({ reach: 120, saved: 4 });
    expect(parseInsightMetrics(null)).toEqual({});
  });
  it('guardados y compartidos pesan más', () => {
    expect(interestScore(post({ saved: 2, shares: 1, comments: 1, likes: 5 }))).toBe(6 + 3 + 2 + 5);
    const ranked = topBy([post({ id: 'a', likes: 30 }), post({ id: 'b', saved: 12 })], 'interest');
    expect(ranked[0].id).toBe('b');
  });
  it('promedios por formato', () => {
    const avg = averagesByType([post({ type: 'reel', reach: 100 }), post({ type: 'reel', reach: 300 }), post({ type: 'image', reach: 50 })]);
    expect(avg[0]).toMatchObject({ type: 'reel', count: 2, reach: 200 });
  });
  it('resumen vacío sin datos de alcance', () => {
    expect(insightsPromptSummary({ generatedAt: '', posts: [post({})], missingPermission: true, error: null })).toBe('');
    expect(insightsPromptSummary({ generatedAt: '', posts: [post({ reach: 10 })], missingPermission: false, error: null })).toContain('ESTADÍSTICAS REALES');
  });
});
