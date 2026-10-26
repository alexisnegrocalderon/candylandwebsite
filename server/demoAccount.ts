import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import { getDb } from './db';
import { generateTicketQR } from './qr';
import { normalizeMemberEmail } from './memberAuth';
import { DEMO_GUEST_PHOTOS } from './demoPhotos';
import {
  customers, discountCodes, events, exclusiveAmbassadors, memberCoupons, memberPasskeys, orderItems, orders,
  partyBlocks, partyConnections, partyCostumeVotes, partyGifts, partyMessages, partyPhotos, partyProfiles,
  partyReports, partySwipes, playcoinsLedger, prepaidLedger, tickets, ticketTypes,
} from '../drizzle/schema';
import {
  DEMO_CODE_PREFIX, DEMO_EVENT_SLUG, DEMO_EVENT_TITLE, DEMO_GUESTS, DEMO_GUESTS_EMAIL, DEMO_MATCH_MESSAGES,
  DEMO_PAST_EVENTS, DEMO_PAST_SLUG_PREFIX, DEMO_TICKET_TYPES, demoAttendeeData, demoEventWindow, demoTicketCode,
  type DemoPhase,
} from '../shared/demoAccount';
import { orderedPair } from '../shared/party';

/* Cuenta de prueba de la App (reglas y datos en shared/demoAccount.ts). Todo cuelga de eventos
 * ocultos con slug fijo; «Borrar todo» encuentra y borra exactamente eso, más el cliente, los
 * movimientos, cupones, embajador y Face ID del correo de prueba. */

const DAY = 24 * 60 * 60 * 1000;
const rand = (n: number) => Array.from({ length: n }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
const insertId = (res: any) => Number((res as any)[0]?.insertId ?? (res as any).insertId);

async function demoEvents(db: any) {
  return db.select().from(events).where(or(eq(events.slug, DEMO_EVENT_SLUG), like(events.slug, `${DEMO_PAST_SLUG_PREFIX}%`)));
}

/** El correo de la cuenta de prueba (el comprador de la orden del evento principal), si existe. */
async function demoEmail(db: any): Promise<string | null> {
  const [ev] = await db.select().from(events).where(eq(events.slug, DEMO_EVENT_SLUG)).limit(1);
  if (!ev) return null;
  const [order] = await db.select({ email: orders.buyerEmail }).from(orders)
    .where(and(eq(orders.eventId, ev.id), sql`${orders.buyerEmail} <> ${DEMO_GUESTS_EMAIL}`)).limit(1);
  return order?.email ? normalizeMemberEmail(order.email) : null;
}

/** Borra la cuenta de prueba completa. Seguro de llamar aunque no exista. */
export async function deleteDemoAccount() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const email = await demoEmail(db);
  const evs = await demoEvents(db);
  const eventIds: number[] = evs.map((e: any) => e.id);

  if (eventIds.length > 0) {
    const profiles = await db.select({ id: partyProfiles.id }).from(partyProfiles).where(inArray(partyProfiles.eventId, eventIds));
    const profileIds: number[] = profiles.map((p: any) => p.id);
    const conns = await db.select({ id: partyConnections.id }).from(partyConnections).where(inArray(partyConnections.eventId, eventIds));
    if (conns.length > 0) await db.delete(partyMessages).where(inArray(partyMessages.connectionId, conns.map((c: any) => c.id)));
    await db.delete(partyConnections).where(inArray(partyConnections.eventId, eventIds));
    await db.delete(partySwipes).where(inArray(partySwipes.eventId, eventIds));
    await db.delete(partyCostumeVotes).where(inArray(partyCostumeVotes.eventId, eventIds));
    await db.delete(partyBlocks).where(inArray(partyBlocks.eventId, eventIds));
    await db.delete(partyReports).where(inArray(partyReports.eventId, eventIds));
    await db.delete(partyGifts).where(inArray(partyGifts.eventId, eventIds));
    await db.delete(partyPhotos).where(inArray(partyPhotos.eventId, eventIds));
    if (profileIds.length > 0) await db.delete(partyProfiles).where(inArray(partyProfiles.id, profileIds));
    await db.delete(tickets).where(inArray(tickets.eventId, eventIds));
    const ords = await db.select({ id: orders.id }).from(orders).where(inArray(orders.eventId, eventIds));
    if (ords.length > 0) await db.delete(orderItems).where(inArray(orderItems.orderId, ords.map((o: any) => o.id)));
    await db.delete(orders).where(inArray(orders.eventId, eventIds));
    await db.delete(ticketTypes).where(inArray(ticketTypes.eventId, eventIds));
    const codes = await db.select({ id: discountCodes.id }).from(discountCodes).where(inArray(discountCodes.eventId, eventIds));
    if (codes.length > 0) {
      await db.delete(memberCoupons).where(inArray(memberCoupons.discountCodeId, codes.map((c: any) => c.id)));
      await db.delete(discountCodes).where(inArray(discountCodes.id, codes.map((c: any) => c.id)));
    }
    await db.delete(exclusiveAmbassadors).where(and(inArray(exclusiveAmbassadors.eventId, eventIds), like(exclusiveAmbassadors.code, `${DEMO_CODE_PREFIX}%`)));
    await db.delete(events).where(inArray(events.id, eventIds));
  }

  if (email) {
    const [customer] = await db.select().from(customers).where(sql`LOWER(${customers.email}) = ${email}`).limit(1);
    if (customer) {
      await db.delete(playcoinsLedger).where(eq(playcoinsLedger.customerId, customer.id));
      await db.delete(prepaidLedger).where(eq(prepaidLedger.customerId, customer.id));
      await db.delete(customers).where(eq(customers.id, customer.id));
    }
    await db.delete(memberCoupons).where(sql`LOWER(${memberCoupons.email}) = ${email}`);
    await db.delete(memberPasskeys).where(eq(memberPasskeys.email, email));
  }
  return { deleted: eventIds.length > 0 };
}

