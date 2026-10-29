import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "./db";
import { sendMarketingEmailBatch } from "./email";
import { processMailingCronBatch, materializeDueCampaigns, mailingVariantFor, mailingSubjectFor, AUTOMATED_EMAIL_DAILY_CAP } from "./mailing";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getPendingMailingRecipients: vi.fn(),
  markMailingRecipientsResults: vi.fn(),
  markMailingRecipientsSkipped: vi.fn(),
  approvedBuyerEmailsForEvent: vi.fn(),
  bulkAddCustomerTag: vi.fn(),
  getFeaturedEvent: vi.fn(),
  countAutomatedEmailsSentToday: vi.fn(),
  listDueScheduledCampaigns: vi.fn(),
  claimScheduledCampaign: vi.fn(),
  revertScheduledCampaign: vi.fn(),
  insertMailingRecipients: vi.fn(),
}));

vi.mock("./email", async () => {
  const actual = await vi.importActual<typeof import("./email")>("./email");
  return { ...actual, sendMarketingEmailBatch: vi.fn() };
});

// Armar la audiencia consulta clientes de verdad: acá solo importa cuándo y con qué filtros se pide.
vi.mock("./customerFilters", () => ({ customerWhere: vi.fn(() => undefined) }));
vi.mock("./appDevices", () => ({ appUserEmails: vi.fn(async () => new Set<string>()) }));
vi.mock("./leadsMailing", () => ({ syncLeadsAsMailingAudience: vi.fn(async () => []) }));

const pendingMock = vi.mocked(db.getPendingMailingRecipients);
const resultsMock = vi.mocked(db.markMailingRecipientsResults);
const skippedMock = vi.mocked(db.markMailingRecipientsSkipped);
const buyersMock = vi.mocked(db.approvedBuyerEmailsForEvent);
const tagMock = vi.mocked(db.bulkAddCustomerTag);
const batchMock = vi.mocked(sendMarketingEmailBatch);
const countSentTodayMock = vi.mocked(db.countAutomatedEmailsSentToday);

const baseRecipient = {
  id: 1, campaignId: 10, customerId: 100, email: "camila@example.com", fullName: "Camila",
  campaignName: "masivo candyland 2",
  content: { subject: "Asunto", headline: "Título", paragraphs: ["Párrafo."] },
  ctaUrl: "https://candylandwebsite.vercel.app", eventSections: null, campaignEventId: null, emailOptOut: 0,
};

const okFor = (rows: { email: string }[]) => rows.map((r) => ({ to: r.email, success: true }));

beforeEach(() => {
  vi.clearAllMocks();
  countSentTodayMock.mockResolvedValue(0);
  vi.mocked(db.listDueScheduledCampaigns).mockResolvedValue([]);
  buyersMock.mockResolvedValue(new Set());
  batchMock.mockImplementation(async (inputs) => inputs.map((i) => ({ to: i.to, success: true })));
});

