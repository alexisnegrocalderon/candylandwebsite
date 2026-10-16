import { describe, expect, it } from 'vitest';
import { summarizeAiUsage } from './aiUsage';
import { usageCostUsd } from './studioAi';

describe('summarizeAiUsage', () => {
  it('suma por función y por día, ordenado por gasto', () => {
    const s = summarizeAiUsage([
      { feature: 'mailing', model: 'x', costMicroUsd: 1000, createdAt: new Date('2026-10-10T15:00:00Z') },
      { feature: 'studio-rapido', model: 'x', costMicroUsd: 5000, createdAt: new Date('2026-10-10T16:00:00Z') },
      { feature: 'mailing', model: 'x', costMicroUsd: 2000, createdAt: new Date('2026-10-11T15:00:00Z') },
    ]);
    expect(s.totalUsd).toBeCloseTo(0.008, 6);
    expect(s.byFeature[0]).toMatchObject({ feature: 'studio-rapido', label: 'Estudio: modo Rápido', calls: 1 });
    expect(s.byFeature[1].calls).toBe(2);
    expect(s.byDay).toHaveLength(2);
  });
});

describe('usageCostUsd por familia', () => {
  it('cobra otras versiones como su familia', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(usageCostUsd('claude-sonnet-5', u)).toBe(2);
    expect(usageCostUsd('claude-haiku-4-5-20251001', u)).toBe(1);
    expect(usageCostUsd('desconocido', u)).toBe(4);
  });
});
