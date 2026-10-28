import { describe, expect, it, vi } from "vitest";
import { findCustomersForCaja } from "./customerFilters";

function fakeDb(rows: any[]) {
  const chain: any = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => rows };
  return { select: () => chain };
}

describe("findCustomersForCaja", () => {
  it("deja fuera los correos marcador", async () => {
    const res = await findCustomersForCaja(fakeDb([
      { email: "ana@test.cl", fullName: "Ana", playcoins: 10 },
      { email: "caja@mansionplayroom.cl", fullName: null, playcoins: 0 },
      { email: "Invitacion@mansionplayroom.cl", fullName: null, playcoins: 0 },
    ]), "ana");
    expect(res).toEqual([{ email: "ana@test.cl", fullName: "Ana", playcoins: 10 }]);
  });
});

import { quickSearchCustomers, quickSearchTerms } from "./customerFilters";

describe("quickSearchTerms", () => {
  it("pide al menos 2 caracteres", () => {
    expect(quickSearchTerms("a")).toBeNull();
    expect(quickSearchTerms("  ")).toBeNull();
    expect(quickSearchTerms("jo")).toMatchObject({ pattern: "%jo%", digits: null });
  });
  it("busca el teléfono por sus dígitos solo si el texto es un número", () => {
    expect(quickSearchTerms("+56 9 1234")?.digits).toBe("%5691234%");
    expect(quickSearchTerms("ana 123")?.digits).toBeNull();
    expect(quickSearchTerms("12")?.digits).toBeNull();
  });
  it("escapa los comodines de LIKE", () => {
    expect(quickSearchTerms("50%_off")?.pattern).toBe("%50\\%\\_off%");
  });
});

describe("quickSearchCustomers", () => {
  const chainOf = (rows: any[], fail = false) => {
    const chain: any = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => { if (fail) throw new Error("Unsupported collation"); return rows; } };
    return chain;
  };
  it("devuelve hasta 8 y sin correos marcador", async () => {
    const rows = [{ id: 0, email: "invitacion@mansionplayroom.cl", fullName: null, phone: null, lastSeenAt: null },
      ...Array.from({ length: 10 }, (_, i) => ({ id: i + 1, email: `p${i}@t.cl`, fullName: `P ${i}`, phone: null, lastSeenAt: null }))];
    const res = await quickSearchCustomers({ select: () => chainOf(rows) }, "p");
    expect(res).toEqual([]);
    const res2 = await quickSearchCustomers({ select: () => chainOf(rows) }, "p0");
    expect(res2).toHaveLength(8);
    expect(res2.some((r) => r.email.startsWith("invitacion"))).toBe(false);
  });
  it("si la base no acepta la collation sin tildes, busca igual", async () => {
    let calls = 0;
    const db = { select: () => chainOf([{ id: 1, email: "jose@t.cl", fullName: "José", phone: null, lastSeenAt: null }], calls++ === 0) };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await quickSearchCustomers(db, "jose");
    expect(res.map((r) => r.email)).toEqual(["jose@t.cl"]);
  });
});
