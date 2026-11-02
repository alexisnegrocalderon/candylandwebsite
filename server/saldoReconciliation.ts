/** Conciliación de ventas de caja que se cobraron SIN descontar el saldo de la tarjeta.
 *
 * Bug de la caja (arreglado en server/caja/sale.ts): al escanear el QR de «Pagar en caja» de la app, la venta
 * se guardaba con el último medio usado (débito, QR de terminal, efectivo) y el saldo del cliente quedaba
 * intacto. Acá se listan las ventas sospechosas y, SOLO por decisión explícita del admin, se descuenta el saldo
 * y se corrige el medio de pago a «saldo». Todo queda en el ledger de saldo (reason `spend_caja`, con el opId de
 * la venta) y es idempotente: aplicar dos veces la misma venta no vuelve a descontar. */
import { and, desc, eq, gt, gte, lte, ne, sql } from 'drizzle-orm';
import { getDb } from './db';
import { customers, memberPayTokens, orders, prepaidLedger } from '../drizzle/schema';

export const CAJA_PLACEHOLDER_EMAIL = 'caja@mansionplayroom.cl';
/** Una venta se considera «con QR de la app» si el cliente generó un QR de pago hasta este tiempo antes de ella. */
const QR_WINDOW_MS = 10 * 60 * 1000;

export type SaldoCandidate = {
  orderId: number; orderNumber: string; createdAt: Date; eventId: number;
  buyerEmail: string; buyerName: string; total: number; paymentMethod: string;
  /** Opid de la venta en caja (`CAJA-<opId>` en orders.paymentId). */
  saleOpId: string;
  balance: number; toppedUp: number;
  /** El cliente tenía un QR de pago de la app generado en los minutos previos a la venta: señal fuerte. */
  hadPayQr: boolean;
};

export function saleOpIdOf(paymentId: string | null | undefined): string | null {
  return paymentId && paymentId.startsWith('CAJA-') ? paymentId.slice(5) : null;
}

/** Ventas de caja pagadas con otro medio, a nombre de un cliente con correo real que había cargado saldo antes
 * de la venta y que todavía no tienen un descuento de saldo. Son CANDIDATAS: una venta en efectivo de alguien que
 * también cargó saldo es legítima, por eso la señal `hadPayQr` y la decisión final es del admin. */
export async function listSaldoCandidates(filter: { eventId?: number } = {}): Promise<SaldoCandidate[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(orders.channel, 'caja'), eq(orders.paymentStatus, 'approved'),
    ne(orders.paymentMethod, 'saldo'), ne(orders.buyerEmail, CAJA_PLACEHOLDER_EMAIL),
    gt(orders.total, '0'),
  ];
  if (filter.eventId) conds.push(eq(orders.eventId, filter.eventId));
  const rows = await db.select().from(orders).where(and(...conds)).orderBy(desc(orders.createdAt)).limit(2000);
  const out: SaldoCandidate[] = [];
  const customerCache = new Map<string, { id: number; balance: number } | null>();
  for (const o of rows) {
    const saleOpId = saleOpIdOf(o.paymentId);
    if (!saleOpId) continue;
    const email = o.buyerEmail.trim().toLowerCase();
    if (!customerCache.has(email)) {
      const [c] = await db.select({ id: customers.id, balance: customers.prepaidBalance }).from(customers).where(eq(customers.email, email)).limit(1);
      customerCache.set(email, c ? { id: c.id, balance: c.balance } : null);
    }
    const c = customerCache.get(email);
    if (!c) continue;
    const [topups] = await db.select({ sum: sql<number>`COALESCE(SUM(${prepaidLedger.delta}), 0)` }).from(prepaidLedger)
      .where(and(eq(prepaidLedger.customerId, c.id), eq(prepaidLedger.reason, 'topup_web'), lte(prepaidLedger.createdAt, o.createdAt)));
    const toppedUp = Number(topups?.sum ?? 0);
    if (toppedUp <= 0) continue; // nunca había cargado saldo: no pudo pagar con saldo
    const [already] = await db.select({ id: prepaidLedger.id }).from(prepaidLedger)
      .where(and(eq(prepaidLedger.customerId, c.id), eq(prepaidLedger.opId, saleOpId), eq(prepaidLedger.reason, 'spend_caja'))).limit(1);
    if (already) continue;
    const [qr] = await db.select({ nonce: memberPayTokens.nonce }).from(memberPayTokens)
      .where(and(eq(memberPayTokens.email, email), gte(memberPayTokens.createdAt, new Date(o.createdAt.getTime() - QR_WINDOW_MS)), lte(memberPayTokens.createdAt, new Date(o.createdAt.getTime() + 60_000)))).limit(1);
    out.push({
      orderId: o.id, orderNumber: o.orderNumber, createdAt: o.createdAt, eventId: o.eventId,
      buyerEmail: email, buyerName: o.buyerName, total: Number(o.total), paymentMethod: String(o.paymentMethod),
      saleOpId, balance: c.balance, toppedUp, hadPayQr: !!qr,
    });
  }
  return out;
}

