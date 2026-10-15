import { describe, expect, it } from 'vitest';
import { BUBBLE_PALETTES, isBubbleHeroKey, layoutBubbleHeadline, resolveBubblePalette, splitBalanced } from './studioBubble';
import { DEFAULT_STUDIO_THEME, designFromPiece, emptySlide, normalizeStudioDesign, normalizeStudioSlide } from './contentStudio';

describe('studioBubble', () => {
  it('el celeste de la marca es el fondo por defecto', () => {
    expect(resolveBubblePalette(-1).key).toBe('celeste');
    expect(resolveBubblePalette(-1).bg).toBe('#07A2FC');
    expect(resolveBubblePalette(1).key).toBe('azul');
    expect(resolveBubblePalette(99).key).toBe('celeste');
    expect(BUBBLE_PALETTES).toHaveLength(3);
  });

  it('reconoce los gráficos y trata lo demás como emoji', () => {
    expect(isBubbleHeroKey('puerta')).toBe(true);
    expect(isBubbleHeroKey('🔥')).toBe(false);
  });

  it('reparte las palabras sin pasarse del ancho de la palabra más larga', () => {
    expect(splitBalanced(['¿QUÉ', 'ES', 'REALMENTE', 'UNA', 'FIESTA', 'LIBERAL?'], 2).join('|').length).toBeGreaterThan(0);
    const lines = splitBalanced(['NO', 'ES', 'UNA', 'OBLIGACIÓN'], 2);
    expect(lines).toEqual(['NO ES UNA', 'OBLIGACIÓN']);
  });

  it('respeta los saltos de línea que escribe el dueño', () => {
    const r = layoutBubbleHeadline('Libre\nrespeto', { width: 900, height: 500 });
    expect(r.lines).toEqual(['LIBRE', 'RESPETO']);
  });

  it('elige la cantidad de líneas que deja la letra más grande', () => {
    const one = layoutBubbleHeadline('NO ES', { width: 900, height: 500 }, { max: 400, min: 40 });
    const many = layoutBubbleHeadline('¿Qué es realmente una fiesta liberal?', { width: 900, height: 600 }, { max: 400, min: 40 });
    expect(one.lines).toHaveLength(1);
    expect(many.lines.length).toBeGreaterThan(2);
    // Ninguna línea es más ancha que la caja.
    expect(Math.max(...many.lines.map((l) => l.length)) * many.size * 0.68).toBeLessThanOrEqual(900 + 1);
  });

  it('un titular vacío no rompe', () => {
    expect(layoutBubbleHeadline('   ', { width: 900, height: 500 }).lines).toEqual([]);
  });
});

describe('tema bubble en el Estudio', () => {
  it('es el tema oficial por defecto de los diseños nuevos', () => {
    expect(DEFAULT_STUDIO_THEME).toBe('bubble');
    const piece = { format: 'post', hook: '¿Listx para descubrirlo?', caption: 'x', hashtags: [], slides: [], keyword: '', interaction: '' } as any;
    expect(designFromPiece(piece, null).theme).toBe('bubble');
  });

  it('un diseño viejo conserva su tema', () => {
    const slide = emptySlide('portada');
    expect(normalizeStudioDesign({ title: 'x', format: 'carrusel', theme: 'pastel', slides: [slide] })!.theme).toBe('pastel');
    expect(normalizeStudioDesign({ title: 'x', format: 'carrusel', theme: 'bubble', slides: [slide] })!.theme).toBe('bubble');
  });

  it('sin logo por defecto, y con interruptor para volver a mostrarlo', () => {
    const slide = emptySlide('portada');
    expect(normalizeStudioDesign({ title: 'x', format: 'carrusel', slides: [slide] })!.showBrand).toBe(false);
    expect(normalizeStudioDesign({ title: 'x', format: 'carrusel', showBrand: true, slides: [slide] })!.showBrand).toBe(true);
    expect(normalizeStudioDesign({ title: 'x', format: 'carrusel', showBrand: 'si', slides: [slide] })!.showBrand).toBe(false);
  });

  it('el gráfico puede ir debajo del título', () => {
    expect(normalizeStudioSlide({ layout: 'pregunta', heroBelow: true })!.heroBelow).toBe(true);
    expect(normalizeStudioSlide({ layout: 'pregunta' })!.heroBelow).toBe(false);
  });

  it('hay gráficos de línea brillante y relieve rosa además de los básicos', () => {
    for (const key of ['corazon-neon', 'manos-neon', 'mano-neon', 'chat-neon', 'chat', 'corazon-cuadro', 'musica', 'fuego']) {
      expect(isBubbleHeroKey(key)).toBe(true);
    }
  });

  it('limpia el gráfico de la lámina', () => {
    expect(normalizeStudioSlide({ layout: 'portada', hero: '  puerta ' })!.hero).toBe('puerta');
    expect(normalizeStudioSlide({ layout: 'portada', hero: 'x'.repeat(100) })!.hero.length).toBe(16);
    expect(normalizeStudioSlide({ layout: 'portada' })!.hero).toBe('');
  });
});
