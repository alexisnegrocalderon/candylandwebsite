import { describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./_core/llm";
import { EventDescriptionSchema, generateEventDescription } from "./eventDescriptions";

// Solo se mockea invokeLLM -- extractContent (ahora compartida en
// _core/llm.ts) se deja real, mismo criterio que mailing.test.ts.
vi.mock("./_core/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/llm")>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

describe("EventDescriptionSchema", () => {
  it("accepts a valid description", () => {
    const result = EventDescriptionSchema.safeParse({
      shortDescription: "La fiesta de disfraces más grande del año.",
      description: "Un párrafo largo describiendo el evento con suficiente detalle para pasar el mínimo de caracteres pedido.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a shortDescription over 160 chars", () => {
    const result = EventDescriptionSchema.safeParse({
      shortDescription: "x".repeat(161),
      description: "Un párrafo largo describiendo el evento con suficiente detalle.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a description that's too short", () => {
    const result = EventDescriptionSchema.safeParse({
      shortDescription: "Corta.",
      description: "corto",
    });
    expect(result.success).toBe(false);
  });
});

describe("generateEventDescription", () => {
  it("returns the parsed content when the LLM responds with valid JSON", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            shortDescription: "2º aniversario de Mansion Playroom, disfraz obligatorio.",
            description: "Celebramos dos años con la fiesta más grande hasta ahora, en el marco de Halloween con disfraz obligatorio para todos.",
          }),
        },
      }],
    } as any);

    const result = await generateEventDescription({ title: "2º Aniversario", idea: "Halloween, disfraz obligatorio" });
    expect(result.shortDescription).toContain("aniversario");
    expect(result.description.length).toBeGreaterThan(10);
  });

  it("works without the optional idea field", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            shortDescription: "Una noche para recordar en Valparaíso.",
            description: "Ven a vivir una experiencia única con luces, música y una pista que no para en toda la noche.",
          }),
        },
      }],
    } as any);

    const result = await generateEventDescription({ title: "Candyland" });
    expect(result.shortDescription).toBeTruthy();
  });

  it("throws a readable error when the LLM returns invalid JSON", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{ message: { content: "esto no es JSON" } }],
    } as any);

    await expect(generateEventDescription({ title: "Evento" })).rejects.toThrow(/JSON válido/);
  });

  it("throws a readable error when the JSON doesn't match the schema", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ shortDescription: "x" }) } }],
    } as any);

    await expect(generateEventDescription({ title: "Evento" })).rejects.toThrow(/formato esperado/);
  });
});
