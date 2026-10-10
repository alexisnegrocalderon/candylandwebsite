/** Informes PDF de las simulaciones de evento: individual (completa, resumen,
 * sin márgenes) y comparación. Página horizontal 16:9 tipo presentación, una
 * idea por página, con los gráficos dibujados en pdfkit (ver draw.ts).
 *
 * Este módulo es PURO: recibe los datos ya calculados (motor de análisis +
 * narrativa) y no toca la base ni la IA, así se puede revisar y testear solo. */
import PDFDocument from "pdfkit";
import {
  AREA_LABEL, compareSimulations, waterfallSteps, expenseBreakdown,
  type Recommendation, type RecommendationSet, type Scenario, type SensitivityRow, type Verdict, type VerdictKey,
} from "../../shared/budgetInsights";
import { expenseLineAmounts, type BudgetResult, type BudgetSimulationInput } from "../../shared/eventBudget";
import { LOGO_PNG_BASE64 } from "./logo";
import { ANTON_TTF_BASE64 } from "./fonts";
import type { Narrative } from "./narrative";
import {
  C, H, PALETTE, W, barChart, block, card, clp, compact, cross, donut, fitText, gauge, hbar, legend, lineChart, pctText, pill, rrect, rule, safe, text, textHeight,
} from "./draw";

type Doc = PDFKit.PDFDocument;
export type ReportVersion = "completa" | "resumen" | "externa";

const MX = 48;
const CONTENT_W = W - MX * 2;
const logoBuffer = Buffer.from(LOGO_PNG_BASE64, "base64");

const VERDICT_COLOR: Record<VerdictKey, string> = { ok: C.green, warning: C.amber, danger: C.orange, loss: C.red };

export type SingleReportData = {
  name: string;
  /** Evento real al que está vinculada, si lo hay. */
  eventTitle?: string | null;
  /** Informe con datos reales del evento (no una simulación). */
  real?: boolean;
  input: BudgetSimulationInput;
  result: BudgetResult;
  verdict: Verdict;
  scenarios: Scenario[];
  sensitivity: SensitivityRow[];
  curve: { ticketsSold: number; netProfit: number }[];
  recommendations: RecommendationSet;
  narrative: Narrative;
  emittedAt: Date;
};

export type ComparisonReportData = {
  sims: { id: number; name: string; input: BudgetSimulationInput; result: BudgetResult; verdict: Verdict; scenarios: Scenario[] }[];
  winnerIndex: number;
  reasons: string[];
  best: ReturnType<typeof compareSimulations>["best"];
  /** Recomendaciones de la opción ganadora. */
  winnerRecommendations: RecommendationSet;
  winnerNarrative: Narrative;
  emittedAt: Date;
};

/* ─── Andamiaje ─────────────────────────────────────────────── */

function createDoc(title: string): { doc: Doc; done: Promise<Buffer> } {
  const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: safe(title), Author: "Mansion Playroom", Creator: "Mansion Playroom" } });
  doc.registerFont("Anton", Buffer.from(ANTON_TTF_BASE64, "base64"));
  pageCount = 0;
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, done };
}

type Theme = "dark" | "light";

let pageCount = 0;

function newPage(doc: Doc, theme: Theme): void {
  doc.addPage({ size: [W, H], margin: 0 });
  // Sin margen inferior: el texto nunca salta solo a otra página; si algo se
  // pasa de largo se ve en la revisión visual en vez de duplicar páginas.
  doc.page.margins.bottom = -5000;
  doc.rect(0, 0, W, H).fill(C.bgLight);
  pageCount++;
  void theme;
}

/** Combinaciones de bloques semitransparentes que se cruzan detrás del encabezado. */
const HEADER_BLOCKS: { a: [number, number, number, number, string]; b: [number, number, number, number, string] }[] = [
  { a: [W - 300, 0, 300, 112, C.bgDark], b: [W - 200, 38, 120, 84, C.bgDark2] },
  { a: [W - 300, 0, 300, 112, C.bgDark2], b: [W - 200, 38, 120, 84, C.bgDark] },
  { a: [W - 340, 0, 340, 100, C.bgDark], b: [W - 150, 30, 90, 90, C.bgDark2] },
];

/** Encabezado editorial: regla fina con la sección, titular en Anton y bloques de color cruzados con el número de página. */
function header(doc: Doc, kicker: string, title: string, subtitle?: string): void {
  const v = HEADER_BLOCKS[pageCount % HEADER_BLOCKS.length];
  block(doc, ...v.a, 0.85);
  block(doc, ...v.b, 0.7);
  text(doc, String(pageCount).padStart(2, "0"), W - MX - 110, 30, { font: "display", size: 56, color: C.ink, width: 110, align: "right", height: 64 });
  rule(doc, MX, 24, 590, 24);
  cross(doc, MX + 4, 14, 8, C.pink);
  text(doc, kicker.toUpperCase(), MX + 16, 10, { size: 8.5, bold: true, color: C.ink, spacing: 2, width: 420, height: 12 });
  fitText(doc, title.toUpperCase(), MX, 40, { width: CONTENT_W - 200, height: 40, maxSize: 34, minSize: 18, font: "display", color: C.ink, spacing: 0.3 });
  if (subtitle) text(doc, subtitle, MX, 88, { size: 11.5, color: C.muted, width: CONTENT_W - 200, height: 16 });
}

function footers(doc: Doc, label: string, o: { skipFirst?: boolean; skipLast?: boolean } = {}): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    if ((o.skipFirst ?? true) && i === 0) continue;
    if (o.skipLast && i === range.count - 1) continue;
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = -5000;
    rule(doc, MX, 506, W - MX, 506, { width: 0.5 });
    text(doc, `MANSION PLAYROOM  ·  ${label}`.toUpperCase(), MX, 512, { size: 7.5, color: C.muted, width: 640, height: 12, spacing: 1 });
    text(doc, `${i + 1} / ${range.count}`, W - MX - 120, 512, { size: 8, color: C.muted, width: 120, align: "right" });
  }
}

const emittedText = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "long", timeStyle: "short" }).format(d);

function kpi(doc: Doc, x: number, y: number, w: number, h: number, label: string, value: string, caption?: string, color: string = C.ink) {
  card(doc, x, y, w, h);
  text(doc, label.toUpperCase(), x + 16, y + 14, { size: 8, bold: true, color: C.muted, spacing: 1.2, width: w - 32, height: 12 });
  fitText(doc, value, x + 16, y + 28, { width: w - 32, height: 36, maxSize: 30, minSize: 18, font: "display", color, spacing: 0.4 });
  if (caption) text(doc, caption, x + 16, y + h - 27, { size: 9.5, color: C.muted, width: w - 32, height: 24 });
}

const QUALITY_LABEL: Record<Recommendation["quality"], string> = { ninguno: "Sin riesgo para la calidad", bajo: "Riesgo bajo para la calidad", medio: "Con cuidado: negociar, no recortar" };
const AREA_COLOR: Record<Recommendation["area"], string> = { ingresos: C.pink, barra: C.violet, costos: C.sky, impuestos: C.green };

/* ─── Portada ───────────────────────────────────────────────── */

