/** Vigilante de caja ("agente contador", pedido explícito del dueño): avisa
 * al celular del dueño (push del /admin instalado) de todo lo que puede ser
 * plata que se escapa, antes de que la cajera lo note.
 *
 * Las ALERTAS las deciden reglas fijas y probadas (funciones puras de este
 * archivo); la IA solo redacta el resumen horario/de cierre a partir de
 * números ya calculados -- nunca decide qué es sospechoso ni inventa cifras.
 *
 * Toda alerta queda guardada en `cajaAlerts` (historial visible en /admin), y
 * su `dedupeKey` único es lo que evita repetir la misma alerta en cada pasada
 * del cron. Nada de este archivo lanza: un aviso fallido nunca puede tumbar
 * una venta, una anulación o un cierre de turno. */
import { and, eq, gte, inArray, isNull, desc, sql } from "drizzle-orm";
import { cajaAlerts, events, operators, ops, orders, orderItems, registers, shifts, ticketTypes } from "../../drizzle/schema";
import { getDb, getSiteSettings } from "../db";
import { sendPushToAdmins } from "../push";
import { normalizeAdminAlertsConfig, type AdminAlertsConfig } from "../../shared/adminAlertsConfig";
import { isPartyWindowOpen, partyWindow } from "../../shared/party";
import { invokeLLM, extractContent } from "../_core/llm";
import { sendEmail } from "../email";
import { ADMIN_NOTIFICATION_EMAIL } from "@shared/const";

export type CajaAlertSeverity = "info" | "warning" | "critical";
export type CajaAlertDraft = { kind: string; severity: CajaAlertSeverity; title: string; body: string; dedupeKey: string };

const money = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const SEVERITY_ICON: Record<CajaAlertSeverity, string> = { info: "ℹ️", warning: "⚠️", critical: "🚨" };

/** Sin actividad en una caja abierta por más de esto, durante la fiesta. */
export const IDLE_REGISTER_MINUTES = 45;
/** Desde esta cantidad de anulaciones de una misma persona, se avisa. */
export const MANY_VOIDS_THRESHOLD = 3;
/** Descuento por sobre este porcentaje del subtotal de una venta. */
export const HIGH_DISCOUNT_RATIO = 0.5;

async function loadConfig(): Promise<AdminAlertsConfig> {
  const settings = await getSiteSettings();
  return normalizeAdminAlertsConfig((settings as any)?.adminAlertsConfig);
}

/** Guarda la alerta y, si es nueva (dedupeKey no visto), la manda por push.
 * Devuelve `true` solo si se creó ahora. */
export async function raiseCajaAlert(eventId: number, draft: CajaAlertDraft, opts: { isTestEvent?: boolean } = {}): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const title = `${opts.isTestEvent ? "🧪 [Prueba] " : ""}${SEVERITY_ICON[draft.severity]} ${draft.title}`.slice(0, 200);
    try {
      await db.insert(cajaAlerts).values({
        eventId, kind: draft.kind, severity: draft.severity, title, body: draft.body, dedupeKey: draft.dedupeKey.slice(0, 191),
      });
    } catch (err: any) {
      const isDuplicate = err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? ""));
      if (isDuplicate) return false;
      throw err;
    }
    await sendPushToAdmins("pushCajaAlerts", { title, body: draft.body.slice(0, 240), url: "/admin" });
    return true;
  } catch (err) {
    console.error("[cajaAlerts] No se pudo registrar/enviar la alerta:", err);
    return false;
  }
}

async function isTestEvent(eventId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [event] = await db.select({ slug: events.slug }).from(events).where(eq(events.id, eventId)).limit(1);
  return event?.slug === "pruebas-caja";
}

async function raiseAll(eventId: number, drafts: CajaAlertDraft[]) {
  if (drafts.length === 0) return;
  const test = await isTestEvent(eventId);
  for (const draft of drafts) await raiseCajaAlert(eventId, draft, { isTestEvent: test });
}

