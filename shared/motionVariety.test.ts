import { describe, expect, it } from 'vitest';
import { MOTION_STYLES, normalizeMotionSpec, starterSpec } from './motionSpec';
import { LAYOUTS, resolveLayouts, sceneJitter, seedFromText, seededRandom } from './motionVariety';

const spec = (style: (typeof MOTION_STYLES)[number], seed: number, scenes = 6) =>
  normalizeMotionSpec({ style, seed, scenes: Array.from({ length: scenes }, (_, i) => ({ text: `Escena ${i}`, secs: 2 })) });

describe('variedad de composiciones', () => {
  it('es determinista: misma semilla, mismas composiciones; otra semilla, otra secuencia', () => {
    for (const style of MOTION_STYLES) {
      expect(resolveLayouts(spec(style, 42))).toEqual(resolveLayouts(spec(style, 42)));
      const sequences = new Set(Array.from({ length: 30 }, (_, seed) => resolveLayouts(spec(style, seed)).join('|')));
      expect(sequences.size).toBeGreaterThan(5);
    }
  });

  it('una escena nunca repite la composición de la anterior ni la de dos antes (hay catálogo de sobra)', () => {
    for (const style of MOTION_STYLES) {
      for (let seed = 0; seed < 40; seed++) {
        const l = resolveLayouts(spec(style, seed, 8));
        for (let i = 1; i < l.length; i++) expect(l[i]).not.toBe(l[i - 1]);
        if (LAYOUTS[style].length >= 4) for (let i = 2; i < l.length; i++) expect(l[i]).not.toBe(l[i - 2]);
      }
    }
  });

  it('solo elige composiciones del catálogo del estilo', () => {
    for (const style of MOTION_STYLES) {
      const keys = LAYOUTS[style].map((x) => x.key);
      for (let seed = 0; seed < 20; seed++) for (const k of resolveLayouts(spec(style, seed))) expect(keys).toContain(k);
    }
  });

  it('respeta la composición fijada en una escena y descarta las inventadas o de otro estilo', () => {
    const fixed = normalizeMotionSpec({ style: 'kinetic', seed: 7, scenes: [{ text: 'a', layout: 'gigante' }, { text: 'b', layout: 'inventada' }, { text: 'c', layout: 'clasico' }] });
    expect(fixed.scenes.map((s) => s.layout)).toEqual(['gigante', 'auto', 'clasico']);
    const l = resolveLayouts(fixed);
    expect(l[0]).toBe('gigante');
    expect(LAYOUTS.kinetic.map((x) => x.key)).toContain(l[1]);
    // «clasico» es del póster: en kinetic no vale y la semilla elige otra.
    expect(LAYOUTS.kinetic.map((x) => x.key)).toContain(l[2]);
  });

  it('los videos guardados sin semilla la sacan de su nombre (no cambian de cara al abrirlos)', () => {
    const a = normalizeMotionSpec({ title: 'Noche Neón', scenes: [{ text: 'x' }] });
    const b = normalizeMotionSpec({ title: 'Noche Neón', scenes: [{ text: 'x' }] });
    expect(a.seed).toBe(b.seed);
    expect(a.seed).toBe(seedFromText('Noche Neón'));
    expect(normalizeMotionSpec({ title: 'Otro', scenes: [{ text: 'x' }] }).seed).not.toBe(a.seed);
    expect(normalizeMotionSpec({ seed: 123, scenes: [{ text: 'x' }] }).seed).toBe(123);
    expect(normalizeMotionSpec({ seed: -5, scenes: [{ text: 'x' }] }).seed).toBeGreaterThanOrEqual(0);
  });

  it('la variación fina y el generador son estables y están en rango', () => {
    expect(sceneJitter(5, 2)).toEqual(sceneJitter(5, 2));
    expect(sceneJitter(5, 2)).not.toEqual(sceneJitter(5, 3));
    const j = sceneJitter(99, 1);
    for (const v of [j.x, j.y, j.r]) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    const r = seededRandom(1);
    const nums = Array.from({ length: 200 }, () => r());
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums)).toBeLessThan(1);
  });

  it('cada plantilla de partida trae un estilo con catálogo', () => {
    expect(resolveLayouts(starterSpec('anuncio', 'poster')).length).toBeGreaterThan(0);
  });
});
