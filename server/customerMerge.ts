/* Unir dos fichas de cliente de la misma persona (compró con dos correos). La ficha que se conserva suma todo
 * lo de la otra y la otra se borra; su correo queda como alias para que entrar con él lleve a la ficha unida. */
import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from './db';
import {
  ambassadorClients, appDevices, customerPushSubscriptions, customers, memberCoupons, memberPasskeys, orders, playcoinsLedger, prepaidLedger,
} from '../drizzle/schema';
import { mergeCustomerFields, type MergeableCustomer } from '../shared/customerMerge';

type Row = typeof customers.$inferSelect;

async function load(db: any, keepId: number, fromId: number): Promise<{ keep: Row; from: Row }> {
  if (keepId === fromId) throw new Error('Elige dos fichas distintas.');
  const rows: Row[] = await db.select().from(customers).where(inArray(customers.id, [keepId, fromId]));
  const keep = rows.find((r) => r.id === keepId);
  const from = rows.find((r) => r.id === fromId);
  if (!keep || !from) throw new Error('No encontré una de las dos fichas.');
  return { keep, from };
}

/** Qué se sumaría, para mostrarlo antes de confirmar. */
export async function previewCustomerMerge(keepId: number, fromId: number) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const { keep, from } = await load(db, keepId, fromId);
  const fromEmail = from.email.toLowerCase();
  const count = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const [ordersN, couponsN, devicesN, passkeysN] = await Promise.all([
    count(db.select({ n: sql<number>`count(*)` }).from(orders).where(sql`(lower(${orders.buyerEmail}) = ${fromEmail} OR ${orders.customerId} = ${fromId})`)),
    count(db.select({ n: sql<number>`count(*)` }).from(memberCoupons).where(sql`lower(${memberCoupons.email}) = ${fromEmail}`)),
    count(db.select({ n: sql<number>`count(*)` }).from(appDevices).where(sql`lower(${appDevices.emailNorm}) = ${fromEmail}`)),
    count(db.select({ n: sql<number>`count(*)` }).from(memberPasskeys).where(sql`lower(${memberPasskeys.email}) = ${fromEmail}`)),
  ]);
  return {
    keep: { id: keep.id, email: keep.email, name: keep.fullName, orders: keep.totalOrders, playcoins: keep.playcoins, prepaid: keep.prepaidBalance },
    from: { id: from.id, email: from.email, name: from.fullName, orders: from.totalOrders, playcoins: from.playcoins, prepaid: from.prepaidBalance },
    moves: { orders: ordersN, coupons: couponsN, devices: devicesN, passkeys: passkeysN },
    after: { orders: keep.totalOrders + from.totalOrders, playcoins: keep.playcoins + from.playcoins, prepaid: keep.prepaidBalance + from.prepaidBalance },
    pinConflict: !!keep.cardPinHash && !!from.cardPinHash,
  };
}

/** Une `fromId` dentro de `keepId` y borra la ficha `fromId`. Todo o nada. */
export async function mergeCustomers(keepId: number, fromId: number) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const { keep, from } = await load(db, keepId, fromId);
  const keepEmail = keep.email.toLowerCase();
  const fromEmail = from.email.toLowerCase();
  const patch = mergeCustomerFields(keep as unknown as MergeableCustomer, from as unknown as MergeableCustomer);

  const moved = await db.transaction(async (tx) => {
    const [o] = await tx.update(orders).set({ buyerEmail: keepEmail, customerId: keepId })
      .where(sql`(lower(${orders.buyerEmail}) = ${fromEmail} OR ${orders.customerId} = ${fromId})`) as any;
    await tx.update(prepaidLedger).set({ customerId: keepId }).where(eq(prepaidLedger.customerId, fromId));
    await tx.update(playcoinsLedger).set({ customerId: keepId }).where(eq(playcoinsLedger.customerId, fromId));
    await tx.update(memberCoupons).set({ email: keepEmail }).where(sql`lower(${memberCoupons.email}) = ${fromEmail}`);
    await tx.update(appDevices).set({ email: keepEmail, emailNorm: keepEmail }).where(sql`lower(${appDevices.emailNorm}) = ${fromEmail}`);
    await tx.update(customerPushSubscriptions).set({ email: keepEmail, emailNorm: keepEmail }).where(sql`lower(${customerPushSubscriptions.emailNorm}) = ${fromEmail}`);
    await tx.update(memberPasskeys).set({ email: keepEmail }).where(sql`lower(${memberPasskeys.email}) = ${fromEmail}`);
    // Cliente de embajador: el correo es único, si la principal ya lo tiene, la otra se descarta.
    const [hasAmb] = await tx.select({ id: ambassadorClients.id }).from(ambassadorClients).where(sql`lower(${ambassadorClients.customerEmail}) = ${keepEmail}`).limit(1);
    if (hasAmb) await tx.delete(ambassadorClients).where(sql`lower(${ambassadorClients.customerEmail}) = ${fromEmail}`);
    else await tx.update(ambassadorClients).set({ customerEmail: keepEmail }).where(sql`lower(${ambassadorClients.customerEmail}) = ${fromEmail}`);
    // El correo es único: se libera borrando la otra ficha antes de dejarle sus datos a la principal.
    await tx.delete(customers).where(eq(customers.id, fromId));
    await tx.update(customers).set({ ...patch, gender: patch.gender as Row['gender'] }).where(eq(customers.id, keepId));
    return Number(o?.affectedRows ?? 0);
  });
  return { ok: true as const, keepEmail, fromEmail, orders: moved, playcoins: patch.playcoins, prepaid: patch.prepaidBalance };
}