/** Crea la cuenta de prueba (borra la anterior primero). El correo NO puede ser de un cliente real:
 * al borrar se borra el cliente completo, y eso no puede tocar a nadie de verdad. */
export async function createDemoAccount(input: { email: string; name: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const email = normalizeMemberEmail(input.email);
  const name = input.name.trim() || 'Cuenta Demo';
  await deleteDemoAccount();

  const [existing] = await db.select({ id: customers.id }).from(customers).where(sql`LOWER(${customers.email}) = ${email}`).limit(1);
  if (existing) throw new Error('Ese correo ya es de un cliente. Usa uno que nunca haya comprado (por ejemplo, uno secundario tuyo).');
  const [realOrder] = await db.select({ id: orders.id }).from(orders).where(sql`LOWER(${orders.buyerEmail}) = ${email}`).limit(1);
  if (realOrder) throw new Error('Ese correo tiene compras reales. Usa uno que nunca haya comprado.');

  const now = new Date();

  // 1. El evento de la fiesta (oculto), con un tipo de entrada por cada cosa que muestra la App.
  const w = demoEventWindow('antes', now);
  const eventId = insertId(await db.insert(events).values({
    title: DEMO_EVENT_TITLE, slug: DEMO_EVENT_SLUG, status: 'draft', venue: 'Mansión PlayRoom',
    eventDate: w.eventDate, doorsOpen: w.doorsOpen, eventEnd: w.eventEnd,
  }));
  const orderNumber = `MP-DEMO-${rand(6)}`;
  const orderId = insertId(await db.insert(orders).values({
    orderNumber, buyerName: name, buyerEmail: email, eventId, subtotal: '0', total: '0',
    paymentStatus: 'approved', paymentId: 'DEMO', paymentMethod: 'Cuenta de prueba', attendeeData: demoAttendeeData(),
  }));
  let n = 1;
  for (const tt of DEMO_TICKET_TYPES) {
    const ticketTypeId = insertId(await db.insert(ticketTypes).values({ eventId, name: tt.name, price: '0', totalStock: 10, category: tt.category }));
    const orderItemId = insertId(await db.insert(orderItems).values({ orderId, ticketTypeId, quantity: 1, unitPrice: '0', totalPrice: '0' }));
    const ticketCode = demoTicketCode(n++);
    const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, DEMO_EVENT_TITLE);
    await db.insert(tickets).values({ ticketCode, orderId, orderItemId, eventId, ticketTypeId, holderName: name, qrData, qrImageUrl, status: 'valid' });
  }

  // 2. Tres fiestas pasadas a las que «fue»: le dan sellos a la tarjeta (la regla cuenta accesos usados).
  for (let i = 1; i <= DEMO_PAST_EVENTS; i++) {
    const date = new Date(now.getTime() - (DEMO_PAST_EVENTS + 1 - i) * 30 * DAY);
    const pastId = insertId(await db.insert(events).values({ title: `Fiesta pasada ${i} · DEMO`, slug: `${DEMO_PAST_SLUG_PREFIX}${i}`, status: 'draft', eventDate: date, doorsOpen: date, eventEnd: new Date(date.getTime() + 6 * 3600_000) }));
    const typeId = insertId(await db.insert(ticketTypes).values({ eventId: pastId, name: 'Acceso', price: '0', totalStock: 1, category: 'acceso' }));
    const pastOrder = insertId(await db.insert(orders).values({ orderNumber: `MP-DEMO-P${i}${rand(4)}`, buyerName: name, buyerEmail: email, eventId: pastId, subtotal: '0', total: '0', paymentStatus: 'approved', paymentId: 'DEMO', paymentMethod: 'Cuenta de prueba' }));
    const pastItem = insertId(await db.insert(orderItems).values({ orderId: pastOrder, ticketTypeId: typeId, quantity: 1, unitPrice: '0', totalPrice: '0' }));
    await db.insert(tickets).values({ ticketCode: demoTicketCode(50 + i), orderId: pastOrder, orderItemId: pastItem, eventId: pastId, ticketTypeId: typeId, holderName: name, status: 'used', usedAt: date });
  }

  // 3. El cliente: nivel VIP, saldo, Playcoins y sus movimientos.
  const customerId = insertId(await db.insert(customers).values({
    email, fullName: name, totalOrders: 1 + DEMO_PAST_EVENTS, totalSpent: '0', playcoins: 1250, prepaidBalance: 15000,
    memberSince: new Date(now.getTime() - 120 * DAY), levelOverride: 'vip',
  }));
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY);
  await db.insert(prepaidLedger).values([
    { customerId, delta: 20000, reason: 'topup_web', balanceAfter: 20000, createdAt: at(20) },
    { customerId, delta: -5000, reason: 'spend_caja', balanceAfter: 15000, createdAt: at(19) },
  ]);
  await db.insert(playcoinsLedger).values([
    { customerId, delta: 1000, reason: 'earn_web', balanceAfter: 1000, createdAt: at(30) },
    { customerId, delta: 450, reason: 'earn_caja', balanceAfter: 1450, createdAt: at(19) },
    { customerId, delta: -200, reason: 'redeem_caja', balanceAfter: 1250, createdAt: at(18) },
  ]);

  // Todo lo anterior queda ligado al cliente, igual que en producción, y un consumo de caja pagado con saldo
  // (su cobro es el `spend_caja` de arriba) para que «Mis movimientos» muestre la compra con su detalle.
  await db.update(orders).set({ customerId }).where(sql`LOWER(${orders.buyerEmail}) = ${email}`);
  const cajaTypeId = insertId(await db.insert(ticketTypes).values({ eventId, name: 'Piscola', price: '5000', totalStock: 100, category: 'consumo' }));
  const cajaOpId = `demo-caja-${rand(8)}`;
  const cajaOrder = insertId(await db.insert(orders).values({
    orderNumber: `CAJA-DEMO${rand(4)}`, buyerName: name, buyerEmail: email, customerId, eventId, subtotal: '5000', total: '5000',
    paymentStatus: 'approved', paymentId: `CAJA-${cajaOpId}`, paymentMethod: 'saldo', channel: 'caja', emailSent: 1, createdAt: at(19),
  }));
  await db.insert(orderItems).values({ orderId: cajaOrder, ticketTypeId: cajaTypeId, quantity: 1, unitPrice: '5000', totalPrice: '5000' });
  await db.update(prepaidLedger).set({ opId: cajaOpId }).where(sql`${prepaidLedger.customerId} = ${customerId} AND ${prepaidLedger.reason} = 'spend_caja'`);

  // 4. Cupones: uno vigente, uno usado y uno vencido. Solo valen en el evento de prueba.
  const coupons = [
    { kind: 'bienvenida', title: '10% de bienvenida', percent: 10, validUntil: new Date(now.getTime() + 30 * DAY), usedCount: 0 },
    { kind: 'cumpleanos', title: '15% por tu cumpleaños', percent: 15, validUntil: new Date(now.getTime() + 10 * DAY), usedCount: 1 },
    { kind: 'nivel', title: '10% por ser VIP', percent: 10, validUntil: new Date(now.getTime() - 5 * DAY), usedCount: 0 },
  ];
  for (const c of coupons) {
    const discountCodeId = insertId(await db.insert(discountCodes).values({
      code: `${DEMO_CODE_PREFIX}${rand(6)}`, description: 'Cuenta de prueba', discountType: 'percentage', discountValue: String(c.percent),
      maxUses: 1, usedCount: c.usedCount, eventId, validUntil: c.validUntil, isActive: 1,
    }));
    await db.insert(memberCoupons).values({ email, discountCodeId, kind: c.kind, title: c.title, grantKey: `demo:${c.kind}:${orderNumber}` });
  }

  // 5. Embajador: para ver el panel. Su código empieza con DEMO- y nunca da descuento ni comisión.
  await db.insert(exclusiveAmbassadors).values({ eventId, name: `${name} (prueba)`, code: `${DEMO_CODE_PREFIX}${rand(5)}`, email, active: 1 });

  // 6. Invitados falsos de Playmatch, con foto y disfraz, ya adentro de la fiesta.
  await createDemoGuests(db, eventId, w.eventEnd);
  return { eventId, email };
}

