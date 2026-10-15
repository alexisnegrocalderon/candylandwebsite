import { describe, expect, it } from 'vitest';
import { computeFans, pickHook, welcomeInstruction } from './igEngagement';

describe('igEngagement', () => {
  it('no repite un enganche ya enviado', () => {
    expect(pickHook(['A?', 'B?'], ['hola A? qué tal'], () => 0)).toBe('B?');
    expect(pickHook(['A?'], ['A?'], () => 0)).toBe('A?');
    expect(pickHook([], [])).toBeNull();
  });
  it('bienvenida según si sigue o no', () => {
    expect(welcomeInstruction(true, 'X?')).toContain('agradécele');
    expect(welcomeInstruction(false, null)).toContain('invítale');
    expect(welcomeInstruction(undefined, 'X?')).toContain('"X?"');
  });
  it('fans: suma comentarios y mensajes', () => {
    const fans = computeFans([[{ igUserId: 'a', count: 2 }, { igUserId: 'b', count: 1 }], [{ igUserId: 'a', count: 1 }]]);
    expect(fans.get('a')).toBe(3);
    expect(fans.has('b')).toBe(false);
  });
});
