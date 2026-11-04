/* Inventario en PDF, en formato infografía: portada con lo importante (valor, alertas), stock por grupo con barras de
 * nivel, lo que se usó en el evento, lo que falta comprar y dónde está la plata. Módulo PURO: recibe el inventario ya
 * armado (shared/inventarioReporte.ts) y solo dibuja con pdfkit, sin navegador, así corre en Vercel. */
import PDFDocument from "pdfkit";
import { LOGO_PNG_BASE64 } from "./budgetReport/logo";
import { ANTON_TTF_BASE64 } from "./budgetReport/fonts";
import { safe } from "./budgetReport/draw";
import type { FilaStock, Inventario, NivelInventario } from "../shared/inventarioReporte";

type Doc = PDFKit.PDFDocument;

const W = 595.28;
const H = 841.89;
const M = 36;
const CW = W - M * 2;
const BOTTOM = H - 46;

const C = {
  night: "#120A18", night2: "#2A0F2E", pink: "#E8399A", pinkSoft: "#FCE7F3", sky: "#2AA7DC", skySoft: "#E3F4FB",
  ink: "#1B1320", muted: "#6B6172", faint: "#EDE6EF", zebra: "#FAF7FB", paper: "#FFFFFF",
  red: "#E5484D", redSoft: "#FDECEC", amber: "#F5A524", amberSoft: "#FEF3DC", green: "#2BB673", greenSoft: "#E3F6EC", grey: "#A59CAD",
};
const NIVEL: Record<NivelInventario, { color: string; soft: string; label: string }> = {
  agotado: { color: C.red, soft: C.redSoft, label: "AGOTADO" },
  bajo: { color: C.amber, soft: C.amberSoft, label: "QUEDA POCO" },
  ok: { color: C.green, soft: C.greenSoft, label: "OK" },
  sin_uso: { color: C.grey, soft: C.faint, label: "SIN RECETA" },
};
const GRUPO_COLOR: Record<string, string> = { bebida: C.pink, desechable: C.sky, limpieza: C.green, otro: C.amber };

const money = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const logo = Buffer.from(LOGO_PNG_BASE64, "base64");
const logoImgs = new WeakMap<Doc, unknown>();
const logoImg = (doc: Doc): any => {
  let img = logoImgs.get(doc);
  if (!img) { img = (doc as any).openImage(logo); logoImgs.set(doc, img); }
  return img;
};

type TOpts = { size?: number; color?: string; bold?: boolean; display?: boolean; width?: number; align?: "left" | "center" | "right"; spacing?: number; oneLine?: boolean };
function t(doc: Doc, s: string, x: number, y: number, o: TOpts = {}): number {
  doc.save();
  doc.font(o.display ? "Anton" : o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 10).fillColor(o.color ?? C.ink);
  doc.text(safe(s.replace(/\u2212/g, "-")), x, y, {
    width: o.width, align: o.align ?? "left", characterSpacing: o.spacing, lineGap: 1.5,
    ...(o.oneLine ? { height: (o.size ?? 10) + 2, ellipsis: true, lineBreak: false } : {}),
  });
  const y2 = doc.y;
  doc.restore();
  return y2;
}
function tw(doc: Doc, s: string, o: TOpts = {}): number {
  doc.font(o.display ? "Anton" : o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 10);
  return doc.widthOfString(safe(s.replace(/\u2212/g, "-")), { characterSpacing: o.spacing });
}
function rr(doc: Doc, x: number, y: number, w: number, h: number, r: number, fill: string, o: { stroke?: string; lw?: number } = {}) {
  doc.save();
  doc.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)).fill(fill);
  doc.restore();
  if (o.stroke) { doc.save(); doc.roundedRect(x, y, w, h, Math.min(r, w / 2, h / 2)).lineWidth(o.lw ?? 1).stroke(o.stroke); doc.restore(); }
}
function pill(doc: Doc, s: string, x: number, y: number, bg: string, color: string, size = 7.5): number {
  const w = tw(doc, s, { size, bold: true }) + 12;
  rr(doc, x, y, w, size + 8, (size + 8) / 2, bg);
  t(doc, s, x + 6, y + 3.8, { size, bold: true, color });
  return w;
}
function dot(doc: Doc, x: number, y: number, r: number, color: string) {
  doc.save(); doc.circle(x, y, r).fill(color); doc.restore();
}
function bar(doc: Doc, x: number, y: number, w: number, h: number, pct: number, color: string) {
  rr(doc, x, y, w, h, h / 2, C.faint);
  if (pct > 0) rr(doc, x, y, Math.max(h, w * Math.min(1, pct)), h, h / 2, color);
}
const fechaChile = (d: Date) => new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "long", timeStyle: "short" }).format(d);

