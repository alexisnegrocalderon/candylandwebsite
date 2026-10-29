import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logEmailsSent = vi.fn(async (_rows: unknown[]) => {});
const logEmailSent = vi.fn(async (_row: unknown) => {});
vi.mock("./db", () => ({ logEmailSent: (r: unknown) => logEmailSent(r), logEmailsSent: (r: unknown[]) => logEmailsSent(r) }));
const optedOut = new Set<string>();
vi.mock("./unsubscribe", () => ({
  isEmailOptedOut: vi.fn(async (e: string) => optedOut.has(e)),
  unsubscribeOneClickUrl: (e: string) => `https://x.test/api/unsubscribe?e=${e}`,
  unsubscribePageUrl: (e: string) => `https://x.test/baja?e=${e}`,
}));
vi.mock("./emailQuotaAlert", () => ({ checkEmailQuotaAlert: vi.fn(async () => {}) }));

const { sendMarketingEmailBatch, resendTagValue, EMAIL_BATCH_MAX } = await import("./email");

const mail = (n: number) => ({ to: `p${n}@x.cl`, subject: `Asunto ${n}`, html: "<html><body>Hola</body></html>", marketing: true, tags: [{ name: "campaign", value: "c1" }] });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_FROM_EMAIL", "Mansion <hola@mansionplayroom.cl>");
  vi.stubEnv("RESEND_REPLY_TO", "contacto@mansionplayroom.cl");
  optedOut.clear();
  fetchMock.mockReset();
  logEmailsSent.mockClear();
  logEmailSent.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const body = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe("sendMarketingEmailBatch", () => {
  it("manda una sola llamada a /emails/batch con baja de un clic, reply-to y etiquetas en cada correo", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });

    const r = await sendMarketingEmailBatch([mail(1), mail(2)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails/batch");
    const payload = body(0);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({ to: "p1@x.cl", subject: "Asunto 1", reply_to: "contacto@mansionplayroom.cl", tags: [{ name: "campaign", value: "c1" }] });
    expect(payload[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(payload[0].headers["List-Unsubscribe"]).toContain("p1@x.cl");
    expect(payload[0].html).toContain("baja");
    expect(r.map((x) => x.success)).toEqual([true, true]);
    expect(logEmailsSent).toHaveBeenCalledWith([
      { to: "p1@x.cl", subject: "Asunto 1", success: true }, { to: "p2@x.cl", subject: "Asunto 2", success: true },
    ]);
  });

  it("no le manda a quien pidió la baja y devuelve su motivo en el mismo orden", async () => {
    optedOut.add("p2@x.cl");
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });

    const r = await sendMarketingEmailBatch([mail(1), mail(2), mail(3)]);

    expect(body(0).map((m: { to: string }) => m.to)).toEqual(["p1@x.cl", "p3@x.cl"]);
    expect(r).toEqual([{ to: "p1@x.cl", success: true }, { to: "p2@x.cl", success: false, reason: "Pidió no recibir correos" }, { to: "p3@x.cl", success: true }]);
  });

  it("parte las listas grandes en llamadas de 100", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    const many = Array.from({ length: EMAIL_BATCH_MAX + 30 }, (_, i) => mail(i));

    const r = await sendMarketingEmailBatch(many);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(0)).toHaveLength(EMAIL_BATCH_MAX);
    expect(body(1)).toHaveLength(30);
    expect(r.every((x) => x.success)).toBe(true);
  });

  it("si Resend rechaza el lote, reenvía de a uno para aislar al correo malo", async () => {
    fetchMock.mockImplementation(async (url: string, init: { body: string }) => {
      if (url.endsWith("/emails/batch")) return { ok: false, status: 422, text: async () => "invalid" };
      return JSON.parse(init.body).to === "p2@x.cl" ? { ok: false, status: 422, text: async () => "bad" } : { ok: true, status: 200, text: async () => "" };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await sendMarketingEmailBatch([mail(1), mail(2)]);

    expect(r.map((x) => x.success)).toEqual([true, false]);
  });

  it("sin clave de Resend no manda nada", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await sendMarketingEmailBatch([mail(1)]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toEqual([{ to: "p1@x.cl", success: false, reason: "No API configured" }]);
  });
});

describe("resendTagValue", () => {
  it("deja solo letras, números, guion y guion bajo", () => {
    expect(resendTagValue("Último día — 2º Aniversario!")).toBe("Ultimo-dia-2-Aniversario");
    expect(resendTagValue("###")).toBe("x");
  });
});
