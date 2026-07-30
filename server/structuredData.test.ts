import { describe, it, expect } from 'vitest';
import {
  breadcrumbSchema,
  eventSchema,
  faqSchema,
  nightClubSchema,
} from '../shared/structuredData';

describe('eventSchema', () => {
  const base = {
    name: 'Candyland',
    startDate: '2026-08-08T21:00:00-04:00',
    slug: 'candyland-agosto-2026',
  };

  it('incluye price y priceCurrency cuando hay precio', () => {
    // Sin estos dos campos Google descarta el resultado enriquecido, que es
    // el único motivo por el que existe este schema.
    const schema = eventSchema({ ...base, priceFrom: 20000 });
    const offers = schema.offers as Record<string, unknown>;
    expect(offers.price).toBe('20000');
    expect(offers.priceCurrency).toBe('CLP');
  });

  it('omite el precio si no se sabe, sin romper la oferta', () => {
    const schema = eventSchema(base);
    const offers = schema.offers as Record<string, unknown>;
    expect(offers.price).toBeUndefined();
    expect(offers.priceCurrency).toBeUndefined();
    expect(offers.availability).toBe('https://schema.org/InStock');
    expect(offers.url).toContain('/eventos/candyland-agosto-2026');
  });

  it('incluye endDate cuando se conoce', () => {
    const schema = eventSchema({ ...base, endDate: '2026-08-09T04:30:00-04:00' });
    expect(schema.endDate).toBe('2026-08-09T04:30:00-04:00');
  });

  it('no inventa una dirección de calle', () => {
    // La marca publica la dirección exacta recién al comprar; el schema no
    // puede filtrarla.
    const location = eventSchema(base).location as Record<string, any>;
    expect(location.address.streetAddress).toBeUndefined();
    expect(location.address.addressLocality).toBe('Valparaíso');
    expect(location.address.addressCountry).toBe('CL');
  });

  it('marca el evento como presencial y programado', () => {
    const schema = eventSchema(base);
    expect(schema.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
    expect(schema.eventStatus).toBe('https://schema.org/EventScheduled');
  });
});

describe('faqSchema', () => {
  const faqs = [
    { q: '¿Dónde es la fiesta?', a: 'En La Mansión, Valparaíso.' },
    { q: '¿Hay edad mínima?', a: 'Sí, evento estrictamente +18.' },
  ];

  it('emite cada pregunta con la forma Question/Answer que pide Google', () => {
    const schema = faqSchema(faqs);
    expect(schema['@type']).toBe('FAQPage');
    const entities = schema.mainEntity as Record<string, any>[];
    expect(entities).toHaveLength(2);
    expect(entities[0]['@type']).toBe('Question');
    expect(entities[0].name).toBe('¿Dónde es la fiesta?');
    expect(entities[0].acceptedAnswer['@type']).toBe('Answer');
    expect(entities[0].acceptedAnswer.text).toBe('En La Mansión, Valparaíso.');
  });

  it('acepta un arreglo readonly (el config es `as const`)', () => {
    const readonlyFaqs = [{ q: 'a', a: 'b' }] as const;
    expect((faqSchema(readonlyFaqs).mainEntity as unknown[])).toHaveLength(1);
  });
});

describe('breadcrumbSchema', () => {
  it('numera las posiciones desde 1', () => {
    // Google descarta la lista entera si arranca en 0.
    const schema = breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: 'Eventos', path: '/eventos' },
    ]);
    const items = schema.itemListElement as Record<string, any>[];
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
    expect(items[1].item).toBe('https://mansionplayroom.cl/eventos');
  });
});

describe('nightClubSchema', () => {
  it('arma el rango de precios en formato chileno', () => {
    const schema = nightClubSchema({ description: 'x', priceFrom: 20000, priceTo: 40000 });
    expect(schema.priceRange).toBe('$20.000 - $40.000 CLP');
  });

  it('omite los campos opcionales que no se pasan', () => {
    const schema = nightClubSchema({ description: 'x' });
    expect(schema.priceRange).toBeUndefined();
    expect(schema.telephone).toBeUndefined();
    expect(schema.sameAs).toBeUndefined();
  });

  it('declara las tres zonas que le interesan al negocio', () => {
    const schema = nightClubSchema({ description: 'x' });
    expect(schema.areaServed).toEqual(['Valparaíso', 'Viña del Mar', 'Región de Valparaíso']);
  });
});