function cover(doc: Doc, o: {
  kicker: string; title: string; subtitle: string; verdict?: Verdict; emittedAt: Date;
  kpis: { label: string; value: string; caption?: string; color?: string }[]; chips?: string[]; real?: boolean;
}) {
  newPage(doc, "dark");
  // Bloques de color que se cruzan, como en la referencia editorial.
  block(doc, 500, 0, 460, 346, C.bgDark, 0.9);
  block(doc, 650, 120, 310, 250, C.bgDark2, 0.78);
  doc.rect(MX - 26, 150, 10, 128).fill(C.ink);

  doc.image(logoBuffer, MX, 28, { height: 50 });
  text(doc, "MANSION PLAYROOM", MX + 44, 46, { size: 10, bold: true, color: C.ink, spacing: 3 });
  rule(doc, MX, 100, 470, 100);
  cross(doc, MX + 4, 116, 9, C.pink);
  text(doc, o.kicker.toUpperCase(), MX + 18, 111, { size: 9.5, bold: true, color: C.ink, spacing: 2.5, width: 420, height: 14 });

  fitText(doc, o.title.toUpperCase(), MX, 144, { width: 540, height: 150, maxSize: 84, minSize: 28, font: "display", color: C.ink, lineGap: 0 });
  text(doc, o.subtitle, MX, 302, { size: 12.5, color: C.ink, width: 520, height: 18 });
  if (o.verdict) pill(doc, o.verdict.label, MX, 326, { bg: VERDICT_COLOR[o.verdict.key], color: o.verdict.key === "warning" ? C.ink : C.white, size: 10.5, padX: 12, h: 22 });
  if (o.chips?.length) {
    let cx = MX;
    for (const chip of o.chips.slice(0, 4)) cx += pill(doc, chip, cx, 326, { bg: C.skySoft, color: C.ink, size: 10.5, padX: 12, h: 22 }) + 8;
  }

  const n = o.kpis.length;
  const colW = CONTENT_W / n;
  rule(doc, MX, 386, W - MX, 386, { width: 1.2 });
  o.kpis.forEach((k, i) => {
    const x = MX + i * colW;
    if (i > 0) rule(doc, x - 10, 398, x - 10, 470, { width: 0.6 });
    text(doc, k.label.toUpperCase(), x, 398, { size: 8.5, bold: true, color: C.muted, spacing: 1.4, width: colW - 24, height: 12 });
    fitText(doc, k.value, x, 414, { width: colW - 24, height: 50, maxSize: 50, minSize: 22, font: "display", color: k.color ?? C.ink, spacing: 0.5 });
    if (k.caption) text(doc, k.caption, x, 470, { size: 10, color: C.muted, width: colW - 24, height: 14 });
  });
  text(doc, `Informe generado el ${emittedText(o.emittedAt)} (hora de Chile). ${o.real ? "Cifras reales: ventas y gastos registrados hasta este momento." : "Cifras proyectadas: no incluyen ventas reales."}`, MX, 508, { size: 8, color: C.muted, width: CONTENT_W, height: 12 });
}

/** Página final: cierre de marca con el contacto. */
function closingPage(doc: Doc) {
  newPage(doc, "dark");
  block(doc, 0, 300, 520, 240, C.bgDark, 0.9);
  block(doc, 330, 220, 330, 200, C.bgDark2, 0.78);
  doc.rect(MX - 26, 120, 10, 150).fill(C.ink);
  doc.image(logoBuffer, MX, 28, { height: 50 });
  text(doc, "MANSION PLAYROOM", MX + 44, 46, { size: 10, bold: true, color: C.ink, spacing: 3 });
  rule(doc, MX, 100, 470, 100);
  cross(doc, MX + 4, 116, 9, C.pink);
  text(doc, "GRACIAS", MX + 18, 111, { size: 9.5, bold: true, color: C.ink, spacing: 2.5, width: 420, height: 14 });
  text(doc, "¿DUDAS?", MX, 122, { font: "display", size: 84, color: C.ink, width: 700, spacing: 1 });
  text(doc, "CONVERSEMOS.", MX, 218, { font: "display", size: 84, color: C.ink, width: 800, spacing: 1 });
  text(doc, "Este informe resume lo que realmente pasó en el evento: sirve para decidir mejor el próximo.", 700, 330, { size: 11.5, color: C.ink, width: 212, height: 70 });
  rule(doc, 700, 322, W - MX, 322, { width: 1.2 });
  text(doc, "contacto@mansionplayroom.cl", 700, 412, { size: 12, bold: true, color: C.ink, width: 230 });
  text(doc, "mansionplayroom.cl", 700, 430, { size: 11, color: C.ink, width: 230 });
}

/* ─── Páginas de una simulación ─────────────────────────────── */

function pageEssentials(doc: Doc, d: SingleReportData) {
  const r = d.result;
  newPage(doc, "light");
  header(doc, "Lo esencial", d.narrative.headline);

  // Resumen
  card(doc, MX, 118, 570, 224);
  fitText(doc, d.narrative.summary, MX + 24, 138, { width: 522, height: 184, maxSize: 15.5, minSize: 11, color: C.ink, lineGap: 5 });

  // Medidor de margen vs. meta
  const target = d.input.marginTargetPercent;
  const margin = r.pnl.marginPercent ?? 0;
  card(doc, 634, 118, 278, 224);
  text(doc, "MARGEN DE GANANCIA", 634 + 20, 134, { size: 8.5, bold: true, color: C.muted, spacing: 1, width: 238 });
  const gaugeMax = Math.max(60, Math.ceil((Math.max(margin, target) * 1.25) / 10) * 10);
  gauge(doc, 773, 270, 100, 20, Math.max(0, margin), gaugeMax, VERDICT_COLOR[d.verdict.key], target);
  text(doc, pctText(r.pnl.marginPercent), 773 - 80, 238, { size: 30, bold: true, color: C.ink, width: 160, align: "center" });
  text(doc, `Tu meta es ${target}%`, 773 - 80, 278, { size: 10.5, color: C.muted, width: 160, align: "center" });
  pill(doc, d.verdict.short, 773 - 58, 300, { bg: VERDICT_COLOR[d.verdict.key], color: d.verdict.key === "warning" ? C.ink : C.white, size: 10.5, padX: 12, h: 24 });

  // Indicadores
  const gap = 16;
  const w = (CONTENT_W - gap * 3) / 4;
  const room = r.maxDirectExpenses - r.pnl.directExpensesTotal;
  kpi(doc, MX, 362, w, 118, "Aforo estimado", r.attendance.toLocaleString("es-CL"), `${r.ticketsSold.toLocaleString("es-CL")} entradas vendidas`);
  kpi(doc, MX + (w + gap), 362, w, 118, "Utilidad estimada", compact(r.pnl.netProfit), "lo que queda después de todos los costos", r.pnl.netProfit >= 0 ? C.green : C.red);
  kpi(doc, MX + 2 * (w + gap), 362, w, 118, "Punto de equilibrio", r.breakevenTickets != null ? `${r.breakevenTickets.toLocaleString("es-CL")} entradas` : "-", "para no perder plata");
  kpi(doc, MX + 3 * (w + gap), 362, w, 118, room >= 0 ? "Espacio para gastar" : "Te pasas del techo", compact(Math.abs(room)), room >= 0 ? `bajo el techo de ${compact(r.maxDirectExpenses)}` : `el techo es ${compact(r.maxDirectExpenses)}`, room >= 0 ? C.ink : C.red);
}

type Slice = { label: string; value: number; color: string };

