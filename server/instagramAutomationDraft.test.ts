import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { AutomationReplyDraftSchema, generateAutomationReplyDraft } from "./instagramAutomationDraft";

vi.mock("./_core/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/llm")>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getSiteSettings: vi.fn() };
});
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);

function mockLlmJson(payload: unknown) {
  invokeLLMMock.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  } as any);
}

describe("AutomationReplyDraftSchema", () => {
  it("accepts a valid message", () => {
    const result = AutomationReplyDraftSchema.safeParse({ replyMessage: "Tu código {{codigo}} te espera 💜" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty message", () => {
    const result = AutomationReplyDraftSchema.safeParse({ replyMessage: "" });
    expect(result.success).toBe(false);
  });
});

describe("generateAutomationReplyDraft", () => {
  beforeEach(() => {
    getSiteSettingsMock.mockResolvedValue({} as any);
  });

  it("uses {{codigo}} literally when the reward is a discount", async () => {
    mockLlmJson({ replyMessage: "Ganaste 10% de descuento, usa el código {{codigo}} al comprar 💜" });

    const result = await generateAutomationReplyDraft({
      keyword: "disfraz",
      triggerSource: "story_reply",
      reward: { kind: "discount", discountType: "percentage", discountValue: 10 },
    });

    expect(result.replyMessage).toContain("{{codigo}}");
    expect(result.replyMessage).not.toContain("{{producto}}");
  });

  it("uses {{producto}} literally when the reward is a gift", async () => {
    mockLlmJson({ replyMessage: "Te regalamos {{producto}} para esta fiesta 🍹, entra acá: {{link}}" });

    const result = await generateAutomationReplyDraft({
      keyword: "piscola",
      triggerSource: "both",
      reward: { kind: "gift", productName: "1 Piscola" },
    });

    expect(result.replyMessage).toContain("{{producto}}");
    expect(result.replyMessage).toContain("{{link}}");
  });

  it("works without any reward and without an idea", async () => {
    mockLlmJson({ replyMessage: "¡Hola! Acá tienes toda la info que buscabas 💜" });

    const result = await generateAutomationReplyDraft({
      keyword: "info",
      triggerSource: "comment",
      reward: { kind: "none" },
    });

    expect(result.replyMessage).not.toContain("{{codigo}}");
    expect(result.replyMessage).not.toContain("{{producto}}");
  });

  it("throws a readable error when the LLM returns invalid JSON", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{ message: { content: "esto no es JSON" } }],
    } as any);

    await expect(generateAutomationReplyDraft({
      keyword: "disfraz",
      triggerSource: "story_reply",
      reward: { kind: "none" },
    })).rejects.toThrow(/JSON válido/);
  });

  it("throws a readable error when the JSON doesn't match the schema", async () => {
    invokeLLMMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({}) } }],
    } as any);

    await expect(generateAutomationReplyDraft({
      keyword: "disfraz",
      triggerSource: "story_reply",
      reward: { kind: "none" },
    })).rejects.toThrow(/formato esperado/);
  });
});
