import { describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./_core/llm";
import { MailingContentSchema, generateMailingTemplate } from "./mailing";
import { buildMailingBlastEmail } from "./email";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
const invokeLLMMock = vi.mocked(invokeLLM);

describe("MailingContentSchema", () => {
  it("accepts a valid template", () => {
    const result = MailingContentSchema.safeParse({
      subject: "Faltan 41 entradas",
      headline: "¡Casi llegamos a 300!",
      paragraphs: ["Hoy sorteamos $50.000 en consumos si se completa la meta."],
    });
    expect(result.success).toBe(true);
  });

  it("rejects content without paragraphs", () => {
    const result = MailingContentSchema.safeParse({
      subject: "Faltan 41 entradas",
      headline: "¡Casi llegamos a 300!",
      paragraphs: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 4 paragraphs", () => {
    const result = MailingContentSchema.safeParse({
      subject: "Faltan 41 entradas",
      headline: "¡Casi llegamos a 300!",
      paragraphs: ["uno", "dos", "tres", "cuatro", "cinco"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a subject that is too short", () => {
    const result = MailingContentSchema.safeParse({
      subject: "Hi",
      headline: "¡Casi llegamos a 300!",
      paragraphs: ["Un párrafo cualquiera con suficiente largo."],
    });
    expect(result.success).toBe(false);
  });
});

describe("generateMailingTemplate", () => {
  it("returns the parsed content when the LLM responds with valid JSON", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            subject: "Faltan 41 entradas",
            headline: "¡Casi llegamos a 300!",
            paragraphs: ["Hoy sorteamos $50.000 en consumos si se completa la meta."],
          }),
        },
      }],
    });

    const result = await generateMailingTemplate("avisar que faltan 41 entradas", "clientes sin entrada comprada");
    expect(result.subject).toBe("Faltan 41 entradas");
    expect(result.paragraphs).toHaveLength(1);
  });

  it("throws a readable error when the LLM returns invalid JSON", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{ message: { content: "esto no es JSON" } }],
    });

    await expect(generateMailingTemplate("objetivo", "audiencia")).rejects.toThrow(/JSON válido/);
  });

  it("throws a readable error when the JSON doesn't match the schema", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ subject: "Hi" }) } }],
    });

    await expect(generateMailingTemplate("objetivo", "audiencia")).rejects.toThrow(/formato esperado/);
  });
});

describe("buildMailingBlastEmail", () => {
  it("includes the headline, all paragraphs, the CTA url and the buyer's name", () => {
    const html = buildMailingBlastEmail({
      buyerName: "Camila",
      headline: "¡Casi llegamos a 300!",
      paragraphs: ["Primer párrafo.", "Segundo párrafo."],
      ctaText: "Comprar mi entrada",
      ctaUrl: "https://candylandwebsite.vercel.app/eventos/candyland-agosto-2026",
      highlightLabel: "Faltan",
      highlightValue: "41 entradas",
    });

    expect(html).toContain("Camila");
    expect(html).toContain("¡Casi llegamos a 300!");
    expect(html).toContain("Primer párrafo.");
    expect(html).toContain("Segundo párrafo.");
    expect(html).toContain("https://candylandwebsite.vercel.app/eventos/candyland-agosto-2026");
    expect(html).toContain("41 entradas");
  });

  it("falls back to a generic greeting when there's no buyer name", () => {
    const html = buildMailingBlastEmail({
      buyerName: "",
      headline: "Título",
      paragraphs: ["Párrafo."],
      ctaUrl: "https://candylandwebsite.vercel.app",
    });
    expect(html).toContain("¡Hola!");
  });

  it("omits the event card entirely when eventInfo is not passed", () => {
    const html = buildMailingBlastEmail({
      buyerName: "Camila",
      headline: "Título",
      paragraphs: ["Párrafo."],
      ctaUrl: "https://candylandwebsite.vercel.app",
    });
    expect(html).not.toContain("¿Qué encontrarás?");
    expect(html).not.toContain("Misión 300");
    expect(html).not.toContain("Ver en Google Maps");
  });

  it("omits the event card when eventInfo is explicitly null", () => {
    const html = buildMailingBlastEmail({
      buyerName: "Camila",
      headline: "Título",
      paragraphs: ["Párrafo."],
      ctaUrl: "https://candylandwebsite.vercel.app",
      eventInfo: null,
    });
    expect(html).not.toContain("¿Qué encontrarás?");
  });

  it("renders the banner, date, venue, maps link, Misión 300 counter and venue grid when eventInfo is passed", () => {
    const html = buildMailingBlastEmail({
      buyerName: "Camila",
      headline: "Título",
      paragraphs: ["Párrafo."],
      ctaUrl: "https://candylandwebsite.vercel.app",
      eventInfo: {
        title: "Candyland Agosto",
        imageUrl: "https://candylandwebsite.vercel.app/candyland/og-candyland.jpg",
        dateText: "sábado, 8 de agosto, 21:00 hrs",
        venue: "La Mansión",
        address: "Valparaíso",
        mapsUrl: "https://maps.google.com/?q=La+Mansión",
        mission300: { confirmed: 259, goal: 300, depositPrice: 10000 },
      },
    });

    expect(html).toContain('<img src="https://candylandwebsite.vercel.app/candyland/og-candyland.jpg"');
    expect(html).toContain("Candyland Agosto");
    expect(html).toContain("sábado, 8 de agosto, 21:00 hrs");
    expect(html).toContain("La Mansión");
    expect(html).toContain("Valparaíso");
    expect(html).toContain('href="https://maps.google.com/?q=La+Mansión"');
    expect(html).toContain("259/300 ya confirmados");
    expect(html).toContain("$10.000 por persona mientras dure la Misión 300");
    expect(html).toContain("¿Qué encontrarás?");
    for (const item of ["Estacionamiento privado", "Guardarropía", "Terraza Bar Lounge", "PlayBites para recargar energía", "Dos pistas de baile (Tech + Reggaetón)", "Playground XXL", "Kink Room", "Zona de fumadores"]) {
      expect(html).toContain(item);
    }
  });

  it("omits the Misión 300 card when eventInfo.mission300 is null but still shows the event card", () => {
    const html = buildMailingBlastEmail({
      buyerName: "Camila",
      headline: "Título",
      paragraphs: ["Párrafo."],
      ctaUrl: "https://candylandwebsite.vercel.app",
      eventInfo: {
        title: "Candyland Agosto",
        dateText: "sábado, 8 de agosto, 21:00 hrs",
        venue: "La Mansión",
        mission300: null,
      },
    });

    expect(html).toContain("Candyland Agosto");
    expect(html).not.toContain("Misión 300");
    expect(html).toContain("¿Qué encontrarás?");
  });
});
