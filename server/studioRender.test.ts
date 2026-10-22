import express from 'express';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderState } from '../shared/studioRender';

const store = vi.hoisted(() => ({ render: null as RenderState | null, exists: true }));

vi.mock('./contentStudio', () => ({
  readVideoRender: vi.fn(async () => ({ exists: store.exists, render: store.render, title: 'Noche Neón' })),
  writeVideoRender: vi.fn(async (_id: number, render: RenderState) => { store.render = render; }),
}));
vi.mock('@vercel/blob/client', () => ({ generateClientTokenFromReadWriteToken: vi.fn(async () => 'token-de-subida') }));
vi.mock('./_core/env', () => ({ ENV: { renderCallbackSecret: 'secreto', githubRenderToken: 'gh', githubRenderRepo: 'a/b', githubRenderRef: 'main' } }));

const { registerStudioRenderRoutes } = await import('./studioRender');

const JOB = '11111111-2222-3333-4444-555555555555';
const project = { html: '<script>window.__timelines["main"] = tl;</script>', assets: [['assets/logo.png', 'https://mansionplayroom.cl/logo.png']] as Array<[string, string]> };
let base = '';
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'rw';
  const app = express();
  app.use(express.json());
  registerStudioRenderRoutes(app);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/studio-render/7`;
});
afterAll(() => server.close());
beforeEach(() => {
  store.render = { status: 'grabando', jobId: JOB, requestedAt: Date.now(), finishedAt: null, contentHash: 'h', url: null, error: null, job: project };
});

const auth = { Authorization: 'Bearer secreto', 'Content-Type': 'application/json' };

describe('rutas de la máquina de GitHub', () => {
  it('sin la clave no entrega nada', async () => {
    expect((await fetch(`${base}/job?jobId=${JOB}`)).status).toBe(401);
    expect((await fetch(`${base}/job?jobId=${JOB}`, { headers: { Authorization: 'Bearer otra' } })).status).toBe(401);
  });

  it('entrega el proyecto solo a la grabación activa', async () => {
    const ok = await fetch(`${base}/job?jobId=${JOB}`, { headers: auth });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(project);
    expect((await fetch(`${base}/job?jobId=otro`, { headers: auth })).status).toBe(409);
  });

  it('da un permiso de subida para ese video', async () => {
    const res = await fetch(`${base}/upload-token`, { method: 'POST', headers: auth, body: JSON.stringify({ jobId: JOB }) });
    expect(await res.json()).toEqual({ pathname: 'studio-videos/7-noche-neon.mp4', clientToken: 'token-de-subida' });
  });

  it('al terminar guarda la URL de Vercel Blob y suelta el proyecto', async () => {
    const url = 'https://abc.public.blob.vercel-storage.com/studio-videos/7-noche-neon-x.mp4';
    await fetch(`${base}/done`, { method: 'POST', headers: auth, body: JSON.stringify({ jobId: JOB, url }) });
    expect(store.render).toMatchObject({ status: 'listo', url, job: null });
    // Ya no está activa: no se puede volver a cerrar ni pedir el proyecto.
    expect((await fetch(`${base}/job?jobId=${JOB}`, { headers: auth })).status).toBe(409);
  });

  it('una URL que no es de Vercel Blob queda como error', async () => {
    await fetch(`${base}/done`, { method: 'POST', headers: auth, body: JSON.stringify({ jobId: JOB, url: 'https://malo.test/x.mp4', error: 'falló ffmpeg' }) });
    expect(store.render).toMatchObject({ status: 'error', error: 'falló ffmpeg' });
  });
});
