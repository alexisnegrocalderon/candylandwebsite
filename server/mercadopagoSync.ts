/**
 * Lectura (solo lectura) de la cuenta de Mercado Pago con el mismo token que
 * ya usa el sitio para cobrar. Nunca mueve plata.
 *
 *  - Cobros: /v1/payments/search (monto, comisión y neto recibido).
 *  - Movimientos de la cuenta (retiros al banco, devoluciones, saldo): el
 *    "reporte de dinero liberado" (/v1/account/release_report). Mercado Pago
 *    lo genera de forma asíncrona: si no hay uno reciente se pide y queda
 *    para la próxima sincronización.
 */
import { and, eq, inArray } from "drizzle-orm";
import { accountBalances, accountMovements, orders } from "../drizzle/schema";
import * as db from "./db";
import { parseClp, parseDelimited, suggestClass } from "../shared/cash";

const API = "https://api.mercadopago.com";

function token(): string | null {
  return process.env.MERCADOPAGO_ACCESS_TOKEN || null;
}

async function mp(path: string, init?: RequestInit): Promise<Response> {
  const t = token();
  if (!t) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN en el servidor.");
  return fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
}

type SyncResult = { payments: number; movements: number; balance: number | null; reportStatus: string; errors: string[] };

export async function syncMercadoPago(days = 45): Promise<SyncResult> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const errors: string[] = [];
  let payments = 0, movements = 0, balance: number | null = null;
  let reportStatus = "sin pedir";

  // ── 1. Cobros ──
  try {
    for (let offset = 0; offset < 2000; offset += 100) {
      const res = await mp(`/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=NOW-${days}DAYS&end_date=NOW&limit=100&offset=${offset}`);
      if (!res.ok) { errors.push(`Cobros: Mercado Pago respondió ${res.status}`); break; }
      const body: any = await res.json();
      const results: any[] = body.results ?? [];
      for (const p of results) {
        if (!["approved", "refunded", "charged_back"].includes(p.status)) continue;
        const gross = Number(p.transaction_amount ?? 0);
        const net = Number(p.transaction_details?.net_received_amount ?? gross);
        const refunded = p.status !== "approved";
        const values = {
          source: "mercadopago" as const,
          externalId: `pay:${p.id}`,
          occurredAt: new Date(p.date_approved ?? p.date_created),
          amountClp: Math.round(refunded ? -gross : net),
          description: String(p.description ?? `Cobro ${p.id}`).slice(0, 255),
          kind: refunded ? "devolucion" : "venta",
          classification: (refunded ? "otro" : "venta") as any,
          raw: { id: p.id, status: p.status, gross, net, fee: Math.round(gross - net), externalReference: p.external_reference ?? null, paymentType: p.payment_type_id ?? null, releaseDate: p.money_release_date ?? null },
        };
        await conn.insert(accountMovements).values(values).onDuplicateKeyUpdate({ set: { amountClp: values.amountClp, raw: values.raw, kind: values.kind } });
        payments++;
      }
      if (results.length < 100) break;
    }
  } catch (e) {
    errors.push(`Cobros: ${e instanceof Error ? e.message : "error"}`);
  }

  // ── 2. Reporte de dinero liberado (retiros, devoluciones, saldo) ──
  try {
    const list = await mp(`/v1/account/release_report/list`);
    const files: any[] = list.ok ? await list.json() : [];
    if (!list.ok) errors.push(`Reporte: Mercado Pago respondió ${list.status} (puede faltar activar los reportes en tu cuenta)`);
    const latest = [...files].sort((a, b) => String(b.date_created ?? "").localeCompare(String(a.date_created ?? "")))[0];
    const fresh = latest && Date.now() - new Date(latest.date_created).getTime() < 30 * 3_600_000;
    if (latest?.file_name) {
      const file = await mp(`/v1/account/release_report/${encodeURIComponent(latest.file_name)}`);
      if (file.ok) {
        const rows = parseDelimited(await file.text());
        const header = (rows[0] ?? []).map((h) => h.toUpperCase());
        const col = (name: string) => header.indexOf(name);
        const iDate = col("DATE"), iSrc = col("SOURCE_ID"), iDesc = col("DESCRIPTION"), iCredit = col("NET_CREDIT_AMOUNT"), iDebit = col("NET_DEBIT_AMOUNT"), iBal = col("BALANCE_AMOUNT");
        for (const r of rows.slice(1)) {
          const desc = (r[iDesc] ?? "").toLowerCase();
          if (!desc || desc === "payment") continue; // las ventas ya vienen de /payments
          const credit = parseClp(r[iCredit]) ?? 0, debit = parseClp(r[iDebit]) ?? 0;
          const amount = credit - debit;
          if (!amount) continue;
          const when = r[iDate] ? new Date(r[iDate]) : new Date();
          const bal = iBal >= 0 ? parseClp(r[iBal]) : null;
          if (bal !== null) balance = bal;
          const label = desc === "payout" ? "Retiro a tu cuenta bancaria" : desc === "refund" ? "Devolución" : desc === "chargeback" ? "Contracargo" : r[iDesc];
          const values = {
            source: "mercadopago" as const,
            externalId: `rr:${r[iSrc] ?? ""}:${desc}:${r[iDate] ?? ""}`.slice(0, 120),
            occurredAt: Number.isNaN(when.getTime()) ? new Date() : when,
            amountClp: amount, description: String(label).slice(0, 255), kind: desc.slice(0, 40),
            classification: suggestClass(String(label), amount, "mercadopago") as any,
            balanceAfter: bal, raw: Object.fromEntries(header.map((h, i) => [h, r[i]])),
          };
          await conn.insert(accountMovements).values(values).onDuplicateKeyUpdate({ set: { amountClp: values.amountClp, balanceAfter: values.balanceAfter } });
          movements++;
        }
        reportStatus = `leído (${latest.file_name})`;
      } else errors.push(`Reporte: no se pudo descargar (${file.status})`);
    }
    if (!fresh) {
      const end = new Date(); const begin = new Date(end.getTime() - days * 86_400_000);
      const req = await mp(`/v1/account/release_report`, { method: "POST", body: JSON.stringify({ begin_date: begin.toISOString().replace(/\.\d+Z$/, "Z"), end_date: end.toISOString().replace(/\.\d+Z$/, "Z") }) });
      reportStatus = req.ok ? (latest ? `${reportStatus}; pedido uno nuevo (listo en unos minutos)` : "pedido (listo en unos minutos; vuelve a actualizar)") : `${reportStatus}; no se pudo pedir (${req.status})`;
    }
  } catch (e) {
    errors.push(`Reporte: ${e instanceof Error ? e.message : "error"}`);
  }

  if (balance !== null) await conn.insert(accountBalances).values({ source: "mercadopago", balanceClp: balance, asOf: new Date(), origin: "api" });
  return { payments, movements, balance, reportStatus, errors };
}