async function createDemoGuests(db: any, eventId: number, onlineUntil: Date) {
  const typeId = insertId(await db.insert(ticketTypes).values({ eventId, name: 'Acceso invitados', price: '0', totalStock: DEMO_GUESTS.length, category: 'acceso' }));
  const gOrder = insertId(await db.insert(orders).values({ orderNumber: `MP-DEMO-G${rand(5)}`, buyerName: 'Invitados de prueba', buyerEmail: DEMO_GUESTS_EMAIL, eventId, subtotal: '0', total: '0', paymentStatus: 'approved', paymentId: 'DEMO', paymentMethod: 'Cuenta de prueba' }));
  const gItem = insertId(await db.insert(orderItems).values({ orderId: gOrder, ticketTypeId: typeId, quantity: DEMO_GUESTS.length, unitPrice: '0', totalPrice: '0' }));
  for (let i = 0; i < DEMO_GUESTS.length; i++) {
    const g = DEMO_GUESTS[i];
    const ticketId = insertId(await db.insert(tickets).values({ ticketCode: demoTicketCode(101 + i), orderId: gOrder, orderItemId: gItem, eventId, ticketTypeId: typeId, holderName: g.alias, status: 'used', usedAt: new Date() }));
    // `lastSeenAt` en el futuro (fin de la fiesta): así aparecen «activos» toda la prueba sin un proceso que los mantenga.
    const profileId = insertId(await db.insert(partyProfiles).values({
      eventId, ticketId, alias: g.alias, gender: g.gender, avatarId: (i % 4) + 1, zone: g.zone, active: 1, swipeEnabled: 1,
      lastSeenAt: onlineUntil, rulesAcceptedAt: new Date(), costume: g.costume,
    }));
    await db.insert(partyPhotos).values({ profileId, eventId, position: 0, data: Buffer.from(DEMO_GUEST_PHOTOS[i % DEMO_GUEST_PHOTOS.length], 'base64') });
  }
}

