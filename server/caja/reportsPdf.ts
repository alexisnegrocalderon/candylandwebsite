import PDFDocument from "pdfkit";
import { money, INK, MUTED, drawTable, drawBarChart, drawReportHeader } from "./pdfHelpers";

type ProfitRow = { name: string; category: string; unitsSold: number; revenue: number; cost: number | null; profit: number | null; marginPercent: number | null };

export type SalesBreakdown = {
  web: { total: number; count: number; byMethod: { method: string; count: number; total: number }[] };
  caja: { total: number; count: number; byMethod: { method: string; count: number; total: number }[] };
  total: number;
};

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  qr: "QR / transferencia",
  "sin medio": "Sin medio registrado",
};

/** PDF de ventas del evento: de dónde salió la plata y qué producto dejó
 * margen.
 *
 * Antes solo traía la tabla de margen por producto, sobre precios de lista.
 * Faltaba lo primero que se pregunta al cerrar una fiesta: cuánto entró por
 * la web y cuánto en la puerta, y dentro de la caja cuánto fue efectivo y
 * cuánto tarjeta -- que es lo que se cuadra contra el banco y contra el
 * cajón. */
export function buildVentasReportPdf(eventTitle: string, rows: ProfitRow[], breakdown?: SalesBreakdown | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);

    drawReportHeader(doc, {
      title: "Ventas del evento",
      eventTitle,
      subtitle: breakdown
        ? `Recaudado: ${money(breakdown.total)} · ${breakdown.web.count + breakdown.caja.count} venta(s) aprobadas`
        : undefined,
      note: "Lo recaudado es la plata que entró de verdad. La tabla de productos usa precios de lista, así que sus totales pueden no coincidir: son dos preguntas distintas.",
    });

    if (breakdown) {
      doc.fontSize(13).fillColor(INK).text("De dónde salió la plata");
      doc.moveDown(0.5);
      const chartBottom = drawBarChart(
        doc,
        [{ name: "Recaudado", color: INK }],
        [
          { label: "Web", values: [breakdown.web.total] },
          { label: "Caja", values: [breakdown.caja.total] },
        ],
        doc.x, doc.y + 12, doc.page.width - doc.page.margins.left - doc.page.margins.right, 90,
      );
      doc.y = chartBottom + 14;

      const filas: (string | { text: string; color?: string })[][] = [];
      filas.push([{ text: "Ventas web" }, String(breakdown.web.count), money(breakdown.web.total)]);
      for (const m of breakdown.web.byMethod) {
        filas.push([`    ${METHOD_LABELS[m.method] ?? m.method}`, String(m.count), money(m.total)]);
      }
      filas.push([{ text: "Ventas en caja" }, String(breakdown.caja.count), money(breakdown.caja.total)]);
      for (const m of breakdown.caja.byMethod) {
        filas.push([`    ${METHOD_LABELS[m.method] ?? m.method}`, String(m.count), money(m.total)]);
      }
      filas.push([{ text: "Total recaudado" }, String(breakdown.web.count + breakdown.caja.count), money(breakdown.total)]);

      const after = drawTable(
        doc,
        [{ label: "Origen", width: 240 }, { label: "Ventas", width: 80 }, { label: "Monto", width: 120 }],
        filas,
        doc.y,
      );
      doc.y = after + 20;
    }

    doc.fontSize(13).fillColor(INK).text("Margen por producto");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(MUTED).text(`A precio de lista: ${money(totalRevenue)} · utilidad ${money(totalProfit)}`);
    doc.moveDown(0.6);

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
