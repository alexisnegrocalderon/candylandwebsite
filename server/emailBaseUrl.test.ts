import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("dominio de los correos", () => {
  it("usa el dominio propio, también cuando APP_URL vale mansionplayroom.cl", async () => {
    vi.stubEnv("APP_URL", "https://mansionplayroom.cl");
    vi.resetModules();
    const { EMAIL_BASE_URL, LOGO_URL } = await import("./emailLayout");
    expect(EMAIL_BASE_URL).toBe("https://mansionplayroom.cl");
    expect(LOGO_URL).toBe("https://mansionplayroom.cl/candyland/logo-wordmark-email.png");
  });

  it("sin APP_URL también es el dominio propio, y nunca el de Vercel", async () => {
    vi.stubEnv("APP_URL", "");
    vi.resetModules();
    const { EMAIL_BASE_URL } = await import("./emailLayout");
    expect(EMAIL_BASE_URL).toBe("https://mansionplayroom.cl");
    expect(EMAIL_BASE_URL).not.toMatch(/vercel\.app/);
  });

  it("respeta otra dirección si APP_URL la trae, sin barra al final", async () => {
    vi.stubEnv("APP_URL", "https://pruebas.mansionplayroom.cl/");
    vi.resetModules();
    const { EMAIL_BASE_URL } = await import("./emailLayout");
    expect(EMAIL_BASE_URL).toBe("https://pruebas.mansionplayroom.cl");
  });
});
