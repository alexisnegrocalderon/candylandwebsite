import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: any[] = [];
const pushes: any[] = [];
const emails: any[] = [];

vi.mock("./db", () => ({
  getDb: async () => ({
    insert: () => ({ values: async (v: any) => { inserted.push(v); } }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 5 }] }) }) }),
  }),
  recordAdminAudit: async () => {},
  addCustomerTag: async () => {},
  ensureCustomerIdForEmail: async () => 1,
}));
vi.mock("./email", () => ({
  buildAccessCreditEmail: () => "", buildGiftPassEmail: (d: any) => JSON.stringify(d),
  sendEmail: async (m: any) => { emails.push(m); return { success: true }; },
}));
vi.mock("./customerPush", () => ({ pushToEmail: async (...a: any[]) => { pushes.push(a); } }));
vi.mock("./emailLayout", () => ({ EMAIL_BASE_URL: "https://app.test" }));

beforeEach(() => { inserted.length = 0; pushes.length = 0; emails.length = 0; });

describe("pase para cualquier evento", () => {
  it("se guarda sin evento propio y le avisa a la persona", async () => {
    const { issueGiftPass } = await import("./accessCredit");
    const { parseGiftNote } = await import("../shared/accessCredit");
    const r = await issueGiftPass({ email: "Ana@Cliente.cl", name: "Ana", eventId: null, accesoSlug: "*", validUntil: null, actor: "staff:Camila", reason: "Cupo de Camila" });
    expect(r.emailSent).toBe(true);
    expect(inserted[0]).toMatchObject({ accesoSlug: "*", originOrderId: 0, originEventId: 0, buyerEmail: "ana@cliente.cl" });
    expect(parseGiftNote(inserted[0].note)).toMatchObject({ eventId: null, eventTitle: null, validUntil: null });
    expect(pushes[0][1].body).toMatch(/cualquier evento/);
    expect(emails[0].subject).toMatch(/evento que quieras/);
  });

  it("solo puede ser «a elección»: un acceso fijo es de un evento", async () => {
    const { issueGiftPass } = await import("./accessCredit");
    await expect(issueGiftPass({ email: "a@b.cl", eventId: null, accesoSlug: "duo", validUntil: null, actor: "x" })).rejects.toThrow(/a elección/);
    expect(inserted).toHaveLength(0);
  });
});
