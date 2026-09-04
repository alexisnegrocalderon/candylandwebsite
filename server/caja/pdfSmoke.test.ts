import { describe, expect, it } from "vitest";
import { buildPnlReportPdf } from "./pnlPdf";
import { buildMovementsPdf } from "./movementsPdf";
import { buildVentasReportPdf } from "./reportsPdf";

/* Los PDF se arman a mano con pdfkit, así que un error de dibujo (una fila
 * sin columna, un número que llega null, una tabla vacía) revienta recién al
 * pedir la descarga. Estos casos confirman que cada reporte se genera de
 * punta a punta con los datos que puede recibir de verdad, incluidos los
 * bordes: un evento sin ventas, sin gastos y sin movimientos. */

const pnlBase = {
  title: "2do Aniversario de PlayRoom",
  eventDate: new Date("2026-10-30T21:00:00-03:00"),
  monthKey: "2026-10",
  ivaApplies: true,
  cogsCoverage: 80,
  grossIncome: 4477500,
  cogs: 763600,
  directExpensesTotal: 1200000,
  directByCategory: [
    { category: "produccion", amount: 800000 },
    { category: "barra", amount: 400000 },
  ],
  generalExpensesMonthTotal: 300000,
  generalExpensesAssigned: 150000,
  prorationWeight: 0.5,
  ambassadorCommissions: 90000,
  iva: { debitoFiscal: 714800, creditoFiscal: 200000, ivaAPagar: 514800, remanenteCredito: 0 },
  netIncome: 3762700,
  netProfit: 1559100,
  marginPercent: 41.4,
  warnings: ["La mercadería puede estar contada dos veces."],
};

const esPdf = (buf: Buffer) => buf.subarray(0, 5).toString() === "%PDF-";

describe("PDF de resultado (P&L)", () => {
  it("genera un PDF válido con datos completos", async () => {
    const pdf = await buildPnlReportPdf(pnlBase);
    expect(esPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("una fiesta con pérdida también se genera", async () => {
    const pdf = await buildPnlReportPdf({ ...pnlBase, netProfit: -320000, marginPercent: -8.5 });
    expect(esPdf(pdf)).toBe(true);
  });

  it("un evento que no declara IVA salta esa sección sin romperse", async () => {
    const pdf = await buildPnlReportPdf({ ...pnlBase, ivaApplies: false });
    expect(esPdf(pdf)).toBe(true);
  });

  it("un evento vacío, sin gastos ni avisos, no revienta", async () => {
    const pdf = await buildPnlReportPdf({
      ...pnlBase,
      grossIncome: 0, cogs: 0, directExpensesTotal: 0, directByCategory: [],
      generalExpensesAssigned: 0, ambassadorCommissions: 0,
      netIncome: 0, netProfit: 0, marginPercent: null, warnings: [],
    });
    expect(esPdf(pdf)).toBe(true);
  });
});

describe("PDF de movimientos", () => {
  const row = {
    type: "sale",
    operatorName: "Cata",
    registerId: 1,
    targetType: "order",
    targetId: "777",
    result: "applied",
    conflictNote: null,
    serverAt: new Date("2026-10-31T01:30:00Z"),
  };

  it("genera un PDF con movimientos de varios tipos", async () => {
    const pdf = await buildMovementsPdf("2do Aniversario", [
      row,
      { ...row, type: "shift_open", targetType: "shift", targetId: "3" },
      { ...row, type: "void_code", result: "rejected", conflictNote: "Código ya usado" },
      { ...row, type: "manual_adjust", operatorName: "Supervisor" },
      // Un tipo desconocido no puede romper el reporte: cae al nombre crudo.
      { ...row, type: "tipo_nuevo_que_no_existe_todavia" },
    ]);
    expect(esPdf(pdf)).toBe(true);
  });

  it("un evento sin movimientos genera igual un PDF que lo dice", async () => {
    const pdf = await buildMovementsPdf("Evento nuevo", []);
    expect(esPdf(pdf)).toBe(true);
  });

  it("aguanta campos nulos del ledger", async () => {
    const pdf = await buildMovementsPdf("Evento", [
      { ...row, registerId: null, targetType: null, targetId: null },
    ]);
    expect(esPdf(pdf)).toBe(true);
  });
});

describe("PDF de ventas", () => {
  const producto = { name: "Piscola", category: "consumo", unitsSold: 120, revenue: 600000, cost: 216000, profit: 384000, marginPercent: 64 };
  const breakdown = {
    web: { total: 3000000, count: 120, byMethod: [{ method: "tarjeta", count: 120, total: 3000000 }] },
    caja: { total: 1477500, count: 300, byMethod: [
      { method: "efectivo", count: 100, total: 177000 },
      { method: "debito", count: 180, total: 1100000 },
      { method: "qr", count: 20, total: 200500 },
    ] },
    total: 4477500,
  };

  it("genera el PDF con el desglose por canal y medio de pago", async () => {
    const pdf = await buildVentasReportPdf("2do Aniversario", [producto], breakdown);
    expect(esPdf(pdf)).toBe(true);
  });

  it("sigue funcionando sin desglose (compatibilidad con el llamado viejo)", async () => {
    const pdf = await buildVentasReportPdf("2do Aniversario", [producto]);
    expect(esPdf(pdf)).toBe(true);
  });

  it("un producto sin costo cargado no rompe la tabla", async () => {
    const pdf = await buildVentasReportPdf("Evento", [
      { ...producto, cost: null, profit: null, marginPercent: null },
    ], breakdown);
    expect(esPdf(pdf)).toBe(true);
  });

  it("un evento sin ventas genera igual un PDF", async () => {
    const pdf = await buildVentasReportPdf("Evento nuevo", [], null);
    expect(esPdf(pdf)).toBe(true);
  });
});
