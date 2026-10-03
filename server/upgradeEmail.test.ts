import { describe, expect, it } from "vitest";
import { buildUpgradeEmail } from "./email";

const base = {
  buyerName: "Juan",
  eventTitle: "2do Aniversario",
  eventDate: "11 de octubre de 2026",
  orderNumber: "ORD-1",
  amount: 12000,
  paymentUrl: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=123",
};

describe("buildUpgradeEmail", () => {
  it("incluye el monto formateado, el número de orden y el botón con el link de pago", () => {
    const html = buildUpgradeEmail(base);
    expect(html).toContain("$12.000");
    expect(html).toContain("ORD-1");
    expect(html).toContain(base.paymentUrl);
    expect(html).toContain("Pagar diferencia");
  });

  it("escapa el HTML de los nombres que vienen del checkout", () => {
    const html = buildUpgradeEmail({ ...base, buyerName: '<script>alert(1)</script>', eventTitle: 'Fiesta "VIP" & más' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
