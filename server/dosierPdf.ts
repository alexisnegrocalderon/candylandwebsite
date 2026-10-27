/** Dosier de barra en PDF (docs/ARQUITECTURA-CAJA.md §17): portada con la marca, guía de cristalería y medidas,
 * una ficha por trago con su vaso dibujado a escala (las capas de cada ingrediente), y una tabla resumen para pegar
 * en la barra. Módulo PURO: recibe los datos ya armados (server/dosierData.ts) y solo dibuja con pdfkit, sin
 * navegador, así corre en las funciones serverless de Vercel. */
import PDFDocument from "pdfkit";
import { LOGO_PNG_BASE64 } from "./budgetReport/logo";
import { ANTON_TTF_BASE64 } from "./budgetReport/fonts";
import { safe } from "./budgetReport/draw";
import { bordeDeFicha, capasDeFicha, colorDe, hieloDeFicha } from "../shared/dosierFicha";

type Doc = PDFKit.PDFDocument;

export interface DosierTrago {
  name: string;
  section: string;
  /** vaso | copa | copa_xl | shot */
  glass: string;
  glassLabel: string;
  glassMl: number;
  /** Ingredientes medidos (los `un` van sin capa en el vaso). */
  lineas: { name: string; unit: string; amount: number; texto: string }[];
  /** «Con qué bebida va»: etiqueta del grupo y las opciones, y cuánto (ml) para dibujar la capa. */
  opciones: { label: string; choices: string[]; ml: number }[];
  extras: string[];
  pasos: string[];
  foto: Buffer | null;
}

export interface DosierData {
  eventTitle: string;
  emittedAt: Date;
  tragos: DosierTrago[];
  /** Lo que se vende en su botella o lata. */
  talCual: { name: string; section: string }[];
}

// A4 vertical.
const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;

const C = {
  night: "#120A18",
  night2: "#2A0F2E",
  pink: "#E8399A",
  pinkSoft: "#FCE7F3",
  sky: "#2AA7DC",
  skySoft: "#E3F4FB",
  ink: "#1B1320",
  muted: "#6B6172",
  faint: "#EDE6EF",
  paper: "#FFFFFF",
  glass: "#F3EFF6",
  glassStroke: "#9C90A6",
  ice: "#FFFFFF",
  amber: "#F5A524",
};

const logo = Buffer.from(LOGO_PNG_BASE64, "base64");
// El logo se abre una vez por documento y se reutiliza: con el Buffer directo pdfkit lo incrusta en cada uso
// (la portada lo dibuja ~80 veces) y el PDF pesaba varios MB.
const logoImgs = new WeakMap<Doc, unknown>();
const logoImg = (doc: Doc): any => {
  let img = logoImgs.get(doc);
  if (!img) { img = (doc as any).openImage(logo); logoImgs.set(doc, img); }
  return img;
};

/* ─── Texto ─────────────────────────────────────────────────── */

type TOpts = { size?: number; color?: string; bold?: boolean; display?: boolean; width?: number; align?: "left" | "center" | "right"; spacing?: number; lineGap?: number; opacity?: number };
function t(doc: Doc, s: string, x: number, y: number, o: TOpts = {}): number {
  doc.save();
  doc.font(o.display ? "Anton" : o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 10).fillColor(o.color ?? C.ink);
  if (o.opacity != null) doc.fillOpacity(o.opacity);
  doc.text(safe(s), x, y, { width: o.width, align: o.align ?? "left", characterSpacing: o.spacing, lineGap: o.lineGap ?? 1.5 });
  const y2 = doc.y;
  doc.restore();
  return y2;
}
function th(doc: Doc, s: string, width: number, o: TOpts = {}): number {
  doc.font(o.display ? "Anton" : o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 10);
  return doc.heightOfString(safe(s), { width, lineGap: o.lineGap ?? 1.5, characterSpacing: o.spacing });
}
function tw(doc: Doc, s: string, o: TOpts = {}): number {
  doc.font(o.display ? "Anton" : o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 10);
  return doc.widthOfString(safe(s), { characterSpacing: o.spacing });
}
function rr(doc: Doc, x: number, y: number, w: number, h: number, r: number, fill: string, o: { opacity?: number; stroke?: string; lw?: number } = {}) {
  doc.save();
  if (o.opacity != null) doc.fillOpacity(o.opacity);
  doc.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)).fill(fill);
  doc.restore();
  if (o.stroke) { doc.save(); doc.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)).lineWidth(o.lw ?? 1).stroke(o.stroke); doc.restore(); }
}
function pill(doc: Doc, s: string, x: number, y: number, bg: string, color: string, size = 8.5): number {
  const w = tw(doc, s, { size, bold: true }) + 14;
  rr(doc, x, y, w, size + 9, (size + 9) / 2, bg);
  t(doc, s, x + 7, y + 4.3, { size, bold: true, color });
  return w;
}

