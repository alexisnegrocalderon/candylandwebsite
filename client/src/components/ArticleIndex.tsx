import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Clock } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { breadcrumbSchema } from '@shared/structuredData';
import { articlePath, type Article } from '@/content';

/* Listado compartido por /panoramas y /blog: mismo layout, distinto contenido
 * y distinto copy. */

export default function ArticleIndex({
  eyebrow,
  heading,
  description,
  seoTitle,
  seoDescription,
  path,
  breadcrumbLabel,
  articles,
  emptyText,
}: {
  eyebrow: string;
  heading: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  path: string;
  breadcrumbLabel: string;
  articles: Article[];
  emptyText: string;
}) {
  useSeo({
    title: seoTitle,
    description: seoDescription,
    path,
    jsonLd: [
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: breadcrumbLabel, path },
      ]),
    ],
  });

  return (
    <div className="relative min-h-screen pt-24 pb-16 overflow-hidden">
      <div aria-hidden className="absolute -top-16 right-[8%] w-72 h-72 rounded-full bg-violet-electric/15 blur-[100px] candy-float-slow" />

      <div className="container relative max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '400px' }} transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}>
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">{eyebrow}</p>
          <h1 className="font-heading font-extrabold text-4xl md:text-6xl tracking-tight mb-6 leading-[1.05]">
            {heading}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-12 max-w-2xl">{description}</p>
        </motion.div>

        {articles.length === 0 ? (
          <p className="text-muted-foreground">{emptyText}</p>
        ) : (
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '400px' }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {articles.map((article) => (
              <motion.div
                key={`${article.category}-${article.slug}`}
                variants={{ hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } } }}
              >
                <Link
                  href={articlePath(article)}
                  className="glass-candy rounded-2xl p-6 interactive hover:border-primary/30 transition-colors block h-full"
                >
                  <div className="text-3xl mb-3" aria-hidden>{article.emoji}</div>
                  <h2 className="font-heading font-bold text-xl mb-2 leading-snug">{article.heading}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{article.description}</p>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" /> {article.readMinutes} min
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
