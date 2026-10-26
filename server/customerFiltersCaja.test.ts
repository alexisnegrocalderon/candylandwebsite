import { describe, expect, it } from "vitest";
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