// --- Reglas puras (server/caja/alerts.test.ts) ---

/** Stock bajo / agotado tras una venta. Solo avisa al CRUZAR el umbral (antes
 * de la venta quedaba más), y la dedupeKey lo hace una sola vez por producto. */
export function stockAlertsAfterSale(
  products: { id: number; name: string; totalStock: number; soldCountAfter: number; quantitySold: number }[],
  lowStockUnits: number,
): CajaAlertDraft[] {
  const drafts: CajaAlertDraft[] = [];
  for (const p of products) {
    const left = p.totalStock - p.soldCountAfter;
    const leftBefore = left + p.quantitySold;
    if (left <= 0 && leftBefore > 0) {
      drafts.push({
        kind: "stock_out", severity: "critical", dedupeKey: `stock_out:${p.id}`,
        title: `Agotado: ${p.name}`,
        body: left < 0 ? `Se vendió ${Math.abs(left)} por sobre el stock cargado. Revisa la barra o corrige el inventario.` : "Se vendió la última unidad según el inventario cargado.",
      });
    } else if (lowStockUnits > 0 && left > 0 && left <= lowStockUnits && leftBefore > lowStockUnits) {
      drafts.push({
        kind: "stock_low", severity: "warning", dedupeKey: `stock_low:${p.id}:${lowStockUnits}`,
        title: `Stock bajo: ${p.name}`,
        body: `Quedan ${left} unidades.`,
      });
    }
  }
  return drafts;
}

/** Venta fuera de lo normal: monto alto o descuento grande. */
export function unusualSaleAlerts(
  sale: { orderNumber: string; subtotal: number; discount: number; total: number; operatorName: string; paymentMethod: string },
  highSaleClp: number,
): CajaAlertDraft[] {
  const drafts: CajaAlertDraft[] = [];
  if (highSaleClp > 0 && sale.total >= highSaleClp) {
    drafts.push({
      kind: "sale_high", severity: "warning", dedupeKey: `sale_high:${sale.orderNumber}`,
      title: `Venta alta: ${money(sale.total)}`,
      body: `${sale.orderNumber} · ${sale.paymentMethod} · cobró ${sale.operatorName}.`,
    });
  }
  if (sale.subtotal > 0 && sale.discount / sale.subtotal > HIGH_DISCOUNT_RATIO) {
    drafts.push({
      kind: "sale_discount", severity: "warning", dedupeKey: `sale_discount:${sale.orderNumber}`,
      title: `Descuento de ${Math.round((sale.discount / sale.subtotal) * 100)}% en una venta`,
      body: `${sale.orderNumber}: ${money(sale.subtotal)} → ${money(sale.total)} · cobró ${sale.operatorName}.`,
    });
  }
  return drafts;
}

/** Descuadre al cerrar turno: cualquier diferencia de $1 o más. */
export function shiftCloseAlerts(report: {
  id: number; registerName: string; operatorName: string;
  cashDiff: number; debitDiff: number; creditDiff: number; qrDiff: number;
  voids?: { total: number }[];
}): CajaAlertDraft[] {
  const parts: string[] = [];
  const add = (label: string, diff: number) => {
    if (Math.abs(diff) >= 1) parts.push(`${label} ${diff > 0 ? "sobran" : "faltan"} ${money(Math.abs(diff))}`);
  };
  add("Efectivo:", report.cashDiff);
  // Débito y crédito se evalúan juntos: la cajera puede elegir mal el tipo de
  // tarjeta y eso no es plata perdida (ver cardTotals en shiftMath.ts).
  add("Tarjetas:", report.debitDiff + report.creditDiff);
  add("QR:", report.qrDiff);
  const drafts: CajaAlertDraft[] = [];
  if (parts.length > 0) {
    drafts.push({
      kind: "shift_diff", severity: "critical", dedupeKey: `shift_diff:${report.id}`,
      title: `Descuadre en ${report.registerName}`,
      body: `${parts.join(" · ")} — turno de ${report.operatorName}.`,
    });
  }
  const voids = report.voids ?? [];
  if (voids.length > 0) {
    drafts.push({
      kind: "shift_voids", severity: "info", dedupeKey: `shift_voids:${report.id}`,
      title: `${report.registerName} cerró con ${voids.length} anulación(es)`,
      body: `Total anulado ${money(voids.reduce((s, v) => s + v.total, 0))}. Verifica las reversas en la máquina.`,
    });
  }
  return drafts;
}

