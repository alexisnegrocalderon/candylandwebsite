import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: any[] = [];
let responses: Array<(params: any) => string> = [];

vi.mock('../_core/llm', () => ({
  getAnthropicClient: () => ({
    beta: {
      messages: {
        stream: (params: any) => {
          calls.push(params);
          const next = responses.shift();
          const text = next ? next(params) : '{}';
          return {
            finalMessage: async () => ({
              model: params.model,
              stop_reason: 'end_turn',
              content: [{ type: 'text', text }],
              usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
            }),
          };
        },
      },
    },
  }),
}));
vi.mock('../db', () => ({ getDb: async () => null, getEventById: async () => null, getFeaturedEvent: async () => ({ id: 1 }) }));
vi.mock('../winback', () => ({ buildEventFacts: async () => '- Evento: Aniversario\n- Fecha: viernes 30 de octubre' }));

import { createDesignTurn, editDesignTurn } from './designer';
import { emptyAiDesign } from '../../shared/studioAi';

beforeEach(() => {
  calls.length = 0;
  responses = [];
});

describe('createDesignTurn', () => {
  it('arma el plan y escribe cada lámina en paralelo, saneada', async () => {
    responses = [
      () => JSON.stringify({ reply: 'Va un desafío de 2 láminas.', title: 'Desafío pista', concept: 'Quiz', css: '.board{background:#00A3FF}', caption: 'Texto #MansionPlayroom', slides: [{ brief: 'Portada' }, { brief: 'Pregunta 1' }] }),
      () => JSON.stringify({ html: '<div class="board"><h1>¿Sabes jugar?</h1><script>x()</script></div>' }),
      () => JSON.stringify({ html: '<div class="board"><img src="https://evil.com/a.png"><p>01</p></div>' }),
    ];
    const events: any[] = [];
    const res = await createDesignTurn({
      design: emptyAiDesign('carrusel'),
      message: 'Carrusel tipo Desafío',
      images: ['https://a.public.blob.vercel-storage.com/foto.jpg'],
      allImages: ['https://a.public.blob.vercel-storage.com/foto.jpg'],
      history: [],
      model: 'claude-sonnet-5-5',
      onEvent: (e) => events.push(e),
    });

    expect(res.design.title).toBe('Desafío pista');
    expect(res.design.slides).toHaveLength(2);
    expect(res.design.slides[0].html).not.toContain('script');
    expect(res.design.slides[1].html).not.toContain('evil.com');
    expect(res.reply).toBe('Va un desafío de 2 láminas.');
    // 1 plan + 2 láminas: el uso se suma.
    expect(res.usage.outputTokens).toBe(150);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['status', 'plan', 'slide']));

    // El prompt estable va primero y cacheado; los datos del evento y las fotos, después.
    const plan = calls[0];
    expect(plan.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(plan.system[0].text).toContain('PlayRoom Design System');
    expect(plan.system[1].text).toContain('1080×1440');
    expect(plan.system[1].text).toContain('Aniversario');
    expect(plan.system[1].text).toContain('foto.jpg');
    expect(plan.messages[0].content.some((b: any) => b.type === 'image')).toBe(true);
    expect(plan.output_config.format.type).toBe('json_schema');
    expect(plan.fallbacks).toBe('default');
    // Mismo prefijo estable en todas las llamadas (para que el caché pegue).
    expect(new Set(calls.map((c) => c.system[0].text)).size).toBe(1);
  });

  it('un post usa solo la primera lámina del plan', async () => {
    responses = [
      () => JSON.stringify({ reply: 'ok', title: 'Post', concept: 'c', css: '', caption: '', slides: [{ brief: 'a' }, { brief: 'b' }] }),
      () => JSON.stringify({ html: '<div class="board">a</div>' }),
    ];
    const res = await createDesignTurn({ design: emptyAiDesign('post'), message: 'post', images: [], allImages: [], history: [], model: 'claude-opus-5-5', onEvent: () => {} });
    expect(res.design.slides).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });
});

describe('editDesignTurn', () => {
  it('aplica las operaciones y avisa las que no pudo', async () => {
    responses = [() => JSON.stringify({
      reply: 'Agrandé el título.',
      operations: [
        { op: 'set_slide', index: 0, to: -1, html: '<div class="board"><h1 style="font-size:120px">Hola</h1></div>', css: '', caption: '' },
        { op: 'delete_slide', index: 9, to: -1, html: '', css: '', caption: '' },
      ],
    })];
    const design = { ...emptyAiDesign('carrusel'), slides: [{ html: '<div class="board"><h1>Hola</h1></div>' }] };
    const res = await editDesignTurn({
      design,
      message: 'el título más grande',
      images: [],
      allImages: [],
      history: [{ role: 'assistant', text: 'antes' }, { role: 'user', text: 'haz un carrusel' }, { role: 'assistant', text: 'listo' }],
      model: 'claude-sonnet-5-5',
      onEvent: () => {},
    });
    expect(res.design.slides[0].html).toContain('font-size:120px');
    expect(res.reply).toContain('1 cambio no se pudo aplicar');
    // El historial empieza siempre con un mensaje del dueño.
    expect(calls[0].messages[0].role).toBe('user');
    expect(calls[0].messages.at(-1).content[0].text).toContain('Diseño actual');
  });
});
