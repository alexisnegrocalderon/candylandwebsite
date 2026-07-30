import { useRoute } from 'wouter';
import ArticleLayout from '@/components/ArticleLayout';
import ArticleIndex from '@/components/ArticleIndex';
import NotFound from '@/pages/NotFound';
import { getArticle, getPosts } from '@/content';

/* /blog (listado) y /blog/:slug (artículo).
 *
 * ⚠️ La ruta es "/blog" en SINGULAR a propósito: vercel.json excluye `blogs/`
 * del rewrite a index.html (ruta heredada de Shopify), así que el plural
 * devolvería 404 en producción. */

export default function Blog() {
  const [esDetalle, params] = useRoute('/blog/:slug');

  if (esDetalle) {
    const post = getArticle('blog', params?.slug ?? '');
    if (!post) return <NotFound />;
    return <ArticleLayout article={post} />;
  }

  return (
    <ArticleIndex
      eyebrow="Blog"
      heading="Todo lo que conviene saber antes de salir"
      description="Dress code, qué llevar, cómo llegar y qué esperar si es tu primera vez. Las respuestas a lo que la gente pregunta de verdad antes de una noche con nosotros."
      seoTitle="Blog — Mansion Playroom"
      seoDescription="Guías prácticas para tu próxima noche: dress code, qué llevar, cómo llegar y qué esperar en una fiesta liberal en la Región de Valparaíso."
      path="/blog"
      breadcrumbLabel="Blog"
      articles={getPosts()}
      emptyText="Todavía no hay artículos publicados."
    />
  );
}
