import { describe, expect, it } from 'vitest';
import { cleanRenderProject, contentHash, isAllowedAssetUrl, normalizeRenderState, RENDER_TIMEOUT_MS, summarizeRender } from './studioRender';

const SITE = 'https://mansionplayroom.cl';
const html = '<script>window.__timelines["main"] = tl;</script>';

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
  it('completa las rutas del sitio con la dirección oficial', () => {
    const p = cleanRenderProject({ html, assets: [['assets/logo.png', '/studio/logo.png'], ['assets/f.jpg', 'https://x.public.blob.vercel-storage.com/f.jpg']] }, SITE);
    expect(p.assets).toEqual([['assets/logo.png', 'https://mansionplayroom.cl/studio/logo.png'], ['assets/f.jpg', 'https://x.public.blob.vercel-storage.com/f.jpg']]);
  });

  it('rechaza rutas locales que se escapan de assets/ y archivos de otros sitios', () => {
    expect(() => cleanRenderProject({ html, assets: [['../etc/passwd', '/x']] }, SITE)).toThrow();
    expect(() => cleanRenderProject({ html, assets: [['assets/a/../../b', '/x']] }, SITE)).toThrow();
    expect(() => cleanRenderProject({ html, assets: [['assets/x.png', '//otro.test/x.png']] }, SITE)).toThrow();
    expect(() => cleanRenderProject({ html, assets: [['assets/x.png', 'https://otro.test/x.png']] }, SITE)).toThrow();
  });

  it('rechaza un HTML que no es una composición', () => {
    expect(() => cleanRenderProject({ html: '<p>hola</p>', assets: [] }, SITE)).toThrow();
  });
});

describe('estado de la grabación', () => {
  const base = { status: 'grabando', jobId: 'j1', requestedAt: 1000, finishedAt: null, contentHash: 'abc', url: null, error: null, job: { html, assets: [] } };

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
