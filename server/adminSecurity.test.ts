import { describe, expect, it } from "vitest";
import {
  BACKUP_CODE_COUNT,
  consumeBackupCode,
  createTotpSecret,
  currentTotpToken,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
  safeCompare,
  totpUri,
  verifyTotp,
} from "./adminSecurity";

describe("safeCompare", () => {
  it("da el mismo resultado que === para iguales y distintos", () => {
    expect(safeCompare("clave-secreta", "clave-secreta")).toBe(true);
    expect(safeCompare("clave-secreta", "clave-secretb")).toBe(false);
  });

  it("no explota con largos distintos (timingSafeEqual lanza si no se hashea antes)", () => {
    expect(safeCompare("corta", "una-clave-mucho-mas-larga")).toBe(false);
    expect(safeCompare("", "algo")).toBe(false);
    expect(safeCompare("", "")).toBe(true);
  });

  it("distingue mayúsculas y espacios", () => {
    expect(safeCompare("Clave", "clave")).toBe(false);
    expect(safeCompare("clave ", "clave")).toBe(false);
  });
});

describe("verifyTotp", () => {
  const secret = createTotpSecret();
  const now = new Date("2026-08-01T23:00:00Z");

  it("acepta el código que la app muestra en este momento", () => {
    const res = verifyTotp({ secret, token: currentTotpToken(secret, now), now });
    expect(res.ok).toBe(true);
  });

  it("tolera un reloj desfasado medio minuto", () => {
    const hace30s = new Date(now.getTime() - 30_000);
    const res = verifyTotp({ secret, token: currentTotpToken(secret, hace30s), now });
    expect(res.ok).toBe(true);
  });

  it("rechaza un código de hace diez minutos", () => {
    const viejo = new Date(now.getTime() - 10 * 60_000);
    const res = verifyTotp({ secret, token: currentTotpToken(secret, viejo), now });
    expect(res).toEqual({ ok: false, reason: "invalido" });
  });

  it("RECHAZA reusar un código ya usado, aunque siga vigente", () => {
    const token = currentTotpToken(secret, now);
    const primero = verifyTotp({ secret, token, now });
    expect(primero.ok).toBe(true);

    const segundo = verifyTotp({
      secret,
      token,
      lastUsedStep: primero.ok ? primero.timeStep : undefined,
      now,
    });
    expect(segundo).toEqual({ ok: false, reason: "reusado" });
  });

  it("rechaza cualquier cosa que no sean 6 dígitos", () => {
    for (const t of ["", "12345", "1234567", "abcdef", "12 34 56x", "12345a"]) {
      expect(verifyTotp({ secret, token: t, now }).ok).toBe(false);
    }
  });

  it("ignora espacios: la gente copia el código con espacios", () => {
    const token = currentTotpToken(secret, now);
    const conEspacios = `${token.slice(0, 3)} ${token.slice(3)}`;
    expect(verifyTotp({ secret, token: conEspacios, now }).ok).toBe(true);
  });

  it("un código de otro secreto no sirve", () => {
    const otro = createTotpSecret();
    expect(verifyTotp({ secret, token: currentTotpToken(otro, now), now }).ok).toBe(false);
  });
});

describe("totpUri", () => {
  it("arma la URI que Google Authenticator entiende", () => {
    const uri = totpUri(createTotpSecret(), "admin");
    expect(uri.startsWith("otpauth://totp/Candyland:admin")).toBe(true);
    expect(uri).toContain("secret=");
  });
});

describe("códigos de respaldo", () => {
  it("genera 8 códigos y solo guarda los hasheados", () => {
    const { plain, hashed } = generateBackupCodes();
    expect(plain).toHaveLength(BACKUP_CODE_COUNT);
    expect(hashed).toHaveLength(BACKUP_CODE_COUNT);
    // Ningún código legible aparece tal cual en lo que se guarda.
    for (const p of plain) expect(hashed).not.toContain(p);
  });

  it("no usa caracteres que se confundan al copiarlos a mano", () => {
    const { plain } = generateBackupCodes(50);
    for (const code of plain) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it("no repite códigos", () => {
    const { plain } = generateBackupCodes(50);
    expect(new Set(plain).size).toBe(50);
  });

  it("un código sirve UNA sola vez", () => {
    const { plain, hashed } = generateBackupCodes();
    const primero = consumeBackupCode(hashed, plain[0]);
    expect(primero.ok).toBe(true);
    expect(primero.remaining).toHaveLength(BACKUP_CODE_COUNT - 1);

    const segundo = consumeBackupCode(primero.remaining, plain[0]);
    expect(segundo.ok).toBe(false);
    expect(segundo.remaining).toHaveLength(BACKUP_CODE_COUNT - 1);
  });

  it("acepta el código en minúsculas y sin guion: se tipea a mano y con apuro", () => {
    const { plain, hashed } = generateBackupCodes();
    const feo = plain[3].toLowerCase().replace('-', ' ');
    expect(consumeBackupCode(hashed, feo).ok).toBe(true);
  });

  it("un código inventado no sirve", () => {
    const { hashed } = generateBackupCodes();
    const res = consumeBackupCode(hashed, "AAAA-BBBB");
    expect(res.ok).toBe(false);
    expect(res.remaining).toHaveLength(BACKUP_CODE_COUNT);
  });

  it("normaliza igual el mismo código escrito de varias formas", () => {
    expect(normalizeBackupCode("abcd-2345")).toBe("ABCD2345");
    expect(hashBackupCode("abcd-2345")).toBe(hashBackupCode("ABCD 2345"));
  });
});
