import { describe, expect, it } from "vitest";
import {
  applyAttendeePatch,
  buildUpgradeReference,
  companionsRequired,
  computeUpgradeQuote,
  isEligibleUpgradeTarget,
  legacyThirdToPeople,
  missingAttendeeSlots,
  parseUpgradeReference,
  readCompanions,
  sanitizeUpgradePeople,
} from "./upgrade";

describe("computeUpgradeQuote", () => {
  it("es el precio del acceso nuevo menos lo que pagó", () => {
    expect(computeUpgradeQuote({ paidUnitPrice: 24000, targetPrice: 36000 })).toBe(12000);
  });

  it("nunca es negativo si lo pagado supera el precio de hoy", () => {
    expect(computeUpgradeQuote({ paidUnitPrice: 40000, targetPrice: 36000 })).toBe(0);
  });

  it("valores no numéricos dan 0 en vez de NaN", () => {
    expect(computeUpgradeQuote({ paidUnitPrice: NaN, targetPrice: 36000 })).toBe(0);
  });
});

describe("isEligibleUpgradeTarget", () => {
  const ok = (from: string, paid: number, to: string, price: number) =>
    isEligibleUpgradeTarget({ slug: from, paidUnitPrice: paid }, { slug: to, price });

  it("permite subir a un acceso más caro con igual o más personas", () => {
    expect(ok("duo", 24000, "trio", 36000)).toBe(true);
    expect(ok("soltera", 12000, "duo", 30000)).toBe(true);
    expect(ok("duo", 24000, "grupo", 42000)).toBe(true);
    expect(ok("trio", 36000, "grupo", 42000)).toBe(true);
    expect(ok("soltero", 21000, "duo", 30000)).toBe(true);
    expect(ok("duo_mujeres", 15000, "duo", 30000)).toBe(true);
  });

  it("no permite el mismo tipo de acceso (aunque la tanda nueva sea más cara)", () => {
    expect(ok("duo", 24000, "duo", 36000)).toBe(false);
  });

  it("no permite uno igual o más barato que lo pagado", () => {
    expect(ok("duo", 30000, "trio", 30000)).toBe(false);
    expect(ok("duo", 40000, "trio", 36000)).toBe(false);
  });

  it("no permite bajar de cantidad de personas", () => {
    expect(ok("trio", 10000, "duo", 30000)).toBe(false);
    expect(ok("grupo", 10000, "trio", 36000)).toBe(false);
  });

  it("no permite destinos restringidos (género o código de comunidad)", () => {
    for (const slug of ["soltera", "soltero", "duo_mujeres", "cumpleaneros"]) {
      expect(ok("duo", 1000, slug, 99999)).toBe(false);
    }
  });

  it("no permite subir desde cumpleañeros ni desde tipos desconocidos", () => {
    expect(ok("cumpleaneros", 1000, "duo", 30000)).toBe(false);
    expect(ok("inventado", 1000, "duo", 30000)).toBe(false);
    expect(ok("duo", 1000, "inventado", 30000)).toBe(false);
    expect(isEligibleUpgradeTarget({ slug: null, paidUnitPrice: 1000 }, { slug: "duo", price: 30000 })).toBe(false);
  });
});

describe("referencia del pago del upgrade", () => {
  it("ida y vuelta", () => {
    expect(buildUpgradeReference(12)).toBe("UPG-12");
    expect(parseUpgradeReference("UPG-12")).toBe(12);
  });

  it("un número de orden normal NO es un upgrade", () => {
    for (const ref of ["ORD-2026-000123", "MP-ABC", "", null, undefined]) {
      expect(parseUpgradeReference(ref as string | null | undefined)).toBeNull();
    }
  });

  it("rechaza ids inválidos", () => {
    for (const bad of ["UPG-", "UPG-0", "UPG-abc", "UPG-12x", "xUPG-12", "UPG--3", "UPG-1.5"]) {
      expect(parseUpgradeReference(bad)).toBeNull();
    }
  });
});

