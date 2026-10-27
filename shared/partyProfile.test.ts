import { describe, expect, it } from 'vitest';
import {
  LOOKING_FOR_KEYS, MAX_INTENTS, cleanOrientation, cleanRelationStyle, compatibility, identitiesOf, identityLabel, isMutualInterest,
  parseIntents, parseLookingFor, photoSlotFor, sanitizeCostume, serializeIntents, serializeLookingFor, wants,
} from './party';

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
    expect(parseLookingFor(null)).toEqual([...LOOKING_FOR_KEYS]);
    expect(parseLookingFor('mujer, pareja_chicas,cualquiera')).toEqual(['mujer', 'pareja_chicas']);
    expect(serializeLookingFor(['pareja_chicos', 'hombre'])).toBe('hombre,pareja_chicos');
    expect(serializeLookingFor([])).toBe(LOOKING_FOR_KEYS.join(','));
  });
  it('lo guardado antes sigue valiendo', () => {
    // «pareja» eran todas las parejas.
    expect(parseLookingFor('mujer,pareja')).toEqual(['mujer', 'pareja_mixta', 'pareja_chicas', 'pareja_chicos']);
    // La lista completa vieja (el valor por defecto) era «todos»: incluye a las personas no binarias.
    expect(parseLookingFor('hombre,mujer,pareja')).toEqual([...LOOKING_FOR_KEYS]);
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
  it('las parejas se buscan por tipo', () => {
    const chicas = { gender: 'pareja', pairType: 'chicas', lookingFor: 'mujer' };
    const mixtaBuscadora = { gender: 'mujer', lookingFor: 'pareja_mixta' };
    const chicasBuscadora = { gender: 'mujer', lookingFor: 'pareja_chicas' };
    expect(wants(mixtaBuscadora, chicas)).toBe(false);
    expect(isMutualInterest(chicasBuscadora, chicas)).toBe(true);
    // Una pareja de antes (sin tipo) le aparece a quien busque cualquier pareja.
    expect(wants(mixtaBuscadora, { gender: 'pareja' })).toBe(true);
  });
  it('no binario', () => {
    const nb = { gender: 'no_binario', lookingFor: 'mujer,no_binario' };
    expect(isMutualInterest(nb, { gender: 'mujer', lookingFor: 'no_binario' })).toBe(true);
    expect(isMutualInterest(nb, { gender: 'mujer', lookingFor: 'hombre' })).toBe(false);
    expect(identitiesOf({ gender: 'no_binario' })).toEqual(['no_binario']);
  });
  it('cómo se lee el Soy', () => {
    expect(identityLabel({ gender: 'pareja', pairType: 'chicos' })).toBe('Pareja · Dos chicos');
    expect(identityLabel({ gender: 'pareja' })).toBe('Pareja');
    expect(identityLabel({ gender: 'no_binario' })).toBe('No binario');
  });
});

describe('orientación, cómo me relaciono y qué busco', () => {
  it('solo valores conocidos; lo demás es «prefiero no decir»', () => {
    expect(cleanOrientation('bi')).toBe('bi');
    expect(cleanOrientation('x')).toBeNull();
    expect(cleanRelationStyle('poliamor')).toBe('poliamor');
    expect(cleanRelationStyle(null)).toBeNull();
  });
  it('intenciones: sin repetir, en orden y hasta 4', () => {
    expect(parseIntents('fantasia,amistad,amistad,nada')).toEqual(['amistad', 'fantasia']);
    expect(parseIntents(['explorar', 'fantasia', 'casual', 'cita', 'bailar'])).toHaveLength(MAX_INTENTS);
    expect(serializeIntents([])).toBeNull();
  });
  it('compatibilidad y lo que tienen en común', () => {
    const a = { intents: 'fantasia,bailar', relationStyle: 'poliamor' };
    const b = { intents: 'fantasia,conversar', relationStyle: 'no_monogamia' };
    expect(compatibility(a, b)).toEqual({ score: 4, common: ['Cumplir una fantasía', 'Relaciones abiertas'] });
    expect(compatibility({ relationStyle: 'monogamia' }, { relationStyle: 'abierta' }).score).toBe(-2);
    expect(compatibility({ relationStyle: 'monogamia' }, { relationStyle: 'monogamia' }).common).toEqual(['Monogamia']);
    expect(compatibility({ relationStyle: 'explorando' }, { relationStyle: 'monogamia' }).score).toBe(1);
  });
  it('quien solo busca amistad baja frente a quien no la busca', () => {
    expect(compatibility({ intents: 'amistad' }, { intents: 'casual' }).score).toBe(-3);
    expect(compatibility({ intents: 'amistad' }, { intents: 'amistad,bailar' }).score).toBe(2);
    expect(compatibility({}, {})).toEqual({ score: 0, common: [] });
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
