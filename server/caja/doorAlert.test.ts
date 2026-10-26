import { describe, expect, it } from "vitest";
import { ops } from "../../drizzle/schema";
import { recordDoorAlert } from "./doorAlert";

function fakeDb(existing = false) {
  const ledger: Record<string, unknown>[] = [];
  return {
    ledger,
    select: () => { const b: any = { from: () => b, where: () => b, limit: async () => (existing ? [{ result: "applied" }] : []) }; return b; },
    insert: (t: unknown) => ({ values: async (v: Record<string, unknown>) => { if (t === ops) ledger.push(v); } }),
  };
}
const base = { opId: "alert-12345678", eventId: 10, operatorId: 5, operatorName: "Eduardo", reason: "emergencia" as const, clientAt: new Date() };

describe("recordDoorAlert", () => {
  it("queda en el ledger como nota y devuelve el push para los organizadores", async () => {
    const db = fakeDb();
    const push = await recordDoorAlert(db, { ...base, note: "pelea en la fila", ticketCode: "mp-1", buyerName: "Ana" });
    expect(db.ledger[0]).toMatchObject({ id: "alert-12345678", type: "note", targetId: "MP-1", payload: { kind: "door_alert", reason: "emergencia", note: "pelea en la fila" } });
    expect(push.title).toBe("🚨 Puerta: Emergencia");
    expect(push.body).toContain("Eduardo");
    expect(push.body).toContain("Ana");
  });
  it("reenviar el mismo opId no duplica el registro", async () => {
    const db = fakeDb(true);
    await recordDoorAlert(db, base);
    expect(db.ledger).toHaveLength(0);
  });
});
