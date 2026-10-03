import { describe, expect, it } from "vitest";
import { buildUpgradeEmail } from "./email";

const base = {
  buyerName: "Juan",
  eventTitle: "2do Aniversario",
  eventDate: "11 de octubre de 2026",
  orderNumber: "ORD-1",
  amount: 12000,
  paymentUrl: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=123",
  fromName: "Acceso Dúo",
  toName: "Acceso Grupo",
};

describe("buildUpgradeEmail", () => {
  it("incluye el monto, la orden, de qué acceso a cuál y el botón con el link de pago", () => {
    const html = buildUpgradeEmail(base);
    expect(html).toContain("$12.000");
    expect(html).toContain("ORD-1");
    expect(html).toContain("Acceso Dúo");
    expect(html).toContain("Acceso Grupo");
    expect(html).toContain(base.paymentUrl);
    expect(html).toContain("Pagar diferencia");
  });

  it("pide los datos de las personas nuevas solo cuando faltan", () => {
    expect(buildUpgradeEmail({ ...base, needsData: true })).toContain("Datos pendientes");
    expect(buildUpgradeEmail({ ...base, needsData: false })).not.toContain("Datos pendientes");
    expect(buildUpgradeEmail(base)).not.toContain("Datos pendientes");
  });

  it("escapa el HTML de los nombres que vienen del checkout y de la base", () => {
    const html = buildUpgradeEmail({ ...base, buyerName: "<script>alert(1)</script>", eventTitle: 'Fiesta "VIP" & más', toName: "<b>x</b>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
