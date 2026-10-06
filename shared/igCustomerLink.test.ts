import { describe, expect, it } from 'vitest';
import { normalizeIgHandle, rankCustomerSuggestions, saysAlreadyBought } from './igCustomerLink';

describe('normalizeIgHandle', () => {
  it('unifica @, mayúsculas y links', () => {
    expect(normalizeIgHandle('@Foo.Bar')).toBe('foo.bar');
    expect(normalizeIgHandle('https://www.instagram.com/foo.bar/?igsh=1')).toBe('foo.bar');
    expect(normalizeIgHandle('')).toBe('');
    expect(normalizeIgHandle('no es un usuario!')).toBe('');
  });
});

describe('saysAlreadyBought', () => {
  it.each(['Ya la adquirí 😏', 'ya compramos las entradas', 'Listo, ya pagué', 'ya tenemos acceso', 'Compré mi entrada hoy', 'ya estamos listos', 'Ya compré'])('detecta "%s"', (t) => {
    expect(saysAlreadyBought([t])).toBe(true);
  });
  it.each(['Pareja preventa', '¿ya compraron?', 'todavía no compro', 'cuando compre te aviso', 'no tengo entrada', 'cuánto sale la entrada', null])('ignora "%s"', (t) => {
    expect(saysAlreadyBought([t])).toBe(false);
  });
});

describe('rankCustomerSuggestions', () => {
  const base = { orderNumber: 'A1', tickets: '2 × Pareja preventa', instagram: null };
  const cands = [
    { ...base, customerId: 1, email: 'maria.perez@gmail.com', fullName: 'María Pérez' },
    { ...base, customerId: 2, email: 'katrina.soto@gmail.com', fullName: 'Katrina Soto' },
    { ...base, customerId: 3, email: 'juan@gmail.com', fullName: 'Juan Rojas' },
  ];
  it('encuentra por el @ y por el nombre de perfil', () => {
    expect(rankCustomerSuggestions({ username: 'soykatrinakatrina', name: null, notes: null }, cands)[0].customerId).toBe(2);
    expect(rankCustomerSuggestions({ username: 'xx', name: 'Maria Perez', notes: null }, cands)[0].customerId).toBe(1);
  });
  it('sin coincidencias no inventa', () => {
    expect(rankCustomerSuggestions({ username: 'zzz', name: null, notes: 'Pareja interesada, preguntó por preventa.' }, cands)).toEqual([]);
  });
  it('un @ ya guardado en la ficha pesa más que todo', () => {
    const withIg = [...cands, { ...base, customerId: 4, email: 'x@y.cl', fullName: 'Otra Persona', instagram: '@zzz' }];
    expect(rankCustomerSuggestions({ username: 'zzz', name: 'Maria Perez', notes: null }, withIg)[0].customerId).toBe(4);
  });
});

import { ALREADY_BOUGHT_MARKER, buildAlreadyBoughtReply } from './igCustomerLink';
describe('buildAlreadyBoughtReply', () => {
  it('usa la fecha real del evento en hora de Chile y no pregunta nada', () => {
    const r = buildAlreadyBoughtReply(new Date('2026-10-31T01:00:00Z')); // 30 oct 22:00 en Chile
    expect(r).toContain('30 de octubre');
    expect(r).toContain(ALREADY_BOUGHT_MARKER);
    expect(r).not.toContain('?');
  });
  it('sin evento no inventa fecha', () => {
    expect(buildAlreadyBoughtReply(null)).not.toMatch(/\d/);
  });
});
