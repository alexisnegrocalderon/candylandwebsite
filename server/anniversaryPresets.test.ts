import { describe, expect, it } from "vitest";
import { ANNIVERSARY_PRESETS } from "../shared/anniversaryCampaigns";
import { MailingContentSchema } from "./mailing";
import { buildMailingBlastEmail } from "./email";

describe("textos listos del aniversario", () => {
  it("hay tres: último día, recordatorio de la noche y bono de la app", () => {
    expect(ANNIVERSARY_PRESETS.map((p) => p.key)).toEqual(["ultimo-dia", "recordatorio-noche", "bono-app"]);
  });

  it.each(ANNIVERSARY_PRESETS)("$label cumple el formato del mailing y trae dos asuntos distintos", (p) => {
    const parsed = MailingContentSchema.safeParse(p.content);
    expect(parsed.success).toBe(true);
    expect(p.content.subjectB).not.toBe(p.content.subject);
    expect(p.campaignName).toMatch(/^[a-z0-9-]+$/);
  });

  it.each(ANNIVERSARY_PRESETS)("$label se arma con el precio de hoy tomado de la base, no del texto", (p) => {
    const html = buildMailingBlastEmail({
      ...p.content, buyerName: "Camila", ctaUrl: "https://x.cl" + p.ctaPath,
      priceList: [{ label: "Acceso Dúo", price: 45000, originalPrice: 50000 }], remaining: 12,
    });
    expect(html).toContain("$45.000");
    expect(html).toContain("$50.000");
    expect(html).toContain(p.content.ctaText);
    expect(html).toContain("2 AÑOS");
    // El texto de la campaña no fija el precio de la entrada: viene siempre de `priceList` (el bono de $10.000 sí se nombra).
    expect(p.content.paragraphs.join(" ").replace(/\$10\.000/g, "")).not.toMatch(/\$\s?\d{2}\.\d{3}/);
  });

  it("el bono de la app promete $10.000 y lleva a instalar la app", () => {
    const bono = ANNIVERSARY_PRESETS.find((p) => p.key === "bono-app")!;
    expect(bono.ctaPath).toBe("/app");
    expect(bono.content.highlightValue).toBe("$10.000");
  });
});