function incomeSlices(d: { input: BudgetSimulationInput; result: BudgetResult }): Slice[] {
  const slices: Slice[] = [];
  d.input.revenueTiers.forEach((t) => { if (t.price * t.expectedQty > 0) slices.push({ label: t.label, value: t.price * t.expectedQty, color: "" }); });
  if (d.result.otherRevenue > 0) slices.push({ label: "Venta de barra", value: d.result.otherRevenue, color: "" });
  (d.input.extraIncomes ?? []).forEach((l) => { if (l.unitPrice * l.quantity > 0) slices.push({ label: l.label || "Otros ingresos", value: l.unitPrice * l.quantity, color: "" });});
  slices.sort((a, b) => b.value - a.value);
  const main = slices.slice(0, 7);
  const rest = slices.slice(7).reduce((s, x) => s + x.value, 0);
  if (rest > 0) main.push({ label: "Otros", value: rest, color: "" });
  return main.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
}

function pageIncome(doc: Doc, d: { input: BudgetSimulationInput; result: BudgetResult }, opts: { kicker: string; title: string }) {
  const r = d.result;
  newPage(doc, "light");
  header(doc, opts.kicker, opts.title, "Cuánto entra y de qué parte viene");
  const slices = incomeSlices(d);
  const total = slices.reduce((s, x) => s + x.value, 0);

  card(doc, MX, 116, 430, 384);
  donut(doc, MX + 112, 262, 88, 54, slices);
  text(doc, "Ingreso bruto", MX + 112 - 50, 247, { size: 9, color: C.muted, width: 100, align: "center" });
  text(doc, compact(r.grossIncome), MX + 112 - 50, 261, { size: 16, bold: true, color: C.ink, width: 100, align: "center" });
  slices.forEach((s, i) => {
    const ly = 140 + i * 42;
    rrect(doc, MX + 226, ly + 2, 11, 11, 3, s.color);
    text(doc, s.label, MX + 244, ly, { size: 10.5, bold: true, color: C.ink, width: 170, height: 14 });
    text(doc, `${compact(s.value)}  ·  ${total > 0 ? Math.round((s.value / total) * 100) : 0}%`, MX + 244, ly + 15, { size: 9.5, color: C.muted, width: 170, height: 12 });
  });

  // Tabla de entradas
  const tx = MX + 450;
  const tw = CONTENT_W - 450;
  card(doc, tx, 116, tw, 384);
  text(doc, "DETALLE POR ENTRADA", tx + 20, 132, { size: 8.5, bold: true, color: C.muted, spacing: 1 });
  const cols = [{ l: "Entrada", w: 114, a: "left" as const }, { l: "Precio", w: 66, a: "right" as const }, { l: "Cant.", w: 34, a: "right" as const }, { l: "Pers.", w: 36, a: "right" as const }, { l: "Ingreso", w: 82, a: "right" as const }];
  let cy = 154;
  const drawRow = (cells: string[], bold = false, color: string = C.ink, bg?: string) => {
    if (bg) rrect(doc, tx + 10, cy - 4, tw - 20, 24, 6, bg);
    let cx = tx + 20;
    cells.forEach((c, i) => { text(doc, c, cx, cy, { size: 10, bold, color, width: cols[i].w, align: cols[i].a, height: 14 }); cx += cols[i].w + 4; });
    cy += 26;
  };
  drawRow(cols.map((c) => c.l), true, C.muted);
  const rows = d.input.revenueTiers.slice(0, 9);
  rows.forEach((t, i) => drawRow([t.label, t.price > 0 ? clp(t.price) : "Gratis", String(t.expectedQty), String(t.expectedQty * t.personasPorEntrada), clp(t.price * t.expectedQty)], false, C.ink, i % 2 === 0 ? "#f7f1fa" : undefined));
  if (d.input.revenueTiers.length > rows.length) drawRow([`+ ${d.input.revenueTiers.length - rows.length} más`, "", "", "", ""], false, C.muted);
  if (r.otherRevenue > 0) drawRow(["Venta de barra", `${clp(d.input.otherRevenuePerPerson)}/pers.`, "", String(r.attendance), clp(r.otherRevenue)], false, C.ink, "#f7f1fa");
  (d.input.extraIncomes ?? []).slice(0, 3).forEach((l) => drawRow([l.label || "Otros ingresos", clp(l.unitPrice), String(l.quantity), "-", clp(l.unitPrice * l.quantity)]));
  doc.save(); doc.moveTo(tx + 20, cy).lineTo(tx + tw - 20, cy).lineWidth(1).stroke(C.faint); doc.restore();
  cy += 8;
  drawRow(["Total", "", String(r.ticketsSold), String(r.attendance), clp(r.grossIncome)], true);
}

function pageMoneyOut(doc: Doc, d: SingleReportData) {
  const r = d.result;
  newPage(doc, "light");
  header(doc, "A dónde se va la plata", "Del ingreso a lo que realmente te queda", "Cada barra roja es algo que se resta; al final queda la utilidad");
  const steps = waterfallSteps(r);
  card(doc, MX, 116, 600, 384);
  const x0 = MX + 14, y0 = 150, w = 572, h = 262;
  const maxV = Math.max(...steps.map((s) => Math.abs(s.amount)), r.grossIncome, 1);
  const n = steps.length;
  const slot = w / n;
  const bw = Math.min(58, slot * 0.62);
  let running = 0;
  steps.forEach((s, i) => {
    const bx = x0 + i * slot + (slot - bw) / 2;
    let top: number, bottom: number, color: string, label: string;
    if (s.kind === "income") { running = s.amount; top = s.amount; bottom = 0; color = C.pink; label = compact(s.amount); }
    else if (s.kind === "cost") { top = running; bottom = running - s.amount; running = bottom; color = C.orange; label = `-${compact(s.amount)}`; }
    else { top = Math.max(s.amount, 0); bottom = Math.min(s.amount, 0); color = s.amount >= 0 ? C.green : C.red; label = compact(s.amount); }
    const py = (v: number) => y0 + (1 - v / maxV) * h;
    const yTop = py(top), yBot = py(bottom);
    rrect(doc, bx, yTop, bw, Math.max(yBot - yTop, 2), 4, color);
    text(doc, label, bx - 18, yTop - 15, { size: 9.5, bold: true, color: C.ink, width: bw + 36, align: "center" });
    text(doc, s.label, x0 + i * slot, y0 + h + 12, { size: 8.8, color: C.muted, width: slot, align: "center", height: 26 });
    if (i < n - 1) {
      doc.save(); doc.moveTo(bx + bw, py(running)).lineTo(x0 + (i + 1) * slot + (slot - bw) / 2, py(running)).lineWidth(0.8).dash(2, { space: 2 }).stroke(C.muted); doc.restore();
    }
  });

  // Lectura simple
  const per100 = r.grossIncome > 0 ? (r.pnl.netProfit / r.grossIncome) * 100 : 0;
  card(doc, 664, 116, 248, 384, { fill: C.card });
  text(doc, "POR CADA $100 QUE ENTRAN", 684, 134, { size: 8.5, bold: true, color: C.muted, spacing: 1, width: 210 });
  text(doc, `$${per100.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`, 684, 150, { size: 46, bold: true, color: per100 >= 0 ? C.green : C.red, width: 210 });
  text(doc, "se quedan como utilidad. El resto se reparte así:", 684, 204, { size: 10.5, color: C.muted, width: 210, height: 30 });
  const costs = steps.filter((s) => s.kind === "cost").sort((a, b) => b.amount - a.amount).slice(0, 6);
  costs.forEach((s, i) => {
    const sy = 244 + i * 40;
    text(doc, s.label, 684, sy, { size: 10, bold: true, color: C.ink, width: 140, height: 13 });
    text(doc, `$${((s.amount / r.grossIncome) * 100).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`, 684 + 140, sy, { size: 10, bold: true, color: C.ink, width: 70, align: "right" });
    hbar(doc, 684, sy + 17, 210, 7, s.amount / r.grossIncome, C.orange);
  });
}

