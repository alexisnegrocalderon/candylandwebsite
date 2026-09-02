import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { answerSalesQuestion } from "./adminQa";

// Solo se mockea invokeLLM -- extractContent (compartida en _core/llm.ts) se
// deja real, mismo criterio que mailing.test.ts.
vi.mock("./_core/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/llm")>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getOrderStats: vi.fn(),
    getSalesByUtmOrigin: vi.fn(),
    getFeaturedEvent: vi.fn(),
    getEventPnl: vi.fn(),
  };
});
const getOrderStatsMock = vi.mocked(db.getOrderStats);
const getSalesByUtmOriginMock = vi.mocked(db.getSalesByUtmOrigin);
const getFeaturedEventMock = vi.mocked(db.getFeaturedEvent);
const getEventPnlMock = vi.mocked(db.getEventPnl);

function mockLlmReply(text: string) {
  invokeLLMMock.mockResolvedValueOnce({
    choices: [{ message: { content: text } }],
  } as any);
}

describe("answerSalesQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the LLM's plain-text answer built from aggregated data", async () => {
    getOrderStatsMock.mockResolvedValueOnce({ totalOrders: 120, totalRevenue: 4500000, approvedOrders: 95 } as any);
    getSalesByUtmOriginMock.mockResolvedValueOnce([
      { utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'story-halloween', ordersCount: 20, revenue: 600000 },
    ] as any);
    getFeaturedEventMock.mockResolvedValueOnce({ id: 7 } as any);
    getEventPnlMock.mockResolvedValueOnce({
      eventId: 7, title: '2º Aniversario', eventDate: new Date(), monthKey: '2026-10', ivaApplies: false,
      cogsCoverage: 80, grossIncome: 4000000, cogs: 500000, ambassadorCommissions: 200000,
      directExpensesTotal: 300000, generalExpensesAssigned: 100000, netProfit: 2900000,
      marginPercent: 72.5, prorationWeight: 1, warnings: [],
    } as any);
    mockLlmReply('Hasta ahora van 95 órdenes aprobadas por un total de $4.500.000.');

    const answer = await answerSalesQuestion('¿Cuánto llevamos vendido?');
    expect(answer).toContain('95 órdenes');
    expect(getEventPnlMock).toHaveBeenCalledWith(7);
  });

  it("uses the explicit eventId instead of the featured event when given", async () => {
    getOrderStatsMock.mockResolvedValueOnce({ totalOrders: 0, totalRevenue: 0, approvedOrders: 0 } as any);
    getSalesByUtmOriginMock.mockResolvedValueOnce([] as any);
    getEventPnlMock.mockResolvedValueOnce(null);
    mockLlmReply('No hay datos todavía.');

    await answerSalesQuestion('¿Cómo va el evento 42?', 42);
    expect(getEventPnlMock).toHaveBeenCalledWith(42);
    expect(getFeaturedEventMock).not.toHaveBeenCalled();
  });

  it("throws a readable error when the LLM returns an empty answer", async () => {
    getOrderStatsMock.mockResolvedValueOnce({ totalOrders: 0, totalRevenue: 0, approvedOrders: 0 } as any);
    getSalesByUtmOriginMock.mockResolvedValueOnce([] as any);
    getFeaturedEventMock.mockResolvedValueOnce(undefined as any);
    mockLlmReply('   ');

    await expect(answerSalesQuestion('¿Algo?')).rejects.toThrow(/ninguna respuesta/);
  });
});
