import { describe, expect, it } from "vitest";
import { parseAttendeeRuts, parseAttendees } from "./db";
import { normalizeRut, isValidRut } from "../shared/rut";

describe("normalizeRut", () => {
  it("quita puntos y espacios, deja el guion, y pasa la 'k' a mayúscula", () => {
    expect(normalizeRut("12.345.678-9")).toBe("12345678-9");
    expect(normalizeRut(" 12345678-k ")).toBe("12345678-K");
  });

  it("isValidRut sigue validando igual usando el normalizador compartido", () => {
    expect(isValidRut("11.111.111-1")).toBe(true);
    expect(isValidRut("11111111-2")).toBe(false);
  });
});

describe("parseAttendeeRuts", () => {
  it("extrae el RUT del comprador y de cada acompañante, normalizados", () => {
    const attendeeData = JSON.stringify({
      campos: {
        buyer__nombre: "Juan Pérez",
        buyer__rut: "12.345.678-9",
        acceso__acomp1_rut: "11.111.111-1",
        acceso__acomp2_rut: "  9.876.543-2 ",
        acceso__acomp1_nombre: "María López",
      },
    });
    expect(parseAttendeeRuts(attendeeData)).toEqual(["12345678-9", "11111111-1", "9876543-2"]);
  });

  it("ignora claves sin 'rut' y valores vacíos, y no revienta con JSON inválido/ausente", () => {
    expect(parseAttendeeRuts(JSON.stringify({ campos: { buyer__nombre: "Juan", buyer__rut: "" } }))).toEqual([]);
    expect(parseAttendeeRuts(undefined)).toEqual([]);
    expect(parseAttendeeRuts("no es json")).toEqual([]);
  });

  it("un pasaporte bloqueado también se detecta -- el valor del documento se guarda en la misma clave *_rut sin importar el tipo elegido en el checkout", () => {
    const attendeeData = JSON.stringify({
      campos: { buyer__nombre: "Jane Doe", buyer__rut: "AB123456", buyer__docTipo: "passport" },
    });
    expect(parseAttendeeRuts(attendeeData)).toEqual(["AB123456"]);
  });

  it("el campo docTipo no se cuela como si fuera un RUT a cruzar contra bloqueados (su clave no contiene 'rut')", () => {
    const attendeeData = JSON.stringify({
      campos: { buyer__nombre: "Jane Doe", buyer__rut: "AB123456", buyer__docTipo: "passport" },
    });
    expect(parseAttendeeRuts(attendeeData)).not.toContain("PASSPORT");
  });
});

describe("parseAttendees con selector de tipo de documento", () => {
  it("agrupa el docTipo bajo la misma persona que su nombre y su documento", () => {
    const attendeeData = JSON.stringify({
      campos: {
        buyer__nombre: "Jane Doe",
        buyer__rut: "AB123456",
        buyer__docTipo: "passport",
        acceso__acomp1_nombre: "Juan Pérez",
        acceso__acomp1_rut: "12.345.678-9",
      },
    });
    expect(parseAttendees(attendeeData)).toEqual([
      { name: "Jane Doe", rut: "AB123456", docType: "passport" },
      { name: "Juan Pérez", rut: "12345678-9", docType: "rut" },
    ]);
  });

  it("sin docTipo guardado (órdenes viejas) cae a 'rut', sin sorpresas", () => {
    const attendeeData = JSON.stringify({
      campos: { buyer__nombre: "Juan Pérez", buyer__rut: "12.345.678-9" },
    });
    expect(parseAttendees(attendeeData)).toEqual([{ name: "Juan Pérez", rut: "12345678-9", docType: "rut" }]);
  });
});

import { describeBlockHits, orderIdentities } from "./db";
import { blockedKeysFor, matchBlocked } from "../shared/blockedMatch";

describe("orderIdentities y la lista de bloqueados", () => {
  const web = JSON.stringify({ campos: { buyer__nombre: "Juan Pérez", buyer__rut: "12.345.678-5", buyer__instagram: "@juan.p", acceso__acomp1_nombre: "Ana Soto", acceso__acomp1_rut: "11.111.111-1" } });
  const manual = JSON.stringify({ campos: { rut: "12.345.678-5", instagram: "juan.p", acomp1_nombre: "Ana Soto" } });

  it("arma titular (contacto, RUT, Instagram) y acompañantes", () => {
    const ids = orderIdentities(web, { name: "Juan Pérez", email: "j@x.cl", phone: "+56 9 1111 2222" });
    expect(ids[0]).toMatchObject({ name: "Juan Pérez", email: "j@x.cl", phone: "+56 9 1111 2222", instagram: "@juan.p", rut: "12.345.678-5" });
    expect(ids.some((p) => p.name === "Ana Soto" && p.rut === "11111111-1")).toBe(true);
  });

  it("los accesos manuales guardan el RUT como `rut` y también se cruza", () => {
    expect(orderIdentities(manual, { name: "Juan", email: "a@b.cl" })[0].rut).toBe("12.345.678-5");
  });

  it("bloquea por teléfono, Instagram o correo aunque el RUT no coincida, y el nombre solo avisa", () => {
    const rows = [
      { id: 1, fullName: "Otro Nombre", sourceVenue: "Sinners", ...blockedKeysFor({ fullName: "Otro Nombre", phone: "911112222" }) },
      { id: 2, fullName: "Ana Soto", ...blockedKeysFor({ fullName: "Ana Soto" }) },
    ];
    const r = matchBlocked(orderIdentities(web, { name: "Juan Pérez", email: "j@x.cl", phone: "+56 9 1111 2222" }), rows);
    expect(r.block.map((h) => h.by)).toEqual(["phone"]);
    expect(r.review.map((h) => h.row.id)).toEqual([2]);
    expect(describeBlockHits(r.block)).toBe("Otro Nombre por teléfono · Sinners");
  });
});
