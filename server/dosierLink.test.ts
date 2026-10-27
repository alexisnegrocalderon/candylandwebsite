import { describe, expect, it } from "vitest";
import { firmarDosier, verificarDosier } from "./dosierLink";

describe("link del dosier", () => {
  it("un token válido devuelve su evento", () => {
    const { token } = firmarDosier(42, 60_000);
    expect(verificarDosier(token)).toBe(42);
    expect(verificarDosier(`${token}.pdf`)).toBe(42);
  });
  it("vencido no sirve", () => {
    const { token } = firmarDosier(42, 60_000, Date.now() - 120_000);
    expect(verificarDosier(token)).toBeNull();
  });
  it("cambiar el evento rompe la firma", () => {
    const { token } = firmarDosier(42, 60_000);
    const [, sig] = token.split(".");
    const otro = Buffer.from(JSON.stringify({ e: 7, x: Math.floor(Date.now() / 1000) + 999 })).toString("base64url");
    expect(verificarDosier(`${otro}.${sig}`)).toBeNull();
    expect(verificarDosier("basura")).toBeNull();
  });
});
