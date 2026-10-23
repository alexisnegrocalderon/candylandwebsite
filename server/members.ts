/** Cuenta de socios («Mi cuenta»): entrar con un código al correo, ver saldo,
 * Playcoins, entradas y cupones, y recibir beneficios (cupones personales y
 * preventa anticipada).
 *
 * «Socio» = cliente que entró a su cuenta alguna vez (customers.memberSince).
 * Solo pueden entrar correos que ya son clientes (o de un embajador activo):
 * el código nunca se manda a un correo desconocido (y la respuesta es la misma exista o no, para que
 * nadie averigüe quién es cliente). */
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb, getSiteSettings } from './db';
import { sendEmail, buildMemberCodeEmail } from './email';
import { pushToEmail } from './customerPush';
import { findAmbassadorByEmail } from './ambassadorProgram';
import { currentMemberCode, normalizeMemberEmail, randomCouponCode } from './memberAuth';
import { customers, discountCodes, events, memberCoupons, orders, playcoinsLedger, prepaidLedger, tickets, ticketTypes } from '../drizzle/schema';
import { computeCustomerLevel, daysUntilBirthday } from '../shared/customerInsights';
import { couponStatus, normalizeMemberConfig, type CouponRule, type MemberConfig } from '../shared/memberConfig';
import { chileParts } from '../shared/pushSchedule';
import { firstName } from '../shared/pushText';
import { sortByKind, ticketKind, ticketKindLabel, type TicketKind } from '../shared/ticketKind';
import { companionsFromCampos, knownCompanions, lastPurchaseFrom, type Companion } from '../shared/repurchase';

type CustomerRow = typeof customers.$inferSelect;

export async function getMemberConfig(): Promise<MemberConfig> {
  const settings = await getSiteSettings();
  return normalizeMemberConfig((settings as any)?.memberConfig);
}

export async function findCustomer(email: string): Promise<CustomerRow | null> {
  const db = await getDb();
  if (!db) return null;
  const [c] = await db.select().from(customers).where(eq(customers.email, normalizeMemberEmail(email))).limit(1);
  return c ?? null;
}

/** ¿Este correo ya entró alguna vez a su cuenta? */
export async function isMember(email: string): Promise<boolean> {
  return !!(await findCustomer(email))?.memberSince;
}

/** Un embajador activo puede entrar a «Mi cuenta» con su correo aunque nunca
 * haya comprado: se le crea su ficha de cliente (etiquetada «embajador») la
 * primera vez que pide el código. */
async function ensureAmbassadorCustomer(email: string): Promise<CustomerRow | null> {
  const db = await getDb();
  const ambassador = await findAmbassadorByEmail(email);
  if (!db || !ambassador) return null;
  try {
    await db.insert(customers).values({
      email: normalizeMemberEmail(email),
      fullName: ambassador.name,
      instagram: ambassador.instagram,
      accessTypes: [],
      tags: ['embajador'],
      totalOrders: 0,
      totalSpent: '0',
    });
  } catch {
    // Dos pedidos de código a la vez: la ficha ya la creó el otro.
  }
  return findCustomer(email);
}

/** Manda el código al correo, solo si es cliente (o embajador). Devuelve si se mandó (para los límites; nunca se le dice a quien pide). */
export async function sendMemberCode(email: string): Promise<boolean> {
  const customer = (await findCustomer(email)) ?? (await ensureAmbassadorCustomer(email));
  if (!customer) return false;
  const html = buildMemberCodeEmail({ code: currentMemberCode(customer.email), name: firstName(customer.fullName) || null });
  await sendEmail({ to: customer.email, subject: '🔐 Tu código para entrar a tu cuenta', html });
  return true;
}

/** Email del cliente dueño de esa entrada o pedido (para mandarle el código ahí, nunca a uno que escriba quien pide). */
export async function emailForTicketOrOrder(input: { ticketCode?: string; orderNumber?: string }): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  if (input.ticketCode) {
    const [row] = await db.select({ email: orders.buyerEmail }).from(tickets).innerJoin(orders, eq(tickets.orderId, orders.id)).where(eq(tickets.ticketCode, input.ticketCode)).limit(1);
    return row?.email ? normalizeMemberEmail(row.email) : null;
  }
  if (input.orderNumber) {
    const [row] = await db.select({ email: orders.buyerEmail }).from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1);
    return row?.email ? normalizeMemberEmail(row.email) : null;
  }
  return null;
}

