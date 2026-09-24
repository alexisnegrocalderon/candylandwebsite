import type { Express, Request, Response } from "express";
import * as db from "./db";
import { getGuides, getPosts } from "../client/src/content";
import { articlePath } from "../client/src/content/types";

/* sitemap.xml generado en cada request (con caché corto en memoria), no un
 * archivo estático -- ver el commit que reemplaza esto. El archivo estático
 * anterior (client/public/sitemap.xml) era de mantención manual: cada vez
 * que un evento terminaba y empezaba el siguiente, el sitemap seguía
 * apuntando al que ya pasó hasta que alguien se acordaba de editarlo a
 * mano. Acá el evento vigente y los artículos salen siempre de la fuente
 * real (la base de datos y client/src/content), nunca de una lista copiada.
 *
 * Registrado en server/_core/app.ts como una ruta EXACTA (no un catch-all),
 * así que no hay conflicto de orden con las rutas de server/ssrMeta.ts (que
 * sólo se agregan en vercel-entry.ts, después de todo lo demás). Ver
 * vercel.json (rewrites): "/sitemap.xml" tiene su propia entrada explícita
 * ANTES del catch-all, así que este archivo nunca colisiona con esa regex
 * -- no hace falta tocarla. */

const SITE_URL = "https://mansionplayroom.cl";

type SitemapEntry = { path: string; changefreq: string; priority: string };

/** Páginas "shell" fijas: no cambian solas. Una página nueva de verdad ya es
 * un cambio de código (una ruta nueva en App.tsx + su rewrite en
 * vercel.json), así que agregar una línea acá al mismo tiempo es
 * razonable -- lo que NUNCA debe ir acá a mano es un evento o un artículo de
 * client/src/content: esos salen solos, más abajo. */
const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/eventos", changefreq: "weekly", priority: "0.9" },
  { path: "/entradas", changefreq: "monthly", priority: "0.7" },
  { path: "/playmatch", changefreq: "monthly", priority: "0.6" },
  { path: "/embajadores", changefreq: "monthly", priority: "0.7" },
  { path: "/panoramas", changefreq: "monthly", priority: "0.8" },
  { path: "/blog", changefreq: "weekly", priority: "0.7" },
  { path: "/blog/que-son-las-fiestas-liberales", changefreq: "monthly", priority: "0.7" },
  { path: "/blog/tarjeta-playcard", changefreq: "monthly", priority: "0.7" },
  { path: "/blog/dress-code-explicado", changefreq: "monthly", priority: "0.6" },
  { path: "/politica-de-reembolso", changefreq: "yearly", priority: "0.3" },
  { path: "/politica-de-privacidad", changefreq: "yearly", priority: "0.3" },
];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function xmlFor(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${escapeXml(SITE_URL + e.path)}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function buildSitemapXml(): Promise<string> {
  const entries: SitemapEntry[] = [...STATIC_ENTRIES];

  // Eventos vigentes (publicados o agotados) -- NUNCA "past": es justo el
  // desfase que este endpoint reemplaza. getPublishedEvents() también trae
  // 'past' (lo usa la home para la sección "Ediciones anteriores"), así que
  // acá se filtra aparte.
  const events = await db.getPublishedEvents();
  for (const event of events) {
    if (event.status !== "published" && event.status !== "soldout") continue;
    entries.push({ path: `/eventos/${event.slug}`, changefreq: "weekly", priority: "0.8" });
  }

  // Artículos y guías: la misma fuente única que ya usa /blog, /panoramas y
  // el pre-renderizado (client/src/content/index.ts) -- un artículo nuevo
  // ahí se suma acá solo, sin tocar este archivo.
  for (const guide of getGuides()) {
    entries.push({ path: articlePath(guide), changefreq: "monthly", priority: "0.8" });
  }
  for (const post of getPosts()) {
    entries.push({ path: articlePath(post), changefreq: "monthly", priority: "0.6" });
  }

  return xmlFor(entries);
}

// Caché en memoria corto -- el CDN de Vercel (Cache-Control de la respuesta,
// abajo) ya absorbe la mayoría de los pedidos; esto es solo para no pegarle
// a la base en cada invocación fría que sí llega a ejecutar la función
// (mismo patrón que resolveDefaultOgImage() en server/ssrMeta.ts).
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { xml: string; expiresAt: number } | null = null;

export function registerSitemapRoute(app: Express) {
  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    try {
      if (!cache || cache.expiresAt <= Date.now()) {
        const xml = await buildSitemapXml();
        cache = { xml, expiresAt: Date.now() + CACHE_TTL_MS };
      }
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
      res.send(cache.xml);
    } catch (err) {
      console.error("[sitemap] no se pudo generar con datos en vivo, sirviendo solo las páginas fijas:", err);
      // Nunca un 500 en blanco para un crawler -- mejor un sitemap parcial
      // (siempre válido, aunque le falte el evento vigente) que nada.
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.send(xmlFor(STATIC_ENTRIES));
    }
  });
}
