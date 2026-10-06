import { describe, it, expect } from 'vitest';
import { stepsFor, stepSeconds, zoneCutoff, SCENES, CUTOFF_CLOSED_HZ, CUTOFF_NEAR_HZ } from './config';

const kinds = (scene: 'AMBIENT' | 'TECH' | 'PERREO', step: number) => stepsFor(scene, step).map((h) => h.kind);
const allSteps = (scene: 'AMBIENT' | 'TECH' | 'PERREO') =>
  Array.from({ length: 32 }, (_, i) => stepsFor(scene, i)).flat();

describe('patrones rítmicos', () => {
  it('Tech es 4x4: bombo en cada negra y hi-hat abierto al contratiempo', () => {
    for (const s of [0, 4, 8, 12]) expect(kinds('TECH', s)).toContain('kick');
    for (const s of [1, 2, 3, 5, 6, 7]) expect(kinds('TECH', s)).not.toContain('kick');
    for (const s of [2, 6, 10, 14]) expect(kinds('TECH', s)).toContain('openHat');
  });

  it('Perreo es dembow: bombo en negras y caja sincopada en 3, 6, 11 y 14', () => {
    for (const s of [0, 4, 8, 12]) expect(kinds('PERREO', s)).toContain('kick');
    for (const s of [3, 6, 11, 14]) expect(kinds('PERREO', s)).toContain('snare');
    expect(kinds('PERREO', 5)).not.toContain('snare');
  });

  it('el ambiente es solo graves y bombo suave: nada agudo que se cuele por la pared', () => {
    const used = new Set(allSteps('AMBIENT').map((h) => h.kind));
    expect([...used].sort()).toEqual(['kick', 'rumble']);
  });

  it('el patrón se repite cada compás (16 pasos) salvo los acentos de compases alternos', () => {
    expect(kinds('TECH', 0)).toEqual(kinds('TECH', 32));
    expect(kinds('PERREO', 4)).toEqual(kinds('PERREO', 36));
  });

  it('todas las notas y velocidades son válidas', () => {
    for (const scene of ['AMBIENT', 'TECH', 'PERREO'] as const) {
      for (const hit of allSteps(scene)) {
        expect(hit.vel).toBeGreaterThan(0);
        expect(hit.vel).toBeLessThanOrEqual(1);
        if (['bass', 'sub', 'pluck'].includes(hit.kind)) expect(hit.freq).toBeGreaterThan(20);
      }
    }
  });
});

describe('tiempos y filtro', () => {
  it('un paso a 120 BPM dura 125 ms', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 5);
  });

  it('Perreo va más lento que Tech', () => {
    expect(SCENES.PERREO.bpm).toBeLessThan(SCENES.TECH.bpm);
  });

  it('la puerta se abre: el filtro sube con el nivel y se mantiene en rango', () => {
    expect(zoneCutoff(0)).toBeCloseTo(CUTOFF_CLOSED_HZ, 3);
    expect(zoneCutoff(1)).toBeCloseTo(CUTOFF_NEAR_HZ, 3);
    expect(zoneCutoff(0.5)).toBeGreaterThan(zoneCutoff(0.2));
    expect(zoneCutoff(-5)).toBeCloseTo(CUTOFF_CLOSED_HZ, 3);
    expect(zoneCutoff(9)).toBeCloseTo(CUTOFF_NEAR_HZ, 3);
  });
});