/** Pasa la fiesta de prueba a «antes» o «durante». Durante: la entrada queda escaneada, Playmatch
 * abre y, si la cuenta ya se inscribió, los invitados le mandan un Caramelo, le dan ♥ y uno ya es
 * match con mensajes sin leer. */
export async function setDemoPhase(phase: DemoPhase) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [ev] = await db.select().from(events).where(eq(events.slug, DEMO_EVENT_SLUG)).limit(1);
  if (!ev) throw new Error('Primero crea la cuenta de prueba');
  const w = demoEventWindow(phase);
  await db.update(events).set({ eventDate: w.eventDate, doorsOpen: w.doorsOpen, eventEnd: w.eventEnd }).where(eq(events.id, ev.id));

  const email = await demoEmail(db);
  const [mainOrder] = email ? await db.select().from(orders).where(and(eq(orders.eventId, ev.id), sql`LOWER(${orders.buyerEmail}) = ${email}`)).limit(1) : [];
  const accessTypes = await db.select({ id: ticketTypes.id }).from(ticketTypes).where(and(eq(ticketTypes.eventId, ev.id), eq(ticketTypes.name, DEMO_TICKET_TYPES[0].name)));
  if (mainOrder && accessTypes[0]) {
    await db.update(tickets).set(phase === 'durante' ? { status: 'used', usedAt: new Date() } : { status: 'valid', usedAt: null })
      .where(and(eq(tickets.orderId, mainOrder.id), eq(tickets.ticketTypeId, accessTypes[0].id)));
  }

  // Los invitados siguen «activos» hasta el nuevo fin de la fiesta.
  const guestOrder = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.eventId, ev.id), eq(orders.buyerEmail, DEMO_GUESTS_EMAIL)));
  const guestTickets = guestOrder[0] ? await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orderId, guestOrder[0].id)) : [];
  const guests = guestTickets.length > 0 ? await db.select().from(partyProfiles).where(inArray(partyProfiles.ticketId, guestTickets.map((t: any) => t.id))) : [];
  if (guests.length > 0) await db.update(partyProfiles).set({ lastSeenAt: w.eventEnd }).where(inArray(partyProfiles.id, guests.map((g: any) => g.id)));

  // El perfil de la cuenta (si ya se inscribió en Playmatch desde la App).
  const mine = mainOrder ? await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orderId, mainOrder.id)) : [];
  const [me] = mine.length > 0 ? await db.select().from(partyProfiles).where(inArray(partyProfiles.ticketId, mine.map((t: any) => t.id))).limit(1) : [];
  let interactions = false;
  if (me) {
    // Empezar de cero las interacciones de los invitados con la cuenta (se puede repetir la prueba).
    const guestIds: number[] = guests.map((g: any) => g.id);
    if (guestIds.length > 0) {
      const conns = await db.select().from(partyConnections).where(and(eq(partyConnections.eventId, ev.id), or(inArray(partyConnections.profileLowId, guestIds), inArray(partyConnections.profileHighId, guestIds))));
      if (conns.length > 0) {
        await db.delete(partyMessages).where(inArray(partyMessages.connectionId, conns.map((c: any) => c.id)));
        await db.delete(partyConnections).where(inArray(partyConnections.id, conns.map((c: any) => c.id)));
      }
      await db.delete(partySwipes).where(and(eq(partySwipes.eventId, ev.id), or(inArray(partySwipes.fromProfileId, guestIds), eq(partySwipes.fromProfileId, me.id))));
    }
    await db.update(partyProfiles).set({ active: phase === 'durante' ? 1 : 0, rewindsUsed: 0 }).where(eq(partyProfiles.id, me.id));
    if (phase === 'durante') {
      for (const g of guests as any[]) {
        const role = DEMO_GUESTS.find((d) => d.alias === g.alias)?.role ?? 'nada';
        if (role === 'nada') continue;
        if (role === 'like') {
          await db.insert(partySwipes).values({ eventId: ev.id, fromProfileId: g.id, toProfileId: me.id, liked: 1 });
          continue;
        }
        const { low, high } = orderedPair(g.id, me.id);
        if (role === 'caramelo') {
          await db.insert(partyConnections).values({ eventId: ev.id, profileLowId: low, profileHighId: high, initiatedById: g.id, status: 'pending' });
        } else {
          const connectionId = insertId(await db.insert(partyConnections).values({ eventId: ev.id, profileLowId: low, profileHighId: high, initiatedById: g.id, status: 'accepted', respondedAt: new Date(), viaSwipe: 1 }));
          for (const body of DEMO_MATCH_MESSAGES) await db.insert(partyMessages).values({ connectionId, fromProfileId: g.id, body });
        }
      }
      interactions = true;
    }
  }
  return { phase, interactions };
}