function pageCeiling(doc: Doc, d: SingleReportData) {
  const r = d.result;
  newPage(doc, "light");
  header(doc, "Techo de gasto y equilibrio", "¿Cuánto puedes gastar? ¿Cuánta gente necesitas?");
  // Izquierda: gastos fijos vs techo
  card(doc, MX, 116, 420, 384);
  text(doc, "GASTOS FIJOS VS. TECHO", MX + 22, 134, { size: 8.5, bold: true, color: C.muted, spacing: 1 });
  const fixed = r.pnl.directExpensesTotal;
  const ceiling = r.maxDirectExpenses;
  const scale = Math.max(fixed, ceiling, 1) * 1.12;
  const bx = MX + 22, bw = 376;
  const room = ceiling - fixed;
  const color = VERDICT_COLOR[r.status === "ok" ? "ok" : r.status === "warning" ? "warning" : "danger"];
  rrect(doc, bx, 166, bw, 30, 15, C.faint);
  rrect(doc, bx, 166, Math.max(30, Math.min(1, fixed / scale) * bw), 30, 15, color);
  const cx = bx + Math.max(0, Math.min(1, ceiling / scale)) * bw;
  doc.save(); doc.moveTo(cx, 156).lineTo(cx, 206).lineWidth(2.5).stroke(C.ink); doc.restore();
  text(doc, `Gastos fijos: ${clp(fixed)}`, bx, 212, { size: 10.5, bold: true, color: C.ink, width: 190 });
  text(doc, `Techo: ${clp(ceiling)}`, bx + 186, 212, { size: 10.5, bold: true, color: C.ink, width: 190, align: "right" });
  text(doc, room >= 0 ? "Hay espacio:" : "Te pasas por:", bx, 260, { size: 11, color: C.muted });
  text(doc, compact(Math.abs(room)), bx, 276, { size: 40, bold: true, color: room >= 0 ? C.green : C.red, width: bw });
  fitText(doc, `El techo es lo máximo que puedes gastar en gastos fijos y aun así cumplir tu meta de ${d.input.marginTargetPercent}% de margen. ${room >= 0 ? "Mientras estés por debajo, vas bien." : "Para volver al margen, baja gastos o sube ingresos."}`, bx, 336, { width: bw, height: 70, maxSize: 11.5, minSize: 9, color: C.muted, lineGap: 3 });
  // Gastos por categoría
  const cats = expenseBreakdown(r).slice(0, 4);
  const catMax = Math.max(1, ...cats.map((c) => c.amount));
  cats.forEach((c, i) => {
    const sy = 412 + i * 19;
    text(doc, c.label, bx, sy, { size: 9.5, color: C.ink, width: 110, height: 12 });
    hbar(doc, bx + 118, sy + 2, 180, 7, c.amount / catMax, C.sky);
    text(doc, compact(c.amount), bx + 304, sy, { size: 9.5, bold: true, color: C.ink, width: 72, align: "right" });
  });

  // Derecha: curva de equilibrio
  card(doc, 484, 116, 428, 384);
  text(doc, "UTILIDAD SEGÚN LAS ENTRADAS VENDIDAS", 506, 134, { size: 8.5, bold: true, color: C.muted, spacing: 1, width: 390 });
  const marks: { x: number; label: string; color: string }[] = [{ x: r.ticketsSold, label: "Plan", color: C.violet }];
  if (r.breakevenTickets != null) marks.push({ x: r.breakevenTickets, label: "Equilibrio", color: C.orange });
  lineChart(doc, 498, 158, 402, 250, [{ name: "Utilidad", color: C.pink, points: d.curve.map((p) => ({ x: p.ticketsSold, y: p.netProfit })) }], { marks, xLabel: (v) => `${Math.round(v)}`, xTicks: [0, r.ticketsSold / 2, r.ticketsSold, r.ticketsSold * 1.3] });
  const pctPlan = r.breakevenTickets != null && r.ticketsSold > 0 ? Math.round((r.breakevenTickets / r.ticketsSold) * 100) : null;
  fitText(doc, r.breakevenTickets != null
    ? `Para no perder plata necesitas vender ${r.breakevenTickets.toLocaleString("es-CL")} entradas${pctPlan != null ? `, el ${pctPlan}% de las ${r.ticketsSold.toLocaleString("es-CL")} que proyectas` : ""}. Desde ahí, cada entrada extra es ganancia.`
    : "Con estos precios y costos, vender más entradas no alcanza para cubrir los gastos: conviene revisar precios o costos.",
  506, 424, { width: 390, height: 66, maxSize: 12, minSize: 9, color: C.ink, lineGap: 3 });
}

function pageScenarios(doc: Doc, d: SingleReportData, externa = false) {
  newPage(doc, "light");
  header(doc, externa ? "Proyección" : "Proyecciones", externa ? "Ingreso según cuánta gente asista" : "¿Y si va menos (o más) gente?", externa ? "Qué pasa con el ingreso si la asistencia cambia" : "La utilidad según el porcentaje del aforo que se llene; los gastos fijos no cambian");
  card(doc, MX, 116, 470, 384);
  const groups = d.scenarios.map((s) => ({
    label: `${s.label} del aforo`,
    caption: externa ? `${s.attendance.toLocaleString("es-CL")} personas` : `margen ${pctText(s.marginPercent)}`,
    values: [{ value: externa ? s.grossIncome : s.netProfit, color: externa ? C.pink : VERDICT_COLOR[s.verdict.key] }],
  }));
  barChart(doc, MX + 20, 134, 430, 354, groups);

  const tx = MX + 490, tw = CONTENT_W - 490;
  card(doc, tx, 116, tw, 384);
  const cols = externa
    ? [{ l: "Asistencia", w: 82, a: "left" as const }, { l: "Personas", w: 82, a: "right" as const }, { l: "Ingreso", w: 120, a: "right" as const }]
    : [{ l: "Asistencia", w: 56, a: "left" as const }, { l: "Personas", w: 56, a: "right" as const }, { l: "Utilidad", w: 64, a: "right" as const }, { l: "Margen", w: 48, a: "right" as const }];
  let cy = 140;
  const drawRow = (cells: string[], bold = false, color: string = C.ink) => {
    let cx = tx + 18;
    cells.forEach((c, i) => { text(doc, c, cx, cy, { size: 10, bold, color, width: cols[i].w, align: cols[i].a }); cx += cols[i].w + 4; });
    cy += 28;
  };
  drawRow(cols.map((c) => c.l), true, C.muted);
  d.scenarios.forEach((s) => {
    drawRow(externa
      ? [s.label, s.attendance.toLocaleString("es-CL"), compact(s.grossIncome)]
      : [s.label, s.attendance.toLocaleString("es-CL"), compact(s.netProfit), pctText(s.marginPercent)], s.occupancy === 1, s.occupancy === 1 ? C.ink : C.ink);
    if (!externa) pill(doc, s.verdict.short, tx + 18 + 240, cy - 28 - 1, { bg: VERDICT_COLOR[s.verdict.key], color: s.verdict.key === "warning" ? C.ink : C.white, size: 7.5, padX: 6, h: 15 });
  });
  cy += 12;
  const low = d.scenarios[0], base = d.scenarios.find((s) => s.occupancy === 1) ?? d.scenarios[0];
  fitText(doc, externa
    ? `Si asiste el ${low.label} del aforo, el ingreso proyectado baja de ${compact(base.grossIncome)} a ${compact(low.grossIncome)}.`
    : `Si solo se llena el ${low.label} del aforo, la utilidad baja de ${compact(base.netProfit)} a ${compact(low.netProfit)} (margen ${pctText(low.marginPercent)}). ${low.netProfit >= 0 ? "Aun así la fiesta no pierde plata." : "Ahí la fiesta pierde plata."}`,
  tx + 18, Math.min(cy, 420), { width: tw - 36, height: 70, maxSize: 11.5, minSize: 9, color: C.muted, lineGap: 3 });
}

