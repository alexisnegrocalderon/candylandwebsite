import { describe, expect, it } from 'vitest';
import { countHasCodeOption, whoAvailable, whoByKey, whoCounts, whoForCount, whoKeyFor } from './playmoreWho';

const types = [
  { accesoSlug: 'soltera', category: 'acceso', status: 'active' },
  { accesoSlug: 'soltero', category: 'acceso', status: 'active' },
  { accesoSlug: 'duo', category: 'acceso', status: 'active' },
  { accesoSlug: 'trio', category: 'acceso', status: 'soldout' },
  { accesoSlug: 'grupo', category: 'acceso', status: 'hidden' },
  { accesoSlug: null, category: 'extra', status: 'active' },
];

describe('whoAvailable', () => {
  const av = whoAvailable(types);
  it('ofrece solo lo que existe y no está oculto', () => {
    expect(av.map((o) => o.key)).toEqual(['soltera', 'soltero', 'pareja', 'dos-hombres', 'trio']);
  });
  it('el dúo sirve para pareja y para dos hombres (el mismo acceso)', () => {
    const duo = av.filter((o) => o.slug === 'duo');
    expect(duo.map((o) => o.key)).toEqual(['pareja', 'dos-hombres']);
    expect(new Set(duo.map((o) => o.type)).size).toBe(1);
  });
  it('cantidades y opciones por cantidad', () => {
    expect(whoCounts(av)).toEqual([1, 2, 3]);
    expect(whoForCount(av, 1).map((o) => o.key)).toEqual(['soltera', 'soltero']);
    expect(whoForCount(av, 4)).toEqual([]);
    expect(whoForCount(av, null)).toEqual([]);
  });
});

describe('avisos al elegir', () => {
  it('no se avisa del código, pero sí que Dos hombres es para parejas y no para amigos', () => {
    expect(whoByKey('soltero')?.note).toBeNull();
    expect(whoByKey('dos-hombres')?.note).toMatch(/PAREJAS/);
    expect(whoByKey('dos-hombres')?.note).not.toMatch(/C[ÓO]DIGO/);
  });
});

describe('código de comunidad', () => {
  it('lo piden hombre solo y dos hombres, nadie más', () => {
    expect(whoByKey('soltero')?.needsCode).toBe(true);
    expect(whoByKey('dos-hombres')?.needsCode).toBe(true);
    for (const k of ['soltera', 'pareja', 'dos-mujeres', 'trio']) expect(whoByKey(k)?.needsCode).toBe(false);
  });
  it('avisa por cantidad', () => {
    const av = whoAvailable(types);
    expect(countHasCodeOption(av, 1)).toBe(true);
    expect(countHasCodeOption(av, 2)).toBe(true);
    expect(countHasCodeOption(av, 3)).toBe(false);
  });
});

describe('whoKeyFor', () => {
  it('traduce un acceso ya elegido; el dúo sin composición es pareja, nunca dos hombres', () => {
    expect(whoKeyFor('duo')).toBe('pareja');
    expect(whoKeyFor('duo', 'mixta')).toBe('pareja');
    expect(whoKeyFor('duo', 'dos_hombres')).toBe('dos-hombres');
    expect(whoKeyFor('soltero')).toBe('soltero');
    expect(whoKeyFor('duo_mujeres')).toBe('dos-mujeres');
    expect(whoKeyFor(null)).toBeNull();
    expect(whoKeyFor('otro')).toBeNull();
  });
});
