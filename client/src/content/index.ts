import type { Article } from './types';
import { guiaVinaDelMar } from './guias/vina-del-mar';
import { guiaValparaiso } from './guias/valparaiso';
import { queLlevar } from './blog/que-llevar';
import { dressCodeExplicado } from './blog/dress-code-explicado';
import { primeraVezQueEsperar } from './blog/primera-vez-que-esperar';
import { comoLlegarYEstacionar } from './blog/como-llegar-y-estacionar';

/* Registro central de contenido: fuente única para los listados, el sitemap,
 * el enlazado entre artículos y (más adelante) el pre-renderizado. Agregar un
 * artículo es crear el archivo e importarlo acá -- nada más. */

export const ALL_ARTICLES: Article[] = [
  guiaVinaDelMar,
  guiaValparaiso,
  primeraVezQueEsperar,
  dressCodeExplicado,
  queLlevar,
  comoLlegarYEstacionar,
];

/** Más nuevos primero, que es como se listan en /blog y /panoramas. */
function byDateDesc(a: Article, b: Article) {
  return b.publishedAt.localeCompare(a.publishedAt);
}

export function getGuides(): Article[] {
  return ALL_ARTICLES.filter((a) => a.category === 'guia').sort(byDateDesc);
}

export function getPosts(): Article[] {
  return ALL_ARTICLES.filter((a) => a.category === 'blog').sort(byDateDesc);
}

export function getArticle(category: Article['category'], slug: string): Article | undefined {
  return ALL_ARTICLES.find((a) => a.category === category && a.slug === slug);
}

/** Los artículos relacionados que existen de verdad. Se filtra en vez de
 * confiar: un slug mal escrito rompería el enlazado interno en silencio (hay
 * un test que además lo detecta en CI). */
export function getRelated(article: Article): Article[] {
  return (article.relatedSlugs ?? [])
    .map((slug) => ALL_ARTICLES.find((a) => a.slug === slug))
    .filter((a): a is Article => !!a);
}

export type { Article, ArticleSection, ArticleCategory } from './types';
export { articlePath } from './types';