function pageSensitivity(doc: Doc, d: SingleReportData) {
  newPage(doc, "light");
  header(doc, "Qué mueve más el margen", "Dónde está el riesgo y dónde está la oportunidad", "Cuánto cambia la utilidad si cada factor empeora (rojo) o mejora (verde)");
  card(doc, MX, 116, CONTENT_W, 384);
  const rows = d.sensitivity.slice(0, 6);
  const maxV = Math.max(1, ...rows.map((r) => Math.max(Math.abs(r.worseProfit), Math.abs(r.betterProfit))));
  const cx = 600, half = 250;
  const rowH = 50;
  rows.forEach((r, i) => {
    const y = 138 + i * rowH;
    text(doc, r.label, MX + 24, y + 4, { size: 11.5, bold: true, color: C.ink, width: 270, height: 15 });
    text(doc, r.change, MX + 24, y + 21, { size: 9.5, color: C.muted, width: 270 });
    const wl = (Math.abs(r.worseProfit) / maxV) * half;
    const wr = (Math.abs(r.betterProfit) / maxV) * half;
    rrect(doc, cx - wl, y + 4, Math.max(wl, 2), 26, 5, C.red);
    rrect(doc, cx, y + 4, Math.max(wr, 2), 26, 5, C.green);
    text(doc, `-${compact(Math.abs(r.worseProfit))}`, cx - wl - 74, y + 11, { size: 10, bold: true, color: C.red, width: 68, align: "right" });
    text(doc, `+${compact(r.betterProfit)}`, cx + wr + 6, y + 11, { size: 10, bold: true, color: C.green, width: 70 });
  });
  doc.save(); doc.moveTo(cx, 130).lineTo(cx, 130 + rows.length * rowH).lineWidth(1.5).stroke(C.ink); doc.restore();
  const top = rows[0];
  if (top) fitText(doc, `Lo que más pesa es «${top.label}»: ${top.change} mueve la utilidad entre ${compact(top.worseProfit)} y +${compact(top.betterProfit)}. Cuida eso primero.`, MX + 24, 448, { width: CONTENT_W - 48, height: 40, maxSize: 13, minSize: 10, bold: true, color: C.ink });
}

function recCard(doc: Doc, rec: Recommendation, note: string, x: number, y: number, w: number, h: number) {
  const careful = rec.quality === "medio";
  const accent = careful ? C.amber : AREA_COLOR[rec.area];
  card(doc, x, y, w, h, { accent });
  text(doc, (careful ? "CON CUIDADO  ·  " : "") + AREA_LABEL[rec.area].toUpperCase(), x + 26, y + 12, { size: 8, bold: true, color: accent === C.amber ? "#b7791f" : accent, spacing: 1, width: w - 160, height: 11 });
  fitText(doc, rec.title, x + 26, y + 26, { width: w - 172, height: 34, maxSize: 12.5, minSize: 9.5, bold: true, color: C.ink });
  text(doc, `+${compact(rec.gainClp)}`, x + w - 126, y + 9, { font: "display", size: 20, color: "#13795B", width: 110, align: "right" });
  text(doc, `${rec.marginPtsGain > 0 ? "+" : ""}${rec.marginPtsGain.toLocaleString("es-CL")} pts de margen`, x + w - 136, y + 38, { size: 8.5, color: C.muted, width: 120, align: "right" });
  fitText(doc, note, x + 26, y + 62, { width: w - 46, height: h - 92, maxSize: 9.5, minSize: 8, color: C.muted, lineGap: 2 });
  let px = x + 26;
  px += pill(doc, QUALITY_LABEL[rec.quality], px, y + h - 22, { bg: careful ? C.amberSoft : C.greenSoft, color: careful ? "#8a5a00" : "#13795b", size: 7.5, padX: 7, h: 15 }) + 6;
  pill(doc, `Esfuerzo ${rec.effort}`, px, y + h - 22, { bg: "#efe7f4", color: C.muted, size: 7.5, padX: 7, h: 15 });
}

function pageRecommendations(doc: Doc, d: SingleReportData) {
  const set = d.recommendations;
  const all = [...set.recommended, ...set.withCare];
  const cardW = (CONTENT_W - 14) / 2;
  const cardH = 120;
  const firstPer = set.topThree ? 4 : 6;
  const perPage = 6;
  const pages = Math.max(1, 1 + Math.ceil(Math.max(0, all.length - firstPer) / perPage));
  for (let p = 0; p < pages; p++) {
    newPage(doc, "light");
    header(doc, "Cómo subir el margen", p === 0 ? "Ideas que no tocan la calidad del evento" : "Más ideas para subir el margen", p === 0 ? "Ordenadas por cuánto suman en relación al esfuerzo; lo que el invitado nota solo se negocia, nunca se recorta" : undefined);
    let startY = p === 0 ? 116 : 108;
    if (p === 0 && set.topThree) {
      card(doc, MX, 110, CONTENT_W, 56, { fill: C.bgDark2 });
      text(doc, "SI APLICAS LAS 3 MEJORES JUNTAS", MX + 22, 121, { size: 8.5, bold: true, color: C.ink, spacing: 1.2 });
      text(doc, `+${compact(set.topThree.profitGain)} de utilidad  ·  margen ${pctText(set.topThree.marginBefore)} > ${pctText(set.topThree.marginAfter)}`, MX + 22, 134, { font: "display", size: 21, color: C.ink, width: CONTENT_W - 44, spacing: 0.5 });
      startY = 182;
    }
    const from = p === 0 ? 0 : firstPer + (p - 1) * perPage;
    all.slice(from, from + (p === 0 ? firstPer : perPage)).forEach((rec, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      recCard(doc, rec, d.narrative.recNotes[rec.id] ?? rec.how, MX + col * (cardW + 14), startY + row * (cardH + 8), cardW, cardH);
    });
    if (all.length === 0) text(doc, "Con los datos cargados no hay ideas con ganancia clara. Revisa precios, costos y barra en la simulación.", MX, 130, { size: 14, color: C.muted, width: CONTENT_W });
  }
}

const GLOSSARY: [string, string][] = [
  ["Utilidad", "Lo que queda en tu bolsillo después de pagar todo: costos, comisiones, el local e impuestos."],
  ["Margen", "Qué parte de cada $100 que entran se convierte en utilidad. Más alto es mejor."],
  ["Meta de margen", "El mínimo de margen que te propusiste. Si lo cumples, la fiesta vale la pena."],
  ["Techo de gasto", "El máximo que puedes gastar en gastos fijos sin bajar de tu meta de margen."],
  ["Punto de equilibrio", "Cuántas entradas hay que vender para no ganar ni perder. Desde ahí empieza la ganancia."],
  ["Gastos fijos", "Lo que pagas sí o sí para hacer la fiesta, venda lo que venda: arriendo, staff, producción."],
  ["IVA y crédito fiscal", "Con factura, el IVA de tus compras se descuenta del IVA que cobras por tus ventas. Con boleta no."],
  ["Aforo", "Cuánta gente asiste en total (cada entrada dúo cuenta como 2 personas)."],
];

