import { describe, expect, it } from 'vitest';
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
