import { describe, expect, it } from 'vitest';
import { computeFans, pickHook, welcomeInstruction, FOLLOW_INVITE, withFollowInvite } from './igEngagement';

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

describe('withFollowInvite', () => {
  it('agrega el aviso tras una línea en blanco', () => {
    expect(withFollowInvite('Hola, aquí está tu regalo')).toBe(`Hola, aquí está tu regalo\n\n${FOLLOW_INVITE}`);
  });
  it('sin mensaje, queda solo el aviso', () => {
    expect(withFollowInvite('  ')).toBe(FOLLOW_INVITE);
  });
  it('con tope, recorta el cuerpo y conserva el aviso completo', () => {
    const out = withFollowInvite('x'.repeat(900), 640);
    expect(out.length).toBeLessThanOrEqual(640);
    expect(out.endsWith(FOLLOW_INVITE)).toBe(true);
    expect(out).toContain('…');
  });
  it('un cuerpo corto no se toca aunque haya tope', () => {
    expect(withFollowInvite('Hola', 640)).toBe(`Hola\n\n${FOLLOW_INVITE}`);
  });
});
