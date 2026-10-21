/* Manifest del sitio instalable con la entrada adentro: la página de la
 * entrada (/verificar/:code) apunta su <link rel="manifest"> acá, así quien
 * agrega el sitio a inicio desde su QR abre la app ya sabiendo cuál es su
 * entrada (`t`, ver client/src/lib/customerPush.ts) y sus avisos quedan
 * ligados a su compra. La app igual abre en la home. */
import type { Express, Request, Response } from "express";

// Copia de client/public/site.webmanifest (el archivo no viaja con la función).
const MANIFEST = {
  name: "Mansion Playroom", short_name: "Playroom", description: "Entradas, eventos y avisos de Mansion Playroom",
  id: "/", scope: "/", display: "standalone", orientation: "portrait", background_color: "#0b0612", theme_color: "#0b0612",
  icons: [180, 192, 512].map((n) => ({ src: `/candyland/favicon-${n}.png?v=2`, sizes: `${n}x${n}`, type: "image/png", purpose: "any" })),
};

export function registerSiteManifestRoute(app: Express) {
  app.get("/api/site-manifest", (req: Request, res: Response) => {
    const t = typeof req.query.t === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(req.query.t) ? req.query.t : null;
    const manifest = { ...MANIFEST, start_url: t ? `/?source=app&t=${t}` : "/?source=app" };
    res.setHeader("Content-Type", "application/manifest+json");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(JSON.stringify(manifest));
  });
}