describe("readCompanions / companionsRequired", () => {
  it("lee acompañantes con el prefijo del checkout web", () => {
    const m = readCompanions({ acceso__acomp1_nombre: " Ana Soto ", acceso__acomp1_rut: "9.876.543-3", acceso__acomp2_nombre: "Luis" });
    expect(m.get(1)).toEqual({ name: "Ana Soto", rut: "9.876.543-3", instagram: "" });
    expect(m.get(2)?.name).toBe("Luis");
  });

  it("lee acompañantes de órdenes manuales del admin, sin prefijo", () => {
    expect(readCompanions({ acomp1_nombre: "Ana" }).get(1)?.name).toBe("Ana");
  });

  it("ignora claves del titular y valores que no son texto", () => {
    expect(readCompanions({ buyer__nombre: "Juan", acomp1_nombre: 5 as unknown as string }).get(1)?.name).toBe("");
    expect(readCompanions(null).size).toBe(0);
  });

  it("acompañantes que exige cada acceso", () => {
    expect([companionsRequired("soltera"), companionsRequired("duo"), companionsRequired("trio"), companionsRequired("grupo")]).toEqual([0, 1, 2, 3]);
    expect(companionsRequired(null)).toBe(0);
  });
});

describe("missingAttendeeSlots", () => {
  const duo = { buyer__nombre: "Juan", acceso__acomp1_nombre: "Ana", acceso__acomp1_rut: "9.876.543-3" };

  it("Dúo → Trío: falta la persona 2 completa", () => {
    expect(missingAttendeeSlots("trio", duo)).toEqual([{ n: 2, needsName: true, needsRut: true }]);
  });

  it("Dúo → Grupo: faltan las personas 2 y 3", () => {
    expect(missingAttendeeSlots("grupo", duo).map((s) => s.n)).toEqual([2, 3]);
  });

  it("Soltera → Dúo: falta la persona 1", () => {
    expect(missingAttendeeSlots("duo", { buyer__nombre: "Marta" })).toEqual([{ n: 1, needsName: true, needsRut: true }]);
  });

  it("solo pide lo que falta de una persona a medio cargar", () => {
    expect(missingAttendeeSlots("duo", { acomp1_nombre: "Ana" })).toEqual([{ n: 1, needsName: false, needsRut: true }]);
  });

  it("si ya está todo cargado no falta nada", () => {
    expect(missingAttendeeSlots("duo", duo)).toEqual([]);
  });
});

describe("sanitizeUpgradePeople", () => {
  const missing = [{ n: 2, needsName: true, needsRut: true }];

  it("acepta nombre, RUT válido (con formato) e Instagram sin @", () => {
    const { people, errors } = sanitizeUpgradePeople([{ n: 2, name: "  Luis   Rojas ", rut: "11111111-1", instagram: "@luis.r" }], missing);
    expect(errors).toEqual([]);
    expect(people).toEqual([{ n: 2, name: "Luis Rojas", rut: "11.111.111-1", instagram: "luis.r" }]);
  });

  it("ignora slots y campos que no faltan", () => {
    const { people } = sanitizeUpgradePeople([{ n: 1, name: "Otro Nombre" }, { n: 9, name: "Nadie Mas" }], missing);
    expect(people).toEqual([]);
    const onlyRut = sanitizeUpgradePeople([{ n: 2, name: "Ya Estaba", rut: "11111111-1" }], [{ n: 2, needsName: false, needsRut: true }]);
    expect(onlyRut.people).toEqual([{ n: 2, rut: "11.111.111-1" }]);
  });

  it("informa RUT inválido, nombre corto e Instagram inválido sin lanzar", () => {
    const { people, errors } = sanitizeUpgradePeople([{ n: 2, name: "Lu", rut: "11111111-2", instagram: "no valido!" }], missing);
    expect(people).toEqual([]);
    expect(errors).toHaveLength(3);
  });

  it("vacío o sin datos no genera personas", () => {
    expect(sanitizeUpgradePeople(undefined, missing).people).toEqual([]);
    expect(sanitizeUpgradePeople([{ n: 2, name: "  ", rut: "" }], missing).people).toEqual([]);
  });
});

