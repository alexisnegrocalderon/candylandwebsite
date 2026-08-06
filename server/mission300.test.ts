import { describe, expect, it } from "vitest";
import { personasForTicket, missionCutoff, isMissionWindowOpen } from "../shared/mission300";

describe("personasForTicket", () => {
  it("usa groupSize cuando está seteado, sin importar el accesoSlug", () => {
    expect(personasForTicket(5, "soltera")).toBe(5);
    expect(personasForTicket(5, null)).toBe(5);
  });

  it("cae a personasForAccesoSlug cuando groupSize es null/undefined", () => {
    expect(personasForTicket(null, "duo")).toBe(2);
    expect(personasForTicket(undefined, "grupo")).toBe(4);
  });

  it("un ticket sin groupSize ni slug mapeado cuenta como 1 persona", () => {
    expect(personasForTicket(null, null)).toBe(1);
    expect(personasForTicket(null, "invitacion_especial")).toBe(1);
  });

  it("distingue groupSize=0 de groupSize ausente -- ?? solo cae al slug con null/undefined", () => {
    expect(personasForTicket(0, "duo")).toBe(0);
  });
});

describe("missionCutoff", () => {
  it("corta a las 23:59:59 hora de Chile del día que, contando el evento, es el 3er día antes -- no 72h exactas antes de la hora del evento", () => {
    const eventDate = new Date("2026-08-08T21:00:00-04:00");
    const cutoff = missionCutoff(eventDate);
    // 2026-08-06T23:59:59.999 hora de Chile (UTC-4) == 2026-08-07T03:59:59.999Z
    expect(cutoff.toISOString()).toBe("2026-08-07T03:59:59.999Z");
  });

  it("la ventana sigue abierta durante todo el día 3 antes del evento, y cierra al día siguiente", () => {
    const eventDate = new Date("2026-08-08T21:00:00-04:00");
    expect(isMissionWindowOpen(eventDate, new Date("2026-08-06T20:00:00-04:00"))).toBe(true);
    expect(isMissionWindowOpen(eventDate, new Date("2026-08-07T00:00:01-04:00"))).toBe(false);
  });
});