function pageAssumptions(doc: Doc, d: { input: BudgetSimulationInput; result: BudgetResult; recs?: RecommendationSet; real?: boolean }, opts: { glossary: boolean; external?: boolean }) {
  newPage(doc, "light");
  header(doc, opts.glossary ? "Supuestos y glosario" : "Supuestos", opts.glossary ? "Cómo se calculó y qué significa cada palabra" : "Cómo leer estas cifras");
  const i = d.input;
  const bullets = [
    d.real ? "Son cifras reales del sistema: ventas aprobadas, gastos cargados y pagos al staff. Los escenarios y consejos usan esos números como base." : "Es una simulación: usa los precios y cantidades que se cargaron, no ventas reales.",
    `Los precios de las entradas ${i.ivaApplies && i.onlineSalesNoIva ? "se venden online y no declaran IVA (solo se descuenta la comisión de la pasarela); el 19% se descuenta solo de la barra." : i.ivaApplies ? "incluyen IVA y el evento declara IVA: el 19% de las ventas se descuenta como impuesto." : "incluyen IVA, pero el evento no declara IVA: todo el ingreso cuenta completo."}`,
    ...(opts.external ? [] : [
      `Comisión de tarjeta: ${i.cardFeePercent}% del ingreso. Comisión de embajadores: ${i.commissionPercent}% sobre entradas y barra.`,
      ...(i.venueBarSharePercent ? [`El local se lleva ${i.venueBarSharePercent}% de la venta bruta de barra, aparte del arriendo.`] : []),
      "Los gastos fijos cargados con «+ IVA» se asumen con factura (el IVA se recupera si el evento lo declara).",
    ]),
    "Los ingresos adicionales (como estacionamiento) no suman personas al aforo.",
    "Las proyecciones por asistencia escalan entradas, barra y autos; los gastos fijos se mantienen.",
    ...(opts.external ? [] : ["Cada idea de mejora se calculó volviendo a simular, cambiando solo esa variable. Los efectos de varias ideas juntas no son la suma exacta."]),
  ];
  const colW = opts.glossary ? 410 : CONTENT_W;
  card(doc, MX, 116, colW + (opts.glossary ? 0 : 0), 384);
  text(doc, "CÓMO SE CALCULÓ", MX + 22, 134, { size: 8.5, bold: true, color: C.muted, spacing: 1 });
  let y = 156;
  for (const b of bullets) {
    const h = textHeight(doc, b, colW - 70, 10.8);
    rrect(doc, MX + 22, y + 5, 6, 6, 3, C.pink);
    text(doc, b, MX + 38, y, { size: 10.8, color: C.ink, width: colW - 70, lineGap: 2 });
    y += h + 12;
  }
  if (opts.glossary) {
    const gx = MX + 430, gw = CONTENT_W - 430;
    card(doc, gx, 116, gw, 384);
    text(doc, "GLOSARIO SIMPLE", gx + 22, 134, { size: 8.5, bold: true, color: C.muted, spacing: 1 });
    let gy = 156;
    for (const [term, def] of GLOSSARY) {
      text(doc, term, gx + 22, gy, { size: 10.5, bold: true, color: C.pink, width: gw - 44 });
      const h = textHeight(doc, def, gw - 44, 9.5);
      text(doc, def, gx + 22, gy + 14, { size: 9.5, color: C.muted, width: gw - 44, lineGap: 1.5 });
      gy += 14 + h + 8;
    }
  }
}

/* ─── Resumen ejecutivo ─────────────────────────────────────── */

function pageExecutive(doc: Doc, d: SingleReportData) {
  const r = d.result;
  newPage(doc, "light");
  header(doc, "Resumen ejecutivo", d.narrative.headline);
  card(doc, MX, 112, 410, 168);
  fitText(doc, d.narrative.summary, MX + 20, 128, { width: 370, height: 138, maxSize: 12.5, minSize: 9.5, color: C.ink, lineGap: 4 });
  const w = 197;
  kpi(doc, MX, 296, w, 98, "Utilidad", compact(r.pnl.netProfit), undefined, r.pnl.netProfit >= 0 ? C.green : C.red);
  kpi(doc, MX + w + 16, 296, w, 98, "Margen", pctText(r.pnl.marginPercent), `meta ${d.input.marginTargetPercent}%`);
  kpi(doc, MX, 406, w, 94, "Aforo", r.attendance.toLocaleString("es-CL"), `${r.ticketsSold.toLocaleString("es-CL")} entradas`);
  kpi(doc, MX + w + 16, 406, w, 94, "Equilibrio", r.breakevenTickets != null ? r.breakevenTickets.toLocaleString("es-CL") : "-", "entradas para no perder");

  const rx = MX + 434, rw = CONTENT_W - 434;
  text(doc, "LAS IDEAS QUE MÁS SUMAN", rx, 114, { size: 8.5, bold: true, color: C.muted, spacing: 1 });
  const set = d.recommendations;
  const picks = set.topThree ? set.topThree.ids.map((id) => [...set.recommended, ...set.withCare].find((x) => x.id === id)!).filter(Boolean) : set.recommended.slice(0, 3);
  picks.forEach((rec, i) => recCard(doc, rec, d.narrative.recNotes[rec.id] ?? rec.how, rx, 132 + i * 106, rw, 98));
  if (set.topThree) {
    card(doc, rx, 132 + picks.length * 106, rw, 50, { fill: C.bgDark2 });
    text(doc, `Las 3 juntas: +${compact(set.topThree.profitGain)}  ·  margen ${pctText(set.topThree.marginBefore)} > ${pctText(set.topThree.marginAfter)}`, rx + 16, 132 + picks.length * 106 + 15, { font: "display", size: 17, color: C.ink, width: rw - 32, spacing: 0.4 });
  }
}

/* ─── API: informe de una simulación ────────────────────────── */

