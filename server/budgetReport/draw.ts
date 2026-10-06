/** Primitivas de dibujo para los informes de simulación (pdfkit, página 960×540).
 *
 * Todo se dibuja con rectángulos, trazos y arcos (sin navegador ni librería de
 * gráficos), así corre en las funciones serverless de Vercel. La fuente es
 * Helvetica estándar: solo dibuja Latin-1 (tildes y ñ sí; emojis y flechas no),
 * por eso `safe()` limpia lo que no soporta. */

export const W = 960;
export const H = 540;

// Identidad Playroom: celeste y rosado pastel mate, tinta casi negra para texto y bordes.
// `violet` y `sky` conservan su nombre por compatibilidad: hoy son celestes.
export const C = {
  bgDark: "#A9DDF2", // celeste mate (portada)
  bgDark2: "#F3BFD2", // rosado pastel mate
  bgLight: "#FBF6EF", // crema
  skySoft: "#E1F2FA",
  pinkSoft: "#FCE7EF",
  card: "#ffffff",
  ink: "#16121A",
  muted: "#5E5566",
  faint: "#E6DCE2",
  pink: "#D94F8C", // rosa fuerte (acentos)
  violet: "#2AA7DC", // celeste vivo (acentos)
  sky: "#7CC6E8",
  green: "#22b07d",
  greenSoft: "#d9f5ea",
  amber: "#f5a524",
  amberSoft: "#fdefd0",
  orange: "#f97316",
  red: "#e5484d",
  redSoft: "#fde0e1",
  white: "#ffffff",
} as const;

export const PALETTE = [C.pink, C.violet, "#F2A7C3", C.green, C.amber, "#7CC6E8", C.orange, "#B07CC6", "#2dd4bf", "#94a3b8"];

type Doc = PDFKit.PDFDocument;

/** Deja solo lo que la fuente estándar puede dibujar. */
export function safe(text: string | number | null | undefined): string {
  return String(text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→⇒]/g, ">")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    // Latin-1 + los signos que WinAnsi sí tiene (guion largo, viñeta, puntos suspensivos, euro).
    .replace(/[^ -~ -ÿ–—•…€]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

/** $18,3 M / $950 mil / $4.200: para números grandes en tarjetas. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000).toLocaleString("es-CL")} mil`;
  return `${sign}$${Math.round(abs).toLocaleString("es-CL")}`;
}

export const pctText = (n: number | null | undefined) => (n == null ? "-" : `${n.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);

/* ─── Texto ─────────────────────────────────────────────────── */

/** `display` = Anton (titulares y cifras grandes), `marker` = Permanent Marker (acentos a mano). */
export type FontKind = "display" | "marker";
export const fontName = (o: { bold?: boolean; font?: FontKind }) =>
  o.font === "display" ? "Anton" : o.font === "marker" ? "Marker" : o.bold ? "Helvetica-Bold" : "Helvetica";

export type TextOpts = {
  font?: FontKind;
  size?: number;
  color?: string;
  bold?: boolean;
  width?: number;
  align?: "left" | "center" | "right";
  height?: number;
  lineGap?: number;
  opacity?: number;
  spacing?: number;
};

export function text(doc: Doc, str: string | number, x: number, y: number, o: TextOpts = {}): number {
  doc.save();
  doc.font(fontName(o)).fontSize(o.size ?? 12).fillColor(o.color ?? C.ink);
  if (o.opacity != null) doc.fillOpacity(o.opacity);
  const opts: PDFKit.Mixins.TextOptions = { width: o.width, align: o.align ?? "left", lineGap: o.lineGap ?? 2, ellipsis: o.height != null, height: o.height, characterSpacing: o.spacing };
  const s = safe(str);
  doc.text(s, x, y, opts);
  const bottom = doc.y;
  doc.restore();
  return bottom;
}

/** Achica la letra hasta que el texto entre en `width` × `height`. */
export function fitText(doc: Doc, str: string, x: number, y: number, o: TextOpts & { width: number; height: number; maxSize: number; minSize?: number }): number {
  const s = safe(str);
  let size = o.maxSize;
  const min = o.minSize ?? 8;
  doc.font(fontName(o));
  while (size > min) {
    doc.fontSize(size);
    if (doc.heightOfString(s, { width: o.width, lineGap: o.lineGap ?? 2 }) <= o.height) break;
    size -= 1;
  }
  return text(doc, s, x, y, { ...o, size, height: o.height });
}

export function textHeight(doc: Doc, str: string, width: number, size: number, bold = false, lineGap = 2, font?: FontKind): number {
  doc.font(fontName({ bold, font })).fontSize(size);
  return doc.heightOfString(safe(str), { width, lineGap });
}

/* ─── Formas ────────────────────────────────────────────────── */

export function rrect(doc: Doc, x: number, y: number, w: number, h: number, r: number, fill: string, opts: { opacity?: number; stroke?: string; strokeWidth?: number } = {}) {
  doc.save();
  if (opts.opacity != null) doc.fillOpacity(opts.opacity);
  doc.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)).fill(fill);
  doc.restore();
  if (opts.stroke) {
    doc.save();
    doc.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)).lineWidth(opts.strokeWidth ?? 1).stroke(opts.stroke);
    doc.restore();
  }
}

