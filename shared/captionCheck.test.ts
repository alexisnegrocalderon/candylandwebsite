import { describe, expect, it } from 'vitest';
import { cleanAiMarks, extractHashtags, feedPreview, humanizeEs, INSTAGRAM_HASHTAG_LIMIT, lintCaption } from './captionCheck';

describe('feedPreview', () => {
  it('muestra 125 caracteres y avisa si la primera línea se corta', () => {
    const long = 'a'.repeat(130);
    expect(feedPreview(long).visible).toHaveLength(125);
    expect(feedPreview(long).firstLineCut).toBe(true);
    expect(feedPreview('Corta.\n' + 'b'.repeat(200)).firstLineCut).toBe(false);
  });
  it('cuenta emojis como un carácter', () => {
    expect(feedPreview('🔥'.repeat(130)).visible).toBe('🔥'.repeat(125));
  });
});

describe('lintCaption', () => {
  const status = (r: ReturnType<typeof lintCaption>, id: string) => r.checks.find((c) => c.id === id)?.status;
  it(`avisa con más de ${INSTAGRAM_HASHTAG_LIMIT} hashtags (sumando los de dentro del texto)`, () => {
    expect(status(lintCaption('Viernes 30 en Playroom #uno', ['#a', '#b', '#c', '#d', '#e']), 'hashtags')).toBe('warn');
    expect(status(lintCaption('Viernes 30 en Playroom', ['#a', '#b']), 'hashtags')).toBe('ok');
  });
  it('gancho concreto: número, fecha o nombre en la parte visible', () => {
    expect(status(lintCaption('Viernes 30 de octubre, segunda edición'), 'hook')).toBe('ok');
    expect(status(lintCaption('Algo grande se viene, atentos'), 'hook')).toBe('warn');
  });
  it('avisa cuando pide demasiadas cosas', () => {
    expect(status(lintCaption('Comenta, etiqueta a tu pareja, guarda y comparte'), 'ask')).toBe('warn');
    expect(status(lintCaption('Comenta cuántas acertaste'), 'ask')).toBe('ok');
  });
  it('detecta muletillas de IA', () => {
    expect(status(lintCaption('Sumérgete en una experiencia única'), 'ai')).toBe('warn');
    expect(status(lintCaption('El viernes 30 abrimos la pista a las 23:00'), 'ai')).toBe('ok');
  });
});

describe('cleanAiMarks / humanizeEs', () => {
  it('quita invisibles y rayas largas sin tocar links', () => {
    expect(cleanAiMarks('Hola​ mundo — nos vemos')).toBe('Hola mundo, nos vemos');
    expect(cleanAiMarks('ver https://mansionplayroom.cl/a—b ahora')).toBe('ver https://mansionplayroom.cl/a—b ahora');
    expect(cleanAiMarks('Espera… ya viene')).toBe('Espera... ya viene');
  });
  it('respeta los emojis compuestos (bandera arcoíris, bandera de Escocia) y quita los tags sueltos', () => {
    expect(cleanAiMarks('orgullo 🏳️‍🌈')).toBe('orgullo 🏳️‍🌈');
    const scotland = '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
    expect(cleanAiMarks(`hola ${scotland}`)).toBe(`hola ${scotland}`);
    expect(cleanAiMarks('texto\u{E0041}\u{E0042} limpio')).toBe('texto limpio');
  });
  it('marca "no es solo X, es Y" y no cambia las palabras', () => {
    const r = humanizeEs('No es solo una fiesta, es una comunidad.');
    expect(r.cleaned).toBe('No es solo una fiesta, es una comunidad.');
    expect(r.flags.some((f) => f.label.includes('no es solo'))).toBe(true);
  });
  it('extrae hashtags del texto', () => {
    expect(extractHashtags('hola #MansionPlayroom y #fiesta')).toEqual(['#MansionPlayroom', '#fiesta']);
  });
});
