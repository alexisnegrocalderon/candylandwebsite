import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: any[] = [];
const audits: any[] = [];
let affectedRows = 1;
let quedan = 3;
const issue = vi.fn();

vi.mock("./db", () => ({
  recordAdminAudit: async (a: any) => { audits.push(a); },
  getDb: async () => ({
    execute: async () => {},
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ staffId: 1, entradas: quedan }] }) }) }),
    insert: () => ({ values: () => ({ onDuplicateKeyUpdate: async () => {} }) }),
    update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); return [{ affectedRows }]; } }) }),
  }),
}));
vi.mock("./accessCredit", () => ({ issueGiftPass: (...a: any[]) => issue(...a) }));

const staff = { id: 1, name: "Camila", email: "camila@staff.cl" };

beforeEach(() => { updates.length = 0; audits.length = 0; affectedRows = 1; quedan = 3; issue.mockReset(); issue.mockResolvedValue({ code: "CREDITO-ABC123", creditId: 9, emailSent: true }); });

describe("cupo de entradas del staff", () => {
  it("regala un pase a elección, válido para cualquier evento y sin vencimiento", async () => {
    const { sendStaffEntrada } = await import("./staffGiftQuota");
    const r = await sendStaffEntrada({ staff, to: { email: " Ana@Cliente.cl ", name: "Ana" }, message: "Para ti" });
    expect(r).toEqual({ code: "CREDITO-ABC123", quedan: 3, emailSent: true });
    expect(issue).toHaveBeenCalledTimes(1);
    expect(issue.mock.calls[0][0]).toMatchObject({ email: "ana@cliente.cl", eventId: null, accesoSlug: "*", validUntil: null, reason: "Cupo de Camila", actor: "staff:Camila" });
    expect(updates).toHaveLength(1); // una sola resta
    expect(audits.map((a) => a.action)).toEqual(["staff.giftQuotaUse"]);
  });

  it("sin cupo no regala ni crea nada", async () => {
    affectedRows = 0;
    const { sendStaffEntrada } = await import("./staffGiftQuota");
    await expect(sendStaffEntrada({ staff, to: { email: "ana@cliente.cl" } })).rejects.toThrow(/No te quedan entradas/);
    expect(issue).not.toHaveBeenCalled();
  });

  it("si el pase falla, la entrada vuelve al cupo", async () => {
    issue.mockRejectedValue(new Error("boom"));
    const { sendStaffEntrada } = await import("./staffGiftQuota");
    await expect(sendStaffEntrada({ staff, to: { email: "ana@cliente.cl" } })).rejects.toThrow("boom");
    expect(updates).toHaveLength(2); // restó y devolvió
  });

  it("no acepta correos inválidos ni regalarse a sí misma, y no toca el cupo", async () => {
    const { sendStaffEntrada } = await import("./staffGiftQuota");
    await expect(sendStaffEntrada({ staff, to: { email: "no-es-correo" } })).rejects.toThrow(/correo válido/);
    await expect(sendStaffEntrada({ staff, to: { email: "CAMILA@staff.cl" } })).rejects.toThrow(/a ti/);
    expect(updates).toHaveLength(0);
  });

  it("el dueño fija el cupo dentro de los límites y queda en la auditoría", async () => {
    const { setQuota, STAFF_QUOTA_MAX } = await import("./staffGiftQuota");
    expect(await setQuota(1, 5, { by: "dueño" })).toBe(5);
    expect(await setQuota(1, -4, { by: "dueño" })).toBe(0);
    expect(await setQuota(1, 99999, { by: "dueño" })).toBe(STAFF_QUOTA_MAX);
    expect(audits.filter((a) => a.action === "staff.giftQuotaSet")).toHaveLength(3);
  });
});