describe("processMailingCronBatch", () => {
  it("manda el lote, marca los resultados de una vez y taguea a quienes recibieron con el nombre de la campaña", async () => {
    pendingMock.mockResolvedValueOnce([baseRecipient]);

    const result = await processMailingCronBatch();

    expect(batchMock).toHaveBeenCalledTimes(1);
    expect(batchMock.mock.calls[0][0][0]).toMatchObject({ to: "camila@example.com", subject: "Asunto", marketing: true });
    expect(resultsMock).toHaveBeenCalledWith(10, [{ recipientId: 1, success: true, reason: undefined }]);
    expect(tagMock).toHaveBeenCalledWith([100], "masivo candyland 2");
    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 0, campaignsTouched: 1 });
  });

  it("marca failed y no taguea cuando el envío falla", async () => {
    pendingMock.mockResolvedValueOnce([baseRecipient]);
    batchMock.mockResolvedValueOnce([{ to: "camila@example.com", success: false, reason: "API error" }]);

    const result = await processMailingCronBatch();

    expect(resultsMock).toHaveBeenCalledWith(10, [{ recipientId: 1, success: false, reason: "API error" }]);
    expect(tagMock).toHaveBeenCalledWith([], "masivo candyland 2");
    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 0, campaignsTouched: 1 });
  });

  it("agrupa por campaña: un lote por campaña y cada campaña cuenta una sola vez", async () => {
    pendingMock.mockResolvedValueOnce([
      { ...baseRecipient, id: 1, campaignId: 10, customerId: 100 },
      { ...baseRecipient, id: 2, campaignId: 10, customerId: 101, email: "juan@example.com" },
      { ...baseRecipient, id: 3, campaignId: 20, customerId: 200, email: "ana@example.com", campaignName: "otra-campana" },
    ]);

    const result = await processMailingCronBatch();

    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ processed: 3, sent: 3, failed: 0, skipped: 0, campaignsTouched: 2 });
  });

  it("etiqueta cada correo con la campaña y la variante A/B para que Resend la devuelva en el webhook", async () => {
    pendingMock.mockResolvedValueOnce([{ ...baseRecipient, customerId: 100 }, { ...baseRecipient, id: 2, customerId: 101, email: "b@example.com" }]);

    await processMailingCronBatch();

    const sent = batchMock.mock.calls[0][0];
    expect(sent[0].tags).toEqual([{ name: "campaign", value: "masivo-candyland-2" }, { name: "variant", value: "A" }]);
    expect(sent[1].tags).toEqual([{ name: "campaign", value: "masivo-candyland-2" }, { name: "variant", value: "B" }]);
  });

  it("prueba A/B: la mitad recibe el asunto B", async () => {
    const content = { ...baseRecipient.content, subjectB: "Asunto B" };
    pendingMock.mockResolvedValueOnce([
      { ...baseRecipient, id: 1, customerId: 100, content },
      { ...baseRecipient, id: 2, customerId: 101, email: "b@example.com", content },
    ]);

    await processMailingCronBatch();

    const [a, b] = batchMock.mock.calls[0][0];
    expect(a.subject).toBe("Asunto");
    expect(b.subject).toBe("Asunto B");
  });

  it("no llama a getFeaturedEvent cuando la campaña no tiene tarjeta de evento", async () => {
    pendingMock.mockResolvedValueOnce([baseRecipient]);
    await processMailingCronBatch();
    expect(db.getFeaturedEvent).not.toHaveBeenCalled();
  });

  it("no manda nada y devuelve ceros cuando no hay pendientes", async () => {
    pendingMock.mockResolvedValueOnce([]);
    const result = await processMailingCronBatch();
    expect(batchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0, campaignsTouched: 0 });
  });
});

/* Pedido explícito del dueño (14/09): si alguien compró la entrada del evento de la campaña MIENTRAS esperaba su
 * turno en la cola, no hay que seguir ofreciéndosela -- se saltea sin gastar cupo diario ni contar como enviado. */
describe("processMailingCronBatch — saltar a quien ya compró o pidió la baja", () => {
  const eventRecipient = { ...baseRecipient, campaignEventId: 7 };

  it("saltea y marca 'skipped' a quien ya tiene una orden aprobada de ese evento", async () => {
    pendingMock.mockResolvedValueOnce([eventRecipient]);
    buyersMock.mockResolvedValueOnce(new Set(["camila@example.com"]));

    const result = await processMailingCronBatch();

    expect(buyersMock).toHaveBeenCalledWith(7);
    expect(batchMock).not.toHaveBeenCalled();
    expect(skippedMock).toHaveBeenCalledWith(10, [1], "Ya había comprado esta entrada");
    expect(resultsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 1, campaignsTouched: 1 });
  });

  it("compara el correo sin importar mayúsculas", async () => {
    pendingMock.mockResolvedValueOnce([{ ...eventRecipient, email: "Camila@Example.com" }]);
    buyersMock.mockResolvedValueOnce(new Set(["camila@example.com"]));
    const result = await processMailingCronBatch();
    expect(result.skipped).toBe(1);
  });

  it("saltea y no manda nada a quien pidió la baja de correos mientras esperaba en la cola", async () => {
    pendingMock.mockResolvedValueOnce([{ ...baseRecipient, emailOptOut: 1 }]);

    const result = await processMailingCronBatch();

    expect(batchMock).not.toHaveBeenCalled();
    expect(skippedMock).toHaveBeenCalledWith(10, [1], "Pidió no recibir correos");
    expect(result).toMatchObject({ sent: 0, failed: 0, skipped: 1 });
  });

  it("nunca consulta compras para una campaña sin evento asociado", async () => {
    pendingMock.mockResolvedValueOnce([baseRecipient]);
    await processMailingCronBatch();
    expect(buyersMock).not.toHaveBeenCalled();
  });

  it("saltear a uno no le impide mandarle al resto de la tanda", async () => {
    pendingMock.mockResolvedValueOnce([
      { ...eventRecipient, id: 1, customerId: 100, email: "camila@example.com" },
      { ...eventRecipient, id: 2, customerId: 101, email: "juan@example.com" },
    ]);
    buyersMock.mockResolvedValueOnce(new Set(["camila@example.com"]));

    const result = await processMailingCronBatch();

    expect(batchMock.mock.calls[0][0].map((i) => i.to)).toEqual(["juan@example.com"]);
    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, skipped: 1, campaignsTouched: 1 });
  });
});

/* El presupuesto diario es lo que hace segura la frecuencia alta: sin este freno, corridas cada pocos minutos
 * vaciarían la cuota de Resend dejando sin cupo a la confirmación de compra con el QR de la entrada. */
