import { describe, expect, it } from 'vitest';
import { MANUAL_DRAFTS } from './staffManualDefaults';
import { STAFF_CARGO_KEYS } from './staffCargos';
import { acceptanceStatus, manualKeysFor, normalizeSections } from './staffManuals';

describe('manualKeysFor', () => {
  it('el general y el del cargo', () => {
    expect(manualKeysFor('cocina')).toEqual(['general', 'cocina']);
    expect(manualKeysFor(null)).toEqual(['general', 'otro']);
    expect(manualKeysFor('inventado')).toEqual(['general', 'otro']);
  });
});

describe('normalizeSections', () => {
  it('descarta lo vacío y limpia el resto', () => {
    const s = normalizeSections([
      { title: '  Reglas ', kind: 'text', text: ' No celular en barra \r\n' },
      { title: 'Vacía', kind: 'text', text: '   ' },
      { title: 'Apertura', kind: 'checklist', items: ['Revisar stock', '', '  Encender plancha '] },
      { kind: 'checklist', items: [] },
      null, 'x',
    ]);
    expect(s).toEqual([
      { title: 'Reglas', kind: 'text', text: 'No celular en barra', items: [] },
      { title: 'Apertura', kind: 'checklist', text: '', items: ['Revisar stock', 'Encender plancha'] },
    ]);
  });
  it('respeta los límites', () => {
    expect(normalizeSections(Array.from({ length: 50 }, () => ({ kind: 'text', text: 'a' })))).toHaveLength(30);
    expect(normalizeSections([{ kind: 'text', text: 'x'.repeat(9000) }])[0].text).toHaveLength(6000);
    expect(normalizeSections('no')).toEqual([]);
  });
});

describe('acceptanceStatus', () => {
  const pub = new Map([['general', 2], ['cocina', 1]]);
  it('sin nada publicado', () => expect(acceptanceStatus(['general', 'cocina'], new Map(), new Map())).toBe('sin_manual'));
  it('falta aceptar si algo vigente nunca se aceptó', () => expect(acceptanceStatus(['general', 'cocina'], pub, new Map([['general', 2]]))).toBe('pendiente'));
  it('hay cambios si aceptó una versión anterior', () => expect(acceptanceStatus(['general', 'cocina'], pub, new Map([['general', 1], ['cocina', 1]]))).toBe('desactualizado'));
  it('al día', () => expect(acceptanceStatus(['general', 'cocina'], pub, new Map([['general', 2], ['cocina', 1]]))).toBe('al_dia'));
  it('solo cuenta lo publicado de su cargo', () => expect(acceptanceStatus(['general', 'barra'], pub, new Map([['general', 2]]))).toBe('al_dia'));
});

describe('borradores', () => {
  it('hay uno por manual y todas sus secciones sobreviven al saneado', () => {
    for (const key of ['general', ...STAFF_CARGO_KEYS] as const) {
      const d = MANUAL_DRAFTS[key];
      expect(d, key).toBeTruthy();
      expect(normalizeSections(d.sections), key).toEqual(d.sections);
      expect(d.sections.some((x) => x.kind === 'checklist') || key === 'general').toBe(true);
    }
  });
});
