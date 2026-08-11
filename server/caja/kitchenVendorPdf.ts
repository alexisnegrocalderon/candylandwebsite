import PDFDocument from "pdfkit";
import { money, INK, MUTED, drawTable, drawBarChart } from "./pdfHelpers";

export type KitchenVendorReport = {
  eventTitle: string;
  vendorName: string;
  products: { name: string; quantity: number; revenue: number; vendorShare: number; venueShare: number }[];
  totalRevenue: number;
  vendorShare: number;
  venueShare: number;
};

/** PDF de rendición con el proveedor de cocina (pedido explícito del
 * usuario): por cada producto `toKitchen`, cuánto se vendió, cuánto le
 * corresponde al proveedor (su costo cargado) y cuánto queda para la
 * productora -- para que las cuentas queden claras entre las dos partes. */
export function buildKitchenVendorPdf(report: KitchenVendorReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor(INK).text(`Rendición de cocina — ${report.eventTitle}`);
    doc.fontSize(11).fillColor(MUTED).text(`Proveedor: ${report.vendorName}`);
    doc.moveDown(1.2);

    doc.fontSize(13).fillColor(INK).text("Total del evento");
    doc.moveDown(0.5);
    const chartBottom = drawBarChart(
      doc,
      [{ name: "Proveedor", color: "#6366f1" }, { name: "Productora", color: INK }],
      [{ label: "Reparto", values: [report.vendorShare, report.venueShare] }],
      doc.x, doc.y + 14, 200, 100,
    );
    doc.x = doc.page.margins.left;
    doc.y = chartBottom + 16;
    doc.fontSize(11).fillColor(INK).text(`Ingresos totales: ${money(report.totalRevenue)}`);
    doc.fontSize(11).fillColor("#6366f1").text(`Le corresponde al proveedor: ${money(report.vendorShare)}`);
    doc.fontSize(11).fillColor(INK).text(`Te corresponde a ti: ${money(report.venueShare)}`);
    doc.moveDown(1.2);

    doc.fontSize(13).fillColor(INK).text("Detalle por producto");
    doc.moveDown(0.5);

    if (report.products.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin ventas de productos de cocina en este evento.");
    } else {
      drawTable(
        doc,
        [
          { label: "Producto", width: 180 },
          { label: "Unidades", width: 80 },
          { label: "Ingresos", width: 90 },
          { label: "Proveedor", width: 90 },
          { label: "Productora", width: 90 },
        ],
        report.products.map((p) => [p.name, String(p.quantity), money(p.revenue), money(p.vendorShare), money(p.venueShare)]),
        doc.y,
      );
    }

    doc.end();
  });
}
