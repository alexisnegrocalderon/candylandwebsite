import PDFDocument from "pdfkit";
import { formatChileDateTime } from "../../shared/chileDate";
import { money, INK, MUTED, GREEN, RED, drawTable, drawBarChart } from "./pdfHelpers";

export type ShiftCloseReport = {
  eventTitle: string;
  registerName: string;
  operatorName: string;
  openedAt: Date;
  closedAt: Date;
  openingCash: number;
  countedCash: number;
  countedDebit: number;
  countedCredit: number;
  countedQr: number;
  expectedCash: number;
  expectedDebit: number;
  expectedCredit: number;
  expectedQr: number;
  cashDiff: number;
  debitDiff: number;
  creditDiff: number;
  qrDiff: number;
  salesCount: number;
  redeemsCount: number;
  shiftProducts: { name: string; quantity: number; revenue: number }[];
};

type PaymentRow = { label: string; counted: number; expected: number; diff: number };

function paymentRows(r: ShiftCloseReport): PaymentRow[] {
  const rows: PaymentRow[] = [
    { label: "Efectivo", counted: r.countedCash, expected: r.expectedCash + r.openingCash, diff: r.cashDiff },
    { label: "Débito", counted: r.countedDebit, expected: r.expectedDebit, diff: r.debitDiff },
    { label: "Crédito", counted: r.countedCredit, expected: r.expectedCredit, diff: r.creditDiff },
  ];
  if (r.countedQr || r.expectedQr) {
    rows.push({ label: "QR / Transferencia", counted: r.countedQr, expected: r.expectedQr, diff: r.qrDiff });
  }
  return rows;
}

/** PDF de cuadre de caja adjuntado al email de cierre de turno (pedido
 * explícito del usuario): lista de ventas por producto DEL TURNO, gráfico de
 * contado-vs-esperado, y el cuadre final por medio de pago -- para revisarlo
 * in situ con la cajera antes de que se vaya. */
export function buildShiftClosePdf(report: ShiftCloseReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor(INK).text(`Cierre de turno — ${report.eventTitle}`);
    doc.fontSize(11).fillColor(MUTED).text(
      `${report.registerName} · ${report.operatorName} · ${formatChileDateTime(report.closedAt)}`
    );
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(MUTED).text(
      `Turno abierto ${formatChileDateTime(report.openedAt)} · ${report.salesCount} ventas · ${report.redeemsCount} canjes`
    );
    doc.moveDown(1.2);

    const rows = paymentRows(report);

    doc.fontSize(13).fillColor(INK).text("Cuadre de caja");
    doc.moveDown(0.5);
    const chartBottom = drawBarChart(
      doc,
      [{ name: "Contado", color: INK }, { name: "Esperado", color: "#dddddd" }],
      rows.map((r) => ({ label: r.label, values: [r.counted, r.expected] })),
      doc.x, doc.y + 14, doc.page.width - doc.page.margins.left - doc.page.margins.right, 100,
    );
    doc.y = chartBottom + 16;

    const paymentTableRows = rows.map((row) => {
      const cuadra = Math.abs(row.diff) < 1;
      const diffText = cuadra ? "✓ Cuadra" : row.diff > 0 ? `▲ Sobran ${money(row.diff)}` : `▼ Faltan ${money(Math.abs(row.diff))}`;
      return [row.label, money(row.counted), money(row.expected), { text: diffText, color: cuadra ? GREEN : RED }];
    });
    const afterPaymentTableY = drawTable(
      doc,
      [{ label: "Medio de pago", width: 160 }, { label: "Contado", width: 110 }, { label: "Esperado", width: 110 }, { label: "Diferencia", width: 110 }],
      paymentTableRows,
      doc.y,
    );

    doc.y = afterPaymentTableY + 20;
    doc.fontSize(13).fillColor(INK).text("Ventas del turno por producto");
    doc.moveDown(0.5);

    if (report.shiftProducts.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin ventas registradas en este turno.");
    } else {
      drawTable(
        doc,
        [{ label: "Producto", width: 280 }, { label: "Unidades", width: 100 }, { label: "Ingresos", width: 110 }],
        report.shiftProducts.map((p) => [p.name, String(p.quantity), money(p.revenue)]),
        doc.y,
      );
    }

    doc.end();
  });
}
