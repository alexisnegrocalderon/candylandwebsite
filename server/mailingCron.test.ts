import { describe, expect, it, vi, beforeEach } from "vitest";
import * as db from "./db";
import { sendEmail } from "./email";
import { processMailingCronBatch } from "./mailing";

vi.mock("./db", () => ({
  getPendingMailingRecipients: vi.fn(),
  markMailingRecipientResult: vi.fn(),
  addCustomerTag: vi.fn(),
  getFeaturedEvent: vi.fn(),
}));

vi.mock("./email", async () => {
  const actual = await vi.importActual<typeof import("./email")>("./email");
  return { ...actual, sendEmail: vi.fn() };
});

const getPendingMailingRecipientsMock = vi.mocked(db.getPendingMailingRecipients);
const markMailingRecipientResultMock = vi.mocked(db.markMailingRecipientResult);
const addCustomerTagMock = vi.mocked(db.addCustomerTag);
const sendEmailMock = vi.mocked(sendEmail);

const baseRecipient = {
  id: 1,
  campaignId: 10,
  customerId: 100,
  email: "camila@example.com",
  fullName: "Camila",
  campaignName: "masivocandyland2",
  content: { subject: "Asunto", headline: "Título", paragraphs: ["Párrafo."] },
  ctaUrl: "https://candylandwebsite.vercel.app",
  eventSections: null,
};

describe("processMailingCronBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("manda cada pendiente, lo marca sent y taguea al cliente con el nombre de la campaña", async () => {
    getPendingMailingRecipientsMock.mockResolvedValueOnce([baseRecipient]);
    sendEmailMock.mockResolvedValueOnce({ success: true });

    const result = await processMailingCronBatch();

    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: "camila@example.com", subject: "Asunto" }));
    expect(markMailingRecipientResultMock).toHaveBeenCalledWith(1, 10, true, undefined);
    expect(addCustomerTagMock).toHaveBeenCalledWith(100, "masivocandyland2");
    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, campaignsTouched: 1 });
  });

  it("marca failed y no taguea cuando el envío falla", async () => {
    getPendingMailingRecipientsMock.mockResolvedValueOnce([baseRecipient]);
    sendEmailMock.mockResolvedValueOnce({ success: false, reason: "API error" });

    const result = await processMailingCronBatch();

    expect(markMailingRecipientResultMock).toHaveBeenCalledWith(1, 10, false, "API error");
    expect(addCustomerTagMock).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, sent: 0, failed: 1, campaignsTouched: 1 });
  });

  it("procesa varios destinatarios de distintas campañas y cuenta cada campaña una sola vez", async () => {
    getPendingMailingRecipientsMock.mockResolvedValueOnce([
      { ...baseRecipient, id: 1, campaignId: 10, customerId: 100 },
      { ...baseRecipient, id: 2, campaignId: 10, customerId: 101, email: "juan@example.com" },
      { ...baseRecipient, id: 3, campaignId: 20, customerId: 200, email: "ana@example.com", campaignName: "otra-campana" },
    ]);
    sendEmailMock.mockResolvedValue({ success: true });

    const result = await processMailingCronBatch();

    expect(sendEmailMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ processed: 3, sent: 3, failed: 0, campaignsTouched: 2 });
  });

  it("no llama a getFeaturedEvent cuando la campaña no tiene tarjeta de evento", async () => {
    getPendingMailingRecipientsMock.mockResolvedValueOnce([baseRecipient]);
    sendEmailMock.mockResolvedValueOnce({ success: true });

    await processMailingCronBatch();

    expect(db.getFeaturedEvent).not.toHaveBeenCalled();
  });

  it("no manda nada y devuelve ceros cuando no hay pendientes", async () => {
    getPendingMailingRecipientsMock.mockResolvedValueOnce([]);

    const result = await processMailingCronBatch();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, campaignsTouched: 0 });
  });
});
