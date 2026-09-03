import PDFDocument from "pdfkit";
import { INK, MUTED, RED, drawTable, drawReportHeader } from "./pdfHelpers";
import { formatChileDateTime } from "../../shared/chileDate";

export type LedgerRow = {
  type: string;
  operatorName: string;
  registerId: number | null;
  targetType: string | null;
  targetId: string | null;
  result: string;
  conflictNote: string | null;
  serverAt: Date | string;
};

/** Nombres legibles de cada tipo de operación. El ledger guarda el nombre
 * técnico; un PDF que dice "shift_open" no se le puede mostrar a nadie. */
const TYPE_LABELS: Record<string, string> = {
  sale: "Venta",
  redeem: "Canje de entrada",
  checkin: "Ingreso en la puerta",
  shift_open: "Apertura de turno",
  shift_close: "Cierre de turno",
  manual_adjust: "Ajuste manual de supervisor",
  void_code: "Anulación",
  locker_return: "Entrega de guardarropía",
  kitchen_update: "Cambio en un pedido de cocina",
};

/** Todos los movimientos de un evento, en PDF.
 *
 * Es el ledger `ops` completo: append-only, idempotente y lo único que
 * sobrevive a cualquier borrado del panel. Sirve para reconstruir la noche
 * cuando un número no cuadra y hay que ver qué pasó de verdad, en orden.
 *
 * Las anulaciones y los ajustes de supervisor van marcados en rojo: son
 * exactamente las operaciones que hay que poder auditar. */
export function buildMovementsPdf(eventTitle: string, rows: LedgerRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    const resumen = Array.from(byType.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${TYPE_LABELS[t] ?? t}: ${n}`)
      .join(" · ");

    drawReportHeader(doc, {
      title: "Movimientos detallados",
      eventTitle,
      subtitle: `${rows.length} operación(es) registradas${resumen ? ` — ${resumen}` : ""}`,
      note: "Registro append-only de los terminales: no se puede editar ni borrar desde el panel. Es la fuente de verdad de qué pasó esa noche.",
    });

    if (rows.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Este evento todavía no tiene movimientos registrados.");
      doc.end();
      return;
    }

    drawTable(
      doc,
      [
        { label: "Fecha y hora", width: 130 },
        { label: "Operación", width: 150 },
        { label: "Quién", width: 110 },
        { label: "Caja", width: 50 },
        { label: "Sobre", width: 120 },
        { label: "Resultado", width: 190 },
      ],
      rows.map((r) => {
        // Una operación rechazada o con conflicto es justo la que hay que
        // poder encontrar de un vistazo al revisar una diferencia.
        const problema = r.result !== "applied";
        const resultado = problema
          ? `${r.result}${r.conflictNote ? ` — ${r.conflictNote}` : ""}`
          : "OK";
        const anulacion = r.type === "void_code" || r.type === "manual_adjust";
        const color = problema || anulacion ? RED : undefined;
        return [
          formatChileDateTime(r.serverAt),
          { text: TYPE_LABELS[r.type] ?? r.type, color },
          r.operatorName,
          r.registerId != null ? `#${r.registerId}` : "—",
          r.targetId ? `${r.targetType ?? ""} ${r.targetId}`.trim() : "—",
          { text: resultado, color },
        ];
      }),
      doc.y,
    );

    doc.moveDown(1);
    doc.fontSize(8).fillColor(MUTED).text(
      "Las anulaciones y los ajustes de supervisor van en rojo. Si un movimiento aparece con un resultado distinto de OK, ahí está la explicación de por qué no se aplicó.",
    );

    doc.end();
  });
}