export function maskMemberEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}

/* ── Cupones ─────────────────────────────────────────────────────────────── */

const isDup = (e: any) => (e?.code ?? e?.cause?.code) === 'ER_DUP_ENTRY';

export interface GrantedCoupon { kind: string; title: string; percent: number; days: number; code: string }

/** Regala un cupón de un solo uso. Idempotente por `grantKey`: devuelve null si ya se regaló. */
async function grantCoupon(input: { email: string; kind: 'bienvenida' | 'nivel' | 'cumpleanos' | 'manual'; grantKey: string; title: string; percent: number; days: number }): Promise<GrantedCoupon | null> {
  const db = await getDb();
  if (!db) return null;
  const [seen] = await db.select({ id: memberCoupons.id }).from(memberCoupons).where(eq(memberCoupons.grantKey, input.grantKey)).limit(1);
  if (seen) return null;
  // Se reserva la llave ANTES de crear el código: ante dos corridas a la vez, solo una sigue.
  let claimId: number;
  try {
    const [res] = await db.insert(memberCoupons).values({ email: input.email, discountCodeId: 0, kind: input.kind, title: input.title, grantKey: input.grantKey }) as any;
    claimId = Number(res.insertId);
  } catch (err) {
    if (isDup(err)) return null;
    throw err;
  }
  try {
    const validUntil = new Date(Date.now() + input.days * 86_400_000);
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCouponCode();
      try {
        const [res] = await db.insert(discountCodes).values({
          code, description: `Cupón de socio: ${input.title}`, discountType: 'percentage', discountValue: String(input.percent), maxUses: 1, validUntil, isActive: 1,
        }) as any;
        await db.update(memberCoupons).set({ discountCodeId: Number(res.insertId) }).where(eq(memberCoupons.id, claimId));
        return { kind: input.kind, title: input.title, percent: input.percent, days: input.days, code };
      } catch (err) {
        if (!isDup(err)) throw err;
      }
    }
    throw new Error('No se pudo generar un código de cupón único');
  } catch (err) {
    await db.delete(memberCoupons).where(eq(memberCoupons.id, claimId));
    throw err;
  }
}

const money = (n: number) => `${n}%`;
const monthKey = (now: Date) => chileParts(now).day.slice(0, 7);

/** Cupones que le tocan a este socio ahora (nivel del mes y cumpleaños), según la configuración. */
async function grantDueCoupons(customer: CustomerRow, config: MemberConfig, now: Date): Promise<GrantedCoupon[]> {
  const email = customer.email.toLowerCase();
  const out: GrantedCoupon[] = [];
  const push = async (rule: CouponRule, kind: 'nivel' | 'cumpleanos', key: string, title: string) => {
    if (!rule.enabled) return;
    const g = await grantCoupon({ email, kind, grantKey: key, title, percent: rule.percent, days: rule.days });
    if (g) out.push(g);
  };

  const level = computeCustomerLevel({ totalOrders: customer.totalOrders, totalSpent: Number(customer.totalSpent), lastActivityAt: customer.lastSeenAt, levelOverride: customer.levelOverride, now });
  if (level === 'recurrente') await push(config.recurrente, 'nivel', `nivel:recurrente:${monthKey(now)}:${email}`, `${money(config.recurrente.percent)} por ser cliente recurrente`);
  if (level === 'vip') await push(config.vip, 'nivel', `nivel:vip:${monthKey(now)}:${email}`, `${money(config.vip.percent)} para clientes VIP`);

  const today = new Date(`${chileParts(now).day}T00:00:00Z`);
  const until = daysUntilBirthday(customer.birthDate, today);
  if (until !== null && until <= 7) await push(config.birthday, 'cumpleanos', `cumple:${chileParts(now).day.slice(0, 4)}:${email}`, `${money(config.birthday.percent)} por tu cumpleaños 🎂`);
  return out;
}

