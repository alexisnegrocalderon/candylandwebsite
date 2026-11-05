import { beforeEach, describe, expect, it, vi } from "vitest";

// Una base de mentira: cada tabla devuelve sus filas, sin importar los filtros (los filtros son SQL; aquí se prueba la lógica).
let credits: any[] = [];
let eventRows: any[] = [];
const tableName = (t: any) => Object.getOwnPropertySymbols(t).map((s) => String(t[s])).join("") || "";
vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => ({
      from: (table: any) => {
        const rows = () => {
          const cols = Object.keys(table);
          if (cols.includes("accesoSlug")) return credits;
          if (cols.includes("eventDate") || cols.includes("slug")) return eventRows;
          return [];
        };
        const chain: any = { where: () => chain, orderBy: () => chain, limit: () => chain, then: (res: any) => Promise.resolve(rows()).then(res) };
        return chain;
      },
    }),
  }),
  recordAdminAudit: async () => {}, addCustomerTag: async () => {}, ensureCustomerIdForEmail: async () => 1,
}));
vi.mock("./email", () => ({ buildAccessCreditEmail: () => "", buildGiftPassEmail: () => "", sendEmail: async () => ({ success: true }) }));
vi.mock("./customerPush", () => ({ pushToEmail: async () => 0 }));
vi.mock("./emailLayout", () => ({ EMAIL_BASE_URL: "https://app.test" }));
void tableName;

const anyEventNote = JSON.stringify({ gift: 1, eventId: null, eventTitle: null, validUntil: null, reason: "Desde el Asistente IA", message: null });
const credit = (over: any = {}) => ({ id: 1, code: "CREDITO-ABC123", accesoSlug: "*", accesoName: "Acceso a tu elección", buyerEmail: "admin@mansionplayroom.cl", buyerName: "Alexis", originOrderId: 0, originEventId: 0, status: "available", usedOrderId: null, reservedAt: null, note: anyEventNote, createdAt: new Date(), ...over });

beforeEach(() => { credits = []; eventRows = []; });

describe("Cupones: pases regalados para cualquier evento", () => {
  it("un pase sin evento aparece en los cupones de la persona, con el próximo evento para usarlo", async () => {
    credits = [credit()];
    eventRows = [{ id: 7, slug: "navidad", title: "Navidad", eventDate: new Date("2026-12-20") }];
    const { listMyGiftPasses } = await import("./accessCredit");
    const r = await listMyGiftPasses("Admin@MansionPlayroom.cl");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ code: "CREDITO-ABC123", anyAccess: true, anyEvent: true, eventId: null, eventTitle: null, eventSlug: "navidad", validUntil: null });
  });

  it("sin eventos a la venta igual aparece (con el código, para elegir evento)", async () => {
    credits = [credit()];
    const { listMyGiftPasses } = await import("./accessCredit");
    const r = await listMyGiftPasses("admin@mansionplayroom.cl");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ anyEvent: true, eventSlug: null });
  });

  it("un pase anulado o usado no aparece, y uno vencido tampoco", async () => {
    credits = [credit({ id: 1, status: "cancelled" }), credit({ id: 2, status: "used" }), credit({ id: 3, note: JSON.stringify({ gift: 1, eventId: null, eventTitle: null, validUntil: "2020-01-01T00:00:00.000Z" }) })];
    const { listMyGiftPasses } = await import("./accessCredit");
    expect(await listMyGiftPasses("admin@mansionplayroom.cl")).toEqual([]);
  });
});