/* ─── Colores de cada ingrediente ───────────────────────────── */

export { colorDe };

/* ─── Vasos ─────────────────────────────────────────────────── */

type Layer = { ml: number; color: string };
type GlassOpts = { layers?: Layer[]; ice?: "cubos" | "frappe" | null; rim?: string | null; capacity: number; straw?: boolean };

/** Dibuja el vaso con `h` de alto, apoyado en (cx, bottom). Devuelve el ancho usado. */
export function drawGlass(doc: Doc, kind: string, cx: number, bottom: number, h: number, o: GlassOpts): number {
  if (kind === "copa" || kind === "copa_xl") return drawCopa(doc, cx, bottom, h, kind === "copa_xl", o);
  if (kind === "shot") return drawShot(doc, cx, bottom, h, o);
  return drawTumbler(doc, cx, bottom, h, o);
}

/** Capas desde el fondo del recipiente, recortadas a su forma; arriba el hielo. */
function fill(doc: Doc, clipPath: () => void, top: number, bottom: number, left: number, right: number, o: GlassOpts) {
  const inner = bottom - top;
  const total = (o.layers ?? []).reduce((s, l) => s + l.ml, 0);
  doc.save();
  clipPath();
  doc.clip();
  let y = bottom;
  for (const l of o.layers ?? []) {
    const lh = Math.max(1.5, (l.ml / o.capacity) * inner);
    doc.rect(left - 2, y - lh, right - left + 4, lh + 0.6).fill(l.color);
    // Línea fina entre capas, para que se distingan los ingredientes claros.
    doc.save().lineWidth(0.4).strokeOpacity(0.6).moveTo(left, y - lh).lineTo(right, y - lh).stroke("#FFFFFF").restore();
    y -= lh;
  }
  // Hielo: cubos o frappé sobre el líquido, hasta casi el borde.
  if (o.ice && total > 0) {
    const iceTop = top + inner * 0.08;
    if (o.ice === "frappe") {
      doc.fillOpacity(0.75);
      for (let yy = iceTop; yy < bottom - 4; yy += 5) {
        for (let xx = left + ((yy / 5) % 2) * 2.5; xx < right; xx += 5) doc.circle(xx, yy, 1.4).fill(C.ice);
      }
    } else {
      const s = Math.max(9, (right - left) / 4.2);
      let row = 0;
      for (let yy = iceTop; yy < bottom - s * 0.6; yy += s * 0.92, row++) {
        for (let xx = left + (row % 2 ? s * 0.5 : 0); xx < right; xx += s * 1.05) {
          doc.save();
          doc.fillOpacity(0.55).rotate(row % 2 ? 8 : -6, { origin: [xx + s / 2, yy + s / 2] });
          doc.roundedRect(xx, yy, s * 0.86, s * 0.86, 2).fill(C.ice);
          doc.fillOpacity(0.9).roundedRect(xx + 2, yy + 2, s * 0.25, s * 0.12, 1).fill(C.ice);
          doc.restore();
        }
      }
    }
  }
  doc.restore();
}

