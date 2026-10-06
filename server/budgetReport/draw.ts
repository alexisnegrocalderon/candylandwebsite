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
  bgLight: "#FFFFFF", // blanco editorial
  skySoft: "#EAF6FC",
  pinkSoft: "#FCEEF3",
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

/** `display` = Anton (titulares y cifras grandes, condensada gruesa tipo editorial). */
export type FontKind = "display";
export const fontName = (o: { bold?: boolean; font?: FontKind }) =>
  o.font === "display" ? "Anton" : o.bold ? "Helvetica-Bold" : "Helvetica";

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

/** Panel editorial: fondo blanco, borde de tinta fino y esquinas casi rectas. */
export function card(doc: Doc, x: number, y: number, w: number, h: number, o: { fill?: string; accent?: string; shadow?: string } = {}) {
  rrect(doc, x, y, w, h, 2, o.fill ?? C.card, { stroke: C.ink, strokeWidth: 0.8 });
  if (o.accent) rect2(doc, x, y, 5, h, o.accent);
}

function rect2(doc: Doc, x: number, y: number, w: number, h: number, fill: string) {
  doc.save();
  doc.rect(x, y, w, h).fill(fill);
  doc.restore();
}

export function pill(doc: Doc, label: string, x: number, y: number, o: { bg: string; color: string; size?: number; padX?: number; h?: number }): number {
  const size = o.size ?? 10;
  const padX = o.padX ?? 10;
  const h = o.h ?? size + 10;
  doc.font("Helvetica-Bold").fontSize(size);
  const w = doc.widthOfString(safe(label)) + padX * 2;
  rrect(doc, x, y, w, h, 3, o.bg);
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
  rrect(doc, x, y, w, h, 1.5, bg);
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) rrect(doc, x, y, Math.max(fw, h), h, 1.5, color);
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
      rrect(doc, bx, by, barW, Math.max(bh, 1.5), 1.5, v.color);
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

/* ─── Elementos editoriales ─────────────────────────────────── */

/** Bloque de color semitransparente: las superposiciones dejan ver lo de abajo. */
export function block(doc: Doc, x: number, y: number, w: number, h: number, color: string, opacity = 0.8) {
  doc.save();
  doc.fillOpacity(opacity).rect(x, y, w, h).fill(color);
  doc.restore();
}

/** Línea fina (horizontal o vertical). */
export function rule(doc: Doc, x1: number, y1: number, x2: number, y2: number, o: { color?: string; width?: number } = {}) {
  doc.save();
  doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(o.width ?? 0.8).stroke(o.color ?? C.ink);
  doc.restore();
}

/** Cruz pequeña de acento (como las del Mooral). */
export function cross(doc: Doc, cx: number, cy: number, size: number, color: string = C.pink) {
  doc.save();
  doc.lineWidth(size / 3.2).lineCap("butt");
  doc.moveTo(cx - size / 2, cy - size / 2).lineTo(cx + size / 2, cy + size / 2).stroke(color);
  doc.moveTo(cx + size / 2, cy - size / 2).lineTo(cx - size / 2, cy + size / 2).stroke(color);
  doc.restore();
}
