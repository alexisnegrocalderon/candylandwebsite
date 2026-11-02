import { describe, expect, it } from "vitest";

// Solo la parte pura: lo demás (consultas) se valida en el panel de admin. Se mockea ./db para no abrir conexión.
import { vi } from "vitest";
vi.mock("./db", () => ({ getDb: async () => null }));
const { saleOpIdOf, listSaldoCandidates, reconcileSaldoSale } = await import("./saldoReconciliation");

describe("saldoReconciliation", () => {
  it("saca el opId de la venta desde orders.paymentId", () => {
    expect(saleOpIdOf("CAJA-abc-123")).toBe("abc-123");
    expect(saleOpIdOf("FREE-MP-1")).toBeNull();
    expect(saleOpIdOf(null)).toBeNull();
  });
  it("sin base de datos no hace nada ni lanza", async () => {
    expect(await listSaldoCandidates()).toEqual([]);
    expect(await reconcileSaldoSale(1, "x")).toMatchObject({ ok: false });
  });
});
