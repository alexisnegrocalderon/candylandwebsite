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
