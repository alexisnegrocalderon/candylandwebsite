#!/usr/bin/env -S npx tsx
/**
 * Pre-renderizado (SSG) de las páginas de contenido puro -- "Fase 3" del
 * plan de SEO/AEO (docs/SEO-ESTRATEGIA.md), pedido para que un crawler que
 * NO ejecuta JavaScript (la mayoría de los bots de motores de respuesta con
 * IA -- GPTBot, ClaudeBot, PerplexityBot, etc. -- a diferencia de Googlebot,
 * que sí lo hace en una segunda pasada) reciba contenido real en el HTML en
 * vez de un `<div id="root"></div>` vacío.
 *
 * Corre DESPUÉS de `vite build` (necesita `dist/public/index.html` ya
 * compilado como plantilla -- ver `getIndexHtmlTemplate()`) y ANTES del
 * build de la API (ver "build" en package.json). Mismo patrón que el ya
 * existente `scripts/generate-pwa-html.mjs`: lee el `index.html` compilado,
 * lo transforma, escribe archivos nuevos en `dist/public/`.
 *
 * Corre con `tsx` (no `node` a secas) porque necesita ejecutar JSX real
 * (`client/src/entry-server.tsx`) y módulos TypeScript del server/shared sin
 * un paso de build aparte -- `tsx` ya es una devDependency de este proyecto,
 * usada igual para `pnpm dev`.
 *
 * Alcance A PROPÓSITO acotado a páginas de contenido puro (sin datos en
 * vivo): Home, Eventos, Entradas y todo lo transaccional se quedan como
 * están hoy (SPA client-render + head-injection de `server/ssrMeta.ts`) --
 * ver docs/SEO-ESTRATEGIA.md, ítem 9/10, "las páginas con datos en vivo
 * quedan como están".
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderPage } from '../client/src/entry-server';
import { getIndexHtmlTemplate, injectMeta, type MetaOverrides } from '../server/_core/htmlTemplate';
import { articleSchema, breadcrumbSchema } from '../shared/structuredData';
import { getArticle, getPosts, getGuides, articlePath, type Article } from '../client/src/content';

const SITE_URL = 'https://mansionplayroom.cl';
const DEFAULT_OG_IMAGE = `${SITE_URL}/candyland/og-candyland.jpg`;
const OUT_DIR = join(import.meta.dirname, '..', 'dist', 'public');

type RouteMeta = { path: string; file: string; meta: MetaOverrides };

/** Arma el `MetaOverrides` de un artículo (guía o post) a partir del mismo
 * dato que ya usa `ArticleLayout.tsx` -- ninguna duplicación de copy, se lee
 * directo de `client/src/content`, así que un artículo nuevo no puede
 * quedar con metadata vieja/inventada por accidente. */
function articleMeta(article: Article): MetaOverrides {
  const path = articlePath(article);
  const url = `${SITE_URL}${path}`;
  const esGuia = article.category === 'guia';
  return {
    title: article.title,
    description: article.description,
    ogTitle: article.title,
    ogDescription: article.description,
    ogUrl: url,
    ogImage: DEFAULT_OG_IMAGE,
    twitterTitle: article.title,
    twitterDescription: article.description,
    twitterImage: DEFAULT_OG_IMAGE,
    canonical: url,
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
        esGuia ? { name: 'Panoramas', path: '/panoramas' } : { name: 'Blog', path: '/blog' },
        { name: article.heading, path },
      ]),
    ],
  };
}

/** Metadata de las páginas "shell" (no vienen de `client/src/content`) --
 * copiada literal de cada `useSeo(...)`/`<ArticleIndex seoTitle=.../>` real.
 * `server/content.test.ts` (extendido acá al lado) verifica que esta lista
 * no se desalinee de las páginas de verdad. */