/** Página clara con la banda de marca; devuelve el y desde donde escribir. */
function lightPage(doc: Doc, title: string, inv: Inventario): number {
  doc.addPage({ size: "A4", margin: 0 });
  doc.page.margins.bottom = -5000;
  doc.rect(0, 0, W, H).fill(C.paper);
  doc.rect(0, 0, W, 54).fill(C.night);
  doc.image(logoImg(doc), M, 9, { height: 36 });
  t(doc, "MANSION", M + 34, 13, { size: 7, bold: true, color: "#FFFFFF", spacing: 2.5 });
  t(doc, "PLAYROOM", M + 34, 21, { size: 18, display: true, color: C.pink, spacing: 1 });
  t(doc, title.toUpperCase(), M, 16, { size: 9, bold: true, color: "#FFFFFF", width: CW, align: "right", spacing: 1.5 });
  t(doc, inv.eventTitle, M, 30, { size: 8, color: "#CFC3D6", width: CW, align: "right", oneLine: true });
  return 72;
}
function sectionTitle(doc: Doc, s: string, y: number, sub?: string): number {
  t(doc, s.toUpperCase(), M, y, { size: 20, display: true, color: C.ink, spacing: 1 });
  doc.save(); doc.rect(M, y + 26, 38, 3).fill(C.pink); doc.restore();
  if (sub) return t(doc, sub, M, y + 36, { size: 8.5, color: C.muted, width: CW }) + 8;
  return y + 40;
}
function footer(doc: Doc, n: number, total: number) {
  t(doc, "Inventario · Mansion Playroom · La evolucion del carrete", M, H - 24, { size: 7, color: C.muted });
  t(doc, `${n} / ${total}`, M, H - 24, { size: 7, color: C.muted, width: CW, align: "right" });
}

/* ─── Portada ───────────────────────────────────────────────── */