function drawTumbler(doc: Doc, cx: number, bottom: number, h: number, o: GlassOpts): number {
  const topW = h * 0.62;
  const botW = h * 0.46;
  const lidH = h * 0.06;
  const top = bottom - h + lidH;
  const path = () => doc.moveTo(cx - topW / 2, top).lineTo(cx + topW / 2, top).lineTo(cx + botW / 2, bottom).lineTo(cx - botW / 2, bottom).closePath();
  // Vaso esmerilado.
  doc.save(); path(); doc.fillOpacity(1).fill(C.glass); doc.restore();
  fill(doc, path, top + 3, bottom - 3, cx - topW / 2, cx + topW / 2, o);
  doc.save(); path(); doc.lineWidth(1.2).strokeColor(C.glassStroke).stroke(); doc.restore();
  // Logo y nombre del vaso Playroom.
  doc.save(); doc.opacity(0.85); doc.image(logoImg(doc), cx - h * 0.07, bottom - h * 0.47, { height: h * 0.16 }); doc.restore();
  t(doc, "PLAYROOM", cx - topW / 2, bottom - h * 0.29, { size: Math.max(6, h * 0.045), bold: true, color: C.pink, width: topW, align: "center", spacing: 0.6 });
  if (o.rim) drawRim(doc, cx - topW / 2, cx + topW / 2, top, o.rim);
  // Tapa y bombilla.
  rr(doc, cx - topW / 2 - 3, top - lidH, topW + 6, lidH, 2, "#FFFFFF", { stroke: C.glassStroke, lw: 1 });
  if (o.straw !== false) {
    doc.save(); doc.lineWidth(Math.max(2.2, h * 0.025)).strokeColor("#E9E2EE").moveTo(cx + topW * 0.08, top - lidH).lineTo(cx + topW * 0.2, top - lidH - h * 0.22).stroke(); doc.restore();
  }
  return topW + 6;
}

function drawCopa(doc: Doc, cx: number, bottom: number, h: number, xl: boolean, o: GlassOpts): number {
  const baseW = h * 0.42;
  const stemH = h * (xl ? 0.36 : 0.4);
  const bowlH = h - stemH;
  const bowlW = h * (xl ? 0.66 : 0.58);
  const top = bottom - h;
  const bowlBottom = top + bowlH;
  const path = () => doc
    .moveTo(cx - bowlW / 2, top)
    .lineTo(cx + bowlW / 2, top)
    .bezierCurveTo(cx + bowlW / 2, top + bowlH * 0.75, cx + bowlW * 0.22, bowlBottom, cx, bowlBottom)
    .bezierCurveTo(cx - bowlW * 0.22, bowlBottom, cx - bowlW / 2, top + bowlH * 0.75, cx - bowlW / 2, top)
    .closePath();
  doc.save(); path(); doc.fill(C.glass); doc.restore();
  fill(doc, path, top + 2, bowlBottom - 1, cx - bowlW / 2, cx + bowlW / 2, o);
  doc.save(); path(); doc.lineWidth(1.2).strokeColor(C.glassStroke).stroke(); doc.restore();
  // Tallo y base.
  doc.save(); doc.lineWidth(Math.max(2, h * 0.02)).strokeColor(C.glassStroke).moveTo(cx, bowlBottom).lineTo(cx, bottom - 3).stroke(); doc.restore();
  doc.save(); doc.ellipse(cx, bottom - 2, baseW / 2, Math.max(2.5, h * 0.022)).fillAndStroke(C.glass, C.glassStroke); doc.restore();
  if (o.rim) drawRim(doc, cx - bowlW / 2, cx + bowlW / 2, top, o.rim);
  if (o.straw) {
    doc.save(); doc.lineWidth(Math.max(2, h * 0.02)).strokeColor("#E9E2EE").moveTo(cx + bowlW * 0.1, top + bowlH * 0.5).lineTo(cx + bowlW * 0.28, top - h * 0.12).stroke(); doc.restore();
  }
  if (xl) t(doc, "XL", cx - 20, top + bowlH * 0.72 - 12, { size: Math.max(7, h * 0.06), display: true, color: C.pink, width: 40, align: "center", opacity: 0.85 });
  return bowlW;
}

