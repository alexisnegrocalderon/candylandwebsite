import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAnthropicSystem } from './llm';

describe('buildAnthropicSystem', () => {
  it('sin marcas de caché sigue siendo un solo string, como siempre', () => {
    expect(buildAnthropicSystem([
      { role: 'system', content: 'uno' },
      { role: 'system', content: 'dos' },
    ])).toBe('uno\n\ndos');
  });

  it('con una marca arma bloques y pone cache_control solo en el marcado', () => {
    const system = buildAnthropicSystem([
      { role: 'system', content: 'estable', cache: true },
      { role: 'system', content: 'variable' },
    ]);
    expect(system).toEqual([
      { type: 'text', text: 'estable', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'variable' },
    ]);
  });
});

/* Respuestas estructuradas cortadas o vacías (02/10): el Director comercial y el
 * plan de contenido mostraban "Unexpected end of JSON input" / "Unterminated
 * string in JSON" porque el modelo gastaba `max_tokens` razonando y el JSON
 * llegaba vacío o a medias. */
describe('invokeLLM con Anthropic: respuestas estructuradas', () => {
  const createMock = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    createMock.mockReset();
    vi.doMock('@anthropic-ai/sdk', () => {
      class APIError extends Error { status = 0; }
      class Anthropic {
        static APIError = APIError;
        messages = { create: createMock };
      }
      return { default: Anthropic };
    });
    vi.doMock('./env', () => ({ ENV: { anthropicApiKey: 'test-key', geminiApiKey: '', forgeApiKey: '', forgeApiUrl: '' } }));
  });

  const response = (content: unknown[], stop_reason: string, output_tokens = 100) => ({
    id: 'msg_1', model: 'claude-sonnet-5', stop_reason, content, usage: { input_tokens: 50, output_tokens },
  });
  const schema = { type: 'json_schema' as const, json_schema: { name: 'x', schema: { type: 'object' } } };
  const call = async (extra: Record<string, unknown> = {}) => {
    const { invokeLLM } = await import('./llm');
    return invokeLLM({ messages: [{ role: 'user', content: 'hola' }], responseFormat: schema, ...extra });
  };

  it('una respuesta estructurada cortada por max_tokens falla con un mensaje claro, no con un JSON roto', async () => {
    createMock.mockResolvedValue(response([{ type: 'text', text: '{"summary": "se corta aquí' }], 'max_tokens', 8000));
    await expect(call()).rejects.toThrow('La IA se quedó sin espacio para terminar la respuesta');
  });

  it('el razonamiento se come el presupuesto y no queda texto: falla con el motivo', async () => {
    createMock.mockResolvedValue(response([{ type: 'thinking', thinking: 'pensando...', signature: 's' }], 'max_tokens', 2500));
    await expect(call()).rejects.toThrow(/sin espacio/);
    createMock.mockResolvedValue(response([{ type: 'thinking', thinking: 'x', signature: 's' }], 'end_turn'));
    await expect(call()).rejects.toThrow(/no devolvió ninguna respuesta \(motivo: end_turn\)/);
  });

  it('una respuesta estructurada completa pasa tal cual', async () => {
    createMock.mockResolvedValue(response([{ type: 'text', text: '{"ok":true}' }], 'end_turn'));
    const r = await call();
    expect(r.choices[0].message.content).toBe('{"ok":true}');
  });

  it('sin salida estructurada, una respuesta de texto cortada se devuelve como antes (no es JSON, sirve igual)', async () => {
    createMock.mockResolvedValue(response([{ type: 'text', text: 'Respuesta larga que se corta' }], 'max_tokens'));
    const { invokeLLM } = await import('./llm');
    const r = await invokeLLM({ messages: [{ role: 'user', content: 'hola' }] });
    expect(r.choices[0].message.content).toBe('Respuesta larga que se corta');
  });

  it('pasa `thinking: disabled` a Anthropic solo cuando el llamador lo pide', async () => {
    createMock.mockResolvedValue(response([{ type: 'text', text: '{}' }], 'end_turn'));
    const { invokeLLM, NO_THINKING } = await import('./llm');
    await invokeLLM({ messages: [{ role: 'user', content: 'hola' }], responseFormat: schema, thinking: NO_THINKING });
    expect(createMock.mock.calls[0][0].thinking).toEqual({ type: 'disabled' });

    await invokeLLM({ messages: [{ role: 'user', content: 'hola' }], responseFormat: schema });
    expect(createMock.mock.calls[1][0]).not.toHaveProperty('thinking');
  });
});
