import { describe, expect, it } from "vitest";
import { formatRutLive, normalizeRut, isValidRut } from "./rut";

describe("formatRutLive", () => {
  it("no toca nada mientras hay 0 o 1 carácter -- todavía no hay nada que agrupar", () => {
    expect(formatRutLive("")).toBe("");
    expect(formatRutLive("1")).toBe("1");
  });

  it("agrupa de a 3 desde la derecha y pone el guion antes del dígito verificador", () => {
    expect(formatRutLive("12")).toBe("1-2");
    expect(formatRutLive("123")).toBe("12-3");
    expect(formatRutLive("1234")).toBe("123-4");
    expect(formatRutLive("12345")).toBe("1.234-5");
    expect(formatRutLive("123456")).toBe("12.345-6");
    expect(formatRutLive("1234567")).toBe("123.456-7");
    expect(formatRutLive("12345678")).toBe("1.234.567-8");
    expect(formatRutLive("123456789")).toBe("12.345.678-9");
  });

  it("acepta K como dígito verificador (mayúscula o minúscula)", () => {
    expect(formatRutLive("11111111k")).toBe("11.111.111-K");
    expect(formatRutLive("11111111K")).toBe("11.111.111-K");
  });

  it("ignora puntos/guiones/espacios ya escritos -- se recalcula desde los dígitos limpios", () => {
    expect(formatRutLive("12.345.678-9")).toBe("12.345.678-9");
    expect(formatRutLive("12345678-9")).toBe("12.345.678-9");
    expect(formatRutLive(" 12345678 9 ")).toBe("12.345.678-9");
  });

  it("nunca deja más de 9 caracteres limpios (8 dígitos + verificador)", () => {
    expect(formatRutLive("123456789999")).toBe("12.345.678-9");
  });

  it("el backspace funciona solo: borrar de a un carácter del resultado formateado siempre da un prefijo válido", () => {
    // Simula tipear "123456789" letra por letra y confirma que cada paso
    // intermedio es exactamente lo que se espera ver en pantalla.
    const steps = "123456789".split("").reduce<string[]>((acc, ch) => {
      const prevRaw = acc.length ? acc[acc.length - 1].replace(/[^0-9kK]/gi, "") : "";
      acc.push(formatRutLive(prevRaw + ch));
      return acc;
    }, []);
    expect(steps).toEqual([
      "1", "1-2", "12-3", "123-4", "1.234-5", "12.345-6", "123.456-7", "1.234.567-8", "12.345.678-9",
    ]);
  });

  it("round-trip: normalizeRut(formatRutLive(x)) sigue validando igual que antes para RUTs válidos conocidos", () => {
    const validRuts = ["12345678-5", "11111111-1", "76543210-3"];
    for (const rut of validRuts) {
      const digits = rut.replace(/[^0-9kK]/gi, "");
      const formatted = formatRutLive(digits);
      expect(normalizeRut(formatted)).toBe(rut.toUpperCase());
      expect(isValidRut(formatted)).toBe(isValidRut(rut));
    }
  });
});
