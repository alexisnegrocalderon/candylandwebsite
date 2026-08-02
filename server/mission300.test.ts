import { describe, expect, it } from "vitest";
import { personasForTicket } from "../shared/mission300";

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
