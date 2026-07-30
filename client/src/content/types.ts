/* Contenido editorial (guías y artículos) como DATOS, no como JSX.
 *
 * Se guarda así -- y no como componentes React sueltos -- para que el listado,
 * el sitemap, el enlazado entre artículos y el pre-renderizado (fase 3) salgan
 * todos de la misma fuente sin duplicar nada, y para que el texto quede
 * separado de la presentación.
 *
 * ⚠️ Regla de redacción, decidida con el dueño: acá solo se afirma lo que se
 * puede verificar en `client/src/config/candyland.ts` (FAQ, dress code,
 * horarios, amenities, accesos, valores). NO se inventan locales de terceros,
 * barrios, horarios de transporte ni datos de la escena que nadie confirmó.
 * Contenido genérico inflado es exactamente lo que penaliza el sistema de
 * contenido útil de Google, y recomendar lugares que no se pueden verificar es
 * un riesgo para la marca. */

export type ArticleCategory = 'guia' | 'blog';

export type ArticleSection = {
  heading: string;
  /** Párrafos. Cada string es un <p>. */
  body?: string[];
  /** Viñetas, si la sección las lleva. */
  list?: string[];
  /** Nota destacada al cierre de la sección. */
  note?: string;
};

export type Article = {
  slug: string;
  category: ArticleCategory;
  /** Título de la página y `headline` del schema. Google recorta sobre los
   * ~110 caracteres, así que se mantiene corto (hay un test que lo verifica). */
  title: string;
  /** Título visible en la página, puede ser más largo/expresivo que el `title`. */
  heading: string;
  description: string;
  /** ISO (YYYY-MM-DD). */
  publishedAt: string;
  updatedAt?: string;
  readMinutes: number;
  emoji: string;
  sections: ArticleSection[];
  /** Slugs de otros artículos. Un test verifica que todos existan -- si no, el
   * enlazado interno se rompería en silencio. */
  relatedSlugs?: string[];
  cta: {
    text: string;
    label: string;
    href: string;
  };
};

/** Ruta pública de un artículo según su categoría. */
export function articlePath(article: Pick<Article, 'slug' | 'category'>): string {
  return article.category === 'guia' ? `/panoramas/${article.slug}` : `/blog/${article.slug}`;
}