function drawShot(doc: Doc, cx: number, bottom: number, h: number, o: GlassOpts): number {
  const topW = h * 0.62;
  const botW = h * 0.48;
  const top = bottom - h;
  const path = () => doc.moveTo(cx - topW / 2, top).lineTo(cx + topW / 2, top).lineTo(cx + botW / 2, bottom).lineTo(cx - botW / 2, bottom).closePath();
  doc.save(); path(); doc.fill(C.glass); doc.restore();
  fill(doc, path, top + 2, bottom - h * 0.18, cx - topW / 2, cx + topW / 2, { ...o, ice: null });
  // Fondo grueso del shot.
  doc.save(); doc.rect(cx - botW / 2, bottom - h * 0.18, botW, h * 0.18).fillOpacity(0.6).fill("#DCD3E2"); doc.restore();
  doc.save(); path(); doc.lineWidth(1.2).strokeColor(C.glassStroke).stroke(); doc.restore();
  return topW;
}

/** Borde escarchado (Tajín, sal, azúcar). */
function drawRim(doc: Doc, left: number, right: number, y: number, kind: string) {
  const color = /taj/i.test(kind) ? "#D9481E" : /az[uú]car/i.test(kind) ? "#FFFFFF" : "#F1F1F1";
  doc.save();
  doc.rect(left - 1, y - 1, right - left + 2, 5).fill(color);
  doc.fillOpacity(0.7);
  for (let x = left; x < right; x += 3) doc.circle(x, y + 5 + (x % 2), 0.9).fill(color);
  doc.restore();
}

/* ─── Páginas ───────────────────────────────────────────────── */

function lightPage(doc: Doc, title: string, eventTitle: string): number {
  doc.addPage({ size: "A4", margin: 0 });
  doc.page.margins.bottom = -5000;
  doc.rect(0, 0, W, H).fill(C.paper);
  // Banda superior de marca.
  doc.rect(0, 0, W, 54).fill(C.night);
  doc.image(logoImg(doc), M, 9, { height: 36 });
  t(doc, "MANSION", M + 34, 13, { size: 7, bold: true, color: "#FFFFFF", spacing: 2.5 });
  t(doc, "PLAYROOM", M + 34, 21, { size: 18, display: true, color: C.pink, spacing: 1 });
  t(doc, title.toUpperCase(), M, 16, { size: 9, bold: true, color: "#FFFFFF", width: CW, align: "right", spacing: 1.5 });
  t(doc, eventTitle, M, 30, { size: 8, color: "#CFC3D6", width: CW, align: "right" });
  return 72;
}

function footer(doc: Doc, n: number, total: number) {
  t(doc, `Dosier de barra · Mansion Playroom · La evolucion del carrete`, M, H - 24, { size: 7, color: C.muted });
  t(doc, `${n} / ${total}`, M, H - 24, { size: 7, color: C.muted, width: CW, align: "right" });
}

