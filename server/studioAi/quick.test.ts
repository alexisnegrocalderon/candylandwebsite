import { describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('../_core/llm', () => ({ getAnthropicClient: () => ({ messages: { create } }) }));
vi.mock('./designer', () => ({ eventFacts: async () => 'Evento de prueba' }));

import { quickBubbleDesign } from './quick';

describe('quickBubbleDesign', () => {
  it('arma un diseño Bubble con los textos de la IA y calcula el costo', async () => {
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      model: 'claude-haiku-4-5',
      usage: { input_tokens: 1000, output_tokens: 500 },
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Consentimiento', caption: 'Texto #MansionPlayroom',
        slides: [
          { layout: 'portada', title: '¿Listx?', body: '', hero: 'interrogacion', heroBelow: false, items: [], cta: 'Comenta PLAYROOM', footnote: '', palette: 0 },
          { layout: 'resultados', title: 'Conecta', body: '', hero: '', heroBelow: false, items: [{ badge: 'check', title: 'Preguntar' }], cta: '', footnote: '', palette: 1 },
        ],
      }) }],
    });
    const r = await quickBubbleDesign({ brief: 'consentimiento', format: 'carrusel', eventId: null, model: 'claude-haiku-4-5', slideCount: 2 });
    expect(r.design.theme).toBe('bubble');
    expect(r.design.slides).toHaveLength(2);
    expect(r.design.slides[1].items[0].badge).toBe('check');
    expect(r.costUsd).toBeCloseTo(0.0035, 4);
  });

  it('rechaza una respuesta cortada', async () => {
    create.mockResolvedValue({ stop_reason: 'max_tokens', model: 'x', usage: {}, content: [] });
    await expect(quickBubbleDesign({ brief: 'a', format: 'post', eventId: null, model: 'claude-haiku-4-5', slideCount: 1 })).rejects.toThrow(/espacio/);
  });
});