/** Lo que el admin necesita ver de la cuenta de prueba. */
export async function getDemoStatus() {
  const db = await getDb();
  if (!db) return { exists: false as const };
  const [ev] = await db.select().from(events).where(eq(events.slug, DEMO_EVENT_SLUG)).limit(1);
  if (!ev) return { exists: false as const };
  const email = await demoEmail(db);
  const phase: DemoPhase = new Date(ev.doorsOpen ?? ev.eventDate).getTime() <= Date.now() ? 'durante' : 'antes';
  let enrolled = false;
  if (email) {
    const [mainOrder] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.eventId, ev.id), sql`LOWER(${orders.buyerEmail}) = ${email}`)).limit(1);
    const mine = mainOrder ? await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orderId, mainOrder.id)) : [];
    if (mine.length > 0) enrolled = (await db.select({ id: partyProfiles.id }).from(partyProfiles).where(inArray(partyProfiles.ticketId, mine.map((t: any) => t.id))).limit(1)).length > 0;
  }
  const [amb] = email ? await db.select({ code: exclusiveAmbassadors.code }).from(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.eventId, ev.id)).limit(1) : [];
  return { exists: true as const, email, phase, eventDate: ev.eventDate, playmatchEnrolled: enrolled, ambassadorCode: amb?.code ?? null };
}