export type ReconcileResult = {
  orderId: number; ok: boolean; charged: number; shortfall: number; balanceAfter: number | null; message: string;
};

/** Descuenta del saldo de la tarjeta una venta de caja que se cobró sin tocarlo. Descuenta el total de la venta, o
 * lo que quede si el saldo no alcanza (el faltante se informa y queda en la nota del movimiento: nunca deja el
 * saldo negativo). Idempotente por (opId, spend_caja). */
export async function reconcileSaldoSale(orderId: number, reasonNote: string): Promise<ReconcileResult> {
  const fail = (message: string): ReconcileResult => ({ orderId, ok: false, charged: 0, shortfall: 0, balanceAfter: null, message });
  const db = await getDb();
  if (!db) return fail('Base de datos no disponible');
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!o) return fail('La venta no existe');
  if (o.channel !== 'caja' || o.paymentStatus !== 'approved') return fail('Solo se concilian ventas de caja aprobadas');
  if (o.paymentMethod === 'saldo') return fail('Esta venta ya figura pagada con saldo');
  const saleOpId = saleOpIdOf(o.paymentId);
  if (!saleOpId) return fail('La venta no tiene identificador de caja');
  const email = o.buyerEmail.trim().toLowerCase();
  if (email === CAJA_PLACEHOLDER_EMAIL) return fail('La venta no está asociada a ningún cliente');
  const [c] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!c) return fail('No se encontró la tarjeta del cliente');

  const [dup] = await db.select().from(prepaidLedger)
    .where(and(eq(prepaidLedger.customerId, c.id), eq(prepaidLedger.opId, saleOpId), eq(prepaidLedger.reason, 'spend_caja'))).limit(1);
  if (dup) return fail('Esta venta ya tiene su descuento de saldo');

  const total = Number(o.total);
  if (!(total > 0)) return fail('La venta no tiene monto');
  const charge = Math.min(total, Math.max(0, c.prepaidBalance));
  if (charge <= 0) return { orderId, ok: false, charged: 0, shortfall: total, balanceAfter: c.prepaidBalance, message: 'El cliente ya no tiene saldo para descontar' };

  // Descuento condicional: nunca deja el saldo negativo, aunque el cliente gaste en paralelo.
  const [upd] = await db.update(customers).set({ prepaidBalance: sql`prepaidBalance - ${charge}` })
    .where(and(eq(customers.id, c.id), sql`prepaidBalance >= ${charge}`));
  if (Number((upd as unknown as { affectedRows?: number }).affectedRows ?? 0) === 0) return fail('El saldo cambió mientras se aplicaba: reintenta');
  const [after] = await db.select({ balance: customers.prepaidBalance }).from(customers).where(eq(customers.id, c.id)).limit(1);
  const shortfall = total - charge;
  const note = `${reasonNote} · venta ${o.orderNumber} ($${total})${shortfall > 0 ? ` · el saldo solo alcanzó para $${charge}, faltaron $${shortfall}` : ''}`.slice(0, 500);
  try {
    await db.insert(prepaidLedger).values({ customerId: c.id, delta: -charge, reason: 'spend_caja', opId: saleOpId, balanceAfter: after!.balance, note });
  } catch (err) {
    // Otra conciliación ganó la carrera: se devuelve lo recién descontado para no cobrar dos veces.
    await db.update(customers).set({ prepaidBalance: sql`prepaidBalance + ${charge}` }).where(eq(customers.id, c.id));
    return fail('Esta venta ya tiene su descuento de saldo');
  }
  await db.update(orders).set({ paymentMethod: 'saldo' }).where(eq(orders.id, o.id));
  return { orderId, ok: true, charged: charge, shortfall, balanceAfter: after!.balance, message: shortfall > 0 ? `Descontado $${charge} (faltaron $${shortfall})` : `Descontado $${charge}` };
}
