import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordEmailEvent = vi.fn(async (_e: unknown) => true);
const applyEmailOptOut = vi.fn(async (_e: string, _r?: string) => true);
vi.mock("./db", () => ({ recordEmailEvent: (e: unknown) => recordEmailEvent(e) }));
vi.mock("./unsubscribe", () => ({ applyEmailOptOut: (e: string, r?: string) => applyEmailOptOut(e, r) }));

const { verifySvixSignature, handleResendEvent } = await import("./resendWebhook");

const secret = "whsec_" + Buffer.from("clave-de-prueba-1234567890").toString("base64");
const sign = (id: string, ts: string, body: string) =>
  "v1," + crypto.createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64");

describe("firma de Svix", () => {
  const body = '{"type":"email.delivered"}';
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);

  it("acepta una firma válida", () => {
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(true);
  });
  it("acepta si una de varias firmas es la buena", () => {
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,AAAA ${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
  });
  it("rechaza si el cuerpo cambió", () => {
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body + " ", now)).toBe(false);
  });
  it("rechaza una firma de otra clave, y avisos viejos (anti-repetición)", () => {
    expect(verifySvixSignature("whsec_" + Buffer.from("otra").toString("base64"), { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now)).toBe(false);
    expect(verifySvixSignature(secret, { id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body) }, body, now + 10 * 60_000)).toBe(false);
  });
  it("rechaza si falta algo", () => {
    expect(verifySvixSignature("", { id: "a", timestamp: ts, signature: "v1,x" }, body, now)).toBe(false);
    expect(verifySvixSignature(secret, { id: "a", timestamp: ts }, body, now)).toBe(false);
  });
});

describe("avisos de Resend", () => {
  beforeEach(() => { recordEmailEvent.mockClear(); applyEmailOptOut.mockClear(); recordEmailEvent.mockResolvedValue(true); });
  const ev = (type: string, extra: object = {}) => ({ type, data: { email_id: "re_1", to: ["Ana@X.cl"], tags: { campaign: "ultimo-dia", variant: "B" }, ...extra } });

  it("guarda el aviso con su campaña y variante", async () => {
    await handleResendEvent("msg_1", ev("email.clicked", { click: { link: "https://x.cl/checkout" } }));
    expect(recordEmailEvent).toHaveBeenCalledWith(expect.objectContaining({ svixId: "msg_1", type: "clicked", email: "Ana@X.cl", campaign: "ultimo-dia", variant: "B", url: "https://x.cl/checkout" }));
    expect(applyEmailOptOut).not.toHaveBeenCalled();
  });
  it("lee las etiquetas también como lista", async () => {
    await handleResendEvent("msg_2", { type: "email.opened", data: { to: ["a@x.cl"], tags: [{ name: "campaign", value: "c" }, { name: "variant", value: "A" }] } });
    expect(recordEmailEvent).toHaveBeenCalledWith(expect.objectContaining({ campaign: "c", variant: "A" }));
  });
  it("un rebote permanente da de baja al correo", async () => {
    const r = await handleResendEvent("msg_3", ev("email.bounced", { bounce: { type: "Permanent" } }));
    expect(applyEmailOptOut).toHaveBeenCalledWith("Ana@X.cl", expect.stringContaining("rebot"));
    expect(r.optedOut).toBe(true);
  });
  it("un rebote temporal no da de baja", async () => {
    await handleResendEvent("msg_4", ev("email.bounced", { bounce: { type: "Transient" } }));
    expect(applyEmailOptOut).not.toHaveBeenCalled();
  });
  it("una queja de spam da de baja", async () => {
    await handleResendEvent("msg_5", ev("email.complained"));
    expect(applyEmailOptOut).toHaveBeenCalledWith("Ana@X.cl", expect.stringContaining("spam"));
  });
  it("un aviso repetido (Resend reintenta) no vuelve a actuar", async () => {
    recordEmailEvent.mockResolvedValue(false);
    await handleResendEvent("msg_6", ev("email.complained"));
    expect(applyEmailOptOut).not.toHaveBeenCalled();
  });
  it("ignora los tipos que no maneja", async () => {
    const r = await handleResendEvent("msg_7", ev("email.sent"));
    expect(r).toEqual({ recorded: false, optedOut: false });
    expect(recordEmailEvent).not.toHaveBeenCalled();
  });
});
