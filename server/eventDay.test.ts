import { describe, expect, it } from "vitest";
import { isEventToday } from "../shared/eventDay";

// Offset fijo de prueba (UTC-4) para no depender de la fecha real al correr
// los tests.
const OFFSET = -4;

describe("isEventToday", () => {
  it("es el mismo día si la hora local cae en el mismo día calendario", () => {
    const now = new Date("2026-07-29T10:00:00Z"); // 06:00 hora Chile
    const eventDate = new Date("2026-07-29T23:00:00Z"); // 19:00 hora Chile, mismo día
    expect(isEventToday(eventDate, now, OFFSET)).toBe(true);
  });

  it("no es hoy si el evento es mañana", () => {
    const now = new Date("2026-07-29T10:00:00Z"); // 06:00 hora Chile del 29
    const eventDate = new Date("2026-07-30T05:00:00Z"); // 01:00 hora Chile del 30
    expect(isEventToday(eventDate, now, OFFSET)).toBe(false);
  });

  it("no es hoy si el evento fue ayer", () => {
    const now = new Date("2026-07-29T10:00:00Z");
    const eventDate = new Date("2026-07-28T23:00:00Z");
    expect(isEventToday(eventDate, now, OFFSET)).toBe(false);
  });

  it("respeta el borde de medianoche en hora de Chile, no en UTC", () => {
    // 2026-07-30T03:59:00Z = 2026-07-29T23:59:00 hora Chile (UTC-4): todavía "hoy".
    const now = new Date("2026-07-30T03:59:00Z");
    const eventDate = new Date("2026-07-29T15:00:00Z"); // 11:00 hora Chile del mismo día
    expect(isEventToday(eventDate, now, OFFSET)).toBe(true);

    // Un minuto después ya cruzó a las 00:00 hora Chile: es otro día.
    const nowNextDay = new Date("2026-07-30T04:01:00Z");
    expect(isEventToday(eventDate, nowNextDay, OFFSET)).toBe(false);
  });

  it("acepta la fecha del evento como string, igual que llega de la base", () => {
    const now = new Date("2026-07-29T10:00:00Z");
    expect(isEventToday("2026-07-29T20:00:00Z", now, OFFSET)).toBe(true);
  });

  it("rechaza una fecha inválida en vez de reventar", () => {
    const now = new Date("2026-07-29T10:00:00Z");
    expect(isEventToday("no-es-una-fecha", now, OFFSET)).toBe(false);
  });

  it("usa el offset de Chile por defecto si no se pasa uno", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    const eventDate = new Date("2026-07-29T12:00:00Z");
    expect(isEventToday(eventDate, now)).toBe(true);
  });
});