function staticRoutes(): RouteMeta[] {
  const withOg = (m: Omit<MetaOverrides, 'ogTitle' | 'ogDescription' | 'ogUrl' | 'ogImage' | 'twitterTitle' | 'twitterDescription' | 'twitterImage' | 'canonical'> & { path: string }): MetaOverrides => ({
    ...m,
    ogTitle: m.title,
    ogDescription: m.description,
    ogUrl: `${SITE_URL}${m.path}`,
    ogImage: DEFAULT_OG_IMAGE,
    twitterTitle: m.title,
    twitterDescription: m.description,
    twitterImage: DEFAULT_OG_IMAGE,
    canonical: `${SITE_URL}${m.path}`,
  });

  return [
    {
      path: '/nosotros',
      file: 'nosotros.html',
      meta: withOg({
        path: '/nosotros',
        title: 'Quiénes Somos — Comunidad y Consentimiento | Mansion Playroom',
        description: 'Cómo cuidamos el espacio: respeto, consentimiento y libertad. Conoce la comunidad detrás de las noches de Mansion Playroom en la Región de Valparaíso.',
        jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Nosotros', path: '/nosotros' }])],
      }),
    },
    {
      path: '/panoramas',
      file: 'panoramas.html',
      meta: withOg({
        path: '/panoramas',
        title: 'Panoramas Nocturnos en la Región de Valparaíso — Guía',
        description: 'Qué hacer de noche en Viña del Mar y Valparaíso: guías de panoramas, vida nocturna y planes de fin de semana en la Región de Valparaíso.',
        jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Panoramas', path: '/panoramas' }])],
      }),
    },
    {
      path: '/blog',
      file: 'blog.html',
      meta: withOg({
        path: '/blog',
        title: 'Blog — Mansion Playroom',
        description: 'Guías prácticas para tu próxima noche: dress code, qué llevar, cómo llegar y qué esperar en una fiesta liberal en la Región de Valparaíso.',
        jsonLd: [breadcrumbSchema([{ name: 'Inicio', path: '/' }, { name: 'Blog', path: '/blog' }])],
      }),
    },
    {
      path: '/blog/que-son-las-fiestas-liberales',
      file: 'blog/que-son-las-fiestas-liberales.html',
      meta: withOg({
        path: '/blog/que-son-las-fiestas-liberales',
        title: '¿Qué son las fiestas liberales? — Mansion Playroom',
        description: 'Mitos, realidades y un quiz rápido para saber si una fiesta liberal es para ti -- respeto, consentimiento y libertad, explicado sin vueltas.',
        jsonLd: [
          articleSchema({
            headline: '¿Qué son las fiestas liberales?',
            description: 'Mitos, realidades y un quiz rápido para saber si una fiesta liberal es para ti.',
            url: '/blog/que-son-las-fiestas-liberales',
            datePublished: '2026-08-11',
          }),
          breadcrumbSchema([
            { name: 'Inicio', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: '¿Qué son las fiestas liberales?', path: '/blog/que-son-las-fiestas-liberales' },
          ]),
        ],
      }),
    },
    {
      path: '/politica-de-reembolso',
      file: 'politica-de-reembolso.html',
      meta: withOg({
        path: '/politica-de-reembolso',
        title: 'Política de reembolso — Mansion Playroom',
        description: 'Plazos, condiciones y proceso de devolución o transferencia de entradas para los eventos de Mansion Playroom.',
      }),
    },
    {
      path: '/politica-de-privacidad',
      file: 'politica-de-privacidad.html',
      meta: withOg({
        path: '/politica-de-privacidad',
        title: 'Política de privacidad — Mansion Playroom',
        description: 'Qué datos guardamos, para qué los usamos, cuánto tiempo los conservamos y cómo puedes pedir que los borremos.',
      }),
    },
  ];
}

function contentRoutes(): RouteMeta[] {
  const routes: RouteMeta[] = [];
  for (const guia of getGuides()) {
    routes.push({ path: articlePath(guia), file: `panoramas/${guia.slug}.html`, meta: articleMeta(guia) });
  }
  for (const post of getPosts()) {
    routes.push({ path: articlePath(post), file: `blog/${post.slug}.html`, meta: articleMeta(post) });
  }
  return routes;
}

export function getRouteList(): RouteMeta[] {
  return [...staticRoutes(), ...contentRoutes()];
}

function main() {
  const template = getIndexHtmlTemplate();
  const routes = getRouteList();

  for (const route of routes) {
    const bodyHtml = renderPage(route.path);
    const withBody = template.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
    const html = injectMeta(withBody, route.meta);

    const outPath = join(OUT_DIR, route.file);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    console.log(`[generate-static-pages] ${route.file} <- ${route.path}`);
  }

  // Guarda de cordura: que /panoramas/:slug o /blog/:slug de content/index.ts
  // no se hayan quedado sin match real (getArticle usa el mismo slug que ya
  // se acaba de renderizar arriba -- esto solo confirma que no hay drift
  // entre getGuides()/getPosts() y getArticle()).
  for (const route of contentRoutes()) {
    const [, category, slug] = route.path.split('/');
    const found = getArticle(category === 'panoramas' ? 'guia' : 'blog', slug);
    if (!found) throw new Error(`[generate-static-pages] Artículo fantasma: ${route.path}`);
  }

  console.log(`[generate-static-pages] ${routes.length} páginas generadas.`);
}

// Guarda de ejecución: este módulo también se importa desde
// `server/generateStaticPages.test.ts` (para probar `getRouteList()` sin
// escribir archivos) -- sin esto, ese import solo por las funciones
// dispararía el build entero como efecto secundario.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