function cover(doc: Doc, d: DosierData) {
  doc.addPage({ size: "A4", margin: 0 });
  doc.page.margins.bottom = -5000;
  const g = doc.linearGradient(0, 0, W, H);
  g.stop(0, C.night).stop(1, C.night2);
  doc.rect(0, 0, W, H).fill(g);
  // Patrón suave de la marca.
  doc.save();
  doc.opacity(0.07);
  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 7; col++) {
      const x = col * 90 + (row % 2 ? 45 : 0) - 10;
      const y = row * 82 + 6;
      doc.image(logoImg(doc), x, y, { height: 34 });
    }
  }
  doc.restore();
  // Brillo central.
  const rg = doc.radialGradient(W / 2, 300, 10, W / 2, 300, 260);
  rg.stop(0, C.pink, 0.35).stop(1, C.pink, 0);
  doc.rect(0, 0, W, H).fill(rg);

  doc.image(logoImg(doc), W / 2 - 62, 150, { height: 170 });
  t(doc, "MANSION", 0, 352, { size: 14, bold: true, color: "#FFFFFF", width: W, align: "center", spacing: 9 });
  t(doc, "PLAYROOM", 0, 370, { size: 72, display: true, color: C.pink, width: W, align: "center", spacing: 3 });
  t(doc, "La evolucion del carrete", 0, 474, { size: 13, color: "#F3D9EA", width: W, align: "center" });

  rr(doc, W / 2 - 140, 518, 280, 50, 25, "#FFFFFF", { opacity: 0.08, stroke: "#FFFFFF", lw: 0.6 });
  t(doc, "DOSIER DE BARRA", 0, 532, { size: 22, display: true, color: "#FFFFFF", width: W, align: "center", spacing: 3 });

  t(doc, d.eventTitle, 0, 590, { size: 15, bold: true, color: "#FFFFFF", width: W, align: "center" });
  const fecha = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "long", timeStyle: "short" }).format(d.emittedAt);
  t(doc, `${d.tragos.length} tragos · emitido el ${fecha}`, 0, 612, { size: 9.5, color: "#CFC3D6", width: W, align: "center" });

  // Los vasos de la casa, a escala.
  const base = 800;
  drawGlass(doc, "vaso", W / 2 - 120, base, 112, { capacity: 500, layers: [{ ml: 240, color: "#F26A21" }], ice: "cubos" });
  drawGlass(doc, "copa", W / 2 - 25, base, 112, { capacity: 400, layers: [{ ml: 210, color: "#FF9F1C" }], ice: "cubos", straw: true });
  drawGlass(doc, "copa_xl", W / 2 + 80, base, 126, { capacity: 600, layers: [{ ml: 330, color: "#F2C94C" }], ice: "cubos", straw: true });
  drawGlass(doc, "shot", W / 2 + 160, base, 40, { capacity: 30, layers: [{ ml: 26, color: "#C27C2C" }] });
}

