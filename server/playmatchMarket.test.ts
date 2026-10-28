import { describe, expect, it, vi } from "vitest";

// El módulo abre la base al importarse solo cuando se la pide: acá solo se prueban las funciones puras.
vi.mock("./db", () => ({ getDb: async () => null, getPartyConfig: async () => ({}), getPartyConnectionsFor: async () => [], getPartyHiddenIds: async () => new Set(), partyVibe: () => ({}) }));
vi.mock("./push", () => ({ sendPushToProfile: async () => {} }));
vi.mock("./playcardTopup", () => ({ identityFromTicketCode: async () => null }));

import { shortName } from "./playmatchMarket";

describe("shortName (lo que ve un anfitrión de quien aún no tiene alias)", () => {
  it("nombre y la inicial del apellido, nunca el apellido completo", () => {
    expect(shortName("María Pérez González")).toBe("María P.");
    expect(shortName("  juan   de la cruz ")).toBe("juan D.");
  });
  it("con un solo nombre, ese nombre", () => {
    expect(shortName("Ana")).toBe("Ana");
  });
  it("sin nada, «Invitado»", () => {
    expect(shortName("")).toBe("Invitado");
    expect(shortName(null)).toBe("Invitado");
  });
});