/** Tarjeta con borde de tinta y sombra dura desplazada (look sticker). */
export function card(doc: Doc, x: number, y: number, w: number, h: number, o: { fill?: string; accent?: string; shadow?: string } = {}) {
  rrect(doc, x + 4, y + 4, w, h, 10, o.shadow ?? C.ink);
  rrect(doc, x, y, w, h, 10, o.fill ?? C.card, { stroke: C.ink, strokeWidth: 1.6 });
  if (o.accent) rrect(doc, x + 10, y + 12, 5, h - 24, 2.5, o.accent);
}

export function pill(doc: Doc, label: string, x: number, y: number, o: { bg: string; color: string; size?: number; padX?: number; h?: number }): number {
  const size = o.size ?? 10;
  const padX = o.padX ?? 10;
  const h = o.h ?? size + 10;
  doc.font("Helvetica-Bold").fontSize(size);
  const w = doc.widthOfString(safe(label)) + padX * 2;
  rrect(doc, x, y, w, h, h / 2, o.bg, { stroke: C.ink, strokeWidth: 1 });
  text(doc, label, x + padX, y + (h - size) / 2 - 0.5, { size, bold: true, color: o.color, width: w - padX, align: "left" });
  return w;
}

export function gradient(doc: Doc, x: number, y: number, w: number, h: number, from: string, to: string, angle: "v" | "h" | "d" = "d") {
  const g = angle === "v" ? doc.linearGradient(x, y, x, y + h) : angle === "h" ? doc.linearGradient(x, y, x + w, y) : doc.linearGradient(x, y, x + w, y + h);
  g.stop(0, from).stop(1, to);
  doc.save();
  doc.rect(x, y, w, h).fill(g);
  doc.restore();
}

export function glow(doc: Doc, cx: number, cy: number, r: number, color: string, opacity = 0.25) {
  doc.save();
  for (let i = 5; i >= 1; i--) {
    doc.fillOpacity((opacity * (6 - i)) / 14);
    doc.circle(cx, cy, (r * i) / 5).fill(color);
  }
  doc.restore();
}

/* ─── Gráficos ──────────────────────────────────────────────── */