function cover(doc: Doc, inv: Inventario) {
  doc.addPage({ size: "A4", margin: 0 });
  doc.page.margins.bottom = -5000;
  doc.rect(0, 0, W, H).fill(C.paper);
  const g = doc.linearGradient(0, 0, W, 250);
  g.stop(0, C.night).stop(1, C.night2);
  doc.rect(0, 0, W, 236).fill(g);
  const rg = doc.radialGradient(W - 90, 60, 5, W - 90, 60, 230);
  rg.stop(0, C.pink, 0.35).stop(1, C.pink, 0);
  doc.rect(0, 0, W, 236).fill(rg);

  doc.image(logoImg(doc), M, 28, { height: 52 });
  t(doc, "MANSION", M + 50, 34, { size: 9, bold: true, color: "#FFFFFF", spacing: 4 });
  t(doc, "PLAYROOM", M + 50, 46, { size: 26, display: true, color: C.pink, spacing: 1.5 });
  t(doc, "INVENTARIO", M, 94, { size: 50, display: true, color: "#FFFFFF", spacing: 3 });
  t(doc, inv.eventTitle, M, 166, { size: 14, bold: true, color: "#FFFFFF", width: CW, oneLine: true });
  t(doc, `Actualizado el ${fechaChile(inv.emittedAt)} (hora de Chile)  ·  Calculado para ${inv.personas.toLocaleString("es-CL")} personas`, M, 188, { size: 8.5, color: "#CFC3D6", width: CW });

  // Indicadores.
  const k = inv.kpis;
  const gap = 9;
  const tw4 = (CW - gap * 3) / 4;
  const tiles: { label: string; value: string; sub: string; color: string; soft: string }[] = [
    { label: "VALOR DEL STOCK", value: money(k.valorStock), sub: k.sinCosto > 0 ? `${k.sinCosto} sin costo cargado` : "con todos los costos", color: C.pink, soft: C.pinkSoft },
    { label: "INSUMOS", value: String(k.insumos), sub: `${k.agotados} agotados · ${k.bajos} con poco`, color: k.agotados > 0 ? C.red : C.green, soft: k.agotados > 0 ? C.redSoft : C.greenSoft },
    { label: "USADO EN EL EVENTO", value: money(k.valorUsado), sub: inv.totalMerma > 0 ? `merma ${money(inv.totalMerma)}` : "sin merma registrada", color: C.sky, soft: C.skySoft },
    { label: "POR COMPRAR", value: money(k.costoCompra), sub: `${k.porComprar} ${k.porComprar === 1 ? "insumo" : "insumos"}`, color: C.amber, soft: C.amberSoft },
  ];
  tiles.forEach((tile, i) => {
    const x = M + i * (tw4 + gap);
    rr(doc, x, 214, tw4, 78, 12, C.paper, { stroke: C.faint, lw: 1 });
    rr(doc, x, 214, 5, 78, 2.5, tile.color);
    t(doc, tile.label, x + 14, 224, { size: 6.5, bold: true, color: C.muted, spacing: 1, width: tw4 - 18 });
    const size = tw(doc, tile.value, { size: 21, display: true }) > tw4 - 22 ? 16 : 21;
    t(doc, tile.value, x + 14, 238, { size, display: true, color: C.ink, width: tw4 - 18 });
    pill(doc, tile.sub.toUpperCase().slice(0, 28), x + 14, 268, tile.soft, tile.color, 5.8);
  });

  // Alertas.
  let y = sectionTitle(doc, "Lo urgente", 316);
  const alertas = inv.alertas;
  if (alertas.length === 0) {
    rr(doc, M, y, CW, 40, 10, C.greenSoft);
    dot(doc, M + 20, y + 20, 6, C.green);
    t(doc, "Todo el stock está sobre el mínimo. No hay nada agotado ni con poco.", M + 36, y + 15, { size: 10, bold: true, color: C.green, width: CW - 50 });
    y += 52;
  } else {
    const max = 9;
    for (const a of alertas.slice(0, max)) {
      const n = NIVEL[a.nivel];
      rr(doc, M, y, CW, 22, 8, n.soft);
      dot(doc, M + 13, y + 11, 4, n.color);
      t(doc, a.name, M + 26, y + 6.5, { size: 9.5, bold: true, width: 250, oneLine: true });
      t(doc, a.cantidad, M + 285, y + 7, { size: 8.5, color: C.muted, width: 120, oneLine: true });
      const w = tw(doc, n.label, { size: 7, bold: true }) + 12;
      pill(doc, n.label, M + CW - w - 8, y + 4, n.color, "#FFFFFF", 7);
      y += 26;
    }
    if (alertas.length > max) y = t(doc, `+ ${alertas.length - max} más en las páginas de stock`, M, y + 2, { size: 8.5, color: C.muted }) + 6;
    y += 8;
  }

  // Valor por grupo.
  y = sectionTitle(doc, "Dónde está el stock", y + 6);
  const maxV = Math.max(1, ...inv.grupos.map((gr) => gr.valor));
  for (const gr of inv.grupos) {
    const col = GRUPO_COLOR[gr.id] ?? C.pink;
    t(doc, gr.label, M, y + 3, { size: 9.5, bold: true, width: 110 });
    t(doc, `${gr.filas.length} insumos`, M + 100, y + 4, { size: 8, color: C.muted, width: 70 });
    bar(doc, M + 175, y + 2, 250, 11, gr.valor / maxV, col);
    t(doc, money(gr.valor), M + 175, y + 3, { size: 9, bold: true, color: C.ink, width: CW - 175, align: "right" });
    y += 24;
  }

  // Cómo leerlo.
  const ly = H - 112;
  rr(doc, M, ly, CW, 70, 12, C.zebra, { stroke: C.faint });
  t(doc, "CÓMO LEER ESTE INFORME", M + 14, ly + 10, { size: 7, bold: true, color: C.muted, spacing: 1.2 });
  const items: [NivelInventario, string][] = [["ok", "Stock sobre el mínimo"], ["bajo", "Queda poco: hay que reponer pronto"], ["agotado", "Se acabó"], ["sin_uso", "Ningún trago lo usa todavía"]];
  items.forEach(([n, txt], i) => {
    const x = M + 14 + (i % 2) * (CW / 2);
    const yy = ly + 26 + Math.floor(i / 2) * 16;
    dot(doc, x + 4, yy + 4.5, 4, NIVEL[n].color);
    t(doc, txt, x + 14, yy, { size: 8.5, color: C.ink, width: CW / 2 - 30, oneLine: true });
  });
  t(doc, "La barra de cada insumo compara lo que hay con lo que se abrió la noche o lo que se necesita. Los valores salen del costo por envase de cada insumo.", M + 14, ly + 58, { size: 7, color: C.muted, width: CW - 28 });
}

