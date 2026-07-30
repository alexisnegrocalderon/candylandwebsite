import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight, Clock } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { articleSchema, breadcrumbSchema } from '@shared/structuredData';
import { getRelated, articlePath, type Article } from '@/content';

/* Layout compartido por guías (/panoramas/:slug) y artículos (/blog/:slug).
 * Sigue el molde de RefundPolicy.tsx -- secciones armadas desde un arreglo de
 * datos con .map() -- que es como el proyecto ya renderiza contenido largo. */

function fechaLegible(iso: string): string {
  // Se fuerza mediodía UTC para que el cambio de zona horaria no corra la
  // fecha un día hacia atrás en Chile.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ArticleLayout({ article }: { article: Article }) {
  const path = articlePath(article);
  const related = getRelated(article);
  const esGuia = article.category === 'guia';

  useSeo({
    title: article.title,
    description: article.description,
    path,
    jsonLd: [
      articleSchema({
        headline: article.heading,
        description: article.description,
        url: path,
        datePublished: article.publishedAt,
        dateModified: article.updatedAt,
      }),
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        esGuia
          ? { name: 'Panoramas', path: '/panoramas' }
          : { name: 'Blog', path: '/blog' },
        { name: article.heading, path },
      ]),
    ],
  });

  return (
    <div className="min-h-screen pt-24 pb-16">
      <article className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* Migas de pan: además del schema, orientan de verdad a quien llega
              desde Google directo al artículo sin pasar por el home. */}
          <nav aria-label="Migas de pan" className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
            <span aria-hidden>/</span>
            <Link href={esGuia ? '/panoramas' : '/blog'} className="hover:text-primary transition-colors">
              {esGuia ? 'Panoramas' : 'Blog'}
            </Link>
          </nav>

          <div className="text-5xl mb-4" aria-hidden>{article.emoji}</div>
          <h1 className="font-heading font-extrabold text-3xl md:text-5xl tracking-tight mb-4 leading-[1.1]">
            {article.heading}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-4">{article.description}</p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pb-8 mb-8 border-b border-border/40">
            <time dateTime={article.publishedAt}>{fechaLegible(article.publishedAt)}</time>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {article.readMinutes} min de lectura
            </span>
          </div>

          <div className="space-y-10">
            {article.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-heading font-bold text-xl md:text-2xl mb-4">{section.heading}</h2>
                {section.body?.map((p, i) => (
                  <p key={i} className="text-muted-foreground leading-relaxed mb-4">{p}</p>
                ))}
                {section.list && (
                  <ul className="space-y-2.5 mb-4">
                    {section.list.map((item, i) => (
                      <li
                        key={i}
                        className="text-muted-foreground leading-relaxed pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-primary"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                {section.note && (
                  <p className="glass-candy rounded-xl p-4 text-sm text-foreground/80 leading-relaxed">
                    {section.note}
                  </p>
                )}
              </section>
            ))}
          </div>

          <div className="glass-candy rounded-2xl p-6 md:p-8 mt-12 text-center">
            <p className="text-base md:text-lg mb-5">{article.cta.text}</p>
            <Link
              href={article.cta.href}
              className="btn-jelly inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
            >
              {article.cta.label} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {related.length > 0 && (
            <div className="mt-14">
              <h2 className="font-heading font-bold text-xl mb-5">Seguir leyendo</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={articlePath(r)}
                    className="glass-candy rounded-2xl p-5 interactive hover:border-primary/30 transition-colors block"
                  >
                    <div className="text-2xl mb-2" aria-hidden>{r.emoji}</div>
                    <h3 className="font-semibold mb-1 leading-snug">{r.heading}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{r.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </article>
    </div>
  );
}
