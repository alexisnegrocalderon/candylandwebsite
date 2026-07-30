import { describe, it, expect } from 'vitest';
import { ALL_ARTICLES, getGuides, getPosts, getRelated, articlePath } from '../client/src/content';
import { articleSchema } from '../shared/structuredData';

/* El contenido son datos, así que se puede verificar en CI. Estos tests
 * atrapan los errores que si no se descubren en producción: un slug repetido,
 * un enlace interno a un artículo que no existe, o un artículo publicado sin
 * cuerpo. */

describe('registro de contenido', () => {
  it('no tiene slugs repetidos dentro de una misma categoría', () => {
    // Slugs iguales en categorías distintas SÍ se permiten (viven en rutas
    // distintas), pero repetidos dentro de una haría que getArticle devuelva
    // siempre el primero y el otro quedara inalcanzable.
    for (const category of ['guia', 'blog'] as const) {
      const slugs = ALL_ARTICLES.filter((a) => a.category === category).map((a) => a.slug);
      expect(new Set(slugs).size, `slugs repetidos en ${category}`).toBe(slugs.length);
    }
  });

  it('todos los relatedSlugs apuntan a un artículo que existe', () => {
    // Sin esto, un slug mal escrito rompe el enlazado interno en silencio.
    for (const article of ALL_ARTICLES) {
      for (const slug of article.relatedSlugs ?? []) {
        const target = ALL_ARTICLES.find((a) => a.slug === slug);
        expect(target, `"${article.slug}" enlaza a "${slug}", que no existe`).toBeDefined();
      }
    }
  });

  it('ningún artículo se enlaza a sí mismo', () => {
    for (const article of ALL_ARTICLES) {
      expect(article.relatedSlugs ?? []).not.toContain(article.slug);
    }
  });

  it('todos tienen secciones con contenido', () => {
    for (const article of ALL_ARTICLES) {
      expect(article.sections.length, `"${article.slug}" no tiene secciones`).toBeGreaterThan(0);
      for (const section of article.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        const tieneCuerpo = (section.body?.length ?? 0) > 0 || (section.list?.length ?? 0) > 0;
        expect(tieneCuerpo, `"${article.slug}" → "${section.heading}" está vacía`).toBe(true);
      }
    }
  });

  it('los títulos no exceden lo que Google muestra', () => {
    // Sobre ~110 caracteres Google recorta el headline en los resultados.
    for (const article of ALL_ARTICLES) {
      expect(article.title.length, `título muy largo en "${article.slug}"`).toBeLessThanOrEqual(110);
    }
  });

  it('las fechas están en formato ISO', () => {
    for (const article of ALL_ARTICLES) {
      expect(article.publishedAt, `fecha inválida en "${article.slug}"`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('cada artículo tiene descripción para el meta description', () => {
    for (const article of ALL_ARTICLES) {
      expect(article.description.length, `sin descripción: "${article.slug}"`).toBeGreaterThan(50);
    }
  });

  it('separa guías de artículos por categoría', () => {
    expect(getGuides().every((a) => a.category === 'guia')).toBe(true);
    expect(getPosts().every((a) => a.category === 'blog')).toBe(true);
    expect(getGuides().length + getPosts().length).toBe(ALL_ARTICLES.length);
  });

  it('getRelated devuelve solo artículos existentes', () => {
    for (const article of ALL_ARTICLES) {
      const related = getRelated(article);
      expect(related.length).toBeLessThanOrEqual((article.relatedSlugs ?? []).length);
      expect(related.every((r) => ALL_ARTICLES.includes(r))).toBe(true);
    }
  });
});

describe('articlePath', () => {
  it('manda las guías a /panoramas y los artículos a /blog', () => {
    expect(articlePath({ slug: 'vina-del-mar', category: 'guia' })).toBe('/panoramas/vina-del-mar');
    expect(articlePath({ slug: 'que-llevar', category: 'blog' })).toBe('/blog/que-llevar');
  });
});

describe('articleSchema', () => {
  const base = {
    headline: 'Qué hacer en Viña del Mar de noche',
    description: 'Una guía.',
    url: '/panoramas/vina-del-mar',
    datePublished: '2026-07-30',
  };

  it('usa BlogPosting con autor y editor', () => {
    const schema = articleSchema(base);
    expect(schema['@type']).toBe('BlogPosting');
    expect((schema.author as any).name).toBe('Mansion Playroom');
    expect((schema.publisher as any).name).toBe('Mansion Playroom');
    expect((schema.mainEntityOfPage as any)['@id']).toBe('https://mansionplayroom.cl/panoramas/vina-del-mar');
  });

  it('si nunca se editó, dateModified coincide con la publicación', () => {
    expect(articleSchema(base).dateModified).toBe('2026-07-30');
  });

  it('respeta dateModified cuando se pasa', () => {
    expect(articleSchema({ ...base, dateModified: '2026-08-15' }).dateModified).toBe('2026-08-15');
  });
});
