import { describe, expect, it } from 'vitest';
import { cleanRenderProject, contentHash, isAllowedAssetUrl, normalizeRenderState, RENDER_TIMEOUT_MS, specHash, summarizeRender } from './studioRender';
import { normalizeMotionSpec } from './motionSpec';

const SITE = 'https://mansionplayroom.cl';

describe('isAllowedAssetUrl', () => {
  it('solo el sitio y Vercel Blob, por https', () => {
    expect(isAllowedAssetUrl('https://mansionplayroom.cl/studio/fonts/x.woff2', SITE)).toBe(true);
    expect(isAllowedAssetUrl('https://www.mansionplayroom.cl/x.png', SITE)).toBe(true);
    expect(isAllowedAssetUrl('https://abc123.public.blob.vercel-storage.com/studio/f.jpg', SITE)).toBe(true);
    expect(isAllowedAssetUrl('http://mansionplayroom.cl/x.png', SITE)).toBe(false);
    expect(isAllowedAssetUrl('https://otro.test/x.png', SITE)).toBe(false);
    expect(isAllowedAssetUrl('https://mansionplayroom.cl.malo.test/x.png', SITE)).toBe(false);
    expect(isAllowedAssetUrl('no es url', SITE)).toBe(false);
  });
});

describe('cleanRenderProject', () => {
  const spec = (media: string, voice?: string) => normalizeMotionSpec({
    template: 'montaje',
    scenes: [{ text: 'Hola', media: { url: media, kind: 'image' }, say: 'hola' }],
    voice: voice ? { url: voice, hash: 'h', voice: 'catalina', rate: 0, pitch: 0, secs: [1] } : null,
  });

  it('completa las rutas del sitio con la dirección oficial', () => {
    const p = cleanRenderProject(spec('/candyland/foto.jpg', 'https://x.public.blob.vercel-storage.com/voz.wav'), SITE);
    expect(p.spec.scenes[0].media?.url).toBe('https://mansionplayroom.cl/candyland/foto.jpg');
    expect(p.spec.voice?.url).toBe('https://x.public.blob.vercel-storage.com/voz.wav');
  });

  it('rechaza fotos o voz de otros sitios', () => {
    expect(() => cleanRenderProject(spec('https://otro.test/x.png'), SITE)).toThrow();
    expect(() => cleanRenderProject(spec('/x.png', 'https://otro.test/voz.wav'), SITE)).toThrow();
  });

  it('una URL que no es https ni del sitio se descarta antes de llegar', () => {
    const p = cleanRenderProject(spec('javascript:alert(1)'), SITE);
    expect(p.spec.scenes[0].media).toBeNull();
  });

  it('la huella no cambia con el caption ni el nombre, sí con lo que se ve', () => {
    const a = spec('/x.png');
    expect(specHash(a)).toBe(specHash({ ...a, caption: 'otro', title: 'otro' }));
    expect(specHash(a)).not.toBe(specHash({ ...a, style: 'glitch' }));
  });
});

describe('estado de la grabación', () => {
  const base = { status: 'grabando', jobId: 'j1', requestedAt: 1000, finishedAt: null, contentHash: 'abc', url: null, error: null, job: { spec: normalizeMotionSpec({}) } };

  it('una grabación que no responde a tiempo se muestra como error', () => {
    const state = normalizeRenderState(base)!;
    expect(summarizeRender(state, 1000 + 60_000).status).toBe('grabando');
    const late = summarizeRender(state, 1000 + RENDER_TIMEOUT_MS + 1);
    expect(late.status).toBe('error');
    expect(late.error).toMatch(/no respondió/);
  });

  it('sin grabaciones: «nunca»; el resumen no lleva el proyecto', () => {
    expect(summarizeRender(null, 0).status).toBe('nunca');
    expect(summarizeRender(normalizeRenderState(base), 0)).not.toHaveProperty('job');
  });

  it('descarta un estado roto', () => {
    expect(normalizeRenderState({ status: 'otro', jobId: 'x' })).toBeNull();
    expect(normalizeRenderState(null)).toBeNull();
  });

  it('la huella cambia si cambia el contenido', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'));
    expect(contentHash('a')).toBe(contentHash('a'));
  });
});
