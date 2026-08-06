import { describe, expect, it } from "vitest";
import { parseAttendeeRuts } from "./db";
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
});
