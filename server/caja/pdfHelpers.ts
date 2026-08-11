/** Helpers compartidos entre los distintos PDF que arma el admin (cierre de
 * turno, reporte de proveedor de cocina, reportes de Ventas/Gastos) --
 * dibujados con las primitivas de pdfkit (rectángulos/texto) en vez de un
 * motor de charts real o un navegador headless, para no depender de
 * Puppeteer/Chromium en las funciones serverless de Vercel. */

export const money = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export const INK = "#1a1a1a";
export const MUTED = "#666666";
export const BORDER = "#dddddd";
export const GREEN = "#1f9d55";
export const RED = "#d9538f";

export type TableColumn = { label: string; width: number };

/** Tabla genérica con encabezado, línea divisoria y salto de página
 * automático cuando se acaba el espacio vertical. Devuelve el `y` final. */
export function drawTable(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  rows: (string | { text: string; color?: string })[][],
  startY: number,
): number {
  const x = doc.page.margins.left;
  let y = startY;
  const totalWidth = columns.reduce((a, c) => a + c.width, 0);

  const drawHeader = () => {
    doc.fontSize(10).fillColor(INK);
    columns.forEach((c, i) => {
      doc.text(c.label, x + columns.slice(0, i).reduce((a, cc) => a + cc.width, 0), y, { width: c.width });
    });
    y += 16;
    doc.moveTo(x, y).lineTo(x + totalWidth, y).strokeColor(BORDER).stroke();
    y += 6;
  };

  drawHeader();

  for (const row of rows) {
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    doc.fontSize(10);
    row.forEach((cell, i) => {
      const text = typeof cell === "string" ? cell : cell.text;
      const color = typeof cell === "string" ? INK : (cell.color ?? INK);
      doc.fillColor(color).text(text, x + columns.slice(0, i).reduce((a, cc) => a + cc.width, 0), y, { width: columns[i].width });
    });
    y += 18;
  }

  return y;
}

export type ChartSeries = { name: string; color: string };
export type ChartRow = { label: string; values: number[] };

/** Barras agrupadas, una por cada valor en `row.values` (mismo orden que
 * `series`). Usado tanto para "contado vs esperado" (cierre de turno) como
 * para cualquier otra comparación de 2+ series por categoría. Devuelve el
 * `y` final (debajo de la leyenda) para que el caller pueda encadenar el
 * resto del contenido sin adivinar cuánto ocupó el gráfico. */
export function drawBarChart(
  doc: PDFKit.PDFDocument,
  series: ChartSeries[],
  rows: ChartRow[],
  x: number, y: number, width: number, height: number,
): number {
  const maxValue = Math.max(1, ...rows.flatMap((r) => r.values));
  const groupWidth = width / rows.length;
  const barWidth = Math.min(36, groupWidth / (series.length + 1));
  const gap = 6;

  rows.forEach((row, i) => {
    const groupX = x + i * groupWidth + (groupWidth - barWidth * series.length - gap * (series.length - 1)) / 2;
    row.values.forEach((value, s) => {
      const h = (value / maxValue) * height;
      doc.rect(groupX + s * (barWidth + gap), y + height - h, barWidth, h).fill(series[s].color);
    });
    doc.fontSize(8).fillColor(MUTED).text(row.label, x + i * groupWidth, y + height + 6, { width: groupWidth, align: "center" });
  });

  // Leyenda debajo del gráfico (no arriba): arriba se solapaba con el
  // título de la sección cuando el gráfico quedaba pegado al encabezado.
  const legendY = y + height + 22;
  let legendX = x;
  series.forEach((s) => {
    doc.fontSize(8).fillColor(s.color).text("■ ", legendX, legendY, { continued: true }).fillColor(MUTED).text(`${s.name}   `, { continued: true });
    legendX += 14 + s.name.length * 4.2 + 24;
  });
  doc.text("", { continued: false });

  return legendY + 14;
}