/* ─── Stock por grupo ───────────────────────────────────────── */

const ROW = 24;

function stockRow(doc: Doc, f: FilaStock, y: number, i: number) {
  if (i % 2 === 0) rr(doc, M, y, CW, ROW, 6, C.zebra);
  const n = NIVEL[f.nivel];
  dot(doc, M + 10, y + ROW / 2, 4, n.color);
  t(doc, f.name, M + 22, y + 7.5, { size: 9.5, bold: true, width: 190, oneLine: true });
  t(doc, f.cantidad, M + 218, y + 8, { size: 9, color: C.ink, width: 118, oneLine: true });
  if (f.pct !== null) { bar(doc, M + 342, y + 8.5, 100, 7, f.pct, n.color); t(doc, `${Math.round(f.pct * 100)}%`, M + 446, y + 8, { size: 7.5, color: C.muted, width: 30 }); }
  else t(doc, "sin referencia", M + 342, y + 8.5, { size: 7.5, color: C.grey, width: 100 });
  t(doc, f.valor === null ? "sin costo" : money(f.valor), M, y + 8, { size: 9, bold: f.valor !== null, color: f.valor === null ? C.grey : C.ink, width: CW - 6, align: "right" });
}

function stockPages(doc: Doc, inv: Inventario) {
  let y = BOTTOM;
  let first = true;
  for (const g of inv.grupos) {
    const col = GRUPO_COLOR[g.id] ?? C.pink;
    const header = (cont: boolean) => {
      rr(doc, M, y, CW, 26, 8, col);
      t(doc, `${g.label.toUpperCase()}${cont ? "  (sigue)" : ""}`, M + 12, y + 6, { size: 14, display: true, color: "#FFFFFF", spacing: 1.2 });
      t(doc, `${g.filas.length} insumos  ·  ${money(g.valor)}`, M, y + 9, { size: 8.5, bold: true, color: "#FFFFFF", width: CW - 12, align: "right" });
      y += 32;
      t(doc, "INSUMO", M + 22, y, { size: 6.5, bold: true, color: C.muted, spacing: 1 });
      t(doc, "HAY", M + 218, y, { size: 6.5, bold: true, color: C.muted, spacing: 1 });
      t(doc, "NIVEL", M + 342, y, { size: 6.5, bold: true, color: C.muted, spacing: 1 });
      t(doc, "VALOR", M, y, { size: 6.5, bold: true, color: C.muted, spacing: 1, width: CW - 6, align: "right" });
      y += 12;
    };
    if (y + 80 > BOTTOM) { y = lightPage(doc, "Stock actual", inv); if (first) { y = sectionTitle(doc, "Stock actual", y - 4, "Lo que hay hoy de cada insumo, del más urgente al más tranquilo. La barra compara con lo que se abrió o se necesita."); first = false; } }
    header(false);
    g.filas.forEach((f, i) => {
      if (y + ROW > BOTTOM) { y = lightPage(doc, "Stock actual", inv); header(true); }
      stockRow(doc, f, y, i);
      y += ROW;
    });
    y += 14;
  }
}

/* ─── Lo que usamos ─────────────────────────────────────────── */

