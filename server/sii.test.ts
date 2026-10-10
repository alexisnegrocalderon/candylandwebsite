import { describe, expect, it } from "vitest";
import { computeF29, f29DueDateFor, normalizeSiiConfig, obligationsForYear, reminderFor, DEFAULT_SII_CONFIG } from "../shared/sii";

describe("computeF29", () => {
  it("débito, crédito y total a pagar", () => {
    const r = computeF29({ salesTaxableGross: 1_190_000, salesExempt: 0, creditoFacturas: 50_000, remanenteAnterior: 0, retencionHonorarios: 17_994, ppmRatePercent: 0.25 });
    expect(r.debito).toBe(190_000);
    expect(r.creditoTotal).toBe(50_000);
    expect(r.ivaDeterminado).toBe(140_000);
    expect(r.remanenteSiguiente).toBe(0);
    expect(r.ppmBase).toBe(1_000_000);
    expect(r.ppm).toBe(2_500);
    expect(r.total).toBe(140_000 + 17_994 + 2_500);
    expect(r.lines.find((l) => l.code === "91")?.value).toBe(r.total);
  });
  it("si el crédito supera al débito queda remanente y no se paga IVA", () => {
    const r = computeF29({ salesTaxableGross: 119_000, salesExempt: 0, creditoFacturas: 30_000, remanenteAnterior: 5_000, retencionHonorarios: 0, ppmRatePercent: null });
    expect(r.debito).toBe(19_000);
    expect(r.ivaDeterminado).toBe(0);
    expect(r.remanenteSiguiente).toBe(16_000);
    expect(r.ppm).toBeNull();
    expect(r.lines.some((l) => l.code === "062")).toBe(false);
    expect(r.total).toBe(0);
  });
  it("mes sin movimiento", () => {
    const r = computeF29({ salesTaxableGross: 0, salesExempt: 0, creditoFacturas: 0, remanenteAnterior: 0, retencionHonorarios: 0, ppmRatePercent: 0.25 });
    expect(r.sinMovimiento).toBe(true);
    expect(r.total).toBe(0);
  });
  it("las ventas exentas no generan débito pero sí entran a la base del PPM", () => {
    const r = computeF29({ salesTaxableGross: 0, salesExempt: 500_000, creditoFacturas: 0, remanenteAnterior: 0, retencionHonorarios: 0, ppmRatePercent: 1 });
    expect(r.debito).toBe(0);
    expect(r.ppmBase).toBe(500_000);
    expect(r.ppm).toBe(5_000);
  });
});

describe("plazos y calendario", () => {
  it("el F29 de octubre vence el 12 de noviembre; diciembre pasa al año siguiente", () => {
    expect(f29DueDateFor("2026-10", 12)).toBe("2026-11-12");
    expect(f29DueDateFor("2026-12", 20)).toBe("2027-01-20");
  });
  it("config por defecto y valores inválidos", () => {
    expect(normalizeSiiConfig({})).toEqual(DEFAULT_SII_CONFIG);
    expect(normalizeSiiConfig({ f29DueDay: 40, ppmRatePercent: -1, dj1879Date: "13-40" })).toMatchObject({ f29DueDay: 12, ppmRatePercent: null, dj1879Date: "03-31" });
    expect(normalizeSiiConfig({ remindersEnabled: false }).remindersEnabled).toBe(false);
  });
  it("calendario del año: 12 F29 + DJ 1879 + renta + 2 patentes", () => {
    const obs = obligationsForYear(2027, DEFAULT_SII_CONFIG);
    expect(obs.filter((o) => o.kind === "f29")).toHaveLength(12);
    expect(obs.find((o) => o.key === "f29:2026-12")?.dueDate).toBe("2027-01-12");
    expect(obs.find((o) => o.kind === "dj1879")?.dueDate).toBe("2027-03-31");
    expect(obs).toHaveLength(16);
  });
  it("avisos: 5 días, 1 día, el mismo día, vencido y el día 1", () => {
    const o = { key: "f29:2026-10", kind: "f29" as const, title: "F29", dueDate: "2026-11-12", period: "2026-10" };
    expect(reminderFor("2026-11-07", o, false)).toBe("5dias");
    expect(reminderFor("2026-11-11", o, false)).toBe("1dia");
    expect(reminderFor("2026-11-12", o, false)).toBe("hoy");
    expect(reminderFor("2026-11-14", o, false)).toBe("vencido");
    expect(reminderFor("2026-11-01", o, false)).toBe("inicio");
    expect(reminderFor("2026-11-12", o, true)).toBeNull();
    expect(reminderFor("2026-11-09", o, false)).toBeNull();
  });
});

import { aggregateMonthSales } from "../shared/sii";
describe("aggregateMonthSales (qué entra al F29)", () => {
  const evs = new Map([
    [1, { title: "Aniversario", taxIssuer: "mansion" }],
    [2, { title: "Fiesta en Club X", taxIssuer: "tercero", taxNote: "factura el local" }],
    [3, { title: "Evento cultural", taxIssuer: "exento" }],
    [4, { title: "Sin definir", taxIssuer: "por_revisar" }],
  ]);
  const sales = [
    { orderId: 1, eventId: 1, amount: 119_000, accesoAmount: 100_000 },
    { orderId: 2, eventId: 2, amount: 50_000 },
    { orderId: 3, eventId: 3, amount: 30_000 },
    { orderId: 4, eventId: 4, amount: 20_000 },
  ];
  it("solo lo que factura Mansion es afecto; exentos aparte; tercero y por revisar quedan fuera", () => {
    const r = aggregateMonthSales(sales, evs, false);
    expect(r.taxableGross).toBe(119_000);
    expect(r.exempt).toBe(30_000);
    expect(r.byEvent.map((e) => e.issuer)).toEqual(["mansion", "tercero", "exento", "por_revisar"]);
  });
  it("con entradas exentas, la parte de entradas sale de lo afecto", () => {
    const r = aggregateMonthSales(sales, evs, true);
    expect(r.taxableGross).toBe(19_000);
    expect(r.exempt).toBe(100_000 + 30_000);
  });
});
