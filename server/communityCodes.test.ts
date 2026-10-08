import { describe, expect, it } from "vitest";
import { communityCodeOwnerMatches } from "./db";

/* Código de comunidad personal y permanente (ver drizzle/schema.ts,
 * columna ownerRut): un código compartido (sin ownerRut) sigue pasando
 * para cualquiera, igual que siempre -- solo un código con ownerRut
 * asignado exige que el RUT del comprador calce. */
describe("communityCodeOwnerMatches", () => {
  it("un código compartido (sin ownerRut) siempre pasa, con o sin RUT del comprador", () => {
    expect(communityCodeOwnerMatches(null, undefined)).toBe(true);
    expect(communityCodeOwnerMatches(null, "12.345.678-5")).toBe(true);
    expect(communityCodeOwnerMatches(undefined, undefined)).toBe(true);
  });

  it("un código personal pasa si el RUT del comprador calza, normalizado", () => {
    expect(communityCodeOwnerMatches("12345678-5", "12.345.678-5")).toBe(true);
    expect(communityCodeOwnerMatches("12.345.678-5", "12345678-5")).toBe(true);
    expect(communityCodeOwnerMatches("11111111-1", " 11111111-1 ")).toBe(true);
  });

  it("un código personal rechaza a cualquier otro RUT, o si no se manda ninguno", () => {
    expect(communityCodeOwnerMatches("12345678-5", "11111111-1")).toBe(false);
    expect(communityCodeOwnerMatches("12345678-5", undefined)).toBe(false);
    expect(communityCodeOwnerMatches("12345678-5", "")).toBe(false);
  });
});