function usoPages(doc: Doc, inv: Inventario) {
  let y = lightPage(doc, "Lo que usamos", inv);
  y = sectionTitle(doc, "Lo que usamos", y - 4, `Gastado en «${inv.eventTitle}»: ventas de la barra (con las anulaciones descontadas) y merma registrada. Ordenado por lo que más plata movió.`);
  if (inv.uso.length === 0) {
    rr(doc, M, y, CW, 44, 10, C.faint);
    t(doc, "Todavía no hay ventas de barra registradas en este evento, así que no hay consumo que mostrar.", M + 14, y + 16, { size: 9.5, color: C.muted, width: CW - 28 });
    return;
  }
  inv.uso.forEach((u, i) => {
    if (y + ROW > BOTTOM - 40) y = lightPage(doc, "Lo que usamos", inv);
    if (i % 2 === 0) rr(doc, M, y, CW, ROW, 6, C.zebra);
    t(doc, String(i + 1), M + 6, y + 7.5, { size: 8.5, bold: true, color: C.pink, width: 16 });
    t(doc, u.name, M + 24, y + 7.5, { size: 9.5, bold: true, width: 170, oneLine: true });
    bar(doc, M + 200, y + 8.5, 120, 7, u.pct, C.pink);
    t(doc, u.usado, M + 328, y + (u.merma ? 4.5 : 8), { size: 9, width: 105, oneLine: true });
    if (u.merma) t(doc, `merma ${u.merma}`, M + 328, y + 15, { size: 6.5, bold: true, color: C.amber, width: 105, oneLine: true });
    t(doc, u.valor === null ? "sin costo" : money(u.valor), M, y + 8, { size: 9, bold: u.valor !== null, color: u.valor === null ? C.grey : C.ink, width: CW - 6, align: "right" });
    y += ROW;
  });
  y += 10;
  rr(doc, M, y, CW, 34, 10, C.pinkSoft);
  t(doc, "TOTAL USADO", M + 14, y + 11, { size: 8, bold: true, color: C.muted, spacing: 1.2 });
  t(doc, money(inv.kpis.valorUsado), M, y + 8, { size: 17, display: true, color: C.pink, width: CW - 14, align: "right" });
  if (inv.totalMerma > 0) t(doc, `de eso, merma ${money(inv.totalMerma)}`, M + 120, y + 12, { size: 8.5, color: C.muted, width: 200 });
}

/* ─── Qué falta comprar ─────────────────────────────────────── */

function comprasPages(doc: Doc, inv: Inventario) {
  let y = lightPage(doc, "Qué falta comprar", inv);
  y = sectionTitle(doc, "Qué falta comprar", y - 4, `Para ${inv.personas.toLocaleString("es-CL")} personas, según las recetas de la carta y la regla de cada insumo (guantes, vasos, limpieza…). Lo más caro primero.`);
  if (inv.compras.length === 0) {
    rr(doc, M, y, CW, 44, 10, C.greenSoft);
    t(doc, "No falta nada: el stock alcanza para el evento.", M + 14, y + 16, { size: 10, bold: true, color: C.green, width: CW - 28 });
    return;
  }
  inv.compras.forEach((c, i) => {
    if (y + 34 > BOTTOM - 40) y = lightPage(doc, "Qué falta comprar", inv);
    if (i % 2 === 0) rr(doc, M, y, CW, 34, 8, C.zebra);
    rr(doc, M + 8, y + 9, 16, 16, 4, C.paper, { stroke: C.grey, lw: 1 });
    t(doc, c.name, M + 34, y + 6, { size: 10, bold: true, width: 250, oneLine: true });
    t(doc, `Necesitas ${c.necesita}  ·  Hay ${c.hay}`, M + 34, y + 20, { size: 7.8, color: C.muted, width: 300, oneLine: true });
    const label = `${c.envases} ${c.envase}`;
    const w = tw(doc, label, { size: 9, bold: true }) + 16;
    pill(doc, label, M + CW - 90 - w, y + 8, C.amberSoft, C.amber, 9);
    t(doc, c.costo === null ? "sin costo" : money(c.costo), M, y + 12, { size: 9.5, bold: c.costo !== null, color: c.costo === null ? C.grey : C.ink, width: CW - 8, align: "right" });
    y += 34;
  });
  y += 8;
  rr(doc, M, y, CW, 34, 10, C.amberSoft);
  t(doc, `TOTAL ESTIMADO · ${inv.compras.length} ${inv.compras.length === 1 ? "INSUMO" : "INSUMOS"}`, M + 14, y + 11, { size: 8, bold: true, color: C.muted, spacing: 1.2 });
  t(doc, money(inv.kpis.costoCompra), M, y + 8, { size: 17, display: true, color: C.amber, width: CW - 14, align: "right" });
}

