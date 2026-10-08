import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';

const store = {
  designs: new Map<number, any>(),
  messages: [] as any[],
};

vi.mock('../adminRoutes', () => ({
  requireAdmin: async (req: any, res: any) => {
    if (req.headers['x-test-admin'] !== '1') { res.status(401).json({ error: 'Unauthorized' }); return false; }
    return true;
  },
}));
vi.mock('./store', () => ({
  createAiDesign: async (d: any) => { const id = store.designs.size + 1; store.designs.set(id, d); return id; },
  loadAiDesign: async (id: number) => store.designs.get(id) ?? null,
  saveAiDesign: async (id: number, d: any) => { store.designs.set(id, d); return d; },
  listAiMessages: async (id: number) => store.messages.filter((m) => m.designId === id).map((m, i) => ({ ...m, id: i + 1, images: m.images ?? [] })),
  addAiMessage: async (m: any) => { store.messages.push(m); return store.messages.length; },
}));
vi.mock('./designer', () => ({
  createDesignTurn: async (input: any) => {
    input.onEvent({ type: 'status', text: 'Pensando el concepto…' });
    input.onEvent({ type: 'plan', title: 'T', concept: 'c', css: '', caption: 'cap', count: 1 });
    input.onEvent({ type: 'slide', index: 0, html: '<div class="board">a</div>' });
    return { design: { ...input.design, slides: [{ html: '<div class="board">a</div>' }] }, reply: 'Listo', usage: { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-sonnet-5-5' };
  },
  editDesignTurn: async () => { throw new Error('La IA no quiso hacer este diseño.'); },
}));

import { registerStudioAiRoutes } from './routes';

let base = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerStudioAiRoutes(app);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => { store.designs.clear(); store.messages.length = 0; });

async function post(body: unknown, admin = true) {
  const res = await fetch(`${base}/api/admin/studio/ai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(admin ? { 'x-test-admin': '1' } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const events = text.split('\n\n').filter(Boolean).map((chunk) => ({
    event: /^event: (.*)$/m.exec(chunk)?.[1],
    data: JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] ?? 'null'),
  }));
  return { status: res.status, events, text };
}

describe('POST /api/admin/studio/ai', () => {
  it('pide sesión de admin', async () => {
    const res = await post({ message: 'hola', model: 'claude-sonnet-5-5' }, false);
    expect(res.status).toBe(401);
  });

  it('valida el pedido', async () => {
    const res = await post({ message: '', model: 'gpt-5' });
    expect(res.status).toBe(400);
  });

  it('crea un diseño y transmite el avance por SSE', async () => {
    const res = await post({
      message: 'Carrusel tipo Desafío',
      model: 'claude-sonnet-5-5',
      images: ['https://a.public.blob.vercel-storage.com/foto.jpg', 'https://evil.com/x.png'],
    });
    expect(res.status).toBe(200);
    expect(res.events.map((e) => e.event)).toEqual(['start', 'status', 'plan', 'slide', 'done']);
    const done = res.events.at(-1)!.data;
    expect(done.design.slides).toHaveLength(1);
    // 1000 entrada × $2/M + 1000 salida × $10/M
    expect(done.costUsd).toBeCloseTo(0.012);
    // Se guardó lo que pidió el dueño (sin la imagen de afuera) y la respuesta con su versión.
    expect(store.messages[0]).toMatchObject({ role: 'user', images: ['https://a.public.blob.vercel-storage.com/foto.jpg'] });
    expect(store.messages[1]).toMatchObject({ role: 'assistant', text: 'Listo', model: 'claude-sonnet-5-5' });
    expect(store.messages[1].snapshot.slides).toHaveLength(1);
  });

  it('un error de la IA llega como evento y queda anotado en el chat', async () => {
    store.designs.set(1, { title: 'x', format: 'carrusel', eventId: null, css: '', caption: '', concept: '', slides: [{ html: '<div class="board">a</div>' }] });
    const res = await post({ designId: 1, message: 'cámbialo', model: 'claude-opus-5-5' });
    expect(res.events.at(-1)).toMatchObject({ event: 'error', data: { message: 'La IA no quiso hacer este diseño.' } });
    expect(store.messages.at(-1).text).toContain('No pude terminar');
  });

  it('404 si el diseño no existe', async () => {
    const res = await post({ designId: 99, message: 'hola', model: 'claude-sonnet-5-5' });
    expect(res.status).toBe(404);
  });
});