/** Cajas abiertas sin ninguna operación hace más de IDLE_REGISTER_MINUTES. */
export function idleRegisterAlerts(
  openShifts: { shiftId: number; registerName: string; operatorName: string; lastActivityAt: Date }[],
  now: Date,
): CajaAlertDraft[] {
  return openShifts
    .filter((s) => now.getTime() - s.lastActivityAt.getTime() > IDLE_REGISTER_MINUTES * 60_000)
    .map((s) => {
      const minutes = Math.floor((now.getTime() - s.lastActivityAt.getTime()) / 60_000);
      // Un aviso por hora de inactividad, no uno cada 5 minutos.
      const bucket = Math.floor(minutes / 60);
      return {
        kind: "register_idle", severity: "warning" as const, dedupeKey: `register_idle:${s.shiftId}:${bucket}`,
        title: `${s.registerName} sin movimiento hace ${minutes} min`,
        body: `Turno abierto de ${s.operatorName}. ¿Se cayó la tablet, está sin señal o están cobrando fuera del sistema?`,
      };
    });
}

/** Muchas anulaciones de la misma persona en el evento. */
export function manyVoidsAlerts(voidsByOperator: { operatorId: number; operatorName: string; count: number; total: number }[], eventId: number): CajaAlertDraft[] {
  return voidsByOperator
    .filter((v) => v.count >= MANY_VOIDS_THRESHOLD)
    .map((v) => ({
      kind: "many_voids", severity: "critical" as const, dedupeKey: `many_voids:${eventId}:${v.operatorId}:${v.count}`,
      title: `${v.count} ventas anuladas en la caja de ${v.operatorName}`,
      body: `Total anulado ${money(v.total)} esta noche. Revisa los motivos en el historial de ventas.`,
    }));
}

// --- Disparadores inmediatos (los llama el router) ---

/** Después de cada venta aplicada (online o sincronizada). */
export async function checkSaleAlerts(params: { eventId: number; opId: string; operatorName: string }) {
  try {
    const db = await getDb();
    if (!db) return;
    const config = await loadConfig();
    if (!config.pushCajaAlerts) return;
    const [order] = await db.select().from(orders).where(eq(orders.paymentId, `CAJA-${params.opId}`)).limit(1);
    if (!order) return;
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const ids = items.map((i: any) => i.ticketTypeId);
    const products = ids.length ? await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ids)) : [];
    const qtyById = new Map<number, number>();
    for (const i of items) qtyById.set(i.ticketTypeId, (qtyById.get(i.ticketTypeId) ?? 0) + i.quantity);

    await raiseAll(params.eventId, [
      ...stockAlertsAfterSale(
        products.map((p: any) => ({ id: p.id, name: p.name, totalStock: p.totalStock, soldCountAfter: p.soldCount, quantitySold: qtyById.get(p.id) ?? 0 })),
        config.cajaLowStockUnits,
      ),
      ...unusualSaleAlerts({
        orderNumber: order.orderNumber, subtotal: Number(order.subtotal), discount: Number(order.discount),
        total: Number(order.total), operatorName: params.operatorName, paymentMethod: order.paymentMethod ?? "—",
      }, config.cajaHighSaleClp),
    ]);
  } catch (err) {
    console.error("[cajaAlerts] checkSaleAlerts:", err);
  }
}

