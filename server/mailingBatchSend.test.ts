import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  listCustomersByIds: vi.fn(),
  logMailingSend: vi.fn(async () => undefined),
  addCustomerTag: vi.fn(async () => undefined),
}));
vi.mock("./email", async () => {
  const actual = await vi.importActual<typeof import("./email")>("./email");
  return { ...actual, sendMarketingEmailBatch: vi.fn() };
});

import * as db from "./db";
import { sendMarketingEmailBatch } from "./email";
import { sendMailingBatch } from "./mailing";

const batchMock = vi.mocked(sendMarketingEmailBatch);
const listMock = vi.mocked(db.listCustomersByIds);
const logMock = vi.mocked(db.logMailingSend);

const content = { subject: 'Aviso', headline: 'Hola', paragraphs: ['Texto'] };
const customers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, email: `c${i + 1}@t.cl`, fullName: `C${i + 1}`, emailOptOut: 0 }));

describe("sendMailingBatch (envío en lotes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchMock.mockImplementation(async (inputs) => inputs.map((i) => ({ to: i.to, success: true })));
  });

  it("manda en lotes de hasta 100 por llamada, no uno a uno", async () => {
    listMock.mockResolvedValue(customers(250) as any);
    const { results } = await sendMailingBatch(customers(250).map((c) => c.id), content, 'https://x.cl', undefined, null, undefined, 'sales-drip', { eventId: 5 });
    expect(batchMock).toHaveBeenCalledTimes(3);
    expect(batchMock.mock.calls.map((c) => c[0].length)).toEqual([100, 100, 50]);
    expect(results).toHaveLength(250);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it("registra cada envío con su evento (base del tope de 3 mails)", async () => {
    listMock.mockResolvedValue(customers(2) as any);
    await sendMailingBatch([1, 2], content, 'https://x.cl', undefined, null, undefined, 'sales-drip', { eventId: 5 });
    expect(logMock).toHaveBeenCalledTimes(2);
    expect(logMock.mock.calls[0][0]).toMatchObject({ source: 'sales-drip', eventId: 5, customerId: 1, success: true });
  });

  it("quien pidió la baja no recibe nada y queda como fallido", async () => {
    listMock.mockResolvedValue([{ ...customers(1)[0], emailOptOut: 1 }, ...customers(2).slice(1)] as any);
    const { results } = await sendMailingBatch([1, 2], content, 'https://x.cl');
    expect(batchMock.mock.calls[0][0].map((i) => i.to)).toEqual(['c2@t.cl']);
    expect(results.find((r) => r.customerId === 1)).toMatchObject({ success: false, reason: 'Pidió no recibir correos' });
  });

  it("un correo que falla queda como fallido y los demás siguen", async () => {
    listMock.mockResolvedValue(customers(2) as any);
    batchMock.mockResolvedValue([{ to: 'c1@t.cl', success: false, reason: 'API error' }, { to: 'c2@t.cl', success: true }]);
    const { results } = await sendMailingBatch([1, 2], content, 'https://x.cl');
    expect(results.map((r) => r.success)).toEqual([false, true]);
  });
});