export async function buildSingleReportPdf(d: SingleReportData, version: ReportVersion): Promise<Buffer> {
  const label = d.real ? `Informe real «${d.name}»` : version === "externa" ? `Proyección «${d.name}»` : `Simulación «${d.name}»`;
  const { doc, done } = createDoc(`${label} - Mansion Playroom`);
  const r = d.result;

  if (version === "externa") {
    cover(doc, {
      kicker: "Proyección de evento", title: d.name, subtitle: d.eventTitle ? `Evento: ${d.eventTitle}` : "Cifras proyectadas del evento", emittedAt: d.emittedAt,
      kpis: [
        { label: "Aforo estimado", value: `${r.attendance.toLocaleString("es-CL")} personas` },
        { label: "Entradas", value: r.ticketsSold.toLocaleString("es-CL"), caption: "entradas proyectadas" },
        { label: "Ingreso proyectado", value: compact(r.grossIncome), caption: "IVA incluido" },
      ],
    });
    pageIncome(doc, d, { kicker: "Ingresos", title: "De dónde viene el ingreso proyectado" });
    pageScenarios(doc, d, true);
    pageAssumptions(doc, { input: d.input, result: r }, { glossary: false, external: true });
    closingPage(doc);
    footers(doc, label, { skipLast: true });
    doc.end();
    return done;
  }

  const margin = r.pnl.marginPercent;
  cover(doc, {
    real: d.real,
    kicker: d.real ? "Informe real del evento" : "Informe de simulación", title: d.name,
    subtitle: d.real ? "Lo que realmente entró y salió, con consejos para el próximo evento" : d.eventTitle ? `Vinculada al evento: ${d.eventTitle}` : "Simulación previa al evento: cuánto puedes gastar y cuánta gente necesitas",
    verdict: d.verdict, emittedAt: d.emittedAt,
    kpis: [
      { label: d.real ? "Ingreso real" : "Ingreso proyectado", value: compact(r.grossIncome), caption: `${r.attendance.toLocaleString("es-CL")} personas` },
      { label: d.real ? "Utilidad real" : "Utilidad estimada", value: compact(r.pnl.netProfit), caption: "después de todos los costos", color: r.pnl.netProfit >= 0 ? "#13795B" : "#C23B40" },
      { label: "Margen", value: pctText(margin), caption: `meta ${d.input.marginTargetPercent}%` },
    ],
  });

  if (version === "resumen") {
    pageExecutive(doc, d);
    footers(doc, label);
    doc.end();
    return done;
  }

  pageEssentials(doc, d);
  pageIncome(doc, d, { kicker: "De dónde viene la plata", title: "Tus ingresos, entrada por entrada" });
  pageMoneyOut(doc, d);
  pageCeiling(doc, d);
  pageScenarios(doc, d);
  if (d.sensitivity.length > 0) pageSensitivity(doc, d);
  pageRecommendations(doc, d);
  pageAssumptions(doc, { input: d.input, result: r, real: d.real }, { glossary: true });
  closingPage(doc);
  footers(doc, label, { skipLast: true });
  doc.end();
  return done;
}

/* ─── API: comparación ──────────────────────────────────────── */

const SIM_COLORS = [C.pink, C.violet, C.sky, C.amber];

function pageCompareVerdict(doc: Doc, d: ComparisonReportData) {
  newPage(doc, "light");
  const w = d.sims[d.winnerIndex];
  header(doc, "Veredicto", `Conviene «${w.name}»`, "La opción que mejor equilibra utilidad y meta de margen");
  card(doc, MX, 116, 470, 384, { accent: C.green });
  text(doc, "OPCIÓN RECOMENDADA", MX + 28, 134, { size: 8.5, bold: true, color: C.green, spacing: 1.2 });
  fitText(doc, w.name, MX + 28, 150, { width: 420, height: 44, maxSize: 28, minSize: 16, bold: true, color: C.ink });
  pill(doc, w.verdict.label, MX + 28, 202, { bg: VERDICT_COLOR[w.verdict.key], color: w.verdict.key === "warning" ? C.ink : C.white, size: 10.5, padX: 12, h: 26 });
  let y = 248;
  for (const reason of d.reasons) {
    const h = textHeight(doc, reason, 410, 11.8);
    rrect(doc, MX + 28, y + 5, 6, 6, 3, C.green);
    text(doc, reason, MX + 44, y, { size: 11.8, color: C.ink, width: 410, lineGap: 3 });
    y += h + 14;
  }
  // Mini resumen por opción
  const rx = MX + 490, rw = CONTENT_W - 490;
  d.sims.forEach((s, i) => {
    const sy = 116 + i * 96;
    card(doc, rx, sy, rw, 86, { accent: SIM_COLORS[i % SIM_COLORS.length] });
    fitText(doc, s.name, rx + 20, sy + 12, { width: rw - 150, height: 18, maxSize: 13, minSize: 10, bold: true, color: C.ink });
    if (i === d.winnerIndex) pill(doc, "Recomendada", rx + rw - 106, sy + 10, { bg: C.greenSoft, color: "#13795b", size: 8.5, padX: 9, h: 18 });
    text(doc, `Utilidad ${compact(s.result.pnl.netProfit)}  ·  Margen ${pctText(s.result.pnl.marginPercent)}`, rx + 20, sy + 38, { size: 11, color: C.ink, width: rw - 40 });
    text(doc, s.verdict.label, rx + 20, sy + 58, { size: 9.5, color: C.muted, width: rw - 40, height: 12 });
  });
}

function pageCompareTable(doc: Doc, d: ComparisonReportData) {
  newPage(doc, "light");
  header(doc, "Cifras lado a lado", "Todas las opciones en una tabla", "La mejor de cada fila está marcada en verde");
  const n = d.sims.length;
  const labelW = 210;
  const colW = (CONTENT_W - labelW - 24) / n;
  card(doc, MX, 112, CONTENT_W, 392);
  const rows: { label: string; value: (i: number) => string; best?: number | null; sub?: boolean }[] = [
    { label: "Aforo estimado", value: (i) => d.sims[i].result.attendance.toLocaleString("es-CL") },
    { label: "Ingreso bruto", value: (i) => compact(d.sims[i].result.grossIncome), best: d.best.grossIncome },
    { label: "Gastos fijos", value: (i) => compact(d.sims[i].result.pnl.directExpensesTotal) },
    { label: "Parte del local", value: (i) => compact(d.sims[i].result.pnl.extraCostsTotal) },
    { label: "Utilidad estimada", value: (i) => compact(d.sims[i].result.pnl.netProfit), best: d.best.netProfit },
    { label: "Margen", value: (i) => pctText(d.sims[i].result.pnl.marginPercent), best: d.best.marginPercent },
    { label: "Techo de gasto", value: (i) => compact(d.sims[i].result.maxDirectExpenses), best: d.best.maxDirectExpenses },
    { label: "Punto de equilibrio", value: (i) => (d.sims[i].result.breakevenTickets != null ? `${d.sims[i].result.breakevenTickets!.toLocaleString("es-CL")} entradas` : "-"), best: d.best.breakevenTickets },
    { label: "Veredicto", value: (i) => d.sims[i].verdict.short },
  ];
  // Encabezados
  d.sims.forEach((s, i) => {
    const x = MX + 16 + labelW + i * colW;
    rrect(doc, x + 4, 124, colW - 8, 40, 10, SIM_COLORS[i % SIM_COLORS.length], { opacity: 0.14 });
    fitText(doc, s.name, x + 10, 131, { width: colW - 20, height: 28, maxSize: 11.5, minSize: 8.5, bold: true, color: C.ink, align: "center" });
  });
  rows.forEach((row, ri) => {
    const y = 176 + ri * 36;
    if (ri % 2 === 0) rrect(doc, MX + 8, y - 6, CONTENT_W - 16, 32, 8, "#f7f1fa");
    text(doc, row.label, MX + 24, y + 3, { size: 11, bold: true, color: C.muted, width: labelW - 20 });
    d.sims.forEach((_, i) => {
      const x = MX + 16 + labelW + i * colW;
      const isBest = row.best === i && d.sims.length > 1;
      if (isBest) rrect(doc, x + 4, y - 4, colW - 8, 28, 8, C.greenSoft);
      text(doc, row.value(i), x + 6, y + 3, { size: 12, bold: true, color: isBest ? "#13795b" : C.ink, width: colW - 12, align: "center", height: 16 });
    });
  });
}

function pageCompareBars(doc: Doc, d: ComparisonReportData) {
  newPage(doc, "light");
  header(doc, "Ingresos, costos y utilidad", "Qué entra, qué se va y qué queda en cada opción");
  card(doc, MX, 116, CONTENT_W, 384);
  const groups = d.sims.map((s) => ({
    label: s.name,
    values: [
      { value: s.result.grossIncome, color: C.pink },
      { value: s.result.pnl.netIncome - s.result.pnl.netProfit, color: C.orange },
      { value: s.result.pnl.netProfit, color: s.result.pnl.netProfit >= 0 ? C.green : C.red },
    ],
  }));
  barChart(doc, MX + 30, 140, CONTENT_W - 60, 340, groups);
  legend(doc, [{ label: "Ingreso bruto", color: C.pink }, { label: "Costos totales (sin IVA)", color: C.orange }, { label: "Utilidad", color: C.green }], MX + 30, 126);
}

