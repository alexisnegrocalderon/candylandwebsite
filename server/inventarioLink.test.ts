import { describe, expect, it } from "vitest";
import { firmarInventario, verificarInventario } from "./inventarioLink";

describe("link del inventario", () => {
  it("lleva evento y personas, y vence", () => {
    const now = Date.now();
    const { token } = firmarInventario({ eventId: 7, personas: 250 }, 1000, now);
    expect(verificarInventario(token, now)).toEqual({ eventId: 7, personas: 250 });
    expect(verificarInventario(`${token}.pdf`, now)).toEqual({ eventId: 7, personas: 250 });
    expect(verificarInventario(token, now + 5000)).toBeNull();
  });

  it("no acepta tokens cambiados ni los del dosier", () => {
    const now = Date.now();
    const { token } = firmarInventario({ eventId: 7, personas: 250 }, 60_000, now);
    const [body, sig] = token.split(".");
    const otro = Buffer.from(JSON.stringify({ e: 8, p: 250, x: Math.floor((now + 60_000) / 1000) })).toString("base64url");
    expect(verificarInventario(`${otro}.${sig}`, now)).toBeNull();
    expect(verificarInventario(`${body}.xxxx`, now)).toBeNull();
    expect(verificarInventario("", now)).toBeNull();
  });
});
