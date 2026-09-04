import type { Express, Request, Response, NextFunction } from "express";
import * as db from "./db";
import { eventSchema, breadcrumbSchema } from "../shared/structuredData";
import { getIndexHtmlTemplate, injectMeta } from "./_core/htmlTemplate";

/* Inyección de metaetiquetas del lado del servidor (pedido explícito del
 * dueño, 02-03/09) -- el fix real para que WhatsApp/Facebook/Twitter
 * muestren el flyer/título correctos al compartir un link. `useSeo.ts`
 * (client/src/hooks/useSeo.ts) parcha el <head> del lado del NAVEGADOR, que
 * a los crawlers de redes sociales no les sirve de nada: leen el HTML tal
 * cual lo devuelve el servidor, sin correr JS. Ver vercel.json (rewrites)
 * para qué rutas llegan hasta acá en vez de ir directo al `/index.html`
 * estático.
 *
 * ⚠️ Las rutas de acá abajo usan el path REAL que pide el navegador
 * (`/eventos/:slug`, `*`), NO un path inventado tipo `/api/ssr/...` --
 * confirmado con la documentación de Vercel + el comportamiento ya probado
 * de tRPC en este mismo proyecto: el `destination` de un rewrite en
 * vercel.json solo le dice a Vercel QUÉ función invocar, pero Express
 * adentro sigue viendo la URL que el navegador pidió de verdad en
 * `req.url`/`req.path`. Mandar el rewrite a un destino inventado (como se
 * hizo en un intento anterior, `/api/ssr/page`) no resuelve a NINGÚN
 * archivo/función real y tira 404 antes de que esta función corra --
 * rompió el sitio entero, ver el commit que lo arregla.
 *
 * Por el mismo motivo, `registerSsrMetaRoutes` NO se llama desde el
 * `createApp()` compartido (`server/_core/app.ts`) -- se llama SOLO desde
 * `server/vercel-entry.ts`, después de armado el resto de la app (tRPC
 * incluido). El catch-all (`*`) de acá abajo matchea CUALQUIER GET, así
 * que si se registrara antes de tRPC (o en el server local, antes de que
 * Vite sirva sus propias rutas en dev) se comería esas requests primero. */

const SITE_URL = "https://mansionplayroom.cl";
const DEFAULT_OG_IMAGE = `${SITE_URL}/candyland/og-candyland.jpg`;
const DEFAULT_EVENT_DESCRIPTION =
  "Fiesta liberal en la Región de Valparaíso: fecha, horario, accesos y entradas para tu próxima noche con Mansion Playroom.";

// El CDN de Vercel ya cachea la respuesta entera 5 minutos (Cache-Control
// abajo) -- este caché en memoria es solo para no pegarle a la base en cada
// visita que SÍ llega a ejecutar la función (primera de cada ventana de
// caché, o una ráfaga en un cold start).
const OG_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000;
let ogImageCache: { value: string; expiresAt: number } | null = null;

async function resolveDefaultOgImage(): Promise<string> {
  if (ogImageCache && ogImageCache.expiresAt > Date.now()) return ogImageCache.value;
  const settings = await db.getSiteSettings();
  const value = settings.ogImageUrl || DEFAULT_OG_IMAGE;
  ogImageCache = { value, expiresAt: Date.now() + OG_IMAGE_CACHE_TTL_MS };
  return value;
}

function sendHtml(res: Response, html: string) {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
  res.send(html);
}

// `getIndexHtmlTemplate()` puede tirar si ni `dist/public/index.html` ni
// `client/index.html` están disponibles (ej. un `includeFiles` mal
// configurado en Vercel) -- sin este try/catch, ese throw síncrono dentro
// de un handler async queda como una promise rechazada que Express 4 NO
// atrapa solo, y el request se queda colgado hasta el maxDuration (60s) en
// vez de fallar rápido. Mejor una respuesta de error inmediata y visible.
function loadTemplateOrFail(res: Response): string | null {
  try {
    return getIndexHtmlTemplate();
  } catch (err) {
    console.error("[ssrMeta] No se pudo leer index.html:", err);
    res.status(500).type("text/plain").send("Error interno. Probá de nuevo en un momento.");
    return null;
  }
}

export function registerSsrMetaRoutes(app: Express) {
  app.get("/eventos/:slug", async (req: Request, res: Response) => {
    const template = loadTemplateOrFail(res);
    if (!template) return;
    try {
      const slug = req.params.slug;
      const event = await db.getEventBySlug(slug);
      if (!event) {
        // Slug borrado/typo: se sirve el template sin tocar -- la SPA
        // renderiza su propio "no encontrado" normal después de hidratar.
        return sendHtml(res, template);
      }

      const title = `${event.title} — Fiesta Liberal en Viña del Mar | +18`;
      const description = event.shortDescription || DEFAULT_EVENT_DESCRIPTION;
      const image = event.imageUrl || (await resolveDefaultOgImage());
      const url = `${SITE_URL}/eventos/${event.slug}`;

      let priceFrom: number | null = null;
      try {
        const ticketTypes = await db.getTicketTypesByEventId(event.id);
        const accesos = (ticketTypes as any[]).filter((t) => t.category === "acceso");
        if (accesos.length > 0) priceFrom = Math.min(...accesos.map((t) => Number(t.price)));
      } catch {
        // El precio es un plus del JSON-LD, no crítico -- si falla, se
        // sigue sin `price` (mismo comportamiento que eventSchema() ya
        // maneja cuando priceFrom es null).
      }

      const jsonLd = [
        eventSchema({
          name: event.title,
          description: event.shortDescription,
          startDate: new Date(event.eventDate).toISOString(),
          endDate: event.eventEnd ? new Date(event.eventEnd).toISOString() : null,
          slug: event.slug,
          imageUrl: event.imageUrl,
          priceFrom,
          venueName: event.venue ?? undefined,
        }),
        breadcrumbSchema([
          { name: "Inicio", path: "/" },
          { name: "Eventos", path: "/eventos" },
          { name: event.title, path: `/eventos/${event.slug}` },
        ]),
      ];

      const html = injectMeta(template, {
        title,
        description,
        ogTitle: event.title,
        ogDescription: description,
        ogUrl: url,
        ogImage: image,
        twitterTitle: event.title,
        twitterDescription: description,
        twitterImage: image,
        canonical: url,
        jsonLd,
      });
      sendHtml(res, html);
    } catch (err) {
      console.error("[ssrMeta] /eventos/:slug falló, sirviendo template sin inyectar:", err);
      sendHtml(res, template);
    }
  });

  // Catch-all: cualquier otra página pública que haya llegado hasta acá
  // (vercel.json ya filtró /api, assets estáticos, y las apps internas --
  // admin/caja/checkout/etc -- ANTES de llegar a esta función). La guarda
  // de /api/ de abajo es solo por las dudas: un /api/algo que no matcheó
  // ninguna ruta más específica (trpc, admin, cron, blob, webhooks, todas
  // registradas antes que esta) no debería devolver una página HTML.
  app.get("*", async (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) return next();
    const template = loadTemplateOrFail(res);
    if (!template) return;
    try {
      const image = await resolveDefaultOgImage();
      const html = injectMeta(template, { ogImage: image, twitterImage: image });
      sendHtml(res, html);
    } catch (err) {
      console.error("[ssrMeta] catch-all falló, sirviendo template sin inyectar:", err);
      sendHtml(res, template);
    }
  });
}