describe("legacyThirdToPeople", () => {
  it("las solicitudes viejas de Dúo→Trío eran la persona 2", () => {
    expect(legacyThirdToPeople("Luis Rojas", "11.111.111-1")).toEqual([{ n: 2, name: "Luis Rojas", rut: "11.111.111-1" }]);
    expect(legacyThirdToPeople(null, null)).toEqual([]);
  });
});

describe("applyAttendeePatch", () => {
  const base = JSON.stringify({
    acceso: "Dúo", grupoTipo: "duo", cantidad: 1, extras: [],
    campos: {
      buyer__nombre: "Juan Perez", buyer__rut: "12.345.678-5",
      acceso__acomp1_nombre: "Ana Soto", acceso__acomp1_rut: "9.876.543-3",
    },
  });
  const trio = { name: "Acceso Trío", slug: "trio" };

  it("agrega a la persona nueva y conserva todo lo demás", () => {
    const out = JSON.parse(applyAttendeePatch(base, [{ n: 2, name: "Luis Rojas", rut: "11.111.111-1", instagram: "luis" }], trio));
    expect(out.campos.acceso__acomp2_nombre).toBe("Luis Rojas");
    expect(out.campos.acceso__acomp2_rut).toBe("11.111.111-1");
    expect(out.campos.acceso__acomp2_instagram).toBe("luis");
    expect(out.campos.buyer__nombre).toBe("Juan Perez");
    expect(out.campos.acceso__acomp1_nombre).toBe("Ana Soto");
    expect(out.cantidad).toBe(1);
  });

  it("deja el acceso y el slug nuevos, como los escribe el checkout", () => {
    const out = JSON.parse(applyAttendeePatch(base, [], trio));
    expect(out.acceso).toBe("Acceso Trío");
    expect(out.grupoTipo).toBe("trio");
  });

  it("sin datos escribe AMBAS claves vacías de cada persona nueva (aparecen en Editar nombres)", () => {
    const out = JSON.parse(applyAttendeePatch(base, [], { name: "Grupo", slug: "grupo" }));
    for (const n of [2, 3]) {
      expect(out.campos).toHaveProperty(`acceso__acomp${n}_nombre`, "");
      expect(out.campos).toHaveProperty(`acceso__acomp${n}_rut`, "");
    }
  });

  it("Soltera → Dúo: crea la persona 1", () => {
    const soltera = JSON.stringify({ campos: { buyer__nombre: "Marta" } });
    const out = JSON.parse(applyAttendeePatch(soltera, [{ n: 1, name: "Pedro Gómez" }], { name: "Dúo", slug: "duo" }));
    expect(out.campos.acceso__acomp1_nombre).toBe("Pedro Gómez");
    expect(out.campos.acceso__acomp1_rut).toBe("");
  });

  it("respeta el prefijo de las órdenes manuales (sin acceso__) y no duplica claves", () => {
    const manual = JSON.stringify({ campos: { nombre: "Juan", acomp1_nombre: "Ana" } });
    const out = JSON.parse(applyAttendeePatch(manual, [{ n: 2, name: "Luis Rojas" }], trio));
    expect(out.campos.acomp1_nombre).toBe("Ana");
    expect(out.campos).not.toHaveProperty("acceso__acomp1_nombre");
    expect(out.campos.acceso__acomp2_nombre).toBe("Luis Rojas");
  });

  it("es idempotente y no pisa lo ya cargado con vacíos", () => {
    const once = applyAttendeePatch(base, [{ n: 2, name: "Luis Rojas", rut: "11.111.111-1" }], trio);
    const twice = applyAttendeePatch(once, [], trio);
    expect(JSON.parse(twice)).toEqual(JSON.parse(once));
  });

  it("orden sin attendeeData o con JSON dañado: arma uno mínimo en vez de romper", () => {
    for (const input of [null, undefined, "", "{no es json", "[]", "5"]) {
      const out = JSON.parse(applyAttendeePatch(input as string | null | undefined, [{ n: 2, name: "Luis Rojas" }], trio));
      expect(out.grupoTipo).toBe("trio");
      expect(out.campos.acceso__acomp2_nombre).toBe("Luis Rojas");
    }
  });
});
