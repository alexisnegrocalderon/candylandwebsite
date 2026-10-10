import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({ getSiteSettings: vi.fn(), getDb: vi.fn(), getFeaturedEvent: vi.fn() }));
vi.mock("./email", () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }), buildFinanceDigestEmail: vi.fn(() => "<html/>") }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), extractContent: (m: any) => m.content }));
vi.mock("./finance", () => ({ getEventFinanceReport: vi.fn() }));
vi.mock("./financeCompany", () => ({ getCompanyYear: vi.fn(), getPayables: vi.fn() }));

import * as db from "./db";
import * as email from "./email";
import { invokeLLM } from "./_core/llm";
import { getCompanyYear, getPayables } from "./financeCompany";
import { askFinance, chileParts, runFinanceDigest } from "./financeDirector";

beforeEach(() => vi.clearAllMocks());

describe("chileParts", () => {
  it("detecta lunes y mes en hora de Chile (no en UTC)", () => {
    // Martes 00:30 UTC = lunes 21:30 en Chile
    expect(chileParts(new Date("2026-10-06T00:30:00Z"))).toMatchObject({ dow: 1, month: 10, year: 2026 });
  });
});

describe("runFinanceDigest", () => {
  it("no manda nada con los interruptores apagados (por defecto)", async () => {
    vi.mocked(db.getSiteSettings).mockResolvedValue({} as any);
    const r = await runFinanceDigest(new Date("2026-10-05T12:00:00Z"));
    expect(r.sent).toEqual([]);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("manda el resumen semanal solo los lunes", async () => {
    vi.mocked(db.getSiteSettings).mockResolvedValue({ adminAlertsConfig: { financeWeeklyEmail: true } } as any);
    vi.mocked(db.getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }) } as any);
    const months = Array.from({ length: 12 }, (_, i) => ({ monthKey: `2026-${String(i + 1).padStart(2, "0")}`, events: [], grossIncome: 0, eventsProfit: 0, unassignedExpenses: 0, result: 0 }));
    vi.mocked(getCompanyYear).mockResolvedValue({ year: 2026, months, totals: { grossIncome: 0, eventsProfit: 0, unassignedExpenses: 0, result: 0, events: 0 } } as any);
    vi.mocked(getPayables).mockResolvedValue({ ambassadorsPending: 0, staffUnpaidTotal: 0, parkingTotal: 0, playcardSaldoClientes: 0 } as any);
    const monday = await runFinanceDigest(new Date("2026-10-05T12:00:00Z"));
    expect(monday.sent).toEqual(["semana"]);
    const tuesday = await runFinanceDigest(new Date("2026-10-06T12:00:00Z"));
    expect(tuesday.sent).toEqual([]);
  });
});

describe("askFinance", () => {
  it("le pasa a la IA los datos calculados y devuelve su respuesta", async () => {
    vi.mocked(getCompanyYear).mockResolvedValue({
      year: 2026, months: [{ monthKey: "2026-10", events: [{ id: 1, title: "Aniversario", netProfit: 300000, grossIncome: 900000 }], grossIncome: 900000, eventsProfit: 300000, unassignedExpenses: 0, result: 300000 }],
      totals: { grossIncome: 900000, eventsProfit: 300000, unassignedExpenses: 0, result: 300000, events: 1 },
    } as any);
    vi.mocked(getPayables).mockResolvedValue(null as any);
    vi.mocked(db.getFeaturedEvent).mockResolvedValue(null as any);
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: "Ganaste $300.000" } }] } as any);
    expect(await askFinance("¿cuánto gané en octubre?")).toBe("Ganaste $300.000");
    const prompt = JSON.stringify(vi.mocked(invokeLLM).mock.calls[0][0]);
    expect(prompt).toContain("octubre 2026");
    expect(prompt).toContain("$300.000");
  });
  it("falla claro si la IA no responde", async () => {
    vi.mocked(getCompanyYear).mockResolvedValue(null as any);
    vi.mocked(getPayables).mockResolvedValue(null as any);
    vi.mocked(db.getFeaturedEvent).mockResolvedValue(null as any);
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: "" } }] } as any);
    await expect(askFinance("hola mundo")).rejects.toThrow(/no devolvió/);
  });
});

import { normalizeAdminAlertsConfig, marginTarget } from "../shared/adminAlertsConfig";
describe("meta de margen configurable", () => {
  it("usa 30 % por defecto y acepta solo valores razonables", () => {
    expect(normalizeAdminAlertsConfig({}).financeMarginTargetPercent).toBe(30);
    expect(marginTarget(40)).toBe(40);
    expect(marginTarget(0)).toBe(30);
    expect(marginTarget(150)).toBe(30);
    expect(marginTarget("abc")).toBe(30);
    expect(normalizeAdminAlertsConfig({ financeMarginTargetPercent: 25 }).financeMarginTargetPercent).toBe(25);
  });
});
