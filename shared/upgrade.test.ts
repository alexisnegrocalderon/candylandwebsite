import { describe, expect, it } from "vitest";
import {
  addThirdAttendee,
  buildUpgradeReference,
  canUpgradeToTrio,
  computeUpgradeQuote,
  parseUpgradeReference,
} from "./upgrade";
import { personasForAccesoSlug } from "./mission300";

describe("computeUpgradeQuote", () => {
  it("es el precio del Trío de hoy menos lo que pagó por el Dúo", () => {
    expect(computeUpgradeQuote({ paidUnitPrice: 24000, targetPrice: 36000 })).toBe(12000);
  });

  it("nunca es negativo si el Dúo costó más que el Trío de hoy", () => {
    expect(computeUpgradeQuote({ paidUnitPrice: 40000, targetPrice: 36000 })).toBe(0);
  });

  it("acepta precios que vienen como texto de la base de datos (decimal)", () => {
    expect(computeUpgradeQuote({ paidUnitPrice: Number("22000"), targetPrice: Number("36000") })).toBe(14000);
  });

  it("valores no numéricos dan 0 en vez de NaN", () => {
    expect(computeUpgradeQuote({ paidUnitPrice: NaN, targetPrice: 36000 })).toBe(0);
  });
});

describe("canUpgradeToTrio", () => {
  it("solo el Dúo normal puede subir a Trío", () => {
    expect(canUpgradeToTrio("duo")).toBe(true);
    for (const slug of ["trio", "duo_mujeres", "soltera", "soltero", "grupo", "cumpleaneros", "", null, undefined]) {
      expect(canUpgradeToTrio(slug as string | null | undefined)).toBe(false);
    }
  });

  it("el Trío tiene una persona más que el Dúo", () => {
    expect(personasForAccesoSlug("trio") - personasForAccesoSlug("duo")).toBe(1);
  });
});

describe("referencia del pago del upgrade", () => {
  it("ida y vuelta", () => {
    expect(buildUpgradeReference(12)).toBe("UPG-12");
    expect(parseUpgradeReference("UPG-12")).toBe(12);
  });

  it("un número de orden normal NO es un upgrade", () => {
    expect(parseUpgradeReference("ORD-2026-000123")).toBeNull();
    expect(parseUpgradeReference("")).toBeNull();
    expect(parseUpgradeReference(null)).toBeNull();
    expect(parseUpgradeReference(undefined)).toBeNull();
  });

  it("rechaza ids inválidos", () => {
    for (const bad of ["UPG-", "UPG-0", "UPG-abc", "UPG-12x", "xUPG-12", "UPG--3", "UPG-1.5"]) {
      expect(parseUpgradeReference(bad)).toBeNull();
    }
  });
});

describe("addThirdAttendee", () => {
  const base = JSON.stringify({
    acceso: "duo",
    cantidad: 1,
    extras: [],
    campos: {
      buyer__nombre: "Juan Perez",
      buyer__rut: "12.345.678-5",
      acceso__acomp1_nombre: "Ana Soto",
      acceso__acomp1_rut: "9.876.543-3",
    },
  });

  it("agrega a la tercera persona y conserva todo lo demás", () => {
    const out = JSON.parse(addThirdAttendee(base, { name: "Luis Rojas", rut: "11.111.111-1" }));
    expect(out.campos.acceso__acomp2_nombre).toBe("Luis Rojas");
    expect(out.campos.acceso__acomp2_rut).toBe("11.111.111-1");
    expect(out.campos.buyer__nombre).toBe("Juan Perez");
    expect(out.campos.acceso__acomp1_nombre).toBe("Ana Soto");
    expect(out.cantidad).toBe(1);
    expect(out.extras).toEqual([]);
  });

  it("marca el acceso como trío", () => {
    expect(JSON.parse(addThirdAttendee(base)).acceso).toBe("trio");
  });

  it("sin datos igual escribe AMBAS claves vacías (para que aparezca en Editar nombres)", () => {
    const out = JSON.parse(addThirdAttendee(base));
    expect(out.campos).toHaveProperty("acceso__acomp2_nombre", "");
    expect(out.campos).toHaveProperty("acceso__acomp2_rut", "");
  });

  it("es idempotente y no pisa lo ya cargado cuando no llegan datos nuevos", () => {
    const once = addThirdAttendee(base, { name: "Luis Rojas", rut: "11.111.111-1" });
    const twice = addThirdAttendee(once);
    expect(JSON.parse(twice)).toEqual(JSON.parse(once));
  });

  it("un dato nuevo reemplaza al anterior", () => {
    const once = addThirdAttendee(base, { name: "Luis" });
    expect(JSON.parse(addThirdAttendee(once, { name: "Luis Rojas Díaz" })).campos.acceso__acomp2_nombre).toBe("Luis Rojas Díaz");
  });

  it("orden vieja sin attendeeData o con JSON dañado: arma uno mínimo en vez de romper", () => {
    for (const input of [null, undefined, "", "{no es json", "[]", "5"]) {
      const out = JSON.parse(addThirdAttendee(input as string | null | undefined, { name: "Luis Rojas" }));
      expect(out.acceso).toBe("trio");
      expect(out.campos.acceso__acomp2_nombre).toBe("Luis Rojas");
    }
  });
});
