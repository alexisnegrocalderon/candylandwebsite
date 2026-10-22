import { describe, expect, it } from 'vitest';
import { emptySlide, normalizeStudioDesign, normalizeStudioSlide, type StudioDesign } from './contentStudio';
import { designVariants, emptyPhotoBrief, eventPhotoBrief, photoVariants } from './studioVariants';

function design(partial: Partial<StudioDesign> = {}): StudioDesign {
  return normalizeStudioDesign({
    title: 'Prueba',
    format: 'post',
    theme: 'azul',
    slides: [{ ...emptySlide('portada'), title: 'Hola' }],
    ...partial,
  })!;
}

describe('lámina «foto»', () => {
  it('guarda el estilo de la foto y descarta uno desconocido', () => {
    expect(normalizeStudioSlide({ layout: 'foto', photoStyle: 'polaroid' })!.photoStyle).toBe('polaroid');
    expect(normalizeStudioSlide({ layout: 'foto', photoStyle: 'otro' })!.photoStyle).toBe('sangre');
    expect(normalizeStudioSlide({ layout: 'foto' })!.layout).toBe('foto');
  });
});

describe('designVariants', () => {
  it('una imagen sale en cada plantilla, en feed 3:4 e historia 9:16, con el original primero', () => {
    const variants = designVariants(design());
    expect(variants).toHaveLength(8);
    expect(variants[0].design.theme).toBe('azul');
    expect(variants[0].design.format).toBe('post');
    expect(new Set(variants.map((v) => v.key)).size).toBe(8);
    expect(variants.map((v) => v.design.format)).toContain('historia');
  });

  it('un carrusel solo cambia de plantilla y conserva todas sus láminas', () => {
    const slides = [emptySlide('portada'), emptySlide('pregunta'), emptySlide('cierre')];
    const variants = designVariants(design({ format: 'carrusel', slides }));
    expect(variants).toHaveLength(4);
    expect(variants.every((v) => v.design.format === 'carrusel' && v.design.slides.length === 3)).toBe(true);
  });
});

describe('photoVariants', () => {
  const brief = { ...emptyPhotoBrief(), imageUrl: 'https://x.test/foto.jpg', title: 'Noche Neón\nsegunda línea', body: 'Sábado' };

  it('por defecto: los 4 estilos en Bubble, en feed y en historia', () => {
    const variants = photoVariants(brief);
    expect(variants).toHaveLength(8);
    expect(variants.every((v) => v.design.theme === 'bubble' && v.design.slides[0].layout === 'foto')).toBe(true);
    expect(variants[0].design.slides[0].imageUrl).toBe('https://x.test/foto.jpg');
    expect(variants[0].design.title).toBe('Noche Neón · A sangre');
  });

  it('nunca arma carruseles desde una foto', () => {
    const variants = photoVariants(brief, { themes: ['azul'], formats: ['carrusel', 'historia'], styles: ['marco'] });
    expect(variants.map((v) => v.design.format)).toEqual(['historia']);
  });

  it('una imagen que no es http(s) no se carga', () => {
    const variants = photoVariants({ ...brief, imageUrl: 'javascript:alert(1)' });
    expect(variants[0].design.slides[0].imageUrl).toBe('');
  });
});

describe('eventPhotoBrief', () => {
  it('usa la hora de Chile y no publica la dirección', () => {
    // 01:00 UTC del 9 = 21:00 del sábado 8 en Chile (invierno, UTC-4).
    const brief = eventPhotoBrief({ id: 7, title: 'Candyland', eventDate: '2026-08-09T01:00:00Z', imageUrl: ' https://x.test/e.jpg ' });
    expect(brief.body).toBe('Sábado, 8 de agosto · 21:00 hrs');
    expect(brief.imageUrl).toBe('https://x.test/e.jpg');
    expect(brief.eventId).toBe(7);
    expect(brief.caption).toContain('mansionplayroom.cl');
  });

  it('si hay hora de apertura, anuncia esa', () => {
    const brief = eventPhotoBrief({ id: 1, title: 'X', eventDate: '2026-08-09T01:00:00Z', doorsOpen: '2026-08-09T02:00:00Z' });
    expect(brief.body).toContain('22:00 hrs');
  });
});