/** Sector de anillo como path SVG (pdfkit entiende arcos 'A'). */
function ringSegment(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${pt(rOuter, a0)} A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, a1)} L ${pt(rInner, a1)} A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, a0)} Z`;
}

export function donut(doc: Doc, cx: number, cy: number, rOuter: number, rInner: number, slices: { value: number; color: string }[]) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    doc.circle(cx, cy, rOuter).fill(C.faint);
    doc.circle(cx, cy, rInner).fill(C.card);
    return;
  }
  let angle = -Math.PI / 2;
  const gap = slices.length > 1 ? 0.012 : 0;
  for (const s of slices) {
    if (s.value <= 0) continue;
    const sweep = (s.value / total) * Math.PI * 2;
    // Un solo sector que ocupa todo el círculo no se puede trazar con un arco.
    const end = angle + Math.min(sweep, Math.PI * 2 - 0.0001) - gap;
    doc.path(ringSegment(cx, cy, rOuter, rInner, angle + gap, Math.max(angle + gap + 0.001, end))).fill(s.color);
    angle += sweep;
  }
}

/** Medidor semicircular: `value` sobre `max`, con una marca de meta. */
export function gauge(doc: Doc, cx: number, cy: number, r: number, thickness: number, value: number, max: number, color: string, target?: number) {
  const arc = (a0: number, a1: number, rr: number) => `${(cx + rr * Math.cos(a0)).toFixed(2)} ${(cy + rr * Math.sin(a0)).toFixed(2)}`;
  const ring = (frac: number) => {
    const a0 = Math.PI;
    const a1 = Math.PI + Math.PI * Math.max(0.0001, Math.min(1, frac));
    const rin = r - thickness;
    return `M ${arc(a0, a0, r)} A ${r} ${r} 0 0 1 ${arc(a1, a1, r)} L ${arc(a1, a1, rin)} A ${rin} ${rin} 0 0 0 ${arc(a0, a0, rin)} Z`;
  };
  doc.path(ring(1)).fill(C.faint);
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (frac > 0) doc.path(ring(frac)).fill(color);
  if (target != null && max > 0) {
    const a = Math.PI + Math.PI * Math.max(0, Math.min(1, target / max));
    doc.save();
    doc.moveTo(cx + (r - thickness - 4) * Math.cos(a), cy + (r - thickness - 4) * Math.sin(a))
      .lineTo(cx + (r + 5) * Math.cos(a), cy + (r + 5) * Math.sin(a)).lineWidth(2).stroke(C.ink);
    doc.restore();
  }
}

export function hbar(doc: Doc, x: number, y: number, w: number, h: number, frac: number, color: string, bg: string = C.faint) {
  rrect(doc, x, y, w, h, h / 2, bg);
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) rrect(doc, x, y, Math.max(fw, h), h, h / 2, color);
}

export type BarGroup = { label: string; values: { value: number; color: string }[]; caption?: string };

/** Barras verticales (agrupadas), con línea del cero si hay valores negativos. */
export function barChart(doc: Doc, x: number, y: number, w: number, h: number, groups: BarGroup[], o: { format?: (n: number) => string; valueSize?: number } = {}) {
  const fmt = o.format ?? compact;
  const all = groups.flatMap((g) => g.values.map((v) => v.value));
  const max = Math.max(1, ...all, 0);
  const min = Math.min(0, ...all);
  const range = max - min || 1;
  const labelH = 34;
  const top = y + 18;
  const plotH = h - labelH - 18;
  const zeroY = top + (max / range) * plotH;
  const groupW = w / groups.length;
  doc.save();
  doc.moveTo(x, zeroY).lineTo(x + w, zeroY).lineWidth(1).stroke(C.faint);
  doc.restore();
  groups.forEach((g, gi) => {
    const barW = Math.min(64, (groupW * 0.7) / g.values.length);
    const used = barW * g.values.length + 8 * (g.values.length - 1);
    const startX = x + gi * groupW + (groupW - used) / 2;
    g.values.forEach((v, vi) => {
      const bh = (Math.abs(v.value) / range) * plotH;
      const bx = startX + vi * (barW + 8);
      const by = v.value >= 0 ? zeroY - bh : zeroY;
      rrect(doc, bx, by, barW, Math.max(bh, 1.5), 4, v.color, { stroke: C.ink, strokeWidth: 1.2 });
      const ly = v.value >= 0 ? by - 14 : by + bh + 3;
      text(doc, fmt(v.value), bx - 14, ly, { size: o.valueSize ?? 9, bold: true, color: C.ink, width: barW + 28, align: "center" });
    });
    text(doc, g.label, x + gi * groupW + 2, top + plotH + 8 + (zeroY < top + plotH - 2 ? 0 : 0), { size: 10, bold: true, color: C.ink, width: groupW - 4, align: "center", height: 14 });
    if (g.caption) text(doc, g.caption, x + gi * groupW + 2, top + plotH + 21, { size: 8.5, color: C.muted, width: groupW - 4, align: "center", height: 12 });
  });
}

export type LineSeries = { name: string; color: string; points: { x: number; y: number }[]; dashed?: boolean };

/** Líneas sobre ejes numéricos con la línea del cero y marcas en los extremos. */
export function lineChart(doc: Doc, x: number, y: number, w: number, h: number, series: LineSeries[], o: {
  xLabel?: (v: number) => string; yLabel?: (v: number) => string; marks?: { x: number; label: string; color: string }[]; xTicks?: number[];
} = {}) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(0, ...ys), yMax = Math.max(0, ...ys);
  if (yMax === yMin) yMax = yMin + 1;
  const padL = 62, padB = 24, padT = 10;
  const plotX = x + padL, plotW = w - padL - 8, plotY = y + padT, plotH = h - padB - padT;
  const sx = (v: number) => plotX + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (v: number) => plotY + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const yl = o.yLabel ?? compact;
  const xl = o.xLabel ?? ((v: number) => String(Math.round(v)));

  // Rejilla horizontal con 4 niveles
  for (let i = 0; i <= 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 4;
    const gy = sy(v);
    doc.save();
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.6).stroke(C.faint);
    doc.restore();
    text(doc, yl(v), x, gy - 5, { size: 8.5, color: C.muted, width: padL - 6, align: "right" });
  }
  // Línea del cero más marcada
  if (yMin < 0 && yMax > 0) {
    doc.save();
    doc.moveTo(plotX, sy(0)).lineTo(plotX + plotW, sy(0)).lineWidth(1.3).stroke(C.muted);
    doc.restore();
  }
  const ticks = o.xTicks ?? [xMin, (xMin + xMax) / 2, xMax];
  for (const t of ticks) text(doc, xl(t), sx(t) - 30, plotY + plotH + 7, { size: 8.5, color: C.muted, width: 60, align: "center" });

  for (const m of o.marks ?? []) {
    if (m.x < xMin || m.x > xMax) continue;
    doc.save();
    doc.moveTo(sx(m.x), plotY).lineTo(sx(m.x), plotY + plotH).lineWidth(1).dash(3, { space: 3 }).stroke(m.color);
    doc.restore();
    text(doc, m.label, sx(m.x) - 70, plotY - 2, { size: 8.5, bold: true, color: m.color, width: 140, align: "center" });
  }
  for (const s of series) {
    if (s.points.length < 2) continue;
    doc.save();
    doc.lineWidth(2.6).lineJoin("round").lineCap("round");
    if (s.dashed) doc.dash(5, { space: 4 });
    doc.moveTo(sx(s.points[0].x), sy(s.points[0].y));
    for (const p of s.points.slice(1)) doc.lineTo(sx(p.x), sy(p.y));
    doc.stroke(s.color);
    doc.restore();
    const last = s.points[s.points.length - 1];
    doc.circle(sx(last.x), sy(last.y), 3.5).fill(s.color);
  }
}

/** Leyenda horizontal simple. Devuelve el ancho usado. */
export function legend(doc: Doc, items: { label: string; color: string }[], x: number, y: number, size = 9.5): number {
  let cx = x;
  for (const it of items) {
    rrect(doc, cx, y + 1, 9, 9, 2, it.color);
    doc.font("Helvetica").fontSize(size);
    const w = doc.widthOfString(safe(it.label));
    text(doc, it.label, cx + 14, y, { size, color: C.muted, width: w + 6 });
    cx += 14 + w + 18;
  }
  return cx - x;
}

/* ─── Elementos de marca (stickers, cintas, sello) ──────────── */

/** Dibuja un path en caja unitaria (0..1) escalado a `s`, con sombra dura opcional. */
function unitShape(doc: Doc, d: string, x: number, y: number, s: number, o: { fill: string; rotate?: number; shadow?: boolean }) {
  const draw = (dx: number, dy: number, fill: string, stroke: boolean) => {
    doc.save();
    if (o.rotate) doc.rotate(o.rotate, { origin: [x + s / 2, y + s / 2] });
    doc.translate(x + dx, y + dy).scale(s);
    doc.path(d);
    if (stroke) doc.lineWidth(2 / s).lineJoin("round").fillAndStroke(fill, C.ink);
    else doc.fill(fill);
    doc.restore();
  };
  if (o.shadow !== false) draw(s * 0.07, s * 0.07, C.ink, false);
  draw(0, 0, o.fill, true);
}

export type Doodle = "heart" | "arrow" | "bubble" | "star";
const DOODLE_PATH: Record<Doodle, string> = {
  heart: "M 0.5 0.95 C 0.08 0.62 0 0.42 0 0.26 C 0 0.1 0.12 0 0.27 0 C 0.38 0 0.46 0.06 0.5 0.16 C 0.54 0.06 0.62 0 0.73 0 C 0.88 0 1 0.1 1 0.26 C 1 0.42 0.92 0.62 0.5 0.95 Z",
  arrow: "M 0.05 0.05 L 0.7 0.12 L 0.52 0.3 L 0.95 0.73 L 0.73 0.95 L 0.3 0.52 L 0.12 0.7 Z",
  bubble: "M 0.5 0.05 C 0.8 0.05 0.97 0.25 0.97 0.45 C 0.97 0.65 0.8 0.82 0.55 0.84 L 0.3 0.98 L 0.34 0.8 C 0.15 0.74 0.03 0.6 0.03 0.45 C 0.03 0.25 0.2 0.05 0.5 0.05 Z",
  star: "M 0.5 0 L 0.62 0.36 L 1 0.38 L 0.7 0.61 L 0.8 1 L 0.5 0.78 L 0.2 1 L 0.3 0.61 L 0 0.38 L 0.38 0.36 Z",
};

/** Figura decorativa tipo sticker (sin emojis: la fuente estándar no los dibuja). */
export function doodle(doc: Doc, kind: Doodle, x: number, y: number, size: number, fill: string, rotate = 0) {
  unitShape(doc, DOODLE_PATH[kind], x, y, size, { fill, rotate });
}

/** Etiqueta tipo sticker: borde de tinta, sombra dura y leve inclinación. Devuelve su ancho. */
export function sticker(doc: Doc, label: string, x: number, y: number, o: { fill?: string; color?: string; size?: number; rotate?: number; font?: FontKind } = {}): number {
  const size = o.size ?? 13;
  const padX = 11;
  const h = size + 14;
  doc.font(fontName({ font: o.font ?? "display" })).fontSize(size);
  const str = safe(label).toUpperCase();
  const w = doc.widthOfString(str) + padX * 2 + str.length * 0.6;
  doc.save();
  if (o.rotate) doc.rotate(o.rotate, { origin: [x + w / 2, y + h / 2] });
  rrect(doc, x + 3.5, y + 3.5, w, h, 5, C.ink);
  rrect(doc, x, y, w, h, 5, o.fill ?? C.pink, { stroke: C.ink, strokeWidth: 1.8 });
  text(doc, str, x + padX, y + (h - size) / 2 - 1, { size, font: o.font ?? "display", color: o.color ?? C.white, width: w, spacing: 0.6 });
  doc.restore();
  return w;
}

/** Texto a mano (hashtag, nota) con leve inclinación. */
export function scribble(doc: Doc, str: string, x: number, y: number, o: { size?: number; color?: string; rotate?: number } = {}) {
  const size = o.size ?? 16;
  doc.save();
  if (o.rotate) doc.rotate(o.rotate, { origin: [x, y] });
  text(doc, str, x, y, { font: "marker", size, color: o.color ?? C.pink, width: 400 });
  doc.restore();
}

/** Franja de marca a todo el ancho con el nombre repetido y el logo. */
export function brandTape(doc: Doc, y: number, logo: Buffer, o: { fill?: string; color?: string; h?: number } = {}) {
  const h = o.h ?? 30;
  doc.save();
  doc.rect(0, y, W, h).fill(o.fill ?? C.violet);
  doc.moveTo(0, y).lineTo(W, y).lineWidth(1.8).stroke(C.ink);
  doc.moveTo(0, y + h).lineTo(W, y + h).lineWidth(1.8).stroke(C.ink);
  doc.restore();
  const label = "MANSION PLAYROOM";
  doc.font("Anton").fontSize(15);
  const tw = doc.widthOfString(label) + 4 * label.length * 0.1;
  const step = tw + 70;
  for (let cx = 28; cx < W; cx += step) {
    text(doc, label, cx, y + (h - 15) / 2 - 1, { font: "display", size: 15, color: o.color ?? C.ink, width: tw + 20, spacing: 1.5 });
    doc.image(logo, cx + tw + 22, y + 5, { height: h - 10 });
  }
}

/** Cinta inclinada con texto repetido (cruza una esquina de la página). */
export function slantedTape(doc: Doc, str: string, cx: number, cy: number, o: { w?: number; rotate?: number; fill?: string; color?: string } = {}) {
  const w = o.w ?? 460;
  const h = 24;
  doc.save();
  doc.rotate(o.rotate ?? -8, { origin: [cx, cy] });
  doc.rect(cx - w / 2, cy - h / 2, w, h).fill(o.fill ?? C.ink);
  doc.restore();
  doc.save();
  doc.rotate(o.rotate ?? -8, { origin: [cx, cy] });
  doc.font("Anton").fontSize(12);
  const unit = `${safe(str).toUpperCase()}   *   `;
  const uw = doc.widthOfString(unit) + unit.length * 1;
  let t = "";
  while (doc.widthOfString(t) + t.length * 1 < w) t += unit;
  text(doc, t, cx - w / 2 + 6, cy - 7, { font: "display", size: 12, color: o.color ?? C.bgDark, width: w * 3, spacing: 1, height: 16 });
  void uw;
  doc.restore();
}

/** Sello circular con texto alrededor y el logo al centro. */
export function stamp(doc: Doc, cx: number, cy: number, r: number, str: string, logo: Buffer, o: { fill?: string; color?: string } = {}) {
  doc.save();
  doc.circle(cx + 3.5, cy + 3.5, r).fill(C.ink);
  doc.circle(cx, cy, r).lineWidth(1.8).fillAndStroke(o.fill ?? C.bgDark2, C.ink);
  doc.restore();
  const label = safe(str).toUpperCase();
  const size = Math.max(7.5, r * 0.19);
  doc.font("Marker").fontSize(size);
  const radius = r - size * 1.15;
  const total = label.length;
  const span = Math.PI * 2 * 0.94;
  for (let i = 0; i < total; i++) {
    const a = -Math.PI / 2 + (span * i) / total;
    const px = cx + radius * Math.cos(a);
    const py = cy + radius * Math.sin(a);
    doc.save();
    doc.rotate((a * 180) / Math.PI + 90, { origin: [px, py] });
    doc.fillColor(o.color ?? C.ink).fontSize(size).text(label[i], px - size / 2, py - size / 2, { width: size, align: "center", lineBreak: false });
    doc.restore();
  }
  const lh = r * 0.9;
  doc.image(logo, cx - (lh * 174) / 240 / 2, cy - lh / 2, { height: lh });
}
