import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.hoisted(() => vi.fn());
vi.mock('../_core/llm', () => ({ getAnthropicClient: () => ({ messages: { create } }) }));
vi.mock('./designer', () => ({ eventFacts: vi.fn(async () => 'Candyland, sábado 8 de agosto, 21:00') }));

const { quickPhotoTexts, quickVideoFromIdea } = await import('./quickIdea');

const reply = (data: unknown, extra: Record<string, unknown> = {}) => ({
  stop_reason: 'end_turn',
  model: 'claude-haiku-4-5',
  content: [{ type: 'text', text: JSON.stringify(data) }],
  usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
  ...extra,
});

const videoData = {
  title: 'Tu primera vez', caption: 'Texto #MansionPlayroom', numbered: true, ctaLine: '¿Vienes?', cta: 'Entradas en mansionplayroom.cl',
  scenes: [{ title: '¿Tu primera\nvez?', body: '', secs: 3 }, { title: 'Se pregunta siempre', body: '', secs: 2.5 }],
};

beforeEach(() => create.mockReset());

describe('quickVideoFromIdea', () => {
  it('manda la idea y los datos reales, y devuelve un video con su gasto', async () => {
    create.mockResolvedValue(reply(videoData));
    const r = await quickVideoFromIdea({ brief: 'primera vez', format: 'reel', eventId: 3, model: 'claude-haiku-4-5', sceneCount: 20 });
    const call = create.mock.calls[0][0];
    expect(call.model).toBe('claude-haiku-4-5');
    expect(call.system[1].text).toContain('sábado 8 de agosto');
    expect(call.messages[0].content).toContain('Escenas (sin contar el cierre): 8'); // tope de 8
    expect(call.output_config.format.type).toBe('json_schema');
    expect(r.video).toMatchObject({ template: 'puntos', theme: 'bubble', format: 'reel', eventId: 3 });
    expect(r.costUsd).toBeGreaterThan(0);
    expect(r.usage).toMatchObject({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500 });
  });

  it('si la IA se niega, se queda sin espacio o responde algo roto, avisa claro', async () => {
    create.mockResolvedValueOnce(reply({}, { stop_reason: 'refusal' }));
    await expect(quickVideoFromIdea({ brief: 'x', format: 'reel', eventId: null, model: 'claude-haiku-4-5', sceneCount: 4 })).rejects.toThrow(/no quiso/);
    create.mockResolvedValueOnce(reply({}, { stop_reason: 'max_tokens' }));
    await expect(quickVideoFromIdea({ brief: 'x', format: 'reel', eventId: null, model: 'claude-haiku-4-5', sceneCount: 4 })).rejects.toThrow(/sin espacio/);
    create.mockResolvedValueOnce({ ...reply({}), content: [{ type: 'text', text: 'no es json' }] });
    await expect(quickVideoFromIdea({ brief: 'x', format: 'reel', eventId: null, model: 'claude-haiku-4-5', sceneCount: 4 })).rejects.toThrow(/respuesta rota/);
  });

  it('una respuesta sin escenas no crea un video vacío', async () => {
    create.mockResolvedValue(reply({ ...videoData, scenes: [] }));
    await expect(quickVideoFromIdea({ brief: 'x', format: 'feed', eventId: null, model: 'claude-sonnet-5-5', sceneCount: 3 })).rejects.toThrow(/ninguna escena/);
  });
});

describe('quickPhotoTexts', () => {
  const texts = { title: 'Noche Neón', body: 'Sábado · 21:00', cta: 'Comenta PLAYROOM', footnote: 'Evento +18', caption: 'Texto #MansionPlayroom' };

  it('con foto https, Claude la ve; el resultado trae solo los textos', async () => {
    create.mockResolvedValue(reply(texts));
    const r = await quickPhotoTexts({ brief: 'noche neón', imageUrl: 'https://abc.public.blob.vercel-storage.com/f.jpg', eventId: null, model: 'claude-haiku-4-5' });
    const content = create.mock.calls[0][0].messages[0].content;
    expect(content[1]).toEqual({ type: 'image', source: { type: 'url', url: 'https://abc.public.blob.vercel-storage.com/f.jpg' } });
    expect(r.texts).toEqual(texts);
  });

  it('sin foto, o con una que no es https, no se manda ninguna imagen', async () => {
    create.mockResolvedValue(reply(texts));
    await quickPhotoTexts({ brief: 'x', imageUrl: '', eventId: null, model: 'claude-haiku-4-5' });
    await quickPhotoTexts({ brief: 'x', imageUrl: 'http://malo.test/f.jpg', eventId: null, model: 'claude-haiku-4-5' });
    for (const [args] of create.mock.calls) expect(typeof args.messages[0].content).toBe('string');
  });
});