/* ─── Dónde está la plata ───────────────────────────────────── */

function plataPage(doc: Doc, inv: Inventario) {
  let y = lightPage(doc, "Valorizado", inv);
  y = sectionTitle(doc, "Dónde está la plata", y - 4, "Los insumos que más dinero tienen guardado hoy (stock × costo por envase).");
  const todos = inv.grupos.flatMap((g) => g.filas.map((f) => ({ ...f, grupo: g.id }))).filter((f) => (f.valor ?? 0) > 0).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)).slice(0, 12);
  const total = Math.max(1, inv.kpis.valorStock);
  const maxV = Math.max(1, ...todos.map((f) => f.valor ?? 0));
  if (todos.length === 0) t(doc, "Todavía no hay insumos con stock y costo cargado.", M, y, { size: 10, color: C.muted });
  todos.forEach((f) => {
    t(doc, f.name, M, y + 3, { size: 9.5, bold: true, width: 170, oneLine: true });
    bar(doc, M + 178, y + 2, 230, 11, (f.valor ?? 0) / maxV, GRUPO_COLOR[f.grupo] ?? C.pink);
    t(doc, `${Math.round(((f.valor ?? 0) / total) * 100)}%`, M + 414, y + 4, { size: 8, color: C.muted, width: 30 });
    t(doc, money(f.valor ?? 0), M, y + 3, { size: 9.5, bold: true, width: CW, align: "right" });
    y += 24;
  });
  y += 14;
  const k = inv.kpis;
  const cards: [string, string, string][] = [
    ["VALOR DEL STOCK", money(k.valorStock), C.pink], ["USADO EN EL EVENTO", money(k.valorUsado), C.sky],
    ["MERMA", money(inv.totalMerma), C.amber], ["COSTO DE REPONER", money(k.costoCompra), C.green],
  ];
  const cw = (CW - 9 * 3) / 4;
  cards.forEach(([label, value, color], i) => {
    const x = M + i * (cw + 9);
    rr(doc, x, y, cw, 62, 12, C.paper, { stroke: C.faint });
    rr(doc, x, y, 5, 62, 2.5, color);
    t(doc, label, x + 14, y + 10, { size: 6.5, bold: true, color: C.muted, spacing: 1, width: cw - 18 });
    t(doc, value, x + 14, y + 26, { size: tw(doc, value, { size: 18, display: true }) > cw - 22 ? 14 : 18, display: true, width: cw - 18 });
  });
  y += 80;
  if (k.sinCosto > 0) {
    rr(doc, M, y, CW, 40, 10, C.amberSoft);
    t(doc, `${k.sinCosto} ${k.sinCosto === 1 ? "insumo con stock no tiene" : "insumos con stock no tienen"} costo por envase: no cuentan en el valor. Cárgalo en «Editar» para que el total sea exacto.`, M + 14, y + 14, { size: 8.5, color: C.ink, width: CW - 28 });
  }
}

/** El PDF del inventario. */
export async function buildInventarioPdf(inv: Inventario): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: safe(`Inventario - ${inv.eventTitle}`), Author: "Mansion Playroom", Creator: "Mansion Playroom" } });
  doc.registerFont("Anton", Buffer.from(ANTON_TTF_BASE64, "base64"));
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  cover(doc, inv);
  stockPages(doc, inv);
  usoPages(doc, inv);
  comprasPages(doc, inv);
  plataPage(doc, inv);

  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) { doc.switchToPage(range.start + i); footer(doc, i + 1, range.count); }
  doc.end();
  return done;
}
