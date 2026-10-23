import { describe, expect, it } from 'vitest';
import { isMutualInterest, parseLookingFor, photoSlotFor, sanitizeCostume, serializeLookingFor } from './party';

describe('fotos de Playmatch (hasta 3)', () => {
  it('sin posición se agrega al final, y no pasa de 3', () => {
    expect(photoSlotFor(undefined, 0)).toBe(0);
    expect(photoSlotFor(undefined, 2)).toBe(2);
    expect(photoSlotFor(undefined, 3)).toBeNull();
  });
  it('con posición reemplaza esa, sin dejar huecos', () => {
    expect(photoSlotFor(1, 3)).toBe(1);
    expect(photoSlotFor(2, 1)).toBe(1);
    expect(photoSlotFor(3, 1)).toBeNull();
    expect(photoSlotFor(-1, 1)).toBeNull();
  });
});

describe('Busco (filtro mutuo)', () => {
  it('lee y guarda la lista, con todos por defecto', () => {
    expect(parseLookingFor(null)).toEqual(['hombre', 'mujer', 'pareja']);
    expect(parseLookingFor('mujer, pareja,cualquiera')).toEqual(['mujer', 'pareja']);
    expect(serializeLookingFor(['pareja', 'hombre'])).toBe('hombre,pareja');
    expect(serializeLookingFor([])).toBe('hombre,mujer,pareja');
  });
  it('solo aparece si los dos se buscan', () => {
    const ella = { gender: 'mujer', lookingFor: 'hombre' };
    const el = { gender: 'hombre', lookingFor: 'mujer,pareja' };
    const pareja = { gender: 'pareja', lookingFor: 'mujer' };
    expect(isMutualInterest(ella, el)).toBe(true);
    expect(isMutualInterest(el, ella)).toBe(true);
    // Él busca parejas, pero la pareja no busca hombres.
    expect(isMutualInterest(el, pareja)).toBe(false);
    // La pareja busca mujeres, pero ella solo busca hombres.
    expect(isMutualInterest(pareja, ella)).toBe(false);
  });
});

describe('Mi disfraz', () => {
  it('vacío es sin disfraz', () => {
    expect(sanitizeCostume('   ')).toEqual({ ok: true, costume: null });
  });
  it('limpia espacios y acepta texto normal', () => {
    expect(sanitizeCostume('  Vampira   gótica ')).toEqual({ ok: true, costume: 'Vampira gótica' });
  });
  it('no deja redes, links ni teléfonos', () => {
    expect(sanitizeCostume('Bruja @candy').ok).toBe(false);
    expect(sanitizeCostume('zombie.cl').ok).toBe(false);
    expect(sanitizeCostume('llámame 9 1234 5678').ok).toBe(false);
  });
  it('tiene un largo máximo', () => {
    expect(sanitizeCostume('x'.repeat(41)).ok).toBe(false);
  });
});

describe('«Visto» en el chat', () => {
  it('se ve si la otra persona abrió el chat después de mi último mensaje', async () => {
    const { isSeenBy } = await import('./party');
    expect(isSeenBy('2026-10-31T23:00:00Z', '2026-10-31T23:01:00Z')).toBe(true);
    expect(isSeenBy('2026-10-31T23:02:00Z', '2026-10-31T23:01:00Z')).toBe(false);
    expect(isSeenBy('2026-10-31T23:00:00Z', null)).toBe(false);
    expect(isSeenBy(null, '2026-10-31T23:01:00Z')).toBe(false);
  });
});

describe('Votar «Mejor disfraz»', () => {
  it('son 3 votos por noche', async () => {
    const { costumeVotesLeft, MAX_COSTUME_VOTES_PER_EVENT } = await import('./party');
    expect(MAX_COSTUME_VOTES_PER_EVENT).toBe(3);
    expect(costumeVotesLeft(0)).toBe(3);
    expect(costumeVotesLeft(2)).toBe(1);
    expect(costumeVotesLeft(3)).toBe(0);
    expect(costumeVotesLeft(9)).toBe(0);
  });
});
