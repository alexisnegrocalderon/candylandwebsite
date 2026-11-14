import { describe, expect, it } from 'vitest';
import { MASCOT_INFLATE_FRAMES, mascotTimes, normalizeMascot } from './motionMascot';
import { motionTimeline, normalizeMotionSpec } from './motionSpec';

const scenes = [{ text: 'Uno', secs: 3 }, { text: 'Dos', secs: 3 }, { text: 'Tres', secs: 3 }];
const dog = { kind: 'perrito', color: 'oro', size: 'chico', pop: true };

describe('normalizeMascot', () => {
  it('sin perrito o con uno desconocido no hay', () => {
    expect(normalizeMascot(null)).toBeNull();
    expect(normalizeMascot({ kind: 'gato' })).toBeNull();
    expect(normalizeMotionSpec({}).mascot).toBeNull();
  });
  it('acepta la pareja y los colores nuevos', () => {
    expect(normalizeMascot({ kind: 'pareja' })).toMatchObject({ kind: 'pareja', color: 'magenta' });
    for (const color of ['rojo', 'amarillo', 'multi', 'oro', 'plata']) expect(normalizeMascot({ kind: 'perrito', color })!.color).toBe(color);
  });
  it('limpia lo que llega', () => {
    expect(normalizeMascot({ kind: 'perrito', color: 'verde', size: 'gigante' })).toEqual({ kind: 'perrito', color: 'magenta', size: 'grande', style: 'globo3d', pattern: 'auto', pop: true });
    expect(normalizeMascot({ ...dog, pop: false })).toMatchObject({ color: 'oro', size: 'chico', pop: false });
  });
});

describe('mascotTimes', () => {
  const at = (extra: Record<string, unknown>) => {
    const spec = normalizeMotionSpec({ template: 'anuncio', music: 'none', scenes, mascot: dog, ...extra });
    const tl = motionTimeline(spec);
    return { spec, tl, times: mascotTimes(spec, tl, 30) };
  };

  it('gira en cada corte de escena', () => {
    const { tl, times } = at({ outro: false });
    expect(times.spins).toEqual([tl.scenes[1].from, tl.scenes[2].from]);
  });

  it('con firma revienta cuando entra el logo', () => {
    const { tl, times } = at({ outro: true });
    expect(times.popAt).toBe(tl.outroFrom);
    expect(times.deflateAt).toBeNull();
  });

  it('sin firma revienta antes del final, con tiempo para el confeti', () => {
    const { tl, times } = at({ outro: false });
    expect(times.popAt).toBe(tl.total - 36);
  });

  it('con canción revienta en el golpe fuerte más cercano', () => {
    const song = { url: 'https://blob.example/a.mp3', name: 'a', bpm: 120, downbeat: 0, start: 0, duration: 60, energy: Array(600).fill(50), hits: [] as number[], volume: 0.9 };
    const outroFrom = at({ outro: true, song }).tl.outroFrom!;
    // Un golpe 0,3 s después de que entra la firma (dentro del medio segundo) y otro lejos.
    const hit = outroFrom / 30 + 0.3;
    const { times } = at({ outro: true, song: { ...song, hits: [2, hit] } });
    expect(times.popAt).toBe(Math.round(hit * 30));
    // Si el golpe más cercano está a más de medio segundo, revienta justo en la firma.
    expect(at({ outro: true, song: { ...song, hits: [outroFrom / 30 + 0.9] } }).times.popAt).toBe(outroFrom);
  });

  it('nunca revienta antes de inflarse', () => {
    const { times } = at({ outro: false, scenes: [{ text: 'Uno', secs: 1 }] });
    expect(times.popAt == null || times.popAt >= MASCOT_INFLATE_FRAMES + 8).toBe(true);
  });

  it('en loop sin reventar se desinfla al final (termina como empezó)', () => {
    const { tl, times } = at({ outro: false, loop: true, music: 'pulse', mascot: { ...dog, pop: false } });
    expect(times.popAt).toBeNull();
    expect(times.deflateAt).toBe(tl.total - 14);
  });

  it('sin perrito no hay momentos', () => {
    const { times } = at({ mascot: null });
    expect(times).toMatchObject({ spins: [], popAt: null, deflateAt: null });
  });
});
