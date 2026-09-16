import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Clock } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { breadcrumbSchema } from '@shared/structuredData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { articlePath, ALL_ARTICLES, STANDALONE_PAGES, type Article } from '@/content';

/* Listado compartido por /panoramas y /blog: mismo layout, distinto contenido
 * y distinto copy.
 *
 * El modo `tabs` es lo que unifica la navegación entre las dos rutas sin
 * tocarlas ni cambiarles el SEO: cambiar de pestaña es puramente client-side
 * (no cambia la URL ni el <title>/meta), así que /blog y /panoramas siguen
 * siendo dos páginas indexables con su propio título para Google, pero desde
 * cualquiera de las dos se puede ver TODO el contenido sin navegar -- que es
 * el problema real que reportó el dueño (artículos que no se encuentran). */

/** Forma mínima común entre un `Article` real y una página standalone
 * (`STANDALONE_PAGES`), con el link ya resuelto -- así `ArticleGrid` no
 * necesita saber de dónde vino cada tarjeta. */
type ArticleLike = { key: string; href: string; heading: string; description: string; emoji: string; readMinutes: number };

function fromArticle(article: Article): ArticleLike {
  return { key: `${article.category}-${article.slug}`, href: articlePath(article), heading: article.heading, description: article.description, emoji: article.emoji, readMinutes: article.readMinutes };
}

function fromStandalonePage(page: (typeof STANDALONE_PAGES)[number]): ArticleLike {
  return { key: page.path, href: page.path, heading: page.title, description: page.description, emoji: page.emoji, readMinutes: 0 };
}

function ArticleGrid({ articles, emptyText }: { articles: ArticleLike[]; emptyText: string }) {
  if (articles.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {articles.map((article) => (
        <Link
          key={article.key}
          href={article.href}
          className="glass-candy rounded-2xl p-6 interactive hover:border-primary/30 transition-colors block"
        >
          <div className="text-3xl mb-3" aria-hidden>{article.emoji}</div>
          <h2 className="font-heading font-bold text-xl mb-2 leading-snug">{article.heading}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{article.description}</p>
          {article.readMinutes > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" /> {article.readMinutes} min
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

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
  tabs,
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
  /** Pestaña que arranca activa cuando se quiere el modo unificado
   * (Todo/Guías/Blog). Sin este prop, se comporta como antes: solo la
   * lista de `articles` recibida. */
  tabs?: 'todo' | 'guias' | 'blog';
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

  const guias = ALL_ARTICLES.filter((a) => a.category === 'guia').map(fromArticle);
  const posts = [
    ...ALL_ARTICLES.filter((a) => a.category === 'blog').map(fromArticle),
    ...STANDALONE_PAGES.map(fromStandalonePage),
  ];
  const todo = [...guias, ...posts];
  const legacyArticles = articles.map(fromArticle);

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">{eyebrow}</p>
          <h1 className="font-heading font-extrabold text-4xl md:text-6xl tracking-tight mb-6 leading-[1.05]">
            {heading}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-12 max-w-2xl">{description}</p>

          {tabs ? (
            <Tabs defaultValue={tabs}>
              <TabsList className="mb-6">
                <TabsTrigger value="todo">Todo</TabsTrigger>
                <TabsTrigger value="guias">Guías</TabsTrigger>
                <TabsTrigger value="blog">Blog</TabsTrigger>
              </TabsList>
              <TabsContent value="todo"><ArticleGrid articles={todo} emptyText={emptyText} /></TabsContent>
              <TabsContent value="guias"><ArticleGrid articles={guias} emptyText={emptyText} /></TabsContent>
              <TabsContent value="blog"><ArticleGrid articles={posts} emptyText={emptyText} /></TabsContent>
            </Tabs>
          ) : (
            <ArticleGrid articles={legacyArticles} emptyText={emptyText} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