/** Entrada exitosa a la cuenta: marca al cliente como socio y le entrega los cupones que le tocan. */
export async function completeLogin(email: string, now = new Date()): Promise<{ isNew: boolean; granted: GrantedCoupon[] }> {
  const db = await getDb();
  const customer = await findCustomer(email);
  if (!db || !customer) return { isNew: false, granted: [] };
  const config = await getMemberConfig();
  const isNew = !customer.memberSince;
  const granted: GrantedCoupon[] = [];
  if (isNew) {
    await db.update(customers).set({ memberSince: now }).where(eq(customers.id, customer.id));
    if (config.welcome.enabled) {
      const g = await grantCoupon({ email: customer.email.toLowerCase(), kind: 'bienvenida', grantKey: `bienvenida:${customer.email.toLowerCase()}`, title: `${money(config.welcome.percent)} de bienvenida`, percent: config.welcome.percent, days: config.welcome.days });
      if (g) granted.push(g);
    }
  }
  granted.push(...(await grantDueCoupons(customer, config, now)));
  return { isNew, granted };
}

/** Cron diario: cupones de nivel y de cumpleaños para todos los socios; avisa por notificación a quien los activó. */
export async function runMemberBenefits(now = new Date()): Promise<{ members: number; granted: number; notified: number }> {
  const db = await getDb();
  if (!db) return { members: 0, granted: 0, notified: 0 };
  const config = await getMemberConfig();
  if (!config.birthday.enabled && !config.recurrente.enabled && !config.vip.enabled) return { members: 0, granted: 0, notified: 0 };
  const members = await db.select().from(customers).where(isNotNull(customers.memberSince));
  let granted = 0, notified = 0;
  for (const m of members) {
    const got = await grantDueCoupons(m, config, now);
    if (got.length === 0) continue;
    granted += got.length;
    if (config.pushOnGrant) {
      const first = got[0];
      const sent = await pushToEmail(m.email, {
        title: '🎟️ Tienes un cupón nuevo',
        body: `${firstName(m.fullName) ? `${firstName(m.fullName)}, ` : ''}${first.title}. Míralo en tu cuenta: vale ${first.days} días.`,
        url: '/cuenta',
      });
      notified += sent;
    }
  }
  return { members: members.length, granted, notified };
}

/** Un cupón personal solo lo usa su dueño: si el código es de otro correo, se rechaza. */
export async function assertCouponOwner(code: string | undefined, buyerEmail: string): Promise<void> {
  if (!code?.trim()) return;
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select({ email: memberCoupons.email }).from(memberCoupons).innerJoin(discountCodes, eq(memberCoupons.discountCodeId, discountCodes.id)).where(eq(discountCodes.code, code.trim().toUpperCase())).limit(1);
  if (row && row.email !== normalizeMemberEmail(buyerEmail)) throw new Error('Este cupón es personal: úsalo con el correo de tu cuenta.');
}

/* ── Mi cuenta ───────────────────────────────────────────────────────────── */

const PREPAID_LABEL: Record<string, string> = { topup_web: 'Recarga de saldo', spend_caja: 'Compra en caja', spend_puerta: 'Estacionamiento en puerta', refund: 'Devolución', manual_adjust: 'Ajuste' };
const PLAYCOINS_LABEL: Record<string, string> = { earn_web: 'Ganados por tu compra', earn_caja: 'Ganados en caja', redeem_caja: 'Canje en caja', manual_adjust: 'Ajuste' };

