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

import {
  LOOK_ALL_AUTO, LOOK_CLASSIC, LOOK_OPTIONS, LOOK_PARTS, freshSeed, lookDistance, lookHasAuto, lookSignature, lookSummary, normalizeLook, resolveLook, styleHasEntry,
} from './motionVariety';
import { MOTION_STYLES as STYLES, normalizeMotionSpec as normalize, starterSpec as starter } from './motionSpec';

describe('look del video', () => {
  it('un video guardado sin look se queda con el clásico: no cambia de cara', () => {
    const old = normalize({ title: 'Video viejo', style: 'liquid', scenes: [{ text: 'Hola' }] });
    expect(old.look).toEqual(LOOK_CLASSIC);
    expect(resolveLook(old)).toEqual(LOOK_CLASSIC);
    expect(lookSummary(old)).toBe('Clásico del estilo');
  });

  it('los videos nuevos (puntos de partida) parten con todo en automático', () => {
    for (const style of STYLES) expect(starter('anuncio', style).look).toEqual(LOOK_ALL_AUTO);
  });

  it('limpia lo que llega: un valor desconocido vuelve al clásico de esa parte', () => {
    const look = normalizeLook({ cut: 'iris', entry: 'explosion', texture: 'auto', deco: 7 });
    expect(look).toEqual({ ...LOOK_CLASSIC, cut: 'iris', texture: 'auto' });
  });

  it('es determinista y siempre devuelve opciones que existen', () => {
    for (const style of STYLES) {
      for (let seed = 0; seed < 60; seed++) {
        const spec = { style, seed, look: LOOK_ALL_AUTO };
        const a = resolveLook(spec);
        expect(resolveLook(spec)).toEqual(a);
        for (const part of LOOK_PARTS) expect(LOOK_OPTIONS[part] as readonly string[]).toContain(a[part]);
        if (!styleHasEntry(style)) expect(a.entry).toBe('estilo');
      }
    }
  });

  it('lo fijado a mano se respeta, y fijar una parte no cambia lo que la semilla eligió para las demás', () => {
    const auto = resolveLook({ style: 'liquid', seed: 4242, look: LOOK_ALL_AUTO });
    const pinned = resolveLook({ style: 'liquid', seed: 4242, look: { ...LOOK_ALL_AUTO, deco: 'sello', cut: 'iris' } });
    expect(pinned.deco).toBe('sello');
    expect(pinned.cut).toBe('iris');
    for (const part of ['entry', 'texture', 'camera', 'kicker'] as const) expect(pinned[part]).toBe(auto[part]);
  });

  it('con semillas distintas salen muchos looks distintos del mismo estilo', () => {
    for (const style of ['liquid', 'glitch', 'editorial', 'kinetic'] as const) {
      const seen = new Set<string>();
      for (let seed = 0; seed < 200; seed++) seen.add(lookSignature({ style, seed, look: LOOK_ALL_AUTO }));
      expect(seen.size).toBeGreaterThan(60);
    }
  });

  it('«Sorpréndeme» elige una semilla cuyo look no se parece al actual ni a los últimos', () => {
    const rand = (() => { let n = 7; return () => { n = (n * 16807) % 2147483647; return n / 2147483647; }; })();
    const avoid: string[] = [];
    for (let k = 0; k < 8; k++) {
      const seed = freshSeed({ style: 'liquid', look: LOOK_ALL_AUTO }, avoid, rand);
      const sig = lookSignature({ style: 'liquid', seed, look: LOOK_ALL_AUTO });
      // Distinto en al menos tres partes del video anterior.
      if (avoid.length) expect(lookDistance(sig, avoid[0])).toBeGreaterThanOrEqual(3);
      expect(avoid).not.toContain(sig);
      avoid.unshift(sig);
    }
  });

  it('la distancia entre huellas cuenta las partes distintas; otro estilo es lo más lejos', () => {
    expect(lookDistance('liquid|iris|rebote|puntos|sello|empuje|caja', 'liquid|iris|rebote|puntos|sello|empuje|caja')).toBe(0);
    expect(lookDistance('liquid|iris|rebote|puntos|sello|empuje|caja', 'liquid|flash|rebote|rayas|sello|empuje|caja')).toBe(2);
    expect(lookDistance('liquid|iris|rebote|puntos|sello|empuje|caja', 'glitch|iris|rebote|puntos|sello|empuje|caja')).toBe(LOOK_PARTS.length);
  });

  it('sabe si queda algo en automático', () => {
    expect(lookHasAuto(LOOK_ALL_AUTO)).toBe(true);
    expect(lookHasAuto({ ...LOOK_CLASSIC })).toBe(false);
  });
});