export async function alertSaleVoided(params: { eventId: number; orderNumber: string; total: number; paymentMethod: string; buyerName: string; reason: string; operatorName: string }) {
  await raiseAll(params.eventId, [{
    kind: "sale_void", severity: "warning", dedupeKey: `sale_void:${params.orderNumber}`,
    title: `Venta anulada: ${money(params.total)}`,
    body: `${params.orderNumber} (${params.buyerName}, ${params.paymentMethod}) · caja de ${params.operatorName} · motivo: ${params.reason}`,
  }]);
}

export async function alertWrongAdminPassword(params: { eventId: number; operatorName: string; orderNumber: string }) {
  await raiseAll(params.eventId, [{
    kind: "admin_password_failed", severity: "critical",
    dedupeKey: `admin_password_failed:${params.eventId}:${params.orderNumber}:${Math.floor(Date.now() / 60_000)}`,
    title: "Clave de admin incorrecta en caja",
    body: `${params.operatorName} intentó anular ${params.orderNumber} con una clave equivocada.`,
  }]);
}

export async function alertShiftClosed(eventId: number, report: Parameters<typeof shiftCloseAlerts>[0]) {
  await raiseAll(eventId, shiftCloseAlerts(report));
}

// --- Revisión periódica (cron /api/cron/caja-watch, cada 5 minutos) ---

/** Números de la noche ya calculados -- lo único que ve la IA. */
async function buildNightNumbers(eventId: number) {
  const db = (await getDb())!;
  const cajaOrders = await db.select({
    total: orders.total, paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus,
  }).from(orders).where(and(eq(orders.eventId, eventId), eq(orders.channel, "caja")));
  const approved = cajaOrders.filter((o: any) => o.paymentStatus === "approved");
  const voided = cajaOrders.filter((o: any) => o.paymentStatus === "refunded");
  const byMethod: Record<string, number> = {};
  for (const o of approved) byMethod[o.paymentMethod ?? "otro"] = (byMethod[o.paymentMethod ?? "otro"] ?? 0) + Number(o.total);

  const products = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const lowStock = products
    .filter((p: any) => p.category !== "acceso" && p.totalStock - p.soldCount <= 10)
    .map((p: any) => `${p.name}: ${p.totalStock - p.soldCount}`);

  const alerts = await db.select({ title: cajaAlerts.title }).from(cajaAlerts)
    .where(eq(cajaAlerts.eventId, eventId)).orderBy(desc(cajaAlerts.createdAt)).limit(15);
  const closedShifts = await db.select().from(shifts).where(and(eq(shifts.eventId, eventId), eq(shifts.status, "closed")));

  return {
    ventasAprobadas: approved.length,
    totalVendido: approved.reduce((s: number, o: any) => s + Number(o.total), 0),
    porMetodo: byMethod,
    anuladas: voided.length,
    totalAnulado: voided.reduce((s: number, o: any) => s + Number(o.total), 0),
    stockBajo: lowStock,
    turnosCerrados: closedShifts.map((s: any) => ({
      efectivoContado: Number(s.countedCash ?? 0), efectivoEsperado: Number(s.expectedCash ?? 0) + Number(s.openingCash ?? 0),
    })),
    ultimasAlertas: alerts.map((a: any) => a.title),
  };
}

async function writeAiSummary(numbers: Awaited<ReturnType<typeof buildNightNumbers>>, final: boolean): Promise<string> {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "Eres el contador de un evento nocturno en Chile. Recibes números YA calculados de la caja. " +
          "Escribe en español chileno, sin markdown, " + (final ? "un resumen de cierre de 6 a 10 líneas" : "un resumen de 3 a 5 líneas") +
          ": cuánto se vendió y por qué medio, anulaciones, descuadres, stock que se está acabando y qué revisar. " +
          "Usa SOLO los números entregados; nunca inventes cifras. Si algo está bien, dilo en una frase.",
      },
      { role: "user", content: JSON.stringify(numbers) },
    ],
    maxTokens: 600,
  });
  return extractContent(result.choices[0]?.message ?? { content: "" }).trim();
}

