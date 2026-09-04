import { describe, expect, it } from "vitest";
import { injectMeta } from "./htmlTemplate";

const BASE_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Mansion Playroom — Fiesta Liberal en Viña del Mar | +18</title>
    <meta name="description" content="Descripción por defecto." />
    <link rel="canonical" href="https://mansionplayroom.cl/" />
    <meta property="og:title" content="Título por defecto" />
    <meta property="og:description" content="Descripción OG por defecto" />
    <meta property="og:url" content="https://mansionplayroom.cl/" />
    <meta property="og:image" content="https://mansionplayroom.cl/candyland/og-candyland.jpg" />
    <meta name="twitter:title" content="Título por defecto" />
    <meta name="twitter:description" content="Descripción Twitter por defecto" />
    <meta name="twitter:image" content="https://mansionplayroom.cl/candyland/og-candyland.jpg" />
    <script type="application/ld+json">{"@type":"NightClub"}</script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

describe("injectMeta", () => {
  it("reemplaza título, descripción y todas las etiquetas og/twitter", () => {
    const html = injectMeta(BASE_HTML, {
      title: "2º Aniversario — Fiesta Liberal en Viña del Mar | +18",
      description: "Descripción del evento.",
      ogTitle: "2º Aniversario",
      ogDescription: "Descripción del evento.",
      ogUrl: "https://mansionplayroom.cl/eventos/2do-aniversario",
      ogImage: "https://blob.vercel-storage.com/events/flyer.jpg",
      twitterTitle: "2º Aniversario",
      twitterDescription: "Descripción del evento.",
      twitterImage: "https://blob.vercel-storage.com/events/flyer.jpg",
      canonical: "https://mansionplayroom.cl/eventos/2do-aniversario",
    });

    expect(html).toContain("<title>2º Aniversario — Fiesta Liberal en Viña del Mar | +18</title>");
    expect(html).toContain('<meta name="description" content="Descripción del evento." />');
    expect(html).toContain('<meta property="og:title" content="2º Aniversario" />');
    expect(html).toContain('<meta property="og:url" content="https://mansionplayroom.cl/eventos/2do-aniversario" />');
    expect(html).toContain('<meta property="og:image" content="https://blob.vercel-storage.com/events/flyer.jpg" />');
    expect(html).toContain('<meta name="twitter:image" content="https://blob.vercel-storage.com/events/flyer.jpg" />');
    expect(html).toContain('<link rel="canonical" href="https://mansionplayroom.cl/eventos/2do-aniversario" />');
    // El template original no debe seguir presente para lo que sí se reemplazó.
    expect(html).not.toContain("https://mansionplayroom.cl/candyland/og-candyland.jpg");
  });

  it("solo pisa og:image/twitter:image cuando eso es lo único que se pasa (caso /api/ssr/page)", () => {
    const html = injectMeta(BASE_HTML, {
      ogImage: "https://blob.vercel-storage.com/site/og.jpg",
      twitterImage: "https://blob.vercel-storage.com/site/og.jpg",
    });

    expect(html).toContain('<meta property="og:image" content="https://blob.vercel-storage.com/site/og.jpg" />');
    expect(html).toContain('<meta name="twitter:image" content="https://blob.vercel-storage.com/site/og.jpg" />');
    // Título/descripción quedan intactos -- useSeo() del cliente sigue a cargo de eso.
    expect(html).toContain("<title>Mansion Playroom — Fiesta Liberal en Viña del Mar | +18</title>");
    expect(html).toContain('<meta property="og:title" content="Título por defecto" />');
  });

  it("inserta el JSON-LD extra antes de </head>, sin tocar el que ya existía", () => {
    const html = injectMeta(BASE_HTML, {
      jsonLd: [{ "@type": "Event", name: "2º Aniversario" }],
    });

    expect(html).toContain('{"@type":"NightClub"}');
    expect(html).toContain('{"@type":"Event","name":"2º Aniversario"}');
    // El bloque nuevo va justo antes de </head>.
    const headClose = html.indexOf("</head>");
    const newBlock = html.indexOf('{"@type":"Event"');
    expect(newBlock).toBeLessThan(headClose);
  });

  it("escapa caracteres especiales en el contenido inyectado", () => {
    const html = injectMeta(BASE_HTML, {
      ogTitle: 'Comillas "raras" & <tags>',
    });
    expect(html).toContain('<meta property="og:title" content="Comillas &quot;raras&quot; &amp; &lt;tags&gt;" />');
  });

  it("no toca nada cuando no se pasa ningún override (fallback de evento no encontrado)", () => {
    const html = injectMeta(BASE_HTML, {});
    expect(html).toBe(BASE_HTML);
  });

  it("no revienta si una etiqueta no existe en el template -- simplemente no la agrega", () => {
    const htmlSinTwitter = BASE_HTML.replace(/<meta name="twitter:title"[^>]*\/>\n\s*/, "");
    const html = injectMeta(htmlSinTwitter, { twitterTitle: "Algo" });
    expect(html).not.toContain('name="twitter:title"');
    expect(html).toBe(htmlSinTwitter);
  });
});
