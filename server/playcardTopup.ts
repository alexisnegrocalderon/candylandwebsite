import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { customers, orders, rateLimits, tickets } from '../drizzle/schema';
import { getDb, getEventById, getFeaturedEvent, getTicketTypesByEventId, createOrder } from './db';
import { hashPin } from './caja/auth';
import { isTopupProduct } from '../shared/prepaid';
import { normalizeEmail } from './topupAccess';

/* Recargar la PlayCard DESPUÉS de comprar la entrada (/recargar y el botón de
 * la tarjeta digital). La recarga es una orden normal de solo carga de saldo:
 * pasa por el mismo cobro, el mismo webhook y el mismo `creditPrepaid` que la
 * carga del checkout -- acá solo se resuelve QUIÉN recarga y en qué fiesta. */

export type TopupIdentity = {
  email: string;
  buyerName: string;
  buyerPhone: string | null;
  eventId: number;
};

export const TOPUP_UTM_SOURCE = 'recarga-playcard';

/** Quién es, a partir del ticket (botón en la tarjeta digital: el link ya es
 * la prueba de posesión). Solo cuenta si la orden de ese ticket está pagada. */
export async function identityFromTicketCode(ticketCode: string): Promise<TopupIdentity | null> {
  const db = await getDb();
  if (!db) return null;
  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketCode, ticketCode)).limit(1);
  if (!ticket) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, ticket.orderId)).limit(1);
  if (!order || order.paymentStatus !== 'approved') return null;
  return {
    email: normalizeEmail(order.buyerEmail),
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone ?? null,
    eventId: order.eventId,
  };
}

/** Quién es, a partir del email ya validado con el código. Exige haber pagado
 * alguna compra web antes: el código solo abre la puerta a clientes reales. */
export async function identityFromEmail(email: string): Promise<TopupIdentity | null> {
  const db = await getDb();
  if (!db) return null;
  const clean = normalizeEmail(email);
  const [order] = await db.select().from(orders)
    .where(and(
      sql`LOWER(${orders.buyerEmail}) = ${clean}`,
      eq(orders.paymentStatus, 'approved'),
      eq(orders.channel, 'web'),
    ))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (!order) return null;
  return { email: clean, buyerName: order.buyerName, buyerPhone: order.buyerPhone ?? null, eventId: order.eventId };
}

/** La fiesta en la que se recarga: la de su compra si sigue vigente; si ya
 * pasó, la próxima publicada. */
async function pickTopupEvent(orderEventId: number) {
  const own = await getEventById(orderEventId);
  if (own && (own.status === 'published' || own.status === 'soldout')) return own;
  return (await getFeaturedEvent()) ?? null;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(2, user.length - 2))}@${domain}`;
}

export async function getTopupOptions(identity: TopupIdentity) {
  const db = await getDb();
  const event = await pickTopupEvent(identity.eventId);

  const tiers = event
    ? (await getTicketTypesByEventId(event.id))
        .filter((tt) => isTopupProduct(tt) && tt.status === 'active' && Number(tt.price) > 0 && tt.totalStock - tt.soldCount > 0)
        .map((tt) => ({ id: tt.id, name: tt.name, price: Number(tt.price), topupAmount: tt.topupAmount as number }))
        .sort((a, b) => a.price - b.price)
    : [];

  let balance = 0;
  let cardPinSet = false;
  if (db) {
    const [customer] = await db.select().from(customers).where(eq(customers.email, identity.email)).limit(1);
    balance = customer?.prepaidBalance ?? 0;
    cardPinSet = !!customer?.cardPinHash;
  }

  return {
    event: event ? { slug: event.slug, title: event.title } : null,
    tiers,
    balance,
    cardPinSet,
    maskedEmail: maskEmail(identity.email),
  };
}

/** Crea la orden de recarga. El PIN (si la tarjeta todavía no tiene) queda
 * guardado ya hasheado en la orden y se aplica cuando el pago se aprueba. */
export async function createTopupOrder(identity: TopupIdentity, input: { ticketTypeId: number; pin?: string }) {
  const options = await getTopupOptions(identity);
  if (!options.event) throw new Error('Por ahora no hay una fiesta con recarga disponible.');
  const tier = options.tiers.find((t) => t.id === input.ticketTypeId);
  if (!tier) throw new Error('Ese monto ya no está disponible -- elige otro.');

  const wantsPin = !options.cardPinSet && !!input.pin;
  if (wantsPin && !/^\d{4}$/.test(input.pin!)) throw new Error('El PIN debe tener 4 dígitos');
  if (!options.cardPinSet && !input.pin) throw new Error('Crea un PIN de 4 dígitos para poder gastar tu saldo.');

  const result = await createOrder({
    eventSlug: options.event.slug,
    buyerName: identity.buyerName,
    buyerEmail: identity.email,
    buyerPhone: identity.buyerPhone ?? undefined,
    items: [{ ticketTypeId: tier.id, quantity: 1 }],
    utmSource: TOPUP_UTM_SOURCE,
  });

  if (wantsPin) {
    const db = await getDb();
    if (db) await db.update(orders).set({ pendingCardPinHash: hashPin(input.pin!) }).where(eq(orders.id, result.orderId));
  }
  return { orderNumber: result.orderNumber, total: result.total };
}

/** "Olvidé mi PIN": define un PIN nuevo SIN pedir el actual. El llamador ya
 * comprobó que la persona controla el correo de la tarjeta (código de 6
 * dígitos), que es la prueba de identidad en vez del PIN viejo. También borra
 * el bloqueo por intentos fallidos de la barra: quien olvidó su PIN
 * normalmente ya se equivocó varias veces y quedó bloqueado. */
export async function resetCardPin(identity: TopupIdentity, pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error('El PIN debe tener 4 dígitos');
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const [customer] = await db.select().from(customers).where(eq(customers.email, identity.email)).limit(1);
  if (!customer) throw new Error('No encontramos tu tarjeta.');

  await db.update(customers)
    .set({ cardPinHash: hashPin(pin), cardPinSetAt: new Date() })
    .where(eq(customers.id, customer.id));
  await db.delete(rateLimits).where(eq(rateLimits.key, `cardpin:${customer.id}`));
  return { success: true as const };
}

/** Al aprobarse el pago: si la orden traía un PIN pendiente y la tarjeta aún
 * no tiene uno, lo activa. Nunca pisa un PIN existente. */
export async function applyPendingCardPin(orderId: number) {
  const db = await getDb();
  if (!db) return;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order?.pendingCardPinHash) return;
  await db.update(customers)
    .set({ cardPinHash: order.pendingCardPinHash, cardPinSetAt: new Date() })
    .where(and(eq(customers.email, normalizeEmail(order.buyerEmail)), isNull(customers.cardPinHash)));
  await db.update(orders).set({ pendingCardPinHash: null }).where(eq(orders.id, order.id));
}
