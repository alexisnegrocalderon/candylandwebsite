/* «Llega a tu cuenta» de Ventas Web (shared/mpNet.ts): junta las compras aprobadas con lo que Mercado Pago ya informó de cada
 * cobro (accountMovements, que llena la sincronización con Mercado Pago). Solo lee. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { accountMovements, orders } from "../drizzle/schema";
import { getDb, getSiteSettings } from "./db";
import { computeWebNet, type WebNet } from "../shared/mpNet";

const EMPTY: WebNet = { gross: 0, fee: 0, net: 0, feePercent: 0, realCount: 0, estimatedCount: 0, estimateSource: null, notMercadoPago: 0 };

export async function getWebNet(eventId?: number): Promise<WebNet & { configuredPercent: number }> {
  const db = await getDb();
  const settings = await getSiteSettings().catch(() => null);
  const configuredPercent = Number((settings as { cardFeePercent?: string | number } | null)?.cardFeePercent ?? 3.5);
  if (!db) return { ...EMPTY, configuredPercent };

  // Mismo alcance que «Ingresos Totales»: compras aprobadas que no son de caja (y del evento elegido, si hay).
  const where = [sql`${orders.channel} != 'caja'`, eq(orders.paymentStatus, "approved"), ...(eventId ? [eq(orders.eventId, eventId)] : [])];
  const rows = await db.select({ total: orders.total, channel: orders.channel, paymentMethod: orders.paymentMethod, paymentId: orders.paymentId })
    .from(orders).where(and(...where));

  // La comisión real de cada cobro que Mercado Pago ya informó (pay:<id> en la sincronización).
  const realFees = new Map<string, number>();
  const ids = Array.from(new Set(rows.map((r) => r.paymentId).filter((x): x is string => !!x)));
  try {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const movs = await db.select({ externalId: accountMovements.externalId, raw: accountMovements.raw }).from(accountMovements)
        .where(and(eq(accountMovements.source, "mercadopago"), inArray(accountMovements.externalId, chunk.map((id) => `pay:${id}`))));
      for (const m of movs) {
        const fee = Number((m.raw as { fee?: unknown } | null)?.fee);
        if (Number.isFinite(fee) && fee >= 0) realFees.set(m.externalId.slice(4), fee);
      }
    }
  } catch (err) {
    // Sin la tabla o sin sincronización todo se estima con el % de Ajustes.
    console.error("[WebNet] No se pudieron leer los cobros de Mercado Pago:", err instanceof Error ? err.message : err);
  }

  return { ...computeWebNet(rows.map((r) => ({ ...r, total: Number(r.total) })), realFees, configuredPercent), configuredPercent };
}
