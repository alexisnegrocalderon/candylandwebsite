import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(), getFeaturedEvent: vi.fn() }));
import * as db from "./db";
import { exclusiveAmbassadors, ambassadorCommissions } from "../drizzle/schema";
import { getAmbassadorRanking, summarizeSalesByEvent } from "./ambassadorProgram";

const commission = (id: number, ambassadorId: number, eventId: number, clientType = "exclusivo", amount = 1000) => ({
  id, ambassadorId, eventId, clientType, baseAmount: "10000", commissionAmount: String(amount), monthKey: "2026-10",
});

function fakeDb(tables: Map<unknown, any[]>) {
  return {
    select: () => ({
      from: (t: unknown) => {
        const p: any = Promise.resolve(tables.get(t) ?? []);
        p.orderBy = () => p;
        p.where = () => p;
        return p;
      },
    }),
  };
}

describe("ranking por evento", () => {
  it("dos eventos del mismo mes no se mezclan", async () => {
    const tables = new Map<unknown, any[]>([
      [exclusiveAmbassadors, [{ id: 1, name: "Sofía", code: "SOFI", active: 1 }, { id: 2, name: "Camila", code: "CAMI", active: 1 }]],
      [ambassadorCommissions, [
        commission(1, 1, 10), commission(2, 1, 10), commission(3, 1, 10),   // Sofía: 3 en el evento 10
        commission(4, 1, 20),                                                // Sofía: 1 en el evento 20 (mismo mes)
        commission(5, 2, 20), commission(6, 2, 20),                          // Camila: 2 en el evento 20
      ]],
    ]);
    vi.mocked(db.getDb).mockResolvedValue(fakeDb(tables) as any);

    const ev10 = await getAmbassadorRanking(10);
    expect(ev10[0]).toMatchObject({ name: "Sofía", exclusiveSales: 3, position: 1 });
    expect(ev10.find((r) => r.name === "Camila")?.exclusiveSales).toBe(0);

    const ev20 = await getAmbassadorRanking(20);
    expect(ev20[0]).toMatchObject({ name: "Camila", exclusiveSales: 2, position: 1 });
    expect(ev20.find((r) => r.name === "Sofía")?.exclusiveSales).toBe(1);
    // El histórico total sí junta todos los eventos
    expect(ev20.find((r) => r.name === "Sofía")?.totalCommission).toBe(4000);
  });
});

describe("summarizeSalesByEvent", () => {
  it("suma ventas y comisión de cada evento por separado", () => {
    const out = summarizeSalesByEvent([
      { eventId: 10, eventTitle: "Halloween", commissionAmount: 3000 },
      { eventId: 10, eventTitle: "Halloween", commissionAmount: 2000 },
      { eventId: 20, eventTitle: "Aniversario", commissionAmount: 4000 },
    ]);
    expect(out).toEqual([
      { eventId: 10, eventTitle: "Halloween", sales: 2, commission: 5000 },
      { eventId: 20, eventTitle: "Aniversario", sales: 1, commission: 4000 },
    ]);
  });
});
