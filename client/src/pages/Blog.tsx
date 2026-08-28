import { useRoute, Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
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
    <>
      <div className="container max-w-4xl pt-24">
        <Link
          href="/blog/que-son-las-fiestas-liberales"
          className="glass-candy rounded-2xl p-6 flex items-center justify-between gap-4 interactive hover:border-primary/30 transition-colors block"
        >
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wide mb-2">
              ✨ Especial
            </span>
            <h2 className="font-heading font-bold text-xl md:text-2xl mb-1">¿Qué son las fiestas liberales?</h2>
            <p className="text-sm text-muted-foreground">Mitos, realidad y un quiz de 2 minutos para saber si es para ti.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-primary shrink-0" />
        </Link>
      </div>
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
    </>
  );
}
