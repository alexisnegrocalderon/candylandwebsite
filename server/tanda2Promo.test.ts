import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "./db";
import { ticketTypes } from "../drizzle/schema";
import { sendMailingBatch } from "./mailing";
import { runTanda2PromoDaily, buildTanda2PromoContent, TANDA2_PROMO_TAG, TANDA2_PROMO_DAILY_TARGET } from "./tanda2Promo";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getFeaturedEvent: vi.fn(),
  listCustomers: vi.fn(),
  getSiteSettings: vi.fn(),
  updateSiteSettings: vi.fn(),
  getStockPoolRemaining: vi.fn(),
  hasApprovedOrderForEvent: vi.fn(),
  countTandaPromoEmailsSentToday: vi.fn(),
}));

vi.mock("./mailing", async () => {
  const actual = await vi.importActual<typeof import("./mailing")>("./mailing");
  return { ...actual, sendMailingBatch: vi.fn() };
});

const getDbMock = vi.mocked(db.getDb);
const getFeaturedEventMock = vi.mocked(db.getFeaturedEvent);
const listCustomersMock = vi.mocked(db.listCustomers);
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const updateSiteSettingsMock = vi.mocked(db.updateSiteSettings);
const getStockPoolRemainingMock = vi.mocked(db.getStockPoolRemaining);
const hasApprovedOrderMock = vi.mocked(db.hasApprovedOrderForEvent);
const countSentTodayMock = vi.mocked(db.countTandaPromoEmailsSentToday);
const sendMailingBatchMock = vi.mocked(sendMailingBatch);

const event = { id: 5, title: '2º Aniversario', slug: '2do-aniversario-playroom', tandaPhaseIndex: 1 };

const accesos = [
  { name: 'Acceso Soltera', price: '12000', originalPrice: '25000', stockPoolId: 1, sortOrder: 0 },
  { name: 'Acceso Dúo', price: '36000', originalPrice: '60000', stockPoolId: 1, sortOrder: 1 },
];

function fakeDbWithAccesos(rows: Record<string, unknown>[]) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({ orderBy: async () => (table === ticketTypes ? rows : []) }),
      }),
    }),
  } as any;
}

describe("buildTanda2PromoContent", () => {
  it("nunca menciona 'Founders'", () => {
    expect(JSON.stringify(buildTanda2PromoContent(12000, event)).toLowerCase()).not.toContain('founders');
  });

  it("incluye el precio más bajo en el asunto y el evento en los párrafos", () => {
    const content = buildTanda2PromoContent(12000, event);
    expect(content.subject).toContain('desde $12.000');
    expect(content.paragraphs.join(' ')).toContain(event.title);
  });
});

