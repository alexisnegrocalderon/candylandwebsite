/* PDF del contrato de un DJ, con constancia de la firma. Módulo PURO: recibe el texto ya congelado y solo dibuja con
 * pdfkit (sin navegador, corre en las funciones serverless de Vercel). */
import PDFDocument from "pdfkit";
import { PRODUCERS, type DjContract } from "../shared/djContract";

export interface DjContractPdfInput {
  contract: DjContract;
  /** Quien firma; sin firma todavía = vista previa («Sin firmar»). */
  signer?: {
    legalName: string; rut: string; signedAtText: string; ip: string; hash: string; signaturePng: Buffer | null;
  } | null;
  /** «Enviado por la Producción el …» */
  sentAtText?: string | null;
}

const INK = "#1b1a17";
const MUTED = "#6b6458";
const GOLD = "#9a7a2e";

export async function buildDjContractPdf(input: DjContractPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 54, bottom: 60, left: 56, right: 56 }, info: { Title: input.contract.title } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(9).text("PLAYROOM × DALMORE", { characterSpacing: 2 });
  doc.moveDown(0.4).fillColor(INK).font("Helvetica-Bold").fontSize(17).text(input.contract.title);
  doc.moveDown(0.3).fillColor(MUTED).font("Helvetica").fontSize(9).text(`Versión ${input.contract.version}${input.sentAtText ? ` · Enviado el ${input.sentAtText}` : ""}`);
  doc.moveDown(0.8);

  // Resumen
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startY = doc.y;
  const rows = input.contract.summary;
  const rowH = 17;
  doc.roundedRect(x, startY, w, rows.length * rowH + 14, 6).fillAndStroke("#f6f1e4", "#e2d6b4");
  rows.forEach((r, i) => {
    const y = startY + 8 + i * rowH;
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8.5).text(r.label.toUpperCase(), x + 12, y + 2, { width: 100, lineBreak: false });
    doc.fillColor(INK).font("Helvetica").fontSize(10).text(r.value, x + 118, y, { width: w - 130, lineBreak: false });
  });
  doc.x = x;
  doc.y = startY + rows.length * rowH + 28;

  for (const s of input.contract.sections) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11.5).text(s.heading);
    doc.moveDown(0.25);
    for (const p of s.paragraphs) {
      doc.fillColor("#2b2924").font("Helvetica").fontSize(10).text(p, { align: "justify", lineGap: 2 });
      doc.moveDown(0.45);
    }
    doc.moveDown(0.3);
  }

  // Firmas (en una página aparte si no caben)
  if (doc.y > doc.page.height - 250) doc.addPage();
  doc.moveDown(0.8).fillColor(INK).font("Helvetica-Bold").fontSize(11.5).text("Firmas");
  doc.moveDown(0.6);
  const top = doc.y;
  const colW = (w - 20) / 2;
  const block = (left: number, label: string, name: string, lines: string[], png?: Buffer | null) => {
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8.5).text(label.toUpperCase(), left, top, { width: colW });
    if (png) { try { doc.image(png, left, top + 14, { fit: [colW - 20, 56] }); } catch { /* firma ilegible: queda la línea */ } }
    doc.moveTo(left, top + 76).lineTo(left + colW - 10, top + 76).strokeColor("#b9ae92").lineWidth(0.8).stroke();
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(name, left, top + 82, { width: colW });
    doc.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(lines.join("\n"), left, doc.y + 1, { width: colW });
  };
  const s = input.signer;
  block(x, "La Artista", s?.legalName ?? "Sin firmar", s ? [`RUT ${s.rut}`, `Firmado electrónicamente el ${s.signedAtText}`] : ["Pendiente de firma"], s?.signaturePng);
  const afterLeft = doc.y;
  block(x + colW + 20, "La Producción", PRODUCERS.map((p) => p.name).join(" y "), [PRODUCERS.map((p) => p.role).join(" · "), s ? "Aprobado y enviado por la Producción" : "Se contrafirma al enviar"]);
  doc.x = x;
  doc.y = Math.max(doc.y, afterLeft) + 20;

  if (s) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(
      `Constancia de firma electrónica. Fecha y hora: ${s.signedAtText} (hora de Chile). Dirección IP: ${s.ip}. Huella (SHA-256) del texto firmado: ${s.hash}.`,
      x, doc.y, { width: w, lineGap: 1 },
    );
  }
  doc.end();
  return done;
}