function guide(doc: Doc, d: DosierData) {
  let y = lightPage(doc, "Cristaleria y medidas", d.eventTitle);
  t(doc, "Cristaleria de la casa", M, y, { size: 26, display: true, color: C.ink });
  y += 38;
  t(doc, "Cada trago sale siempre en su vaso. El liquido ocupa mas o menos la mitad: el resto es hielo.", M, y, { size: 10, color: C.muted, width: CW });
  y += 26;

  const cards = [
    { kind: "vaso", label: "Vaso Tumbler", ml: 500, note: "Con tapa y bombilla. Tragos largos y mojitos." },
    { kind: "copa", label: "Copa", ml: 400, note: "Spritz, tragos de autor y Tropical Gin." },
    { kind: "copa_xl", label: "Copa XL", ml: 600, note: "Tropical Gin XL." },
    { kind: "shot", label: "Shot", ml: 30, note: "Shots al seco." },
  ];
  const cw = (CW - 3 * 10) / 4;
  cards.forEach((c, i) => {
    const x = M + i * (cw + 10);
    rr(doc, x, y, cw, 250, 14, C.faint, { opacity: 0.6 });
    const gh = c.kind === "shot" ? 56 : c.kind === "copa_xl" ? 168 : c.kind === "copa" ? 150 : 150;
    drawGlass(doc, c.kind, x + cw / 2, y + 190, gh, { capacity: c.ml, layers: [], straw: c.kind !== "shot" });
    t(doc, c.label, x + 8, y + 200, { size: 12, bold: true, width: cw - 16, align: "center" });
    t(doc, `${c.ml} ml`, x + 8, y + 215, { size: 16, display: true, color: C.pink, width: cw - 16, align: "center" });
    t(doc, c.note, x + 8, y + 236, { size: 7, color: C.muted, width: cw - 16, align: "center" });
  });
  y += 270;

  // Jigger.
  t(doc, "La medida: el jigger", M, y, { size: 22, display: true, color: C.ink });
  y += 34;
  const jx = M + 40;
  doc.save();
  doc.moveTo(jx - 22, y).lineTo(jx + 22, y).lineTo(jx + 4, y + 40).lineTo(jx - 4, y + 40).closePath().fillAndStroke("#E7E3EA", C.glassStroke);
  doc.moveTo(jx - 4, y + 40).lineTo(jx + 4, y + 40).lineTo(jx + 16, y + 70).lineTo(jx - 16, y + 70).closePath().fillAndStroke("#E7E3EA", C.glassStroke);
  doc.restore();
  t(doc, "1 jigger = 30 ml", M + 90, y + 4, { size: 20, display: true, color: C.pink });
  t(doc, "Siempre medir con jigger: es lo que descuenta el stock en la caja. Un trago sin medir es stock que no cuadra al cierre.", M + 90, y + 32, { size: 9.5, color: C.muted, width: CW - 90 });
  y += 92;
  const eq = [["1/2 jigger", "15 ml"], ["1 jigger", "30 ml"], ["1 1/2 jigger", "45 ml"], ["2 jiggers", "60 ml"], ["3 jiggers", "90 ml"]];
  const ew = (CW - 4 * 8) / 5;
  eq.forEach(([a, b], i) => {
    const x = M + i * (ew + 8);
    rr(doc, x, y, ew, 50, 10, i % 2 ? C.skySoft : C.pinkSoft);
    t(doc, a.replace("1/2", "½").replace("1 ½", "1½"), x, y + 9, { size: 10, bold: true, width: ew, align: "center" });
    t(doc, b, x, y + 25, { size: 15, display: true, color: i % 2 ? C.sky : C.pink, width: ew, align: "center" });
  });
  y += 70;

  // Hielo y extras.
  t(doc, "Hielo y bordes", M, y, { size: 22, display: true, color: C.ink });
  y += 34;
  const items = [
    { kind: "vaso", ice: "cubos" as const, rim: null, title: "Hielo en cubos", text: "Llenar el vaso hasta arriba antes de servir." },
    { kind: "vaso", ice: "frappe" as const, rim: null, title: "Hielo frappe", text: "Mojitos: hielo molido sobre la hierbabuena." },
    { kind: "vaso", ice: "cubos" as const, rim: "Tajin", title: "Borde de Tajin", text: "Humedecer el borde con limon y pasar por el Tajin." },
  ];
  const iw = (CW - 2 * 10) / 3;
  items.forEach((it, i) => {
    const x = M + i * (iw + 10);
    rr(doc, x, y, iw, 110, 12, C.faint, { opacity: 0.5 });
    drawGlass(doc, it.kind, x + 40, y + 100, 84, { capacity: 500, layers: [{ ml: 220, color: i === 2 ? "#F26A21" : "#BFE6F2" }], ice: it.ice, rim: it.rim, straw: false });
    t(doc, it.title, x + 80, y + 18, { size: 11, bold: true, width: iw - 88 });
    t(doc, it.text, x + 80, y + 34, { size: 8.5, color: C.muted, width: iw - 88 });
  });
}

/** Alto que necesita la ficha de un trago (para paginar sin cortar). */
function fichaLayout(doc: Doc, tr: DosierTrago) {
  const rightW = CW - 190 - 24 - (tr.foto ? 96 : 0);
  let h = 18 + 34 + 26; // título + pills
  h += 16 + tr.lineas.length * 17 + tr.opciones.length * 17;
  if (tr.extras.length) h += 18;
  h += 22;
  for (const p of tr.pasos) h += th(doc, p, CW - 190 - 44, { size: 9 }) + 5;
  return { h: Math.max(tr.glass === "shot" ? 150 : 250, h + 16), rightW };
}