export async function getMemberHome(email: string, now = new Date()) {
  const db = await getDb();
  const customer = await findCustomer(email);
  if (!db || !customer) return null;
  const key = customer.email.toLowerCase();

  const [prepaid, points, couponRows, ticketRows, nextRows] = await Promise.all([
    db.select().from(prepaidLedger).where(eq(prepaidLedger.customerId, customer.id)).orderBy(desc(prepaidLedger.createdAt)).limit(8),
    db.select().from(playcoinsLedger).where(eq(playcoinsLedger.customerId, customer.id)).orderBy(desc(playcoinsLedger.createdAt)).limit(8),
    db.select({
      id: memberCoupons.id, kind: memberCoupons.kind, title: memberCoupons.title, createdAt: memberCoupons.createdAt,
      code: discountCodes.code, percent: discountCodes.discountValue, validUntil: discountCodes.validUntil, usedCount: discountCodes.usedCount, maxUses: discountCodes.maxUses, isActive: discountCodes.isActive,
    }).from(memberCoupons).innerJoin(discountCodes, eq(memberCoupons.discountCodeId, discountCodes.id)).where(eq(memberCoupons.email, key)).orderBy(desc(memberCoupons.createdAt)).limit(30),
    db.select({
      ticketCode: tickets.ticketCode, holderName: tickets.holderName, status: tickets.status, qrImageUrl: tickets.qrImageUrl,
      category: ticketTypes.category, typeName: ticketTypes.name,
      eventId: events.id, eventTitle: events.title, eventSlug: events.slug, eventDate: events.eventDate, venue: events.venue,
      doorsOpen: events.doorsOpen, eventEnd: events.eventEnd, attendeeData: orders.attendeeData,
    }).from(tickets).innerJoin(orders, eq(tickets.orderId, orders.id)).innerJoin(events, eq(tickets.eventId, events.id))
      .innerJoin(ticketTypes, eq(tickets.ticketTypeId, ticketTypes.id))
      .where(and(sql`LOWER(${orders.buyerEmail}) = ${key}`, eq(orders.paymentStatus, 'approved'), gte(events.eventDate, new Date(now.getTime() - 12 * 3_600_000)), inArray(events.status, ['published', 'soldout'])))
      .orderBy(events.eventDate),
    db.select({ id: events.id, title: events.title, slug: events.slug, eventDate: events.eventDate, memberEarlyUntil: events.memberEarlyUntil }).from(events)
      .where(and(eq(events.status, 'published'), gte(events.eventDate, new Date(now.getTime() - 12 * 3_600_000)))).orderBy(events.eventDate).limit(1),
  ]);

  const movements = [
    ...prepaid.map((r) => ({ type: 'money' as const, label: PREPAID_LABEL[r.reason] ?? r.reason, delta: r.delta, createdAt: r.createdAt })),
    ...points.map((r) => ({ type: 'points' as const, label: PLAYCOINS_LABEL[r.reason] ?? r.reason, delta: r.delta, createdAt: r.createdAt })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8);

  const byEvent = new Map<number, { eventId: number; eventTitle: string; eventSlug: string; eventDate: Date; venue: string | null; doorsOpen: Date | null; eventEnd: Date | null; tickets: { ticketCode: string; holderName: string | null; status: string; qrImageUrl: string | null; category: string; kind: TicketKind; kindLabel: string; companions: Companion[] }[] }>();
  for (const t of ticketRows) {
    const g = byEvent.get(t.eventId) ?? { eventId: t.eventId, eventTitle: t.eventTitle, eventSlug: t.eventSlug, eventDate: t.eventDate, venue: t.venue, doorsOpen: t.doorsOpen ?? null, eventEnd: t.eventEnd ?? null, tickets: [] };
    const kind = ticketKind(t.category, t.typeName);
    // Los acompañantes (nombre y documento) que se anotaron al comprar: solo en el acceso, nunca en los extras.
    let companions: Companion[] = [];
    if (kind === 'acceso' && t.attendeeData) {
      try { companions = companionsFromCampos((JSON.parse(t.attendeeData) as { campos?: Record<string, unknown> })?.campos); } catch { /* datos viejos: sin acompañantes */ }
    }
    g.tickets.push({ ticketCode: t.ticketCode, holderName: t.holderName, status: t.status, qrImageUrl: t.qrImageUrl ?? null, category: t.category, kind, kindLabel: ticketKindLabel(kind, t.typeName), companions });
    byEvent.set(t.eventId, g);
  }

  const config = await getMemberConfig();
  const level = computeCustomerLevel({ totalOrders: customer.totalOrders, totalSpent: Number(customer.totalSpent), lastActivityAt: customer.lastSeenAt, levelOverride: customer.levelOverride, now });
  const next = nextRows[0] ?? null;

  return {
    email: customer.email,
    fullName: customer.fullName,
    level,
    playcoins: customer.playcoins,
    prepaidBalance: customer.prepaidBalance,
    memberSince: customer.memberSince,
    movements,
    // Accesos primero y los extras (estacionamiento, guardarropía…) después.
    events: Array.from(byEvent.values()).map((e) => ({ ...e, tickets: sortByKind(e.tickets) })),
    coupons: couponRows.map((c) => ({
      id: c.id, kind: c.kind, title: c.title, code: c.code, percent: Number(c.percent), validUntil: c.validUntil,
      status: couponStatus({ usedCount: c.usedCount, maxUses: c.maxUses, validUntil: c.validUntil, isActive: c.isActive }, now),
    })),
    nextEvent: next ? { title: next.title, slug: next.slug, eventDate: next.eventDate, memberEarlyUntil: next.memberEarlyUntil } : null,
    // Lo que el dueño tiene prendido, para mostrar «lo que desbloqueas» sin prometer lo que no existe.
    perks: {
      welcome: config.welcome.enabled ? config.welcome.percent : 0,
      birthday: config.birthday.enabled ? config.birthday.percent : 0,
      recurrente: config.recurrente.enabled ? config.recurrente.percent : 0,
      vip: config.vip.enabled ? config.vip.percent : 0,
    },
  };
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

export async function memberStats() {
  const db = await getDb();
  if (!db) return { members: 0, withPush: 0, granted: 0, used: 0, byKind: {} as Record<string, { granted: number; used: number }>, recent: [] as any[] };
  const [memberRows, coupons] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(customers).where(isNotNull(customers.memberSince)),
    db.select({
      id: memberCoupons.id, email: memberCoupons.email, kind: memberCoupons.kind, title: memberCoupons.title, createdAt: memberCoupons.createdAt,
      code: discountCodes.code, usedCount: discountCodes.usedCount, maxUses: discountCodes.maxUses, validUntil: discountCodes.validUntil, isActive: discountCodes.isActive,
    }).from(memberCoupons).innerJoin(discountCodes, eq(memberCoupons.discountCodeId, discountCodes.id)).orderBy(desc(memberCoupons.createdAt)),
  ]);
  const byKind: Record<string, { granted: number; used: number }> = {};
  let used = 0;
  for (const c of coupons) {
    const k = (byKind[c.kind] ??= { granted: 0, used: 0 });
    k.granted++;
    if (c.maxUses && c.usedCount >= c.maxUses) { k.used++; used++; }
  }
  return {
    members: Number(memberRows[0]?.n ?? 0),
    granted: coupons.length,
    used,
    byKind,
    recent: coupons.slice(0, 25).map((c) => ({ id: c.id, email: c.email, kind: c.kind, title: c.title, code: c.code, createdAt: c.createdAt, status: couponStatus({ usedCount: c.usedCount, maxUses: c.maxUses, validUntil: c.validUntil, isActive: c.isActive }) })),
  };
}

