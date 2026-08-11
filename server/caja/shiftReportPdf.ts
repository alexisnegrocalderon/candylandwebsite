import PDFDocument from "pdfkit";
import { formatChileDateTime } from "../../shared/chileDate";

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

const money = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const INK = "#1a1a1a";
const MUTED = "#666666";
const BORDER = "#dddddd";
const GREEN = "#1f9d55";
const RED = "#d9538f";

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

/** Gráfico de barras contado-vs-esperado por medio de pago, dibujado con las
 * primitivas de pdfkit (rectángulos) en vez de un motor de charts real --
 * evita depender de un navegador headless (Puppeteer/Chromium) para render,
 * lo cual es mucho más frágil en las funciones serverless de Vercel. */
function drawBarChart(doc: PDFKit.PDFDocument, rows: PaymentRow[], x: number, y: number, width: number, height: number) {
  const maxValue = Math.max(1, ...rows.flatMap((r) => [r.counted, r.expected]));
  const groupWidth = width / rows.length;
  const barWidth = Math.min(36, groupWidth / 3);
  const gap = 6;

  rows.forEach((row, i) => {
    const groupX = x + i * groupWidth + (groupWidth - barWidth * 2 - gap) / 2;
    const countedH = (row.counted / maxValue) * height;
    const expectedH = (row.expected / maxValue) * height;

    doc.rect(groupX, y + height - countedH, barWidth, countedH).fill(INK);
    doc.rect(groupX + barWidth + gap, y + height - expectedH, barWidth, expectedH).fill(BORDER);

    doc.fontSize(8).fillColor(MUTED).text(row.label, x + i * groupWidth, y + height + 6, { width: groupWidth, align: "center" });
  });

  doc.fontSize(8).fillColor(INK).text("■ Contado", x, y - 14, { continued: true }).fillColor(MUTED).text("   ■ Esperado", { continued: false });
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
    drawBarChart(doc, rows, doc.x, doc.y + 14, doc.page.width - doc.page.margins.left - doc.page.margins.right, 100);
    doc.moveDown(8);

    const tableX = doc.x;
    let tableY = doc.y;
    const colWidths = [160, 110, 110, 110];
    const header = ["Medio de pago", "Contado", "Esperado", "Diferencia"];
    doc.fontSize(10).fillColor(INK);
    header.forEach((h, i) => {
      doc.text(h, tableX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableY, { width: colWidths[i], continued: false });
    });
    tableY += 16;
    doc.moveTo(tableX, tableY).lineTo(tableX + colWidths.reduce((a, b) => a + b, 0), tableY).strokeColor(BORDER).stroke();
    tableY += 6;

    for (const row of rows) {
      const cuadra = Math.abs(row.diff) < 1;
      const diffText = cuadra ? "✓ Cuadra" : row.diff > 0 ? `▲ Sobran ${money(row.diff)}` : `▼ Faltan ${money(Math.abs(row.diff))}`;
      doc.fontSize(10).fillColor(INK).text(row.label, tableX, tableY, { width: colWidths[0] });
      doc.text(money(row.counted), tableX + colWidths[0], tableY, { width: colWidths[1] });
      doc.text(money(row.expected), tableX + colWidths[0] + colWidths[1], tableY, { width: colWidths[2] });
      doc.fillColor(cuadra ? GREEN : RED).text(diffText, tableX + colWidths[0] + colWidths[1] + colWidths[2], tableY, { width: colWidths[3] });
      tableY += 18;
    }

    doc.y = tableY + 20;
    doc.fontSize(13).fillColor(INK).text("Ventas del turno por producto");
    doc.moveDown(0.5);

    if (report.shiftProducts.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin ventas registradas en este turno.");
    } else {
      const prodX = doc.x;
      let prodY = doc.y;
      const prodCols = [280, 100, 110];
      doc.fontSize(10).fillColor(INK);
      ["Producto", "Unidades", "Ingresos"].forEach((h, i) => {
        doc.text(h, prodX + prodCols.slice(0, i).reduce((a, b) => a + b, 0), prodY, { width: prodCols[i] });
      });
      prodY += 16;
      doc.moveTo(prodX, prodY).lineTo(prodX + prodCols.reduce((a, b) => a + b, 0), prodY).strokeColor(BORDER).stroke();
      prodY += 6;

      for (const p of report.shiftProducts) {
        if (prodY > doc.page.height - doc.page.margins.bottom - 20) {
          doc.addPage();
          prodY = doc.page.margins.top;
        }
        doc.fontSize(10).fillColor(INK).text(p.name, prodX, prodY, { width: prodCols[0] });
        doc.text(String(p.quantity), prodX + prodCols[0], prodY, { width: prodCols[1] });
        doc.text(money(p.revenue), prodX + prodCols[0] + prodCols[1], prodY, { width: prodCols[2] });
        prodY += 16;
      }
    }

    doc.end();
  });
}
