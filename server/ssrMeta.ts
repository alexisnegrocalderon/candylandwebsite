import type { Express, Request, Response } from "express";
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
 * estático. */

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

export function registerSsrMetaRoutes(app: Express) {
  app.get("/api/ssr/event/:slug", async (req: Request, res: Response) => {
    const template = getIndexHtmlTemplate();
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
      console.error("[ssrMeta] /api/ssr/event falló, sirviendo template sin inyectar:", err);
      sendHtml(res, template);
    }
  });

  app.get("/api/ssr/page", async (_req: Request, res: Response) => {
    const template = getIndexHtmlTemplate();
    try {
      const image = await resolveDefaultOgImage();
      const html = injectMeta(template, { ogImage: image, twitterImage: image });
      sendHtml(res, html);
    } catch (err) {
      console.error("[ssrMeta] /api/ssr/page falló, sirviendo template sin inyectar:", err);
      sendHtml(res, template);
    }
  });
}