/** Cupón a mano para un correo (el dueño regala uno desde el panel). */
export async function grantManualCoupon(email: string, percent: number, days: number, title: string): Promise<GrantedCoupon> {
  const customer = await findCustomer(email);
  if (!customer) throw new Error('Ese correo no es de ningún cliente.');
  const g = await grantCoupon({ email: customer.email.toLowerCase(), kind: 'manual', grantKey: `manual:${Date.now()}:${customer.email.toLowerCase()}`, title: title.trim().slice(0, 100) || `${percent}% de regalo`, percent, days });
  if (!g) throw new Error('No se pudo crear el cupón.');
  return g;
}

/** «Tu entrada de siempre»: la última compra web que se puede repetir y las personas con las que ha
 * venido, para recomprar en un toque desde la app (shared/repurchase.ts). */
export async function getRepurchase(email: string) {
  const db = await getDb();
  const key = normalizeMemberEmail(email);
  if (!db || !key) return null;
  const rows = await db.select({ attendeeData: orders.attendeeData }).from(orders)
    .where(and(sql`lower(${orders.buyerEmail}) = ${key}`, eq(orders.paymentStatus, 'approved'), eq(orders.channel, 'web'), isNotNull(orders.attendeeData)))
    .orderBy(desc(orders.createdAt))
    .limit(12);
  const list = rows.map((r) => r.attendeeData);
  return { last: lastPurchaseFrom(list), companions: knownCompanions(list) };
}
