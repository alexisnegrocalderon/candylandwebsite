import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "./db";
import { sendMailingBatch } from "./mailing";
import { resolveCurrentOffer } from "./tanda2Promo";
import { runSalesDripDaily, buildSalesDripContent, daysUntilEvent, SALES_DRIP_DAILY_TARGET } from "./salesDrip";

vi.mock("./db", () => ({
  getFeaturedEvent: vi.fn(),
  listCustomers: vi.fn(),
  getSalesDripSettings: vi.fn(),
  hasApprovedOrderForEvent: vi.fn(),
  countTandaPromoEmailsSentToday: vi.fn(),
  getLastSalesDripByCustomer: vi.fn(),
  hasMailingCampaignToday: vi.fn(async () => false),
}));
vi.mock("./tandaAutoAdvance", () => ({ checkAndAdvanceTandaIfNeeded: vi.fn() }));
vi.mock("./tanda2Promo", () => ({ resolveCurrentOffer: vi.fn() }));
vi.mock("./mailing", async () => {
  const actual = await vi.importActual<typeof import("./mailing")>("./mailing");
  return { ...actual, sendMailingBatch: vi.fn() };
});

const getFeaturedEventMock = vi.mocked(db.getFeaturedEvent);
const listCustomersMock = vi.mocked(db.listCustomers);
const getSettingsMock = vi.mocked(db.getSalesDripSettings);
const hasApprovedMock = vi.mocked(db.hasApprovedOrderForEvent);
const countSentTodayMock = vi.mocked(db.countTandaPromoEmailsSentToday);
const lastDripMock = vi.mocked(db.getLastSalesDripByCustomer);
const offerMock = vi.mocked(resolveCurrentOffer);
const sendMock = vi.mocked(sendMailingBatch);