function pageCompareMargin(doc: Doc, d: ComparisonReportData) {
  newPage(doc, "light");
  header(doc, "Margen frente a la meta", "¿Quién cumple lo que te propusiste?");
  card(doc, MX, 116, CONTENT_W, 384);
  const maxM = Math.max(60, ...d.sims.map((s) => s.result.pnl.marginPercent ?? 0), ...d.sims.map((s) => s.input.marginTargetPercent)) * 1.1;
  const bx = MX + 230, bw = CONTENT_W - 330;
  d.sims.forEach((s, i) => {
    const y = 150 + i * 80;
    fitText(doc, s.name, MX + 26, y + 2, { width: 190, height: 30, maxSize: 12.5, minSize: 9, bold: true, color: C.ink });
    const m = s.result.pnl.marginPercent ?? 0;
    hbar(doc, bx, y, bw, 22, Math.max(0, m) / maxM, VERDICT_COLOR[s.verdict.key]);
    const tx = bx + (s.input.marginTargetPercent / maxM) * bw;
    doc.save(); doc.moveTo(tx, y - 8).lineTo(tx, y + 30).lineWidth(2.2).stroke(C.ink); doc.restore();
    text(doc, `Meta ${s.input.marginTargetPercent}%`, tx - 40, y + 32, { size: 8.5, color: C.muted, width: 80, align: "center" });
    text(doc, pctText(s.result.pnl.marginPercent), bx + bw + 12, y + 2, { size: 15, bold: true, color: C.ink, width: 80 });
  });
}

function pageCompareScenarios(doc: Doc, d: ComparisonReportData) {
  newPage(doc, "light");
  header(doc, "Proyecciones", "¿Qué pasa si va menos (o más) gente?", "Utilidad de cada opción según el porcentaje del aforo que se llene");
  card(doc, MX, 116, CONTENT_W, 384);
  const series = d.sims.map((s, i) => ({ name: s.name, color: SIM_COLORS[i % SIM_COLORS.length], points: s.scenarios.map((sc) => ({ x: sc.occupancy * 100, y: sc.netProfit })) }));
  lineChart(doc, MX + 24, 150, CONTENT_W - 48, 300, series, { xLabel: (v) => `${Math.round(v)}%`, xTicks: [70, 85, 100, 115] });
  legend(doc, series.map((s) => ({ label: s.name, color: s.color })), MX + 30, 128);
  text(doc, "Porcentaje de las entradas esperadas que se llena", MX + 24, 478, { size: 9, color: C.muted, width: CONTENT_W - 48, align: "center" });
}

function pageCompareWhere(doc: Doc, d: ComparisonReportData) {
  newPage(doc, "light");
  header(doc, "Qué explica la diferencia", "A dónde va cada $100 en cada opción");
  card(doc, MX, 116, CONTENT_W, 384);
  const parts: { key: string; label: string; color: string; pick: (r: BudgetResult) => number }[] = [
    { key: "iva", label: "IVA", color: "#94a3b8", pick: (r) => r.pnl.iva.debitoFiscal },
    { key: "var", label: "Costo por persona", color: C.sky, pick: (r) => r.pnl.cogs },
    { key: "com", label: "Comisiones", color: C.violet, pick: (r) => r.pnl.ambassadorCommissions + r.pnl.cardFeeAmount },
    { key: "venue", label: "Parte del local", color: C.amber, pick: (r) => r.pnl.extraCostsTotal },
    { key: "fixed", label: "Gastos fijos", color: C.orange, pick: (r) => r.pnl.directExpensesTotal },
    { key: "profit", label: "Utilidad", color: C.green, pick: (r) => Math.max(0, r.pnl.netProfit) },
  ];
  legend(doc, parts.map((p) => ({ label: p.label, color: p.color })), MX + 30, 130);
  const bx = MX + 230, bw = CONTENT_W - 270;
  d.sims.forEach((s, i) => {
    const y = 170 + i * 76;
    fitText(doc, s.name, MX + 26, y + 4, { width: 190, height: 30, maxSize: 12.5, minSize: 9, bold: true, color: C.ink });
    const total = parts.reduce((sum, p) => sum + p.pick(s.result), 0) || 1;
    let cx = bx;
    for (const p of parts) {
      const frac = p.pick(s.result) / total;
      const pw = frac * bw;
      if (pw < 1) continue;
      rrect(doc, cx, y, Math.max(pw - 2, 1), 34, 4, p.color);
      if (pw > 44) text(doc, `$${Math.round(frac * 100)}`, cx, y + 10, { size: 10, bold: true, color: C.white, width: pw - 2, align: "center" });
      cx += pw;
    }
    text(doc, `Gasta $${Math.round(((total - Math.max(0, s.result.pnl.netProfit)) / total) * 100)} y guarda $${Math.round((Math.max(0, s.result.pnl.netProfit) / total) * 100)} de cada $100`, bx, y + 44, { size: 9.5, color: C.muted, width: bw });
  });
}

export async function buildComparisonPdf(d: ComparisonReportData, version: Exclude<ReportVersion, "externa">): Promise<Buffer> {
  const names = d.sims.map((s) => s.name).join(" vs. ");
  const label = `Comparación de simulaciones`;
  const { doc, done } = createDoc(`${label}: ${names}`);
  const winner = d.sims[d.winnerIndex];
  cover(doc, {
    kicker: "Comparación de simulaciones", title: names, subtitle: `Recomendada: ${winner.name}`, verdict: winner.verdict, emittedAt: d.emittedAt,
    kpis: [
      { label: "Opciones comparadas", value: String(d.sims.length), caption: "simulaciones" },
      { label: "Mejor utilidad", value: compact(Math.max(...d.sims.map((s) => s.result.pnl.netProfit))), caption: d.sims[d.best.netProfit].name, color: "#13795B" },
      { label: "Mejor margen", value: pctText(Math.max(...d.sims.map((s) => s.result.pnl.marginPercent ?? -Infinity))), caption: d.sims[d.best.marginPercent].name },
    ],
  });
  pageCompareVerdict(doc, d);
  pageCompareTable(doc, d);
  if (version === "completa") {
    pageCompareBars(doc, d);
    pageCompareMargin(doc, d);
    pageCompareScenarios(doc, d);
    pageCompareWhere(doc, d);
    // Ideas para la ganadora, con el mismo diseño del informe individual.
    const single: SingleReportData = {
      name: winner.name, input: winner.input, result: winner.result, verdict: winner.verdict, scenarios: winner.scenarios, sensitivity: [], curve: [],
      recommendations: d.winnerRecommendations, narrative: d.winnerNarrative, emittedAt: d.emittedAt,
    };
    pageRecommendations(doc, { ...single });
    pageAssumptions(doc, { input: winner.input, result: winner.result }, { glossary: true });
  } else {
    pageAssumptions(doc, { input: winner.input, result: winner.result }, { glossary: false });
  }
  if (version === "completa") closingPage(doc);
  footers(doc, label, { skipLast: version === "completa" });
  doc.end();
  return done;
}

export { expenseLineAmounts };
