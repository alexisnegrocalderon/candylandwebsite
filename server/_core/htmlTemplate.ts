import fs from "node:fs";
import path from "node:path";

/* Plantilla HTML de la SPA + inyección de metaetiquetas para server/ssrMeta.ts.
 *
 * Se lee del disco en el PRIMER request (no al importar el módulo -- así un
 * checkout recién clonado, sin `vite build` corrido todavía, no rompe al
 * arrancar el server) y se cachea en memoria para el resto de la vida del
 * proceso/instancia -- una lectura de disco por cada visita sería
 * desperdicio, sobre todo con la respuesta ya cacheada 5 min en el CDN de
 * Vercel (ver Cache-Control en ssrMeta.ts).
 *
 * Busca primero el HTML YA COMPILADO por Vite (`dist/public/index.html`, lo
 * que realmente se sirve en producción); si no existe (típico en un dev
 * local que nunca corrió `pnpm build`), cae al template FUENTE
 * (`client/index.html`) -- casi idéntico para efectos de metaetiquetas: Vite
 * solo le agrega el script de módulos/HMR y algunos preloads en el build
 * real, nada que toque las etiquetas og/twitter/JSON-LD.
 *
 * En Vercel, para que la función tenga `dist/public/index.html` disponible
 * en su propio filesystem (el `outputDirectory` normalmente solo lo sirve
 * el CDN estático, no la función) hace falta `includeFiles` en
 * vercel.json bajo `functions["api/index.js"]`. */
let cached: string | null = null;

export function getIndexHtmlTemplate(): string {
  if (cached) return cached;
  const candidates = [
    path.resolve(process.cwd(), "dist/public/index.html"),
    path.resolve(process.cwd(), "client/index.html"),
  ];
  for (const candidate of candidates) {
    try {
      cached = fs.readFileSync(candidate, "utf-8");
      return cached;
    } catch {
      // Probar el siguiente candidato.
    }
  }
  throw new Error(
    "No se encontró index.html (ni dist/public/ ni client/) -- corré `vite build` o revisá el deploy."
  );
}

/** Solo para tests -- vitest importa este módulo en aislado, sin haber
 * corrido nunca `vite build` en ese proceso. */
export function __resetIndexHtmlCacheForTests() {
  cached = null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMetaContent(html: string, attr: "property" | "name", key: string, content: string): string {
  // El orden de atributos en client/index.html es siempre `attr="key"
  // content="..."` -- confirmado leyendo el archivo. Si algún día se
  // reordenan a mano, este regex deja de encontrar la etiqueta y
  // simplemente no la toca (no revienta, pero tampoco inyecta).
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  return html.replace(re, (_match, pre, post) => `${pre}${escapeHtml(content)}${post}`);
}

function setTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function setLinkHref(html: string, rel: string, href: string): string {
  const re = new RegExp(`(<link\\s+rel="${rel}"\\s+href=")[^"]*(")`, "i");
  return html.replace(re, (_match, pre, post) => `${pre}${escapeHtml(href)}${post}`);
}

export type MetaOverrides = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  canonical?: string;
  /** Se agrega COMO EXTRA antes de `</head>` -- no reemplaza el JSON-LD
   * global (NightClub) que ya trae el template estático, ambos conviven. */
  jsonLd?: unknown[];
};

export function injectMeta(html: string, overrides: MetaOverrides): string {
  let out = html;
  if (overrides.title) out = setTitle(out, overrides.title);
  if (overrides.description) out = setMetaContent(out, "name", "description", overrides.description);
  if (overrides.ogTitle) out = setMetaContent(out, "property", "og:title", overrides.ogTitle);
  if (overrides.ogDescription) out = setMetaContent(out, "property", "og:description", overrides.ogDescription);
  if (overrides.ogUrl) out = setMetaContent(out, "property", "og:url", overrides.ogUrl);
  if (overrides.ogImage) out = setMetaContent(out, "property", "og:image", overrides.ogImage);
  if (overrides.twitterTitle) out = setMetaContent(out, "name", "twitter:title", overrides.twitterTitle);
  if (overrides.twitterDescription) out = setMetaContent(out, "name", "twitter:description", overrides.twitterDescription);
  if (overrides.twitterImage) out = setMetaContent(out, "name", "twitter:image", overrides.twitterImage);
  if (overrides.canonical) out = setLinkHref(out, "canonical", overrides.canonical);
  if (overrides.jsonLd && overrides.jsonLd.length > 0) {
    const script = `<script type="application/ld+json">${JSON.stringify(overrides.jsonLd)}</script>\n  </head>`;
    out = out.replace(/<\/head>/i, script);
  }
  return out;
}
