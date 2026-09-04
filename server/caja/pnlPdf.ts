import PDFDocument from "pdfkit";
import { money, INK, MUTED, GREEN, RED, drawTable, drawReportHeader, drawAmountRow } from "./pdfHelpers";
import { categoryLabel } from "../../shared/expenses";
import { formatChileDate } from "../../shared/chileDate";

/** Lo que devuelve `db.getEventPnl`. Se declara acá en vez de importar el
 * tipo para que este módulo no arrastre a `server/db` (que abre conexión) --
 * mismo criterio que el resto de los constructores de PDF. */
export type PnlReport = {
  title: string;
  eventDate: Date | string;
  monthKey: string;
  ivaApplies: boolean;
  cogsCoverage: number;
  grossIncome: number;
  cogs: number;
  directExpensesTotal: number;
  directByCategory: { category: string; amount: number }[];
  generalExpensesMonthTotal: number;
  generalExpensesAssigned: number;
  prorationWeight: number;
  ambassadorCommissions: number;
  cardFeeBase: number;
  cardFeePercent: number;
  cardFeeAmount: number;
  iva: { debitoFiscal: number; creditoFiscal: number; ivaAPagar: number; remanenteCredito: number };
  netIncome: number;
  netProfit: number;
  marginPercent: number | null;
  warnings: string[];
};

/** Estado de resultados de un evento, en PDF.
 *
 * Era el reporte que faltaba y el que más falta hacía: "¿esta fiesta dio
 * ganancia?" es la pregunta que el dueño hace después de cada evento, y hasta
 * ahora la respuesta solo se podía leer en pantalla.
 *
 * Se lee de arriba hacia abajo como un estado de resultados de verdad: qué
 * entró, qué se fue restando y qué quedó -- en vez de una tabla de números
 * sueltos que hay que sumar mentalmente. */
export function buildPnlReportPdf(r: PnlReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawReportHeader(doc, {
      title: "Resultado del evento",
      eventTitle: r.title,
      subtitle: `Fiesta del ${formatChileDate(r.eventDate, { withYear: true })} · mes contable ${r.monthKey}`,
      // Conviven dos definiciones de "ingreso" en el sistema y ninguna se
      // aclaraba en el PDF, así que dos reportes del mismo evento podían
      // mostrar cifras distintas sin explicar por qué.
      note: "El ingreso es la plata efectivamente recaudada (ventas web aprobadas + ventas de caja), no los precios de lista.",
    });

    // Los avisos van ARRIBA, no en un pie: si un número está sospechoso, hay
    // que saberlo antes de leerlo, no después.
    if (r.warnings.length > 0) {
      doc.fontSize(11).fillColor(RED).text("Ojo con estos números");
      doc.moveDown(0.3);
      for (const w of r.warnings) {
        doc.fontSize(9).fillColor(MUTED).text(`• ${w}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
      }
      doc.moveDown(0.8);
    }

    doc.fontSize(13).fillColor(INK).text("Cómo se llega al resultado");
    doc.moveDown(0.5);

    drawAmountRow(doc, "Ingreso recaudado", r.grossIncome, { strong: true });

    if (r.ivaApplies) {
      drawAmountRow(doc, "IVA débito fiscal", r.iva.debitoFiscal, {
        negative: true,
        hint: "Este evento se declara, así que el IVA de las ventas no es ingreso propio.",
      });
      drawAmountRow(doc, "Ingreso neto (sin IVA)", r.netIncome, { strong: true });
    }

    doc.moveDown(0.4);
    drawAmountRow(doc, "Costo de lo vendido en la barra", r.cogs, {
      negative: true,
      hint: r.cogsCoverage < 100
        ? `Solo el ${r.cogsCoverage}% de las unidades vendidas tiene costo cargado, así que este número está incompleto.`
        : undefined,
    });

    drawAmountRow(doc, "Gastos del evento", r.directExpensesTotal, { negative: true });
    for (const c of r.directByCategory) {
      doc.fontSize(9).fillColor(MUTED);
      const left = doc.page.margins.left + 12;
      const right = doc.page.width - doc.page.margins.right;
      const y = doc.y;
      doc.text(categoryLabel(c.category), left, y, { width: right - left - 110 });
      doc.text(money(c.amount), right - 110, y, { width: 110, align: "right" });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.2);
    drawAmountRow(doc, "Parte de los gastos de la productora", r.generalExpensesAssigned, {
      negative: true,
      hint: `Del total de ${money(r.generalExpensesMonthTotal)} del mes, a esta fiesta le toca el ${Math.round(r.prorationWeight * 100)}% según lo que vendió.`,
    });

    if (r.ambassadorCommissions > 0) {
      drawAmountRow(doc, "Comisiones de embajadores", r.ambassadorCommissions, { negative: true });
    }

    if (r.cardFeeAmount > 0) {
      drawAmountRow(doc, `Comisión de tarjeta (${r.cardFeePercent}%)`, r.cardFeeAmount, {
        negative: true,
        hint: "Sobre ventas web (completo) y caja con débito/crédito/QR -- el efectivo no paga comisión.",
      });
    }

    doc.moveDown(0.5);
    const y = doc.y;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(INK).stroke();
    doc.y = y + 10;

    const gano = r.netProfit >= 0;
    doc.fontSize(14).fillColor(gano ? GREEN : RED);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const ry = doc.y;
    doc.text(gano ? "Ganancia" : "Pérdida", left, ry, { width: right - left - 140 });
    doc.text(money(Math.abs(r.netProfit)), right - 140, ry, { width: 140, align: "right" });
    doc.moveDown(0.4);
    if (r.marginPercent != null) {
      doc.fontSize(10).fillColor(MUTED).text(`Margen sobre el ingreso: ${r.marginPercent}%`, left);
    }

    if (r.ivaApplies) {
      doc.moveDown(1.2);
      doc.fontSize(13).fillColor(INK).text("IVA del período");
      doc.moveDown(0.5);
      drawTable(
        doc,
        [{ label: "Concepto", width: 220 }, { label: "Monto", width: 120 }],
        [
          ["Débito fiscal (ventas)", money(r.iva.debitoFiscal)],
          ["Crédito fiscal (compras con factura)", money(r.iva.creditoFiscal)],
          r.iva.ivaAPagar > 0
            ? [{ text: "IVA a pagar", color: RED }, { text: money(r.iva.ivaAPagar), color: RED }]
            : [{ text: "Remanente de crédito a favor", color: GREEN }, { text: money(r.iva.remanenteCredito), color: GREEN }],
        ],
        doc.y,
      );
    }

    doc.end();
  });
}
