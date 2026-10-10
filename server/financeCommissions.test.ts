import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(), getPnlComparison: vi.fn(), getParkingReport: vi.fn() }));
import * as db from "./db";
import { groupCommissionsByEvent, markCommissionsPaid } from "./financeCompany";

const now = new Date("2026-10-10T12:00:00Z");
const rows = [
  { ambassadorId: 1, name: "Sofía", amount: "10000", paidAt: null, eventId: 10, eventTitle: "Halloween 2025", eventDate: "2025-10-31T22:00:00Z" },
  { ambassadorId: 1, name: "Sofía", amount: "5000", paidAt: new Date(), eventId: 10, eventTitle: "Halloween 2025", eventDate: "2025-10-31T22:00:00Z" },
  { ambassadorId: 1, name: "Sofía", amount: "20000", paidAt: null, eventId: 20, eventTitle: "2do Aniversario", eventDate: "2026-10-30T22:00:00Z" },
  { ambassadorId: 2, name: "Camila", amount: "8000", paidAt: null, eventId: 20, eventTitle: "2do Aniversario", eventDate: "2026-10-30T22:00:00Z" },
];

describe("groupCommissionsByEvent", () => {
  const groups = groupCommissionsByEvent(rows as any, now);
  it("separa cada evento y no mezcla sus montos", () => {
    expect(groups.map((g) => g.eventTitle)).toEqual(["2do Aniversario", "Halloween 2025"]);
    const aniv = groups[0];
    expect(aniv.pending).toBe(28000);
    expect(aniv.paid).toBe(0);
    const hall = groups[1];
    expect(hall.pending).toBe(10000);
    expect(hall.paid).toBe(5000);
  });
  it("marca como futuro el evento que aún no ocurre", () => {
    expect(groups[0].isFuture).toBe(true);
    expect(groups[1].isFuture).toBe(false);
  });
  it("agrupa por embajador dentro del evento", () => {
    expect(groups[0].ambassadors.map((a) => [a.name, a.pending])).toEqual([["Sofía", 20000], ["Camila", 8000]]);
  });
});

describe("markCommissionsPaid", () => {
  beforeEach(() => vi.clearAllMocks());
  const conn = (eventDate: Date) => {
    const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) }));
    return { update, select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ eventDate, title: "2do Aniversario" }]) }) }) }) };
  };
  it("no deja marcar pagado un evento futuro sin confirmación", async () => {
    const c = conn(new Date(Date.now() + 20 * 86_400_000));
    vi.mocked(db.getDb).mockResolvedValue(c as any);
    await expect(markCommissionsPaid({ ambassadorId: 1, eventId: 20, paid: true })).rejects.toThrow(/todavía no ocurre/);
    expect(c.update).not.toHaveBeenCalled();
  });
  it("lo permite con confirmación explícita", async () => {
    const c = conn(new Date(Date.now() + 20 * 86_400_000));
    vi.mocked(db.getDb).mockResolvedValue(c as any);
    await markCommissionsPaid({ ambassadorId: 1, eventId: 20, paid: true, confirmFuture: true });
    expect(c.update).toHaveBeenCalledTimes(1);
  });
  it("un evento pasado se marca sin trabas", async () => {
    const c = conn(new Date(Date.now() - 5 * 86_400_000));
    vi.mocked(db.getDb).mockResolvedValue(c as any);
    await markCommissionsPaid({ ambassadorId: 1, eventId: 10, paid: true });
    expect(c.update).toHaveBeenCalledTimes(1);
  });
});
