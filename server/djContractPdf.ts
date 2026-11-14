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
  /** La firma estampada de cada productor (sin firma = «Se firma al enviar»). */
  producers?: { name: string; role: string; signaturePng: Buffer | null; signedAtText: string | null }[];
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

  // Firmas (en una página aparte si no caben): la artista y los dos productores, lado a lado.
  if (doc.y > doc.page.height - 250) doc.addPage();
  doc.moveDown(0.8).fillColor(INK).font("Helvetica-Bold").fontSize(11.5).text("Firmas");
  doc.moveDown(0.6);
  const top = doc.y;
  const gap = 14;
  const colW = (w - gap * 2) / 3;
  const block = (col: number, label: string, name: string, lines: string[], png?: Buffer | null) => {
    const left = x + col * (colW + gap);
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text(label.toUpperCase(), left, top, { width: colW, lineBreak: false });
    if (png) { try { doc.image(png, left, top + 14, { fit: [colW - 14, 54] }); } catch { /* firma ilegible: queda la línea */ } }
    doc.moveTo(left, top + 74).lineTo(left + colW - 8, top + 74).strokeColor("#b9ae92").lineWidth(0.8).stroke();
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(name, left, top + 80, { width: colW - 6 });
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(lines.join("\n"), left, doc.y + 1, { width: colW - 6 });
    return doc.y;
  };
  const s = input.signer;
  const ends = [block(0, "La Artista", s?.legalName ?? "Sin firmar", s ? [`RUT ${s.rut}`, `Firmado el ${s.signedAtText}`] : ["Pendiente de firma"], s?.signaturePng)];
  const prods = input.producers?.length ? input.producers : PRODUCERS.map((p) => ({ name: p.name, role: p.role, signaturePng: null, signedAtText: null }));
  prods.forEach((p, i) => { ends.push(block(i + 1, "La Producción", p.name, [p.role, p.signedAtText ? `Firmado el ${p.signedAtText}` : "Se firma al enviar"], p.signaturePng)); });
  doc.x = x;
  doc.y = Math.max(...ends) + 20;

  if (s) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(
      `Constancia de firma electrónica. Fecha y hora: ${s.signedAtText} (hora de Chile). Dirección IP: ${s.ip}. Huella (SHA-256) del texto firmado: ${s.hash}.`,
      x, doc.y, { width: w, lineGap: 1 },
    );
  }
  doc.end();
  return done;
}