const NOW = new Date('2026-10-15T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY);

const event = (days: number, extra: Record<string, unknown> = {}) => ({
  id: 5, title: '2º Aniversario', slug: '2do-aniversario', venue: 'La Mansión',
  eventDate: daysFromNow(days), tandaPhaseIndex: 0,
  tandaDiscountSchedule: [{ percent: 60, untilDate: daysFromNow(5).toISOString() }, { percent: 50 }],
  ...extra,
});

const offer = {
  prices: [{ label: 'Acceso Soltera', price: 10000, originalPrice: 25000 }],
  priceFrom: 10000,
  remaining: 40,
};

describe("buildSalesDripContent", () => {
  it("cuenta los días y los pone en asunto y destacado", () => {
    const c = buildSalesDripContent(event(12) as any, offer, NOW);
    expect(c.subject).toContain('12 días');
    expect(c.subject).toContain('$10.000');
    expect(c.highlightValue).toBe('12 días');
  });

  it("cambia el tono según cuánto falta (mañana / hoy)", () => {
    expect(buildSalesDripContent(event(1) as any, offer, NOW).subject).toContain('Mañana');
    expect(buildSalesDripContent(event(0.1) as any, offer, NOW).subject).toContain('Hoy');
  });

  it("anuncia el próximo precio con datos reales y los cupos", () => {
    const text = buildSalesDripContent(event(30) as any, offer, NOW).paragraphs.join(' ');
    expect(text).toContain('después sube a $13.000');
    expect(text).toContain('Quedan 40 cupos');
  });

  it("nunca menciona 'Founders'", () => {
    expect(JSON.stringify(buildSalesDripContent(event(30) as any, offer, NOW)).toLowerCase()).not.toContain('founders');
  });

  it("daysUntilEvent usa días de calendario de Chile", () => {
    expect(daysUntilEvent(daysFromNow(3), NOW)).toBe(3);
  });
});

describe("runSalesDripDaily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettingsMock.mockResolvedValue({ enabled: true, intervalDays: 4 });
    getFeaturedEventMock.mockResolvedValue(event(20) as any);
    offerMock.mockResolvedValue(offer as any);
    countSentTodayMock.mockResolvedValue(0);
    hasApprovedMock.mockResolvedValue(false);
    lastDripMock.mockResolvedValue(new Map());
    listCustomersMock.mockResolvedValue([{ id: 1, email: 'a@t.cl' }, { id: 2, email: 'b@t.cl' }] as any);
    sendMock.mockResolvedValue({
      batchId: 'b',
      results: [{ customerId: 1, email: 'a@t.cl', success: true }, { customerId: 2, email: 'b@t.cl', success: true }],
    });
  });

  it("no hace nada si está apagado", async () => {
    getSettingsMock.mockResolvedValue({ enabled: false, intervalDays: 4 });
    expect(await runSalesDripDaily(NOW)).toEqual({ ran: false, reason: 'disabled' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("termina cuando el evento ya pasó", async () => {
    getFeaturedEventMock.mockResolvedValue(event(-1) as any);
    expect(await runSalesDripDaily(NOW)).toEqual({ ran: false, reason: 'event-over' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("respeta el tope diario compartido", async () => {
    countSentTodayMock.mockResolvedValue(SALES_DRIP_DAILY_TARGET);
    expect(await runSalesDripDaily(NOW)).toEqual({ ran: false, reason: 'daily-cap-reached' });
  });

  it("manda y registra el evento, con 'sales-drip' como origen", async () => {
    const r = await runSalesDripDaily(NOW);
    expect(r).toMatchObject({ ran: true, sent: 2, failed: 0 });
    expect(sendMock.mock.calls[0][6]).toBe('sales-drip');
    expect(sendMock.mock.calls[0][7]).toMatchObject({ eventId: 5 });
  });

  it("no repite antes de N días y retoma al cumplirse la espera", async () => {
    lastDripMock.mockResolvedValue(new Map([
      [1, new Date(NOW.getTime() - 2 * DAY)], // hace 2 días: aún no
      [2, new Date(NOW.getTime() - 5 * DAY)], // hace 5 días: le toca
    ]));
    await runSalesDripDaily(NOW);
    expect(sendMock.mock.calls[0][0]).toEqual([2]);
  });

  it("al terminar una vuelta NO se apaga: queda en 'nobody-due' para mañana", async () => {
    lastDripMock.mockResolvedValue(new Map([
      [1, new Date(NOW.getTime() - 1 * DAY)],
      [2, new Date(NOW.getTime() - 1 * DAY)],
    ]));
    expect(await runSalesDripDaily(NOW)).toEqual({ ran: false, reason: 'nobody-due' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("primero los que nunca recibieron, luego el aviso más antiguo", async () => {
    listCustomersMock.mockResolvedValue([{ id: 1, email: 'a@t.cl' }, { id: 2, email: 'b@t.cl' }, { id: 3, email: 'c@t.cl' }] as any);
    lastDripMock.mockResolvedValue(new Map([
      [1, new Date(NOW.getTime() - 5 * DAY)],
      [2, new Date(NOW.getTime() - 9 * DAY)],
    ]));
    await runSalesDripDaily(NOW);
    expect(sendMock.mock.calls[0][0]).toEqual([3, 2, 1]);
  });

  it("salta a quien compró mientras tanto y completa el cupo con los siguientes", async () => {
    countSentTodayMock.mockResolvedValue(SALES_DRIP_DAILY_TARGET - 1);
    hasApprovedMock.mockImplementation(async (email: string) => email === 'a@t.cl');
    const r = await runSalesDripDaily(NOW);
    expect(sendMock.mock.calls[0][0]).toEqual([2]);
    expect(r).toMatchObject({ ran: true, skipped: 1 });
  });

  it("funciona en cualquier tanda (3ª o más)", async () => {
    getFeaturedEventMock.mockResolvedValue(event(10, { tandaPhaseIndex: 3 }) as any);
    expect(await runSalesDripDaily(NOW)).toMatchObject({ ran: true });
  });
});