function ficha(doc: Doc, tr: DosierTrago, y: number): number {
  const { h, rightW } = fichaLayout(doc, tr);
  rr(doc, M, y, CW, h, 16, "#FFFFFF", { stroke: C.faint, lw: 1 });
  rr(doc, M, y, 190, h, 16, C.faint, { opacity: 0.55 });
  doc.save(); doc.rect(M + 175, y, 15, h).fill(C.faint).fillOpacity(0.55); doc.restore();

  // Vaso con capas.
  const layers: Layer[] = capasDeFicha(tr);
  const ice = hieloDeFicha(tr);
  const rim = bordeDeFicha(tr);
  const gh = Math.min(h - 60, tr.glass === "shot" ? 70 : tr.glass === "copa_xl" ? 200 : 180);
  // Centrado en la columna, con espacio abajo para la etiqueta del vaso.
  drawGlass(doc, tr.glass, M + 95, y + (h - 30 + gh) / 2 + (tr.glass === "vaso" ? 6 : 0), gh, { capacity: tr.glassMl || 500, layers, ice: ice as any, rim, straw: tr.glass !== "shot" });
  t(doc, `${tr.glassLabel}${tr.glassMl ? ` · ${tr.glassMl} ml` : ""}`, M + 10, y + h - 26, { size: 9, bold: true, color: C.muted, width: 170, align: "center" });

  // Contenido.
  const x = M + 190 + 18;
  let yy = y + 16;
  t(doc, tr.section.toUpperCase(), x, yy, { size: 7.5, bold: true, color: C.sky, spacing: 1.5 });
  yy += 11;
  t(doc, tr.name, x, yy, { size: 24, display: true, color: C.ink, width: rightW });
  yy += 34;
  let px = x;
  px += pill(doc, tr.glassLabel.toUpperCase(), px, yy, C.pink, "#FFFFFF") + 5;
  const totalMl = layers.reduce((s, l) => s + l.ml, 0);
  if (totalMl > 0 && tr.glass !== "shot") px += pill(doc, `${Math.round(totalMl)} ml de liquido`, px, yy, C.skySoft, C.sky) + 5;
  yy += 26;

  t(doc, "INGREDIENTES", x, yy, { size: 7.5, bold: true, color: C.muted, spacing: 1.5 });
  yy += 14;
  let ci = 0;
  for (const l of tr.lineas) {
    const col = l.unit === "ml" ? colorDe(l.name, ci++) : "#CFC3D6";
    doc.save(); doc.circle(x + 4, yy + 5, 4).fill(col); doc.circle(x + 4, yy + 5, 4).lineWidth(0.5).stroke("#B9AEC2"); doc.restore();
    t(doc, l.name, x + 14, yy, { size: 10, color: C.ink, width: rightW - 110 });
    t(doc, l.texto, x, yy, { size: 10, bold: true, color: C.ink, width: (tr.foto ? rightW : CW - 190 - 36), align: "right" });
    yy += 17;
  }
  for (const o of tr.opciones) {
    const col = colorDe(o.choices[0] ?? o.label, ci++);
    doc.save(); doc.circle(x + 4, yy + 5, 4).fill(col); doc.restore();
    t(doc, `${o.label}: ${o.choices.join(" / ")}`, x + 14, yy, { size: 10, color: C.ink, width: rightW - 80 });
    if (o.ml > 0) t(doc, `${o.ml} ml`, x, yy, { size: 10, bold: true, color: C.ink, width: (tr.foto ? rightW : CW - 190 - 36), align: "right" });
    yy += 17;
  }
  if (tr.extras.length) {
    let ex = x;
    for (const e of tr.extras) {
      const w = tw(doc, e, { size: 8, bold: true }) + 14;
      if (ex + w > x + CW - 190 - 36) break;
      ex += pill(doc, e, ex, yy, C.pinkSoft, C.pink, 8) + 4;
    }
    yy += 20;
  }
  yy += 4;
  t(doc, "PREPARACION", x, yy, { size: 7.5, bold: true, color: C.muted, spacing: 1.5 });
  yy += 14;
  tr.pasos.forEach((p, i) => {
    doc.save(); doc.circle(x + 7, yy + 6, 7).fill(C.night); doc.restore();
    t(doc, String(i + 1), x, yy + 2, { size: 8, bold: true, color: "#FFFFFF", width: 14, align: "center" });
    const end = t(doc, p, x + 20, yy, { size: 9, color: C.ink, width: CW - 190 - 44 });
    yy = end + 5;
  });

  // Foto del trago, arriba a la derecha.
  if (tr.foto) {
    const fs = 86;
    const fx = M + CW - fs - 14;
    const fy = y + 14;
    try {
      doc.save();
      doc.roundedRect(fx, fy, fs, fs, 12).clip();
      doc.image(tr.foto, fx, fy, { cover: [fs, fs], align: "center", valign: "center" });
      doc.restore();
      doc.save(); doc.roundedRect(fx, fy, fs, fs, 12).lineWidth(2).stroke(C.pink); doc.restore();
    } catch { doc.restore(); }
  }
  return y + h;
}