/** Cuadra los cobros de Mercado Pago con las órdenes del sistema (últimos N días). */
export async function reconcileMercadoPago(days = 45) {
  const conn = await db.getDb();
  if (!conn) return null;
  const since = new Date(Date.now() - days * 86_400_000);
  const pays = ((await conn.select().from(accountMovements).where(and(eq(accountMovements.source, "mercadopago"), eq(accountMovements.kind, "venta")))) as any[])
    .filter((m) => new Date(m.occurredAt) >= since);
  const ids = pays.map((m) => String(m.raw?.id ?? "")).filter(Boolean);
  const matched = ids.length
    ? ((await conn.select({ paymentId: orders.paymentId }).from(orders).where(inArray(orders.paymentId, ids))) as any[]).map((o) => String(o.paymentId))
    : [];
  const matchedSet = new Set(matched);
  const notInSystem = pays.filter((m) => !matchedSet.has(String(m.raw?.id ?? "")));
  return {
    days,
    count: pays.length,
    gross: pays.reduce((s, m) => s + Number(m.raw?.gross ?? 0), 0),
    net: pays.reduce((s, m) => s + Number(m.amountClp), 0),
    fees: pays.reduce((s, m) => s + Number(m.raw?.fee ?? 0), 0),
    notInSystem: notInSystem.slice(0, 20).map((m) => ({ id: m.raw?.id, date: m.occurredAt, amount: m.raw?.gross ?? m.amountClp, description: m.description })),
    notInSystemCount: notInSystem.length,
  };
}
