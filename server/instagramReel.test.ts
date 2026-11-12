import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_core/env', () => ({ ENV: { igAccessToken: 'token-test', igUserId: '1789' } }));

import { InstagramReelError, publishReel, reelCaption, reelStatusAction } from './instagramReel';

type Call = { method: string; url: string; body: string | null };

/** Simula la Graph API: respuestas en orden para cada llamada. */
function mockGraph(responses: Array<{ ok?: boolean; body: unknown }>) {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(url), body: init?.body ? String(init.body) : null });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(JSON.stringify(r.body), { status: r.ok === false ? 400 : 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}

const noSleep = async () => {};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reelStatusAction', () => {
  it('publica solo cuando Meta marca FINISHED', () => {
    expect(reelStatusAction('FINISHED')).toBe('publish');
  });

  it('falla con ERROR o EXPIRED', () => {
    expect(reelStatusAction('ERROR')).toBe('fail');
    expect(reelStatusAction('EXPIRED')).toBe('fail');
  });

  it('espera mientras procesa, o si el estado no viene', () => {
    expect(reelStatusAction('IN_PROGRESS')).toBe('wait');
    expect(reelStatusAction(undefined)).toBe('wait');
    expect(reelStatusAction('algo nuevo')).toBe('wait');
  });
});

describe('reelCaption', () => {
  it('recorta espacios y limita a 2200 caracteres', () => {
    expect(reelCaption('  hola  ')).toBe('hola');
    expect(reelCaption('a'.repeat(3000))).toHaveLength(2200);
  });
});

describe('publishReel', () => {
  it('crea el contenedor REELS, espera a FINISHED y publica', async () => {
    const calls = mockGraph([
      { body: { id: 'cont-1' } },
      { body: { status_code: 'IN_PROGRESS' } },
      { body: { status_code: 'FINISHED' } },
      { body: { id: 'media-9' } },
    ]);

    const result = await publishReel({ videoUrl: 'https://blob.example/reel.mp4', caption: 'Hola #MansionPlayroom' }, { sleep: noSleep, intervalMs: 1 });

    expect(result).toEqual({ mediaId: 'media-9' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('/1789/media');
    const create = new URLSearchParams(calls[0].body ?? '');
    expect(create.get('media_type')).toBe('REELS');
    expect(create.get('video_url')).toBe('https://blob.example/reel.mp4');
    expect(create.get('caption')).toBe('Hola #MansionPlayroom');
    expect(calls[3].url).toContain('/1789/media_publish');
    expect(new URLSearchParams(calls[3].body ?? '').get('creation_id')).toBe('cont-1');
  });

  it('no publica si el contenedor falla al procesar', async () => {
    const calls = mockGraph([
      { body: { id: 'cont-2' } },
      { body: { status_code: 'ERROR', status: 'Formato no soportado' } },
    ]);

    await expect(publishReel({ videoUrl: 'https://blob.example/x.mp4', caption: 'x' }, { sleep: noSleep, intervalMs: 1 }))
      .rejects.toBeInstanceOf(InstagramReelError);
    expect(calls.some((c) => c.url.includes('media_publish'))).toBe(false);
  });

  it('se rinde si Meta tarda más que el tiempo límite', async () => {
    mockGraph([
      { body: { id: 'cont-3' } },
      { body: { status_code: 'IN_PROGRESS' } },
    ]);

    await expect(publishReel({ videoUrl: 'https://blob.example/x.mp4', caption: 'x' }, { timeoutMs: 0, sleep: noSleep, intervalMs: 1 }))
      .rejects.toThrow(/tardó demasiado/);
  });

  it('muestra el mensaje de error de Meta al crear el contenedor', async () => {
    mockGraph([{ ok: false, body: { error: { message: 'Video no accesible', code: 352 } } }]);

    await expect(publishReel({ videoUrl: 'https://blob.example/x.mp4', caption: 'x' }, { sleep: noSleep, intervalMs: 1 }))
      .rejects.toThrow('Video no accesible');
  });
});
