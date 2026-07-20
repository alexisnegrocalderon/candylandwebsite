import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("resolveProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes through Gemini when GEMINI_API_KEY is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    const { resolveProvider } = await import("./_core/llm");

    const provider = resolveProvider();
    expect(provider.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(provider.apiKey).toBe("test-gemini-key");
    expect(provider.defaultModel).toBe("gemini-flash-latest");
  });

  it("falls back to the Forge default when GEMINI_API_KEY is not set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");
    const { resolveProvider } = await import("./_core/llm");

    const provider = resolveProvider();
    expect(provider.baseUrl).toBe("https://forge.manus.im/v1");
    expect(provider.apiKey).toBe("forge-key");
    expect(provider.defaultModel).toBeUndefined();
  });

  it("uses a custom BUILT_IN_FORGE_API_URL when set, without a trailing slash", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("BUILT_IN_FORGE_API_URL", "https://custom.forge.example/");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");
    const { resolveProvider } = await import("./_core/llm");

    const provider = resolveProvider();
    expect(provider.baseUrl).toBe("https://custom.forge.example/v1");
  });

  it("prefers Gemini over Forge when both are configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-key");
    const { resolveProvider } = await import("./_core/llm");

    const provider = resolveProvider();
    expect(provider.baseUrl).toContain("generativelanguage.googleapis.com");
  });
});
