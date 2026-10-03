import { describe, expect, it } from "vitest";
import {
  MAX_ADDON_QUANTITY,
  addonAmount,
  addonBackUrls,
  buildAddonReference,
  isSellableAddon,
  maxAddonQuantity,
  parseAddonReference,
} from "./addon";
import { parseUpgradeReference } from "./upgrade";

describe("referencia del pago de un extra", () => {
  it("ida y vuelta", () => {
    expect(buildAddonReference(7)).toBe("ADD-7");
    expect(parseAddonReference("ADD-7")).toBe(7);
  });

  it("un número de orden o la referencia de un upgrade NO son un extra", () => {
    for (const ref of ["MP-ABC123", "T-1-2", "UPG-3", "", null, undefined]) {
      expect(parseAddonReference(ref as string | null | undefined)).toBeNull();
    }
  });

  it("rechaza ids inválidos", () => {
    for (const bad of ["ADD-", "ADD-0", "ADD-abc", "ADD-7x", "xADD-7", "ADD--3", "ADD-1.5"]) {
      expect(parseAddonReference(bad)).toBeNull();
    }
  });

  it("las referencias de extras y de upgrades nunca se confunden", () => {
    expect(parseUpgradeReference("ADD-7")).toBeNull();
    expect(parseAddonReference(buildAddonReference(9))).toBe(9);
  });
});

describe("isSellableAddon", () => {
  it("acepta un extra activo", () => {
    expect(isSellableAddon({ category: "extra", status: "active" })).toBe(true);
    expect(isSellableAddon({ category: "extra", status: "active", topupAmount: null })).toBe(true);
    expect(isSellableAddon({ category: "extra", status: "active", topupAmount: 0 })).toBe(true);
  });

  it("rechaza accesos y otras categorías", () => {
    for (const category of ["acceso", "consumo", "locker", "merch"]) {
      expect(isSellableAddon({ category, status: "active" })).toBe(false);
    }
  });

  it("rechaza extras ocultos o agotados", () => {
    expect(isSellableAddon({ category: "extra", status: "hidden" })).toBe(false);
    expect(isSellableAddon({ category: "extra", status: "soldout" })).toBe(false);
  });

  it("rechaza los productos de carga de saldo", () => {
    expect(isSellableAddon({ category: "extra", status: "active", topupAmount: 10000 })).toBe(false);
  });
});

describe("maxAddonQuantity", () => {
  it("el estacionamiento (VIP incluido) va de a uno", () => {
    expect(maxAddonQuantity("Estacionamiento", 40)).toBe(1);
    expect(maxAddonQuantity("Estacionamiento VIP", 40)).toBe(1);
    expect(maxAddonQuantity("Parking", 40)).toBe(1);
  });

  it("otro extra tiene tope y respeta el cupo que queda", () => {
    expect(maxAddonQuantity("Piscolón", 40)).toBe(MAX_ADDON_QUANTITY);
    expect(maxAddonQuantity("Piscolón", 3)).toBe(3);
    expect(maxAddonQuantity("Piscolón", 0)).toBe(0);
    expect(maxAddonQuantity("Estacionamiento", 0)).toBe(0);
    expect(maxAddonQuantity("Piscolón", -4)).toBe(0);
  });
});

describe("addonAmount", () => {
  it("es el precio de la base de datos por la cantidad", () => {
    expect(addonAmount(8000, 1)).toBe(8000);
    expect(addonAmount(3500, 4)).toBe(14000);
  });

  it("valores inválidos dan 0 en vez de cobrar mal", () => {
    expect(addonAmount(NaN, 2)).toBe(0);
    expect(addonAmount(8000, 0)).toBe(0);
    expect(addonAmount(-5, 2)).toBe(0);
  });
});

describe("addonBackUrls", () => {
  const base = "https://mansionplayroom.cl";

  it("autoservicio: vuelve a la página del propio ticket con el resultado", () => {
    expect(addonBackUrls(base, "T-1", "/verificar/MP-ABC123")).toEqual({
      success: "https://mansionplayroom.cl/verificar/MP-ABC123?extra=ok",
      failure: "https://mansionplayroom.cl/verificar/MP-ABC123?extra=error",
      pending: "https://mansionplayroom.cl/verificar/MP-ABC123?extra=pending",
    });
  });

  it("link del admin (sin ruta): la página de pago de siempre", () => {
    const urls = addonBackUrls(base, "T-1");
    expect(urls.success).toBe("https://mansionplayroom.cl/pago/exito?order=T-1");
    expect(urls.failure).toBe("https://mansionplayroom.cl/pago/error?order=T-1");
    expect(urls.pending).toContain("pending=true");
  });

  it("una ruta que no es la de un ticket se ignora (nunca redirige a otro lado)", () => {
    for (const bad of ["https://evil.com/x", "//evil.com", "/admin", "/verificar/", "/verificar/a/b", "/verificar/x?y=1", "/verificar/x#z"]) {
      expect(addonBackUrls(base, "T-1", bad).success).toBe("https://mansionplayroom.cl/pago/exito?order=T-1");
    }
  });
});
