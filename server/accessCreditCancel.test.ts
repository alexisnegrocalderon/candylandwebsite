import { beforeEach, describe, expect, it, vi } from "vitest";

let credit: any;
let affected = 1;
const updates: any[] = [];
const audits: any[] = [];

vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (credit ? [credit] : []) }) }) }),
    update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); return [{ affectedRows: affected }]; } }) }),
  }),
  recordAdminAudit: async (a: any) => { audits.push(a); },
  addCustomerTag: async () => {},
  ensureCustomerIdForEmail: async () => 1,
}));
vi.mock("./email", () => ({ buildAccessCreditEmail: () => "", buildGiftPassEmail: () => "", sendEmail: async () => ({ success: true }) }));
vi.mock("./customerPush", () => ({ pushToEmail: async () => {} }));
vi.mock("./emailLayout", () => ({ EMAIL_BASE_URL: "https://app.test" }));

const base = () => ({ id: 3, code: "CREDITO-AAA111", originOrderId: 50, originEventId: 2, status: "available", usedOrderId: null, reservedAt: null, buyerEmail: "ana@x.cl", note: "Dejado para otra fecha (orden ORD-50)" });

beforeEach(() => { credit = base(); affected = 1; updates.length = 0; audits.length = 0; });

describe("anular una entrada pendiente", () => {
  it("anula una disponible, guarda el motivo en la nota y queda en la auditoría", async () => {
    const { cancelPendingCredit } = await import("./accessCredit");
    await cancelPendingCredit(3, "Devolución por transferencia", { by: "contacto@x.cl" });
    expect(updates[0]).toMatchObject({ status: "cancelled" });
    expect(updates[0].note).toMatch(/Dejado para otra fecha.*Anulada.*Devolución por transferencia/);
    expect(audits[0]).toMatchObject({ action: "accessCredit.cancel", payload: { code: "CREDITO-AAA111", reason: "Devolución por transferencia" } });
  });

  it("exige un motivo", async () => {
    const { cancelPendingCredit } = await import("./accessCredit");
    await expect(cancelPendingCredit(3, " a ", { by: "x" })).rejects.toThrow(/motivo/);
    expect(updates).toHaveLength(0);
  });

  it("no anula una que ya se usó", async () => {
    credit.status = "used";
    const { cancelPendingCredit } = await import("./accessCredit");
    await expect(cancelPendingCredit(3, "devolución", { by: "x" })).rejects.toThrow(/ya se usó/);
    expect(updates).toHaveLength(0);
  });

  it("no anula una que alguien está comprando ahora mismo (reservada)", async () => {
    credit.status = "reserved"; credit.usedOrderId = null; credit.reservedAt = new Date();
    const { cancelPendingCredit } = await import("./accessCredit");
    await expect(cancelPendingCredit(3, "devolución", { by: "x" })).rejects.toThrow(/no se puede anular/);
    expect(updates).toHaveLength(0);
  });

  it("si cambió justo antes de anular (alguien la canjeó), avisa y no audita", async () => {
    affected = 0;
    const { cancelPendingCredit } = await import("./accessCredit");
    await expect(cancelPendingCredit(3, "devolución", { by: "x" })).rejects.toThrow(/cambió justo ahora/);
    expect(audits).toHaveLength(0);
  });

  it("no toca los pases regalados ni los premios (sin compra de origen)", async () => {
    const { cancelPendingCredit } = await import("./accessCredit");
    credit.originOrderId = 0;
    await expect(cancelPendingCredit(3, "devolución", { by: "x" })).rejects.toThrow(/No encontré/);
    credit = { ...base(), note: JSON.stringify({ gift: 1, eventId: null, eventTitle: null, validUntil: null, reason: null, by: "x" }) };
    await expect(cancelPendingCredit(3, "devolución", { by: "x" })).rejects.toThrow(/No encontré/);
    expect(updates).toHaveLength(0);
  });

  it("anular una ya anulada no hace nada", async () => {
    credit.status = "cancelled";
    const { cancelPendingCredit } = await import("./accessCredit");
    await cancelPendingCredit(3, "devolución", { by: "x" });
    expect(updates).toHaveLength(0);
  });
});
