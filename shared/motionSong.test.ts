import { describe, expect, it } from 'vitest';
import {
  analyzeSong, bestSongStart, normalizeSong, snapToBar, songBarStarts, songBeatState, songEnergyAt, songHitFrames,
  type MotionSong,
} from './motionSong';

const SR = 22050;

/** Pista de prueba: un bombo en cada pulso (más fuerte en el tiempo 1 del compás), un hi-hat entre pulsos y, desde
 * `dropAt`, el doble de volumen. `offset` = segundo del primer bombo. */
function track(bpm: number, secs: number, offset: number, dropAt = Infinity): Float32Array {
  const out = new Float32Array(Math.floor(secs * SR));
  const period = 60 / bpm;
  const kick = (t0: number, gain: number) => {
    const i0 = Math.round(t0 * SR);
    for (let k = 0; k < SR * 0.18 && i0 + k < out.length; k++) {
      const t = k / SR;
      out[i0 + k] += gain * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 40)) * t) * Math.exp(-t * 22);
    }
  };
  const hat = (t0: number, gain: number) => {
    const i0 = Math.round(t0 * SR);
    let seed = i0 * 2654435761 % 4294967296;
    for (let k = 0; k < SR * 0.03 && i0 + k < out.length; k++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      out[i0 + k] += gain * ((seed / 4294967296) * 2 - 1) * Math.exp(-k / (SR * 0.008));
    }
  };
  for (let n = 0; offset + n * period < secs; n++) {
    const t = offset + n * period;
    const g = (n % 4 === 0 ? 0.9 : 0.6) * (t >= dropAt ? 1 : 0.55);
    kick(t, g);
    hat(t + period / 2, 0.12 * (t >= dropAt ? 2 : 1));
  }
  return out;
}

describe('analyzeSong', () => {
  for (const [bpm, offset] of [[120, 0.23], [96, 0.4], [124, 0.05]] as const) {
    it(`encuentra ${bpm} BPM y el desfase (${offset} s)`, () => {
      const a = analyzeSong(track(bpm, 40, offset), SR);
      expect(Math.abs(a.bpm - bpm)).toBeLessThan(0.4);
      // El tiempo 1 cae sobre un bombo: la distancia a la rejilla real es mínima (módulo un compás).
      const bar = (60 / bpm) * 4;
      const d = (((a.downbeat - offset) % bar) + bar) % bar;
      expect(Math.min(d, bar - d)).toBeLessThan(0.04);
      expect(a.duration).toBeCloseTo(40, 0);
      expect(a.energy.length).toBe(Math.ceil(a.duration * 10));
      expect(a.hits.length).toBeGreaterThan(40 * (bpm / 60) * 0.7);
    });
  }

  it('el tiempo 1 es el bombo más fuerte', () => {
    const a = analyzeSong(track(120, 40, 0.5), SR);
    // Los bombos fuertes caen cada 2 s desde 0,5 s.
    const d = (((a.downbeat - 0.5) % 2) + 2) % 2;
    expect(Math.min(d, 2 - d)).toBeLessThan(0.04);
  });

  it('el mejor fragmento es el que tiene el drop', () => {
    const a = analyzeSong(track(120, 60, 0, 30), SR);
    const song: MotionSong = { ...a, url: 'https://x/a.mp3', name: 'a', start: 0, volume: 0.9, muteOnExport: false };
    const start = bestSongStart(song, 20);
    // Con el doble de volumen desde el segundo 30, el tramo elegido está dentro (o arranca justo antes) del drop.
    expect(start).toBeGreaterThanOrEqual(26);
    expect(start + 20).toBeLessThanOrEqual(a.duration + 0.01);
  });
});

describe('rejilla y compases', () => {
  const song: MotionSong = {
    url: 'https://x/a.mp3', name: 'a', bpm: 120, downbeat: 0.5, start: 0.5, duration: 60,
    energy: Array.from({ length: 600 }, (_, i) => (i < 300 ? 20 : 90)), hits: [0.5, 1, 1.5, 2, 2.5], volume: 0.9, muteOnExport: false,
  };

  it('los compases parten cada 4 pulsos desde el tiempo 1', () => {
    const bars = songBarStarts(song);
    expect(bars[0]).toBe(0.5);
    expect(bars[1]).toBeCloseTo(2.5, 3);
    expect(bars.every((t) => t < 60)).toBe(true);
  });

  it('snapToBar elige el compás más cercano', () => {
    expect(snapToBar(song, 5.4)).toBeCloseTo(4.5, 3);
    expect(snapToBar(song, 0)).toBeCloseTo(0.5, 3);
    expect(snapToBar(song, 9999)).toBeLessThan(60);
  });

  it('el pulso cae en cada pulso y el golpe en los golpes fuertes (relativos al inicio del video)', () => {
    const hitFrames = songHitFrames(song, 30);
    expect(hitFrames).toEqual([0, 15, 30, 45, 60]);
    const on = songBeatState(song, hitFrames, 30, 30); // pulso 2 (índice 2), justo en el golpe
    expect(on.index).toBe(2);
    expect(on.pulse).toBeCloseTo(1, 5);
    expect(on.hit).toBeCloseTo(1, 5);
    const late = songBeatState(song, hitFrames, 36, 30);
    expect(late.pulse).toBeLessThan(0.2);
    expect(late.hit).toBeLessThan(on.hit);
    expect(songBeatState(song, hitFrames, 0, 30).inBar).toBe(0);
    expect(songBeatState(song, hitFrames, 61, 30).inBar).toBe(0 + (4 % 4));
  });

  it('la energía se lee desde el inicio del video', () => {
    expect(songEnergyAt(song, 0)).toBeCloseTo(20 / 99, 3);
    expect(songEnergyAt(song, 40)).toBeCloseTo(90 / 99, 3);
  });
});

describe('normalizeSong', () => {
  const ok = { url: 'https://blob.example/a.mp3', name: '  Mi canción  ', bpm: 124.004, downbeat: 0.2, start: 4, duration: 100, energy: Array(1000).fill(50), hits: [3, 1, 2, 'x', -1, 999], volume: 2 };
  const clean = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') ? v : '');

  it('limpia y ordena', () => {
    const s = normalizeSong(ok, clean)!;
    expect(s.name).toBe('Mi canción');
    expect(s.bpm).toBe(124);
    expect(s.hits).toEqual([1, 2, 3]);
    expect(s.volume).toBe(1);
    expect(s.muteOnExport).toBe(false);
    expect(normalizeSong({ ...ok, muteOnExport: true }, clean)!.muteOnExport).toBe(true);
    expect(normalizeSong({ ...ok, muteOnExport: 'sí' }, clean)!.muteOnExport).toBe(false);
  });

  it('rechaza lo inservible', () => {
    expect(normalizeSong(null, clean)).toBeNull();
    expect(normalizeSong({ ...ok, url: 'http://x' }, clean)).toBeNull();
    expect(normalizeSong({ ...ok, bpm: 400 }, clean)).toBeNull();
    expect(normalizeSong({ ...ok, duration: 2 }, clean)).toBeNull();
    expect(normalizeSong({ ...ok, energy: [1, 2] }, clean)).toBeNull();
  });
});