function sectionHeader(doc: Doc, name: string, y: number): number {
  doc.save(); doc.rect(M, y + 6, 4, 22).fill(C.pink); doc.restore();
  t(doc, name, M + 12, y + 2, { size: 22, display: true, color: C.ink });
  return y + 40;
}

function summary(doc: Doc, d: DosierData) {
  let y = lightPage(doc, "Resumen para la barra", d.eventTitle);
  t(doc, "Resumen rapido", M, y, { size: 26, display: true });
  y += 38;
  const cols = [{ k: "Trago", w: 150 }, { k: "Vaso", w: 72 }, { k: "Ingredientes", w: 200 }, { k: "Opciones / extras", w: CW - 150 - 72 - 200 }];
  const head = () => {
    rr(doc, M, y, CW, 22, 6, C.night);
    let x = M + 8;
    for (const c of cols) { t(doc, c.k.toUpperCase(), x, y + 7, { size: 7.5, bold: true, color: "#FFFFFF", spacing: 1 }); x += c.w; }
    y += 26;
  };
  head();
  d.tragos.forEach((tr, i) => {
    const ing = tr.lineas.map((l) => `${l.name} ${l.texto}`).join(" · ");
    const op = [...tr.opciones.map((o) => `${o.label}: ${o.choices.join("/")}`), ...tr.extras].join(" · ");
    const rh = Math.max(th(doc, tr.name, cols[0].w - 10, { size: 9.5, bold: true }), th(doc, ing, cols[2].w - 10, { size: 8.5 }), th(doc, op, cols[3].w - 10, { size: 8 })) + 10;
    if (y + rh > H - 40) { y = lightPage(doc, "Resumen para la barra", d.eventTitle); head(); }
    if (i % 2) rr(doc, M, y - 3, CW, rh, 4, C.faint, { opacity: 0.45 });
    let x = M + 8;
    t(doc, tr.name, x, y + 2, { size: 9.5, bold: true, width: cols[0].w - 10 }); x += cols[0].w;
    t(doc, `${tr.glassLabel}${tr.glassMl ? ` ${tr.glassMl}` : ""}`, x, y + 2, { size: 8.5, color: C.pink, bold: true, width: cols[1].w - 6 }); x += cols[1].w;
    t(doc, ing, x, y + 2, { size: 8.5, width: cols[2].w - 10 }); x += cols[2].w;
    t(doc, op || "-", x, y + 2, { size: 8, color: C.muted, width: cols[3].w - 10 });
    y += rh;
  });
  if (d.talCual.length) {
    y += 16;
    if (y > H - 120) y = lightPage(doc, "Resumen para la barra", d.eventTitle);
    t(doc, "Se sirven tal cual (botella o lata)", M, y, { size: 16, display: true });
    y += 26;
    t(doc, d.talCual.map((x) => x.name).join("  ·  "), M, y, { size: 10, width: CW, color: C.ink, lineGap: 4 });
  }
}

/** Arma el PDF completo. */
export async function buildDosierPdf(d: DosierData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: safe(`Dosier de barra - ${d.eventTitle}`), Author: "Mansion Playroom", Creator: "Mansion Playroom" } });
  doc.registerFont("Anton", Buffer.from(ANTON_TTF_BASE64, "base64"));
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  cover(doc, d);
  guide(doc, d);

  // Fichas, agrupadas por sección.
  let y = H;
  let section = "";
  for (const tr of d.tragos) {
    const need = fichaLayout(doc, tr).h + (tr.section !== section ? 40 : 0);
    if (y + need > H - 40) { y = lightPage(doc, "Fichas de preparacion", d.eventTitle); section = ""; }
    if (tr.section !== section) { y = sectionHeader(doc, tr.section, y); section = tr.section; }
    y = ficha(doc, tr, y) + 14;
  }

  summary(doc, d);

  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) { doc.switchToPage(range.start + i); footer(doc, i + 1, range.count); }
  doc.end();
  return done;
}
