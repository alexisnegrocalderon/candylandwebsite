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

import { buildAddonEmail } from "./email";

describe("buildAddonEmail", () => {
  const addon = {
    buyerName: "Juan",
    eventTitle: "2do Aniversario",
    eventDate: "11 de octubre de 2026",
    orderNumber: "ORD-1",
    itemName: "Estacionamiento",
    quantity: 1,
    amount: 5000,
    paymentUrl: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=9",
  };

  it("incluye el extra, el total, la orden y el botón con el link de pago", () => {
    const html = buildAddonEmail(addon);
    expect(html).toContain("Estacionamiento");
    expect(html).toContain("$5.000");
    expect(html).toContain("ORD-1");
    expect(html).toContain(addon.paymentUrl);
    expect(html).toContain("Pagar ahora");
  });

  it("muestra la cantidad solo cuando es mayor a 1", () => {
    expect(buildAddonEmail({ ...addon, itemName: "Piscolón", quantity: 3, amount: 36000 })).toContain("Piscolón x3");
    expect(buildAddonEmail(addon)).not.toContain("Estacionamiento x1");
  });

  it("escapa el HTML de los nombres", () => {
    const html = buildAddonEmail({ ...addon, itemName: "<img src=x onerror=alert(1)>", buyerName: "<script>x</script>" });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;img");
  });
});
