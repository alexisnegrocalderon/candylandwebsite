import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "./db";
import { ticketTypes } from "../drizzle/schema";
import { sendMailingBatch } from "./mailing";
import { runFoundersPromoDaily, buildFoundersPromoContent, FOUNDERS_PROMO_TAG, FOUNDERS_PROMO_DAILY_TARGET } from "./foundersPromo";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getFeaturedEvent: vi.fn(),
  getStockPoolRemaining: vi.fn(),
  listCustomers: vi.fn(),
  getSiteSettings: vi.fn(),
  updateSiteSettings: vi.fn(),
}));

vi.mock("./mailing", async () => {
  const actual = await vi.importActual<typeof import("./mailing")>("./mailing");
  return { ...actual, sendMailingBatch: vi.fn() };
});

const getDbMock = vi.mocked(db.getDb);
const getFeaturedEventMock = vi.mocked(db.getFeaturedEvent);
const getStockPoolRemainingMock = vi.mocked(db.getStockPoolRemaining);
const listCustomersMock = vi.mocked(db.listCustomers);
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const updateSiteSettingsMock = vi.mocked(db.updateSiteSettings);
const sendMailingBatchMock = vi.mocked(sendMailingBatch);

const event = { id: 5, title: '2º Aniversario', slug: '2do-aniversario-playroom' };

/** Doble mínimo de la cadena de drizzle, mismo patrón que
 * server/leadsMailing.test.ts -- acá solo hace falta responder
 * `select().from(ticketTypes).where(...)` con las filas de accesos activos. */
function fakeDbWithAccesos(rows: { stockPoolId: number | null }[]) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === ticketTypes ? rows : []),
      }),
    }),
  } as any;
}

describe("buildFoundersPromoContent", () => {
  it("nunca menciona la palabra 'Founders', bajo ninguna capitalización", () => {
    const content = buildFoundersPromoContent(8, event);
    const allText = JSON.stringify(content).toLowerCase();
    expect(allText).not.toContain('founders');
  });

  it("incluye el remanente real en el asunto, el titular y el destacado", () => {
    const content = buildFoundersPromoContent(8, event);
    expect(content.subject).toContain('8');
    expect(content.headline).toContain('8');
    expect(content.highlightValue).toContain('8');
  });

  it("nombra el evento real en los párrafos", () => {
    const content = buildFoundersPromoContent(8, event);
    expect(content.paragraphs.join(' ')).toContain(event.title);
  });
});

describe("runFoundersPromoDaily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteSettingsMock.mockResolvedValue({ foundersPromoEnabled: 1 } as any);
    getFeaturedEventMock.mockResolvedValue(event as any);
    getDbMock.mockResolvedValue(fakeDbWithAccesos([{ stockPoolId: 1 }, { stockPoolId: 1 }]));
    getStockPoolRemainingMock.mockResolvedValue({ remaining: 8 } as any);
    listCustomersMock.mockResolvedValue([{ id: 1, email: 'a@test.cl' }, { id: 2, email: 'b@test.cl' }] as any);
    sendMailingBatchMock.mockResolvedValue([
      { customerId: 1, email: 'a@test.cl', success: true },
      { customerId: 2, email: 'b@test.cl', success: true },
    ]);
  });

  it("no hace nada si está apagado", async () => {
    getSiteSettingsMock.mockResolvedValue({ foundersPromoEnabled: 0 } as any);
    const result = await runFoundersPromoDaily();
    expect(result).toEqual({ ran: false, reason: 'disabled' });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("no hace nada si no hay evento destacado", async () => {
    getFeaturedEventMock.mockResolvedValue(undefined as any);
    const result = await runFoundersPromoDaily();
    expect(result).toEqual({ ran: false, reason: 'no-event' });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("se apaga solo y no manda nada si los accesos activos no comparten un único cupo", async () => {
    getDbMock.mockResolvedValue(fakeDbWithAccesos([{ stockPoolId: 1 }, { stockPoolId: 2 }]));
    const result = await runFoundersPromoDaily();
    expect(result).toEqual({ ran: false, reason: 'no-shared-pool' });
    expect(updateSiteSettingsMock).toHaveBeenCalledWith({ foundersPromoEnabled: false });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("se apaga solo y no manda nada si el cupo compartido ya se agotó", async () => {
    getStockPoolRemainingMock.mockResolvedValue({ remaining: 0 } as any);
    const result = await runFoundersPromoDaily();
    expect(result).toEqual({ ran: false, reason: 'sold-out' });
    expect(updateSiteSettingsMock).toHaveBeenCalledWith({ foundersPromoEnabled: false });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("se apaga solo y no manda nada si ya no queda audiencia nueva", async () => {
    listCustomersMock.mockResolvedValue([]);
    const result = await runFoundersPromoDaily();
    expect(result).toEqual({ ran: false, reason: 'audience-exhausted' });
    expect(updateSiteSettingsMock).toHaveBeenCalledWith({ foundersPromoEnabled: false });
    expect(sendMailingBatchMock).not.toHaveBeenCalled();
  });

  it("manda al cupo diario con el remanente vigente y taguea con FOUNDERS_PROMO_TAG", async () => {
    const result = await runFoundersPromoDaily();

    expect(listCustomersMock).toHaveBeenCalledWith({ notPurchasedEventId: event.id, excludeTags: [FOUNDERS_PROMO_TAG] });
    expect(sendMailingBatchMock).toHaveBeenCalledTimes(1);
    const [ids, content, ctaUrl, tag] = sendMailingBatchMock.mock.calls[0];
    expect(ids).toEqual([1, 2]);
    expect(content.highlightValue).toContain('8');
    expect(ctaUrl).toContain(event.slug);
    expect(tag).toBe(FOUNDERS_PROMO_TAG);

    expect(result).toEqual({ ran: true, eventTitle: event.title, remaining: 8, audienceSize: 2, sent: 2, failed: 0 });
    // Un envío normal (nadie apagado, todavía hay más gente/cupo) no se
    // desactiva solo -- eso es exclusivo de los stops automáticos de arriba.
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });

  it("recorta la audiencia al tope diario", async () => {
    const many = Array.from({ length: FOUNDERS_PROMO_DAILY_TARGET + 10 }, (_, i) => ({ id: i + 1, email: `c${i}@test.cl` }));
    listCustomersMock.mockResolvedValue(many as any);
    sendMailingBatchMock.mockResolvedValue(many.slice(0, FOUNDERS_PROMO_DAILY_TARGET).map((c) => ({ customerId: c.id, email: c.email, success: true })));

    await runFoundersPromoDaily();

    const [ids] = sendMailingBatchMock.mock.calls[0];
    expect(ids).toHaveLength(FOUNDERS_PROMO_DAILY_TARGET);
  });
});
