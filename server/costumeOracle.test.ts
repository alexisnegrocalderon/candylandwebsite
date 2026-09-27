import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./_core/llm";
import { generateCostumeIdeas } from "./costumeOracle";
import type { OracleAnswers } from "../shared/costumeOracle";

vi.mock("./_core/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/llm")>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

function mockLlmReply(text: string) {
  invokeLLMMock.mockResolvedValueOnce({
    id: "x", created: 0, model: "m",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "end_turn" }],
  });
}

const answers: OracleAnswers = { vibe: "terror", company: "pareja", level: "casa", skin: "algo", items: ["negro", "maquillaje"], extra: "tengo un vestido negro" };

const card = (tier: string, name: string) => ({
  tier, name, emoji: "💀", pitch: "p", pieces: ["a", "b"], costRange: "$0 - $5.000", difficulty: 7, beautyTip: "t", groupTip: "g",
});

describe("generateCostumeIdeas", () => {
  beforeEach(() => invokeLLMMock.mockReset());

  it("ordena las 3 cartas por tier y acota la dificultad a 1-3", async () => {
    mockLlmReply(JSON.stringify({ intro: "hola", cards: [card("produccion", "C"), card("basico", "A"), card("intermedio", "B")] }));
    const result = await generateCostumeIdeas(answers);
    expect(result.fallback).toBe(false);
    expect(result.cards.map((c) => c.name)).toEqual(["A", "B", "C"]);
    expect(result.cards.every((c) => c.difficulty === 3)).toBe(true);
  });

  it("le pasa al modelo lo que la persona respondió", async () => {
    mockLlmReply(JSON.stringify({ intro: "", cards: [card("basico", "A"), card("intermedio", "B"), card("produccion", "C")] }));
    await generateCostumeIdeas(answers);
    const userMsg = invokeLLMMock.mock.calls[0][0].messages[1].content as string;
    expect(userMsg).toContain("Terror");
    expect(userMsg).toContain("En pareja");
    expect(userMsg).toContain("tengo un vestido negro");
  });

  it("cae al catálogo estático si falta una carta", async () => {
    mockLlmReply(JSON.stringify({ intro: "", cards: [card("basico", "A")] }));
    const result = await generateCostumeIdeas(answers);
    expect(result.fallback).toBe(true);
    expect(result.cards).toHaveLength(3);
  });

  it("cae al catálogo estático si la IA falla", async () => {
    invokeLLMMock.mockRejectedValueOnce(new Error("sin API key"));
    const result = await generateCostumeIdeas(answers);
    expect(result.fallback).toBe(true);
    expect(result.cards[0].tier).toBe("basico");
  });
});