export async function runCajaWatch(now: Date = new Date()) {
  const db = await getDb();
  if (!db) return { checked: 0 };
  const config = await loadConfig();
  if (!config.pushCajaAlerts && !config.cajaAiSummary) return { checked: 0, reason: "apagado" };

  const candidates = await db.select().from(events);
  let checked = 0;
  for (const event of candidates as any[]) {
    const window = partyWindow(event);
    if (!window) continue;
    const open = isPartyWindowOpen(event, now);
    // Hasta 6 horas después del cierre: turnos que quedaron abiertos y el
    // correo de cierre de la noche.
    const justEnded = !open && now.getTime() >= window.closesAt && now.getTime() < window.closesAt + 6 * 3_600_000;
    if (!open && !justEnded) continue;
    checked++;
    const eventId = event.id as number;
    const drafts: CajaAlertDraft[] = [];

    const openShifts = await db.select({
      id: shifts.id, openedAt: shifts.openedAt, registerId: shifts.registerId, operatorId: shifts.operatorId,
      registerName: registers.name, operatorName: operators.name,
    }).from(shifts)
      .leftJoin(registers, eq(registers.id, shifts.registerId))
      .leftJoin(operators, eq(operators.id, shifts.operatorId))
      .where(and(eq(shifts.eventId, eventId), eq(shifts.status, "open")));

    if (config.pushCajaAlerts && open) {
      const withActivity = [];
      for (const s of openShifts as any[]) {
        const [last] = await db.select({ at: sql<Date>`MAX(${ops.serverAt})` }).from(ops).where(and(
          eq(ops.eventId, eventId), gte(ops.serverAt, s.openedAt),
          s.registerId ? eq(ops.registerId, s.registerId) : isNull(ops.registerId),
        ));
        withActivity.push({
          shiftId: s.id, registerName: s.registerName ?? "Caja sin nombre", operatorName: s.operatorName ?? "—",
          lastActivityAt: new Date(last?.at ?? s.openedAt),
        });
      }
      drafts.push(...idleRegisterAlerts(withActivity, now));

      const voidOps = await db.select({ operatorId: ops.operatorId, payload: ops.payload }).from(ops)
        .where(and(eq(ops.eventId, eventId), eq(ops.type, "void_sale"), eq(ops.result, "applied")));
      // Se agrupa por quién COBRÓ la venta anulada (no por quién estaba
      // logueado al anular): es la caja que acumula errores lo que importa.
      const byOperator = new Map<number, { count: number; total: number }>();
      for (const v of voidOps as any[]) {
        const opId = Number(v.payload?.saleOperatorId ?? v.operatorId);
        const entry = byOperator.get(opId) ?? { count: 0, total: 0 };
        entry.count++; entry.total += Number(v.payload?.total ?? 0);
        byOperator.set(opId, entry);
      }
      if (byOperator.size > 0) {
        const ids = Array.from(byOperator.keys());
        const names = await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray(operators.id, ids));
        const nameById = new Map<number, string>((names as any[]).map((n) => [n.id, n.name]));
        drafts.push(...manyVoidsAlerts(ids.map((id) => ({ operatorId: id, operatorName: nameById.get(id) ?? `#${id}`, ...byOperator.get(id)! })), eventId));
      }

      const conflicts = await db.select({ id: ops.id, targetId: ops.targetId }).from(ops)
        .where(and(eq(ops.eventId, eventId), eq(ops.type, "redeem"), eq(ops.result, "conflict"), gte(ops.serverAt, new Date(window.opensAt))));
      for (const c of conflicts as any[]) {
        drafts.push({
          kind: "redeem_conflict", severity: "warning", dedupeKey: `redeem_conflict:${c.id}`,
          title: "Código canjeado dos veces", body: `El código ${c.targetId} se intentó canjear de nuevo. Revisa la cola de conflictos.`,
        });
      }
    }

    if (config.pushCajaAlerts && justEnded) {
      for (const s of openShifts as any[]) {
        drafts.push({
          kind: "shift_left_open", severity: "critical", dedupeKey: `shift_left_open:${s.id}`,
          title: `${s.registerName ?? "Una caja"} sigue con el turno abierto`,
          body: `La fiesta terminó y ${s.operatorName ?? "la cajera"} no ha cerrado turno: falta el cuadre de esa caja.`,
        });
      }
    }

    await raiseAll(eventId, drafts);

    if (config.cajaAiSummary) {
      try {
        if (open) {
          const hourKey = new Date(now.getTime() - (now.getTime() % 3_600_000)).toISOString();
          const elapsed = now.getTime() - window.opensAt;
          if (elapsed >= 3_600_000) {
            const [already] = await db.select({ id: cajaAlerts.id }).from(cajaAlerts).where(eq(cajaAlerts.dedupeKey, `ai_summary:${eventId}:${hourKey}`)).limit(1);
            if (!already) {
              const text = await writeAiSummary(await buildNightNumbers(eventId), false);
              if (text) await raiseCajaAlert(eventId, { kind: "ai_summary", severity: "info", dedupeKey: `ai_summary:${eventId}:${hourKey}`, title: "Resumen de caja", body: text }, { isTestEvent: event.slug === "pruebas-caja" });
            }
          }
        } else if (justEnded && openShifts.length === 0) {
          const key = `ai_close:${eventId}`;
          const [already] = await db.select({ id: cajaAlerts.id }).from(cajaAlerts).where(eq(cajaAlerts.dedupeKey, key)).limit(1);
          if (!already) {
            const numbers = await buildNightNumbers(eventId);
            const text = await writeAiSummary(numbers, true);
            const created = await raiseCajaAlert(eventId, { kind: "ai_close", severity: "info", dedupeKey: key, title: `Cierre de caja: ${event.title}`, body: text || "Sin resumen." }, { isTestEvent: event.slug === "pruebas-caja" });
            if (created) {
              const alerts = await db.select().from(cajaAlerts).where(eq(cajaAlerts.eventId, eventId)).orderBy(cajaAlerts.createdAt);
              await sendEmail({
                to: ADMIN_NOTIFICATION_EMAIL,
                subject: `[Caja] Resumen de la noche — ${event.title}`,
                html: buildCloseEmailHtml(event.title, text, numbers, alerts as any[]),
              });
            }
          }
        }
      } catch (err) {
        console.error("[cajaWatch] Resumen IA falló:", err);
      }
    }
  }
  return { checked };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function buildCloseEmailHtml(title: string, summary: string, numbers: Awaited<ReturnType<typeof buildNightNumbers>>, alerts: { title: string; body: string; createdAt: Date }[]) {
  const methods = Object.entries(numbers.porMetodo).map(([m, v]) => `<li>${escapeHtml(m)}: ${money(v)}</li>`).join("");
  const alertRows = alerts.map((a) =>
    `<tr><td style="padding:4px 8px;color:#666;white-space:nowrap">${new Date(a.createdAt).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" })}</td><td style="padding:4px 8px"><b>${escapeHtml(a.title)}</b><br>${escapeHtml(a.body)}</td></tr>`
  ).join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:640px">
  <h2>Resumen de caja — ${escapeHtml(title)}</h2>
  <p style="white-space:pre-line">${escapeHtml(summary)}</p>
  <h3>Números</h3>
  <ul><li>Ventas: ${numbers.ventasAprobadas} · ${money(numbers.totalVendido)}</li>${methods}<li>Anuladas: ${numbers.anuladas} · ${money(numbers.totalAnulado)}</li></ul>
  <h3>Todas las alertas de la noche (${alerts.length})</h3>
  <table style="border-collapse:collapse;font-size:14px">${alertRows || '<tr><td>Sin alertas.</td></tr>'}</table>
</div>`;
}

/** Historial para /admin. */
export async function listCajaAlerts(eventId?: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(cajaAlerts);
  const filtered = eventId ? query.where(eq(cajaAlerts.eventId, eventId)) : query;
  return filtered.orderBy(desc(cajaAlerts.createdAt)).limit(limit);
}