describe("processMailingCronBatch — presupuesto diario", () => {
  it("no manda nada cuando el presupuesto del día ya se gastó", async () => {
    countSentTodayMock.mockResolvedValue(AUTOMATED_EMAIL_DAILY_CAP);
    const result = await processMailingCronBatch();
    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0, campaignsTouched: 0 });
    expect(pendingMock).not.toHaveBeenCalled();
    expect(batchMock).not.toHaveBeenCalled();
  });

  it("pide solo lo que queda de presupuesto, no la tanda completa", async () => {
    countSentTodayMock.mockResolvedValue(AUTOMATED_EMAIL_DAILY_CAP - 3);
    pendingMock.mockResolvedValue([]);
    await processMailingCronBatch();
    expect(pendingMock).toHaveBeenCalledWith(3);
  });

  it("con presupuesto de sobra pide la tanda entera de la corrida", async () => {
    pendingMock.mockResolvedValue([]);
    await processMailingCronBatch();
    const pedido = pendingMock.mock.calls[0][0];
    expect(pedido).toBeLessThanOrEqual(AUTOMATED_EMAIL_DAILY_CAP);
    expect(pedido).toBeGreaterThan(0);
  });

  it("un presupuesto pasado de largo no pide una cantidad negativa", async () => {
    countSentTodayMock.mockResolvedValue(AUTOMATED_EMAIL_DAILY_CAP + 20);
    const result = await processMailingCronBatch();
    expect(result.sent).toBe(0);
    expect(pendingMock).not.toHaveBeenCalled();
  });
});

describe("campañas programadas", () => {
  const due = { id: 55, audienceFilters: { notPurchasedEventId: 9, includeLeads: true } };

  it("al llegar la hora la campaña se toma, se arma la audiencia y recién ahí se insertan los destinatarios", async () => {
    vi.mocked(db.listDueScheduledCampaigns).mockResolvedValue([due] as any);
    vi.mocked(db.claimScheduledCampaign).mockResolvedValue(true);
    const select = vi.fn(() => ({ from: () => ({ where: () => ({ orderBy: async () => [{ id: 3 }, { id: 8 }] }) }) }));
    vi.mocked(db.getDb).mockResolvedValue({ select } as any);

    const r = await materializeDueCampaigns(new Date("2026-10-29T15:30:00Z"));

    expect(db.insertMailingRecipients).toHaveBeenCalledWith(55, [3, 8]);
    expect(r).toEqual({ campaigns: 1, recipients: 2 });
  });

  it("si otra corrida ya la tomó, no se arma dos veces", async () => {
    vi.mocked(db.listDueScheduledCampaigns).mockResolvedValue([due] as any);
    vi.mocked(db.claimScheduledCampaign).mockResolvedValue(false);

    const r = await materializeDueCampaigns();

    expect(db.insertMailingRecipients).not.toHaveBeenCalled();
    expect(r).toEqual({ campaigns: 0, recipients: 0 });
  });

  it("si armar la audiencia falla, la campaña vuelve a quedar programada y sin destinatarios a medias", async () => {
    vi.mocked(db.listDueScheduledCampaigns).mockResolvedValue([due] as any);
    vi.mocked(db.claimScheduledCampaign).mockResolvedValue(true);
    vi.mocked(db.getDb).mockResolvedValue(null as any);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await materializeDueCampaigns();

    expect(db.revertScheduledCampaign).toHaveBeenCalledWith(55);
    expect(r).toEqual({ campaigns: 0, recipients: 0 });
  });

  it("filtros inválidos no rompen: la campaña se revierte para reintentar", async () => {
    vi.mocked(db.listDueScheduledCampaigns).mockResolvedValue([{ id: 56, audienceFilters: { notPurchasedEventId: "x" } }] as any);
    vi.mocked(db.claimScheduledCampaign).mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await materializeDueCampaigns();
    expect(db.revertScheduledCampaign).toHaveBeenCalledWith(56);
  });
});

describe("variante A/B del asunto", () => {
  it("es determinista: par = A, impar = B", () => {
    expect(mailingVariantFor(2)).toBe("A");
    expect(mailingVariantFor(3)).toBe("B");
    expect(mailingVariantFor(3)).toBe(mailingVariantFor(3));
  });
  it("sin asunto B todos reciben el mismo asunto", () => {
    expect(mailingSubjectFor({ subject: "Uno" }, 3)).toBe("Uno");
    expect(mailingSubjectFor({ subject: "Uno", subjectB: "Dos" }, 3)).toBe("Dos");
    expect(mailingSubjectFor({ subject: "Uno", subjectB: "Dos" }, 2)).toBe("Uno");
  });
});
