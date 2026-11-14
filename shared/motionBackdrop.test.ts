import { describe, expect, it } from 'vitest';
import {
  BACKDROP_GRID, BACKDROP_HZ, BACKDROP_ZONES, analyzeFrame, backdropClipSecs, backdropSamples, buildBackdropAnalysis, calmestZone, legibilityFor, normalizeBackdrop,
  type FrameStat, type MotionBackdrop,
} from './motionBackdrop';
import { cleanMediaUrl, normalizeMotionSpec } from './motionSpec';

/** Un cuadro RGBA de 96×54 donde cada franja (arriba, centro, abajo) es un gris parejo (0–255), o con ruido si `noisy`. */
function frame(grays: [number, number, number], noisy = false): FrameStat {
  const w = 96, h = 54;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const z = Math.min(2, Math.floor((y * 3) / h));
    for (let x = 0; x < w; x++) {
      const v = noisy ? (((x * 7 + y * 13) % 5) * 50) : grays[z];
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return analyzeFrame(data, w, h);
}

/** Un video de fondo sintético: `seconds` segundos con la misma luz y detalle en cada franja. */
function backdrop(seconds: number, luma: number, busy = 0, extra: Partial<MotionBackdrop> = {}): MotionBackdrop {
  const n = backdropSamples(seconds) * BACKDROP_ZONES;
  return { url: 'https://x.public.blob.vercel-storage.com/v.mp4', name: 'v.mp4', duration: seconds, start: 0, loop: 'repetir', mix: 0, audio: 'silencio', adapt: 'auto', luma: Array(n).fill(luma), busy: Array(n).fill(busy), cuts: [], ...extra };
}

describe('análisis de un cuadro', () => {
  it('mide la luz de cada franja por separado', () => {
    const f = frame([240, 128, 10]);
    expect(f.luma[0]).toBeGreaterThan(85);
    expect(f.luma[1]).toBeGreaterThan(40);
    expect(f.luma[1]).toBeLessThan(60);
    expect(f.luma[2]).toBeLessThan(10);
    expect(f.grid).toHaveLength(BACKDROP_GRID.w * BACKDROP_GRID.h);
  });
  it('un cuadro parejo casi no tiene detalle y uno con ruido tiene mucho', () => {
    expect(Math.max(...frame([120, 120, 120]).busy)).toBeLessThan(8);
    expect(Math.min(...frame([120, 120, 120], true).busy)).toBeGreaterThan(60);
  });
});

describe('cortes de plano', () => {
  it('detecta el salto de un plano a otro y no el movimiento suave', () => {
    // 12 s a 2 por segundo: un plano claro hasta el segundo 6 y uno oscuro después; en el medio, cambios suaves.
    const frames = Array.from({ length: 24 }, (_, i) => (i < 12 ? frame([200 - i, 200 - i, 200 - i]) : frame([40 + (i - 12), 40, 40])));
    const { cuts } = buildBackdropAnalysis(frames);
    expect(cuts).toEqual([6]);
  });
  it('no inventa cortes en un video parejo', () => {
    expect(buildBackdropAnalysis(Array.from({ length: 20 }, () => frame([100, 100, 100]))).cuts).toEqual([]);
  });
});

describe('legibilidad: cómo se ve el texto sobre el video', () => {
  it('sobre un video claro el texto es oscuro, y sobre uno oscuro es claro', () => {
    expect(legibilityFor(backdrop(10, 90), 0, 3, [2]).ink).toBe('oscuro');
    expect(legibilityFor(backdrop(10, 8), 0, 3, [2]).ink).toBe('claro');
  });
  it('en un gris medio no hace falta oscurecer casi nada; en uno muy claro con texto claro sí', () => {
    expect(legibilityFor(backdrop(10, 45), 0, 3, [1]).scrim).toBeLessThanOrEqual(0.12);
    const forced = legibilityFor(backdrop(10, 95, 0, { adapt: 'claro' }), 0, 3, [1]);
    expect(forced.ink).toBe('claro');
    expect(forced.scrim).toBeGreaterThan(0.5);
    expect(forced.scrim).toBeLessThanOrEqual(0.72);
  });
  it('lo forzado manda sobre lo medido', () => {
    expect(legibilityFor(backdrop(10, 8, 0, { adapt: 'oscuro' }), 0, 3, [0]).ink).toBe('oscuro');
  });
  it('el contorno crece con el detalle', () => {
    expect(legibilityFor(backdrop(10, 50, 0), 0, 3, [1]).stroke).toBe(0);
    expect(legibilityFor(backdrop(10, 50, 90), 0, 3, [1]).stroke).toBe(1);
  });
  it('mira solo las franjas donde va el texto y solo el tramo de la escena', () => {
    // Arriba claro y abajo oscuro; y el video se oscurece pasado el segundo 5.
    const n = backdropSamples(10);
    const luma = Array.from({ length: n * 3 }, (_, i) => (Math.floor(i / 3) / BACKDROP_HZ >= 5 ? 5 : i % 3 === 0 ? 92 : 5));
    const b = backdrop(10, 0, 0, { luma });
    expect(legibilityFor(b, 0, 4, [0]).ink).toBe('oscuro');
    expect(legibilityFor(b, 0, 4, [2]).ink).toBe('claro');
    expect(legibilityFor(b, 5, 9, [0]).ink).toBe('claro');
  });
  it('es determinista', () => {
    const b = backdrop(10, 60, 40);
    expect(legibilityFor(b, 1, 4, [1])).toEqual(legibilityFor(b, 1, 4, [1]));
  });
  it('encuentra la franja más tranquila (y en un empate, la de abajo)', () => {
    const n = backdropSamples(10);
    const busy = Array.from({ length: n * 3 }, (_, i) => (i % 3 === 1 ? 5 : 80));
    expect(calmestZone(backdrop(10, 50, 0, { busy }), 0, 5)).toBe(1);
    expect(calmestZone(backdrop(10, 50, 30), 0, 5)).toBe(2);
  });
});

describe('recorte y repetición', () => {
  it('parte en el inicio del tramo y, al acabarse, repite o se queda quieto', () => {
    const rep = backdrop(10, 50, 0, { start: 4, loop: 'repetir' }); // tramo de 6 s
    expect(backdropClipSecs(rep, 0)).toBe(4);
    expect(backdropClipSecs(rep, 5)).toBe(9);
    expect(backdropClipSecs(rep, 6)).toBe(4); // vuelve al inicio del tramo
    expect(backdropClipSecs(rep, 13)).toBe(5);
    const quieto = backdrop(10, 50, 0, { start: 4, loop: 'congelar' });
    expect(backdropClipSecs(quieto, 30)).toBeLessThan(10);
    expect(backdropClipSecs(quieto, 30)).toBeGreaterThan(9.9);
  });
});

describe('limpieza de lo guardado', () => {
  const raw = { url: 'https://x.public.blob.vercel-storage.com/v.mp4', name: '  mi  video.mp4 ', duration: 8, start: 2, luma: [10, 20, 30], busy: [5], cuts: [3, 99, -1, 'x', 5] };
  it('ajusta las muestras al largo del video, ordena los cortes y descarta lo imposible', () => {
    const b = normalizeBackdrop(raw, cleanMediaUrl)!;
    expect(b.luma).toHaveLength(backdropSamples(8) * BACKDROP_ZONES);
    expect(b.busy).toHaveLength(backdropSamples(8) * BACKDROP_ZONES);
    expect(b.cuts).toEqual([3, 5]);
    expect(b.name).toBe('mi video.mp4');
    expect(b).toMatchObject({ loop: 'repetir', adapt: 'auto', audio: 'silencio', mix: 0 });
  });
  it('rechaza lo que no sirve: sin URL https, sin análisis o de duración imposible', () => {
    expect(normalizeBackdrop({ ...raw, url: 'http://x.cl/v.mp4' }, cleanMediaUrl)).toBeNull();
    expect(normalizeBackdrop({ ...raw, luma: [] }, cleanMediaUrl)).toBeNull();
    expect(normalizeBackdrop({ ...raw, duration: 0.2 }, cleanMediaUrl)).toBeNull();
    expect(normalizeBackdrop({ ...raw, duration: 9999 }, cleanMediaUrl)).toBeNull();
    expect(normalizeBackdrop(null, cleanMediaUrl)).toBeNull();
  });
  it('el inicio del tramo siempre deja al menos 1 s de video, y los valores raros vuelven a lo normal', () => {
    const b = normalizeBackdrop({ ...raw, start: 99, loop: 'raro', adapt: 'raro', mix: 500 }, cleanMediaUrl)!;
    expect(b.start).toBe(7);
    expect(b).toMatchObject({ loop: 'repetir', adapt: 'auto', mix: 100 });
  });
  it('un video sin fondo guardado sigue sin fondo, y la receta lo conserva si es válido', () => {
    expect(normalizeMotionSpec({ scenes: [{ text: 'a' }] }).backdrop).toBeNull();
    expect(normalizeMotionSpec({ scenes: [{ text: 'a' }], backdrop: raw }).backdrop?.duration).toBe(8);
  });
});

import { backdropPlan, describePlan } from './motionBackdropPlan';
import { layoutZone } from './motionVariety';
import { motionTimeline } from './motionSpec';
import { isAllowedAssetUrl, cleanRenderProject } from './studioRender';

describe('plan de legibilidad por escena', () => {
  const scenes = [{ text: 'Hola', secs: 3 }, { text: 'Chao', secs: 3 }, { text: 'Fin', secs: 3 }];
  it('cada escena decide con lo que hay detrás en ESE momento del video', () => {
    // El video es claro los primeros 4 s y oscuro después.
    const n = backdropSamples(12);
    const luma = Array.from({ length: n * 3 }, (_, i) => (Math.floor(i / 3) / BACKDROP_HZ < 4 ? 92 : 6));
    const spec = normalizeMotionSpec({ template: 'anuncio', style: 'liquid', music: 'none', outro: false, scenes, backdrop: { ...backdrop(12, 0), luma } });
    const plan = backdropPlan(spec, motionTimeline(spec), ['centro', 'centro', 'centro'])!;
    expect(plan.scenes.map((s) => s.ink)).toEqual(['oscuro', 'claro', 'claro']);
    expect(describePlan(plan)).toBe('2 con texto claro y 1 con texto oscuro');
  });
  it('sin video, o con la adaptación apagada, no hay plan', () => {
    const base = { template: 'anuncio', style: 'liquid', music: 'none', outro: false, scenes };
    expect(backdropPlan(normalizeMotionSpec(base), motionTimeline(normalizeMotionSpec(base)), [])).toBeNull();
    const off = normalizeMotionSpec({ ...base, backdrop: { ...backdrop(12, 50), adapt: 'apagada' } });
    expect(backdropPlan(off, motionTimeline(off), [])).toBeNull();
  });
  it('la firma del final también se adapta', () => {
    const spec = normalizeMotionSpec({ template: 'anuncio', style: 'liquid', music: 'none', outro: true, scenes, backdrop: backdrop(12, 90) });
    expect(backdropPlan(spec, motionTimeline(spec), ['centro', 'centro', 'centro'])!.outro?.ink).toBe('oscuro');
  });
  it('la zona del texto sale de la composición', () => {
    expect(layoutZone('liquid', 'bajo')).toBe('bottom');
    expect(layoutZone('liquid', 'alto')).toBe('top');
    expect(layoutZone('editorial', 'abajo')).toBe('bottom');
    expect(layoutZone('editorial', 'partido')).toBe('split');
    expect(layoutZone('poster', 'clasico')).toBe('split');
    expect(layoutZone('softui', 'arriba')).toBe('center');
  });
});

describe('grabación: el video de fondo y la canción solo del sitio o de Vercel Blob', () => {
  const site = 'https://mansionplayroom.cl';
  const withBackdrop = (url: string) => ({ scenes: [{ text: 'a' }], backdrop: { ...backdrop(8, 50), url } });
  it('deja pasar un video del almacenamiento y completa las rutas del sitio', () => {
    expect(cleanRenderProject(withBackdrop('https://abc.public.blob.vercel-storage.com/v.mp4'), site).spec.backdrop?.url).toBe('https://abc.public.blob.vercel-storage.com/v.mp4');
    expect(cleanRenderProject(withBackdrop('/motion/v.mp4'), site).spec.backdrop?.url).toBe('https://mansionplayroom.cl/motion/v.mp4');
  });
  it('rechaza un video de otro lado', () => {
    expect(() => cleanRenderProject(withBackdrop('https://otro.com/v.mp4'), site)).toThrow(/no viene del sitio/);
    expect(isAllowedAssetUrl('https://otro.com/v.mp4', site)).toBe(false);
  });
});
