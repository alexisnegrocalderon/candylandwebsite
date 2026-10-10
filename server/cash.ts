/** Caja real: saldos de Mercado Pago y banco, retiros del dueño, movimientos por clasificar. */
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { accountBalances, accountMovements, expenses, ownerWithdrawals } from "../drizzle/schema";
import * as db from "./db";
import { cashPosition, parseBankStatement, type MovementClass } from "../shared/cash";
import { monthKeyFor } from "../shared/ambassadorProgram";
import { getCompanyYear } from "./financeCompany";

async function need() {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  return conn;
}

export async function latestBalances() {
  const conn = await need();
  const out: { source: "mercadopago" | "banco"; balance: number; asOf: Date; origin: string }[] = [];
  for (const source of ["mercadopago", "banco"] as const) {
    const [b] = await conn.select().from(accountBalances).where(eq(accountBalances.source, source)).orderBy(desc(accountBalances.asOf)).limit(1);
    if (b) out.push({ source, balance: Number((b as any).balanceClp), asOf: (b as any).asOf, origin: (b as any).origin });
  }
  return out;
}

export async function getCashSummary(monthKey: string) {
  const conn = await need();
  const balances = await latestBalances();
  const [y] = monthKey.split("-").map(Number);
  const company = await getCompanyYear(y);
  const monthRow = company?.months.find((m) => m.monthKey === monthKey);
  const withdrawals = ((await conn.select().from(ownerWithdrawals).orderBy(desc(ownerWithdrawals.withdrawnAt)).limit(500)) as any[]);
  const monthWithdrawals = withdrawals.filter((w) => monthKeyFor(w.withdrawnAt) === monthKey);
  const pending = ((await conn.select().from(accountMovements).where(eq(accountMovements.classification, "por_clasificar")).orderBy(desc(accountMovements.occurredAt)).limit(200)) as any[]);
  return {
    monthKey,
    balances,
    position: cashPosition({ balances: balances.map((b) => ({ source: b.source, balance: b.balance })), monthProfit: monthRow?.result ?? 0, monthWithdrawals: monthWithdrawals.reduce((s, w) => s + Number(w.amountClp), 0) }),
    withdrawals: withdrawals.slice(0, 50).map((w) => ({ id: w.id, date: w.withdrawnAt, amount: Number(w.amountClp), account: w.account, note: w.note })),
    pending: pending.map((m) => ({ id: m.id, source: m.source, date: m.occurredAt, amount: Number(m.amountClp), description: m.description, kind: m.kind })),
  };
}

export async function addWithdrawal(p: { date: string; amount: number; account: "mercadopago" | "banco" | "efectivo"; note?: string | null; movementId?: number | null }) {
  const conn = await need();
  const [res] = await conn.insert(ownerWithdrawals).values({
    withdrawnAt: new Date(p.date), amountClp: Math.abs(Math.round(p.amount)), account: p.account, note: p.note?.trim() || null, movementId: p.movementId ?? null,
  }) as any;
  return { id: Number(res.insertId) };
}

export async function deleteWithdrawal(id: number) {
  const conn = await need();
  await conn.update(accountMovements).set({ classification: "por_clasificar", withdrawalId: null }).where(eq(accountMovements.withdrawalId, id));
  await conn.delete(ownerWithdrawals).where(eq(ownerWithdrawals.id, id));
  return { success: true };
}

export async function setManualBalance(source: "mercadopago" | "banco", balance: number) {
  const conn = await need();
  await conn.insert(accountBalances).values({ source, balanceClp: Math.round(balance), asOf: new Date(), origin: "manual" });
  return { success: true };
}

/** Clasifica un movimiento. Retiro → crea el retiro del dueño. Gasto → crea el gasto. */
export async function classifyMovement(p: {
  id: number; classification: MovementClass; eventId?: number | null; category?: string; documentType?: string; userId?: number;
}) {
  const conn = await need();
  const [m] = (await conn.select().from(accountMovements).where(eq(accountMovements.id, p.id)).limit(1)) as any[];
  if (!m) throw new Error("Movimiento no encontrado");
  const set: any = { classification: p.classification, eventId: p.eventId ?? null };
  const date = new Date(m.occurredAt).toISOString();
  if (p.classification === "retiro_dueno" && !m.withdrawalId) {
    const w = await addWithdrawal({ date, amount: Number(m.amountClp), account: m.source, note: m.description, movementId: m.id });
    set.withdrawalId = w.id;
  }
  if ((p.classification === "gasto_evento" || p.classification === "gasto_empresa") && !m.expenseId) {
    if (p.classification === "gasto_evento" && !p.eventId) throw new Error("Elige a qué evento corresponde el gasto");
    const r = await db.createExpense({
      scope: p.classification === "gasto_evento" ? "evento" : "general", eventId: p.eventId ?? null, expenseDate: date,
      category: p.category ?? "otros", description: String(m.description ?? "Gasto").slice(0, 255), documentType: p.documentType ?? "sin_documento",
      amountTotal: Math.abs(Number(m.amountClp)), paymentMethod: "transferencia", createdByUserId: p.userId,
      notes: `Desde ${m.source === "banco" ? "la cartola del banco" : "Mercado Pago"}`,
    } as any);
    if ((r as any)?.id) set.expenseId = (r as any).id;
  }
  await conn.update(accountMovements).set(set).where(eq(accountMovements.id, p.id));
  return { success: true };
}

/** Importa una cartola: con `preview` solo la lee y muestra; sin él la guarda (sin duplicar). */
export async function importBankStatement(text: string, preview: boolean) {
  const parsed = parseBankStatement(text);
  if (preview || parsed.error) return { ...parsed, imported: 0 };
  const conn = await need();
  let imported = 0;
  for (const mv of parsed.movements) {
    try {
      await conn.insert(accountMovements).values({
        source: "banco", externalId: mv.externalId, occurredAt: new Date(`${mv.date}T12:00:00-03:00`), amountClp: mv.amount,
        description: mv.description, kind: mv.amount > 0 ? "abono" : "cargo", classification: mv.suggested as any, balanceAfter: mv.balance,
      });
      imported++;
    } catch { /* ya importado: el único (fuente, id) lo frena */ }
  }
  const last = [...parsed.movements].reverse().find((m) => m.balance !== null);
  if (last) await conn.insert(accountBalances).values({ source: "banco", balanceClp: last.balance as number, asOf: new Date(`${last.date}T23:59:00-03:00`), origin: "cartola" });
  return { ...parsed, imported };
}