describe("runTanda2PromoDaily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteSettingsMock.mockResolvedValue({ tanda2PromoEnabled: 1 } as any);
    getFeaturedEventMock.mockResolvedValue(event as any);
    getDbMock.mockResolvedValue(fakeDbWithAccesos(accesos));
    getStockPoolRemainingMock.mockResolvedValue({ remaining: 50 } as any);
    countSentTodayMock.mockResolvedValue(0);
    hasApprovedOrderMock.mockResolvedValue(false);
    listCustomersMock.mockResolvedValue([{ id: 1, email: 'a@test.cl' }, { id: 2, email: 'b@test.cl' }] as any);
    sendMailingBatchMock.mockResolvedValue({
      batchId: 'b',
      results: [
        { customerId: 1, email: 'a@test.cl', success: true },
        { customerId: 2, email: 'b@test.cl', success: true },
      ],
    });
  });

  it("no hace nada si está apagado", async () => {
    getSiteSettingsMock.mockResolvedValue({ tanda2PromoEnabled: 0 } as any);
    expect(await runTanda2PromoDaily()).toEqual({ ran: false, reason: 'disabled' });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("no manda ni se apaga mientras el evento sigue en la 1ª tanda", async () => {
    getFeaturedEventMock.mockResolvedValue({ ...event, tandaPhaseIndex: 0 } as any);
    expect(await runTanda2PromoDaily()).toEqual({ ran: false, reason: 'wrong-phase' });
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("se apaga solo si el evento ya pasó a la 3ª tanda", async () => {
    getFeaturedEventMock.mockResolvedValue({ ...event, tandaPhaseIndex: 2 } as any);
    expect(await runTanda2PromoDaily()).toEqual({ ran: false, reason: 'phase-ended' });
    expect(updateSiteSettingsMock).toHaveBeenCalledWith({ tanda2PromoEnabled: false });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("no manda si ya se llegó al tope diario compartido", async () => {
    countSentTodayMock.mockResolvedValue(TANDA2_PROMO_DAILY_TARGET);
    expect(await runTanda2PromoDaily()).toEqual({ ran: false, reason: 'daily-cap-reached' });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("se apaga solo si ya no queda audiencia", async () => {
    listCustomersMock.mockResolvedValue([]);
    expect(await runTanda2PromoDaily()).toEqual({ ran: false, reason: 'audience-exhausted' });
    expect(updateSiteSettingsMock).toHaveBeenCalledWith({ tanda2PromoEnabled: false });
  });

  it("manda la lista de precios de CADA acceso (con tachado) y los cupos que quedan", async () => {
    await runTanda2PromoDaily();
    const extras = sendMailingBatchMock.mock.calls[0][7];
    expect(extras).toEqual({
      priceList: [
        { label: 'Acceso Soltera', price: 12000, originalPrice: 25000 },
        { label: 'Acceso Dúo', price: 36000, originalPrice: 60000 },
      ],
      remaining: 50,
    });
  });

  it("sin cupo compartido único no informa cupos", async () => {
    getDbMock.mockResolvedValue(fakeDbWithAccesos([{ ...accesos[0], stockPoolId: 1 }, { ...accesos[1], stockPoolId: 2 }]));
    await runTanda2PromoDaily();
    expect(sendMailingBatchMock.mock.calls[0][7]?.remaining).toBeNull();
  });

  it("manda a todos los no compradores, taggeando con TANDA2_PROMO_TAG", async () => {
    const result = await runTanda2PromoDaily();

    // No excluye la etiqueta de la 1ª tanda: los recontacta con el nuevo precio.
    expect(listCustomersMock).toHaveBeenCalledWith({ notPurchasedEventId: event.id, excludeTags: [TANDA2_PROMO_TAG] });
    const [ids, content, ctaUrl, tag, , , source] = sendMailingBatchMock.mock.calls[0];
    expect(ids).toEqual([1, 2]);
    expect(content.subject).toContain('12.000');
    expect(ctaUrl).toContain(event.slug);
    expect(tag).toBe(TANDA2_PROMO_TAG);
    expect(source).toBe('tanda2-promo');
    expect(result).toEqual({ ran: true, eventTitle: event.title, priceFrom: 12000, audienceSize: 2, sent: 2, failed: 0, skipped: 0 });
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });

  it("recorta al cupo restante del día (tope 50 menos lo ya enviado)", async () => {
    const many = Array.from({ length: TANDA2_PROMO_DAILY_TARGET + 10 }, (_, i) => ({ id: i + 1, email: `c${i}@test.cl` }));
    listCustomersMock.mockResolvedValue(many as any);
    countSentTodayMock.mockResolvedValue(TANDA2_PROMO_DAILY_TARGET - 20);

    await runTanda2PromoDaily();

    expect(sendMailingBatchMock.mock.calls[0][0]).toHaveLength(20);
  });

  it("re-verifica la conversión y deja fuera a quien compró justo antes del envío", async () => {
    hasApprovedOrderMock.mockImplementation(async (email: string) => email === 'a@test.cl');
    sendMailingBatchMock.mockResolvedValue({ batchId: 'b', results: [{ customerId: 2, email: 'b@test.cl', success: true }] });

    const result = await runTanda2PromoDaily();

    expect(sendMailingBatchMock.mock.calls[0][0]).toEqual([2]);
    expect(result).toMatchObject({ ran: true, sent: 1, skipped: 1 });
  });
});
