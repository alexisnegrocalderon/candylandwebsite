import PDFDocument from "pdfkit";
import { money, INK, MUTED, drawTable } from "./pdfHelpers";

type ProfitRow = { name: string; category: string; unitsSold: number; revenue: number; cost: number | null; profit: number | null; marginPercent: number | null };

/** PDF consolidado del sub-tab "Ventas" de Gastos y P&L (pedido explícito
 * del usuario: un solo botón que junta todo, en vez de uno por tabla). Hoy
 * cubre el margen por producto -- es la tabla central de esa sub-tab. */
export function buildVentasReportPdf(eventTitle: string, rows: ProfitRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor(INK).text(`Reporte de ventas — ${eventTitle}`);
    doc.moveDown(1);

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
    doc.fontSize(11).fillColor(MUTED).text(`Ingresos totales: ${money(totalRevenue)} · Utilidad total: ${money(totalProfit)}`);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin ventas registradas en este evento.");
    } else {
      drawTable(
        doc,
        [
          { label: "Producto", width: 170 },
          { label: "Unidades", width: 70 },
          { label: "Ingresos", width: 90 },
          { label: "Costo", width: 80 },
          { label: "Utilidad", width: 80 },
          { label: "Margen", width: 60 },
        ],
        rows.map((r) => [
          r.name, String(r.unitsSold), money(r.revenue),
          r.cost != null ? money(r.cost) : "—",
          r.profit != null ? money(r.profit) : "—",
          r.marginPercent != null ? `${r.marginPercent}%` : "—",
        ]),
        doc.y,
      );
    }

    doc.end();
  });
}

type ExpenseRow = { expenseDate: Date | string; category: string; description: string; supplier: string | null; amountTotal: number; eventTitle: string | null };

/** PDF consolidado del sub-tab "Gastos" (mismo criterio que Ventas: un solo
 * botón para todo el evento). */
export function buildGastosReportPdf(eventTitle: string, rows: ExpenseRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor(INK).text(`Reporte de gastos — ${eventTitle}`);
    doc.moveDown(1);

    const total = rows.reduce((s, r) => s + r.amountTotal, 0);
    doc.fontSize(11).fillColor(MUTED).text(`Total gastado: ${money(total)} (${rows.length} gastos)`);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin gastos registrados para este evento.");
    } else {
      drawTable(
        doc,
        [
          { label: "Fecha", width: 70 },
          { label: "Categoría", width: 90 },
          { label: "Descripción", width: 160 },
          { label: "Proveedor", width: 90 },
          { label: "Monto", width: 70 },
        ],
        rows.map((r) => [
          new Date(r.expenseDate).toLocaleDateString('es-CL'),
          r.category, r.description, r.supplier ?? "—", money(r.amountTotal),
        ]),
        doc.y,
      );
    }

    doc.end();
  });
}
