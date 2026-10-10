import { describe, expect, it } from "vitest";
import { costChecklistSummary, EVENT_COST_SLOTS } from "../shared/eventCostSlots";

describe("costChecklistSummary", () => {
  it("sin gastos: todo pendiente y sin arriendo", () => {
    const r = costChecklistSummary([]);
    expect(r.pendingSlots).toHaveLength(EVENT_COST_SLOTS.length);
    expect(r.hasVenueRent).toBe(false);
    expect(r.total).toBe(0);
  });
  it("marca lo cargado y separa con/sin factura", () => {
    const r = costChecklistSummary([
      { slotKey: "arriendo", amountTotal: 595_000, documentType: "factura", ivaAmount: 95_000 },
      { slotKey: "barra", amountTotal: 119_000, documentType: "boleta", ivaAmount: 0 },
      { slotKey: null, amountTotal: 50_000, documentType: "sin_documento", ivaAmount: 0 },
      { slotKey: "dj", amountTotal: 100_000, documentType: "boleta_honorarios", ivaAmount: 0 },
    ]);
    expect(r.hasVenueRent).toBe(true);
    expect(r.slots.find((s) => s.key === "arriendo")).toMatchObject({ loaded: true, total: 595_000 });
    expect(r.pendingSlots).not.toContain("dj");
    expect(r.total).toBe(864_000);
    expect(r.conFacturaTotal).toBe(595_000);
    expect(r.ivaRecuperado).toBe(95_000);
    expect(r.sinFacturaTotal).toBe(169_000);
    // 19/119 de 119.000 + 19/119 de 50.000 (los honorarios no llevan IVA)
    expect(r.ivaPerdido).toBe(19_000 + 7_983);
  });
  it("una factura exenta no cuenta como IVA recuperado", () => {
    const r = costChecklistSummary([{ slotKey: "arriendo", amountTotal: 500_000, documentType: "factura", ivaAmount: 0, ivaExempt: 1 }]);
    expect(r.ivaRecuperado).toBe(0);
    expect(r.conFacturaTotal).toBe(0);
  });
});
