import { describe, expect, it } from 'vitest';
import { AI_MODELS, motionCallEstimateUsd } from './studioAi';
import { MOTION_FORMATS, MOTION_SIZES } from './motionSpec';

describe('costo estimado por video', () => {
  it('Haiku es más barato que Sonnet, y Sonnet más barato que Opus', () => {
    const [haiku, sonnet, opus] = AI_MODELS.map((m) => motionCallEstimateUsd(m));
    expect(haiku).toBeLessThan(sonnet);
    expect(sonnet).toBeLessThan(opus);
    expect(opus).toBeGreaterThan(0);
  });
});

describe('formato 3:4 (feed de Instagram)', () => {
  it('existe con tamaño 1080×1440', () => {
    expect(MOTION_FORMATS).toContain('retrato');
    expect(MOTION_SIZES.retrato).toEqual({ width: 1080, height: 1440 });
  });
});
