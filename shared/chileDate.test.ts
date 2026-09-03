import { describe, expect, it } from "vitest";
import { chileHourOf, startOfChileDay } from "./chileDate";

/* El gráfico de "horas punta" del admin salía vacío o corrido porque
 * `getHours()` devuelve la hora del runtime, que en Vercel es UTC. Estos
 * casos usan las horas reales de una fiesta (21:00 a 05:00 en Chile). */

describe("chileHourOf", () => {
  it("las 21:00 de Chile son las 21, no la hora UTC", () => {
    // Invierno chileno: UTC-4, así que en UTC son las 01:00 del día siguiente.
    expect(chileHourOf(new Date("2026-08-09T01:00:00Z"))).toBe(21);
  });

  it("las 05:00 de Chile al cierre de la fiesta son las 5", () => {
    expect(chileHourOf(new Date("2026-08-09T09:00:00Z"))).toBe(5);
  });

  it("la medianoche de Chile es 0, nunca 24", () => {
    expect(chileHourOf(new Date("2026-08-09T04:00:00Z"))).toBe(0);
  });

  it("resuelve solo el horario de verano chileno", () => {
    // Enero: UTC-3, así que las 21:00 de Chile son las 00:00 UTC del día
    // siguiente -- una hora distinta que en invierno para la misma hora local.
    expect(chileHourOf(new Date("2027-01-16T00:00:00Z"))).toBe(21);
  });

  it("acepta un string, igual que el resto de este archivo", () => {
    expect(chileHourOf("2026-08-09T01:00:00Z")).toBe(21);
  });

  it("una fiesta entera cae en la franja esperada y no corrida", () => {
    // Cada operación de caja de una noche real: de 21:00 a 05:00 de Chile.
    const horas = [
      "2026-08-09T01:30:00Z", // 21:30
      "2026-08-09T04:10:00Z", // 00:10
      "2026-08-09T07:45:00Z", // 03:45
    ].map(chileHourOf);
    expect(horas).toEqual([21, 0, 3]);
  });
});

describe("startOfChileDay", () => {
  it("en invierno (UTC-4) la medianoche de Chile son las 04:00 UTC", () => {
    // Un instante cualquiera del 9 de agosto en Chile.
    const start = startOfChileDay(new Date("2026-08-09T15:00:00Z"));
    expect(start.toISOString()).toBe("2026-08-09T04:00:00.000Z");
  });

  it("en verano (UTC-3) la medianoche de Chile son las 03:00 UTC", () => {
    const start = startOfChileDay(new Date("2027-01-16T15:00:00Z"));
    expect(start.toISOString()).toBe("2027-01-16T03:00:00.000Z");
  });

  it("de madrugada en Chile sigue siendo el mismo día, no el anterior", () => {
    // 01:30 del 9 de agosto en Chile = 05:30 UTC del 9.
    const start = startOfChileDay(new Date("2026-08-09T05:30:00Z"));
    expect(start.toISOString()).toBe("2026-08-09T04:00:00.000Z");
  });

  it("a las 22:00 de Chile la ventana NO se reinició todavía", () => {
    // 22:00 del 9 de agosto en Chile = 02:00 UTC del 10. Con medianoche UTC
    // el presupuesto ya se habría reiniciado en plena venta; con ésta, no.
    const start = startOfChileDay(new Date("2026-08-10T02:00:00Z"));
    expect(start.toISOString()).toBe("2026-08-09T04:00:00.000Z");
  });

  it("el resultado siempre es la hora 0 en Chile", () => {
    for (const iso of ["2026-08-09T15:00:00Z", "2027-01-16T15:00:00Z", "2026-05-01T12:00:00Z"]) {
      expect(chileHourOf(startOfChileDay(new Date(iso)))).toBe(0);
    }
  });
});
