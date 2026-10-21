/** Avisos push a CLIENTES del sitio público -- promos, concursos, recordatorio
 * del evento, nuevo evento/preventa y carrito abandonado. Mismo Web Push
 * estándar (VAPID) que el admin (server/push.ts); el service worker que los
 * recibe es client/public/sw-site.js.
 *
 * Reglas: nada sale si el cliente se dio de baja o está en la lista de
 * bloqueados; los avisos de marketing respetan un tope de uno al día por
 * dispositivo (shared/pushSegments.ts); los links nunca llevan el código de
 * una entrada (una suscripción ligada por número de pedido no prueba que el
 * dispositivo sea de quien compró) -- el recordatorio abre /mi-entrada, que
 * usa la última entrada abierta en ese mismo teléfono. */
import webpush from 'web-push';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { getDb, getSiteSettings, getEventById, getFeaturedEvent } from './db';
import { ensureConfigured } from './push';
import { blockedCustomers, customerPushSubscriptions, events, exclusiveAmbassadors, orders, pushCampaigns, tickets } from '../drizzle/schema';
import { emailKey } from '../shared/blockedMatch';
import { clip, PUSH_BODY_MAX, PUSH_TITLE_MAX } from '../shared/pushText';
import { normalizeSegment, segmentEventScope, selectRecipients, type PushSegment, type SegmentContext } from '../shared/pushSegments';
import { fillPushText, normalizeCustomerPushConfig, type CustomerPushConfig } from '../shared/customerPushConfig';

export type PushSource = 'ticket' | 'pago' | 'home' | 'concurso' | 'puntos' | 'app';
export type PushPlatform = 'ios' | 'android' | 'desktop';

export interface CustomerPushPayload {
  title: string;
  body: string;
  url: string;
  image?: string | null;
  /** Id de la campaña, para contar el toque (sw-site.js). */
  c?: number | null;
}

export function customerPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function getCustomerPushConfig(): Promise<CustomerPushConfig> {
  const settings = await getSiteSettings();
  return normalizeCustomerPushConfig((settings as any)?.customerPushConfig);
}

/** Solo rutas del propio sitio: un link de campaña nunca saca a otra web. */
export function safePushUrl(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  return /^\/(?!\/)[^\s]*$/.test(s) ? s : '/';
}

/* ── Suscripción ─────────────────────────────────────────────────────────── */

/** Email ligado a la entrada o al pedido desde donde se activó. */
export async function resolveEmail(input: { ticketCode?: string; orderNumber?: string }): Promise<{ email: string; orderId: number } | null> {
  const db = await getDb();
  if (!db) return null;
  let orderId: number | null = null;
  if (input.ticketCode) {
    const [t] = await db.select({ orderId: tickets.orderId }).from(tickets).where(eq(tickets.ticketCode, input.ticketCode)).limit(1);
    orderId = t?.orderId ?? null;
  }
  const [o] = orderId
    ? await db.select({ id: orders.id, buyerEmail: orders.buyerEmail }).from(orders).where(eq(orders.id, orderId)).limit(1)
    : input.orderNumber
      ? await db.select({ id: orders.id, buyerEmail: orders.buyerEmail }).from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1)
      : [];
  return o?.buyerEmail ? { email: o.buyerEmail, orderId: o.id } : null;
}

export async function subscribeCustomer(input: {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  ticketCode?: string;
  orderNumber?: string;
  source: PushSource;
  platform: PushPlatform;
  standalone: boolean;
}): Promise<{ linked: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const who = await resolveEmail(input);
  const keys = { p256dh: input.subscription.keys.p256dh, auth: input.subscription.keys.auth };
  // Reactivar = volver a aceptar avisos: se limpia la baja. El email solo se
  // pisa si este pedido trae uno (desde la home no se pierde el que ya tenía).
  const update = {
    ...keys, optedOutAt: null, platform: input.platform, standalone: input.standalone ? 1 : 0,
    ...(who ? { email: who.email, emailNorm: emailKey(who.email) || null, orderId: who.orderId } : {}),
  };
  await db.insert(customerPushSubscriptions).values({
    endpoint: input.subscription.endpoint, source: input.source, ...update,
    email: who?.email ?? null, emailNorm: who ? emailKey(who.email) || null : null, orderId: who?.orderId ?? null,
  }).onDuplicateKeyUpdate({ set: update });
  return { linked: !!who };
}

/** Liga una suscripción ya activa a una entrada (el mismo dispositivo abrió su QR). */
export async function linkCustomerSubscription(endpoint: string, ticketCode: string): Promise<{ linked: boolean }> {
  const db = await getDb();
  if (!db) return { linked: false };
  const who = await resolveEmail({ ticketCode });
  if (!who) return { linked: false };
  await db.update(customerPushSubscriptions)
    .set({ email: who.email, emailNorm: emailKey(who.email) || null, orderId: who.orderId })
    .where(eq(customerPushSubscriptions.endpoint, endpoint));
  return { linked: true };
}

export async function unsubscribeCustomer(endpoint: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(customerPushSubscriptions).set({ optedOutAt: new Date() }).where(eq(customerPushSubscriptions.endpoint, endpoint));
}

export async function resubscribeCustomer(oldEndpoint: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(customerPushSubscriptions)
    .set({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .where(eq(customerPushSubscriptions.endpoint, oldEndpoint));
}

/** Baja (o vuelta) de todos los dispositivos de un email -- desde /baja. */
export async function setPushOptOutForEmail(email: string, out: boolean): Promise<number> {
  const db = await getDb();
  const key = emailKey(email);
  if (!db || !key) return 0;
  const [res] = await db.update(customerPushSubscriptions)
    .set({ optedOutAt: out ? new Date() : null })
    .where(eq(customerPushSubscriptions.emailNorm, key)) as any;
  return Number(res?.affectedRows ?? 0);
}

export async function countPushForEmail(email: string): Promise<{ active: number; total: number }> {
  const db = await getDb();
  const key = emailKey(email);
  if (!db || !key) return { active: 0, total: 0 };
  const rows = await db.select({ optedOutAt: customerPushSubscriptions.optedOutAt }).from(customerPushSubscriptions).where(eq(customerPushSubscriptions.emailNorm, key));
  return { active: rows.filter((r) => !r.optedOutAt).length, total: rows.length };
}

/* ── Entrega ─────────────────────────────────────────────────────────────── */

type SubRow = typeof customerPushSubscriptions.$inferSelect;

const CONCURRENCY = 25;

/** Manda a cada suscripción; borra las que el navegador invalidó (404/410) y
 * marca lastSentAt (y lastMarketingAt si es marketing). Nunca lanza. */
async function deliver(subs: SubRow[], payload: CustomerPushPayload, opts: { marketing: boolean }): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured() || subs.length === 0) return { sent: 0, failed: 0 };
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };
  const body = JSON.stringify({
    ...payload,
    title: clip(payload.title, PUSH_TITLE_MAX),
    body: clip(payload.body, PUSH_BODY_MAX),
    url: safePushUrl(payload.url),
  });
  const okIds: number[] = [];
  const staleIds: number[] = [];
  let failed = 0;
  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    await Promise.all(subs.slice(i, i + CONCURRENCY).map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 12 * 3600 });
        okIds.push(sub.id);
      } catch (err: any) {
        failed++;
        if (err?.statusCode === 404 || err?.statusCode === 410) staleIds.push(sub.id);
        else console.error('[CustomerPush] Error mandando:', err?.statusCode, err?.body || err?.message);
      }
    }));
  }
  const now = new Date();
  for (let i = 0; i < okIds.length; i += 500) {
    await db.update(customerPushSubscriptions)
      .set(opts.marketing ? { lastSentAt: now, lastMarketingAt: now } : { lastSentAt: now })
      .where(inArray(customerPushSubscriptions.id, okIds.slice(i, i + 500)));
  }
  if (staleIds.length) await db.delete(customerPushSubscriptions).where(inArray(customerPushSubscriptions.id, staleIds));
  return { sent: okIds.length, failed };
}

/* ── Segmentos ───────────────────────────────────────────────────────────── */

async function emailsOf(rows: { e: string | null }[]): Promise<Set<string>> {
  return new Set(rows.map((r) => emailKey(r.e)).filter(Boolean));
}

/** Próximo evento publicado (el destacado si hay). */
async function nextEvent() {
  const ev = await getFeaturedEvent();
  return ev && new Date(ev.eventDate).getTime() > Date.now() - 12 * 3_600_000 ? ev : undefined;
}

async function buildContext(seg: PushSegment): Promise<SegmentContext> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const approved = eq(orders.paymentStatus, 'approved');
  const scope = segmentEventScope(seg);
  const eventId = scope === 'event' && seg.type === 'event' ? seg.eventId : scope === 'next' ? (await nextEvent())?.id : undefined;
  const days = seg.type === 'recentBuyers' ? seg.days : 0;
  const [buyers, eventBuyers, recentBuyers, ambassadors, blocked] = await Promise.all([
    seg.type === 'neverBought' ? db.selectDistinct({ e: orders.buyerEmail }).from(orders).where(approved).then(emailsOf) : new Set<string>(),
    eventId ? db.selectDistinct({ e: orders.buyerEmail }).from(orders).where(and(approved, eq(orders.eventId, eventId))).then(emailsOf) : new Set<string>(),
    days ? db.selectDistinct({ e: orders.buyerEmail }).from(orders).where(and(approved, gte(orders.createdAt, new Date(Date.now() - days * 86_400_000)))).then(emailsOf) : new Set<string>(),
    seg.type === 'ambassadors' ? db.select({ e: exclusiveAmbassadors.email }).from(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.active, 1)).then(emailsOf) : new Set<string>(),
    db.select({ e: blockedCustomers.emailNorm }).from(blockedCustomers).where(isNotNull(blockedCustomers.emailNorm)).then(emailsOf).catch(() => new Set<string>()),
  ]);
  return { buyers, eventBuyers, recentBuyers, ambassadors, blocked };
}

async function activeSubs(): Promise<SubRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerPushSubscriptions).where(isNull(customerPushSubscriptions.optedOutAt));
}

export async function previewSegment(raw: unknown): Promise<{ recipients: number; cappedOut: number; total: number; byPlatform: Record<string, number> }> {
  const seg = normalizeSegment(raw);
  const subs = await activeSubs();
  const { recipients, cappedOut } = selectRecipients(subs, seg, await buildContext(seg), { marketing: true });
  const byPlatform: Record<string, number> = {};
  for (const s of recipients) byPlatform[s.platform] = (byPlatform[s.platform] ?? 0) + 1;
  return { recipients: recipients.length, cappedOut, total: subs.length, byPlatform };
}

export async function audienceStats() {
  const db = await getDb();
  if (!db) return { active: 0, optedOut: 0, linked: 0, ios: 0, android: 0, desktop: 0, installed: 0, last7d: 0 };
  const rows = await db.select({
    platform: customerPushSubscriptions.platform, standalone: customerPushSubscriptions.standalone,
    emailNorm: customerPushSubscriptions.emailNorm, optedOutAt: customerPushSubscriptions.optedOutAt, createdAt: customerPushSubscriptions.createdAt,
  }).from(customerPushSubscriptions);
  const active = rows.filter((r) => !r.optedOutAt);
  const weekAgo = Date.now() - 7 * 86_400_000;
  return {
    active: active.length,
    optedOut: rows.length - active.length,
    linked: active.filter((r) => r.emailNorm).length,
    ios: active.filter((r) => r.platform === 'ios').length,
    android: active.filter((r) => r.platform === 'android').length,
    desktop: active.filter((r) => r.platform === 'desktop').length,
    installed: active.filter((r) => r.standalone).length,
    last7d: active.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
  };
}

/* ── Campañas ────────────────────────────────────────────────────────────── */

export interface CampaignInput {
  title: string;
  body: string;
  url: string;
  imageUrl?: string | null;
  segment: unknown;
  scheduledAt?: Date | null;
  kind?: 'manual' | 'recordatorio' | 'evento' | 'preventa';
  eventId?: number | null;
  status?: 'draft' | 'scheduled';
  createdBy?: string | null;
}

export async function createPushCampaign(input: CampaignInput): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [res] = await db.insert(pushCampaigns).values({
    title: clip(input.title, PUSH_TITLE_MAX), body: clip(input.body, PUSH_BODY_MAX), url: safePushUrl(input.url),
    imageUrl: input.imageUrl || null, segment: normalizeSegment(input.segment), kind: input.kind ?? 'manual',
    eventId: input.eventId ?? null, status: input.status ?? (input.scheduledAt ? 'scheduled' : 'draft'),
    scheduledAt: input.scheduledAt ?? null, createdBy: input.createdBy ?? null,
  }) as any;
  return Number(res.insertId);
}

export async function updatePushCampaign(id: number, input: CampaignInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [c] = await db.select({ status: pushCampaigns.status }).from(pushCampaigns).where(eq(pushCampaigns.id, id)).limit(1);
  if (!c) throw new Error('No existe esa campaña');
  if (c.status !== 'draft' && c.status !== 'scheduled') throw new Error('Esa campaña ya se envió');
  await db.update(pushCampaigns).set({
    title: clip(input.title, PUSH_TITLE_MAX), body: clip(input.body, PUSH_BODY_MAX), url: safePushUrl(input.url),
    imageUrl: input.imageUrl || null, segment: normalizeSegment(input.segment),
    status: input.scheduledAt ? 'scheduled' : 'draft', scheduledAt: input.scheduledAt ?? null,
  }).where(eq(pushCampaigns.id, id));
}

export async function cancelPushCampaign(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pushCampaigns).set({ status: 'cancelled' })
    .where(and(eq(pushCampaigns.id, id), inArray(pushCampaigns.status, ['draft', 'scheduled'])));
}

export async function listPushCampaigns(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushCampaigns).orderBy(desc(pushCampaigns.createdAt)).limit(limit);
}

/** Envía una campaña ya guardada. Toma la campaña con un UPDATE condicional
 * (draft/scheduled → sending) para que dos corridas nunca la manden doble. */
export async function sendPushCampaign(id: number): Promise<{ sent: number; failed: number; targeted: number; cappedOut: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (!ensureConfigured()) throw new Error('Faltan las claves VAPID en el servidor');
  const [res] = await db.update(pushCampaigns).set({ status: 'sending' })
    .where(and(eq(pushCampaigns.id, id), inArray(pushCampaigns.status, ['draft', 'scheduled']))) as any;
  if (!Number(res?.affectedRows)) throw new Error('Esa campaña ya se envió o se está enviando');
  const [c] = await db.select().from(pushCampaigns).where(eq(pushCampaigns.id, id)).limit(1);
  try {
    const seg = normalizeSegment(c.segment);
    // El recordatorio a quien tiene entrada es transaccional: no consume ni respeta el tope.
    const marketing = c.kind !== 'recordatorio';
    const { recipients, cappedOut } = selectRecipients(await activeSubs(), seg, await buildContext(seg), { marketing });
    const r = await deliver(recipients, { title: c.title, body: c.body, url: c.url, image: c.imageUrl, c: c.id }, { marketing });
    await db.update(pushCampaigns).set({ status: 'sent', sentAt: new Date(), targeted: recipients.length, sent: r.sent, failed: r.failed }).where(eq(pushCampaigns.id, id));
    return { ...r, targeted: recipients.length, cappedOut };
  } catch (err) {
    await db.update(pushCampaigns).set({ status: 'draft' }).where(eq(pushCampaigns.id, id));
    throw err;
  }
}

/** Prueba: a los dispositivos de un email (el del dueño), sin campaña ni tope. */
export async function sendPushTest(email: string, payload: CustomerPushPayload): Promise<{ sent: number; devices: number }> {
  const db = await getDb();
  const key = emailKey(email);
  if (!db || !key) return { sent: 0, devices: 0 };
  if (!ensureConfigured()) throw new Error('Faltan las claves VAPID en el servidor');
  const subs = await db.select().from(customerPushSubscriptions).where(and(eq(customerPushSubscriptions.emailNorm, key), isNull(customerPushSubscriptions.optedOutAt)));
  const r = await deliver(subs, { ...payload, c: null }, { marketing: false });
  return { sent: r.sent, devices: subs.length };
}

export async function recordPushClick(campaignId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pushCampaigns).set({ clicks: sql`${pushCampaigns.clicks} + 1` }).where(eq(pushCampaigns.id, campaignId));
}

/* ── Automáticos ─────────────────────────────────────────────────────────── */

/** Hora en Chile (0-23) y fecha YYYY-MM-DD, para "el día del evento a las 18:00". */
function chileParts(d: Date): { day: string; hour: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** Recordatorio del día del evento: una sola vez por evento (queda como campaña). */
async function runEventReminder(config: CustomerPushConfig, now: Date): Promise<string | null> {
  if (!config.eventReminder.enabled) return null;
  const db = await getDb();
  if (!db) return null;
  const today = chileParts(now);
  if (today.hour < config.eventReminder.hour) return null;
  const upcoming = await db.select().from(events)
    .where(and(inArray(events.status, ['published', 'soldout']), gte(events.eventDate, new Date(now.getTime() - 12 * 3_600_000)), lte(events.eventDate, new Date(now.getTime() + 36 * 3_600_000))));
  const ev = upcoming.find((e) => chileParts(new Date(e.eventDate)).day === today.day);
  if (!ev) return null;
  const [already] = await db.select({ id: pushCampaigns.id }).from(pushCampaigns)
    .where(and(eq(pushCampaigns.kind, 'recordatorio'), eq(pushCampaigns.eventId, ev.id))).limit(1);
  if (already) return null;
  const id = await createPushCampaign({
    title: fillPushText(config.eventReminder.title, { evento: ev.title }),
    body: fillPushText(config.eventReminder.body, { evento: ev.title }),
    url: '/mi-entrada', segment: { type: 'event', eventId: ev.id }, kind: 'recordatorio', eventId: ev.id, status: 'scheduled', scheduledAt: now,
  });
  const r = await sendPushCampaign(id);
  return `recordatorio ${ev.title}: ${r.sent}`;
}

/** Nuevo evento publicado o cambio de tanda. Según la config queda como
 * borrador para revisar en el panel o sale altiro. Nunca lanza. */
export async function notifyEventLaunch(eventId: number, kind: 'evento' | 'preventa'): Promise<void> {
  try {
    const config = await getCustomerPushConfig();
    const rule = kind === 'evento' ? config.newEvent : config.presale;
    if (!rule.enabled) return;
    const ev = await getEventById(eventId);
    if (!ev) return;
    const db = await getDb();
    if (!db) return;
    // Uno por evento y tipo (la preventa, uno por día): un evento re-publicado no avisa doble.
    const since = kind === 'preventa' ? new Date(Date.now() - 20 * 3_600_000) : new Date(0);
    const [already] = await db.select({ id: pushCampaigns.id }).from(pushCampaigns)
      .where(and(eq(pushCampaigns.kind, kind), eq(pushCampaigns.eventId, eventId), gte(pushCampaigns.createdAt, since))).limit(1);
    if (already) return;
    const id = await createPushCampaign({
      title: fillPushText(rule.title, { evento: ev.title }),
      body: fillPushText(rule.body, { evento: ev.title }),
      url: `/eventos/${ev.slug}`,
      imageUrl: ev.imageUrl?.startsWith('http') ? ev.imageUrl : null,
      segment: { type: 'all' }, kind, eventId,
      status: rule.mode === 'send' ? 'scheduled' : 'draft',
      scheduledAt: rule.mode === 'send' ? new Date() : null,
    });
    if (rule.mode === 'send') await sendPushCampaign(id);
  } catch (err) {
    console.error('[CustomerPush] Aviso de evento:', err);
  }
}

/** Carrito abandonado: push a los dispositivos del email del pedido, una sola
 * vez por pedido (solo en la corrida en que el pedido cumple la edad mínima,
 * ver server/orderReminders.ts). Nunca lanza. */
export async function pushAbandonedCarts(orderIds: number[]): Promise<number> {
  try {
    if (orderIds.length === 0) return 0;
    const config = await getCustomerPushConfig();
    if (!config.abandonedCart.enabled) return 0;
    const db = await getDb();
    if (!db) return 0;
    const rows = await db.select({ email: orders.buyerEmail, status: orders.paymentStatus, eventName: events.title, slug: events.slug })
      .from(orders).leftJoin(events, eq(orders.eventId, events.id)).where(inArray(orders.id, orderIds));
    let sent = 0;
    for (const o of rows) {
      const key = emailKey(o.email);
      if (o.status !== 'pending' || !key) continue;
      const subs = await db.select().from(customerPushSubscriptions)
        .where(and(eq(customerPushSubscriptions.emailNorm, key), isNull(customerPushSubscriptions.optedOutAt)));
      const r = await deliver(subs, {
        title: fillPushText(config.abandonedCart.title, { evento: o.eventName }),
        body: fillPushText(config.abandonedCart.body, { evento: o.eventName }),
        url: o.slug ? `/checkout/${o.slug}` : '/eventos',
      }, { marketing: false });
      sent += r.sent;
    }
    return sent;
  } catch (err) {
    console.error('[CustomerPush] Carrito abandonado:', err);
    return 0;
  }
}

/** Cron cada 15 min: campañas programadas que ya tocan y el recordatorio del día. */
export async function runPushQueue(now = new Date()): Promise<{ campaigns: number; sent: number; reminder: string | null; errors: string[] }> {
  const db = await getDb();
  if (!db) return { campaigns: 0, sent: 0, reminder: null, errors: ['Database not available'] };
  const errors: string[] = [];
  let campaigns = 0, sent = 0;
  const due = await db.select({ id: pushCampaigns.id }).from(pushCampaigns)
    .where(and(eq(pushCampaigns.status, 'scheduled'), lte(pushCampaigns.scheduledAt, now)));
  for (const c of due) {
    try {
      const r = await sendPushCampaign(c.id);
      campaigns++;
      sent += r.sent;
    } catch (err) {
      errors.push(`#${c.id}: ${err instanceof Error ? err.message : 'error'}`);
    }
  }
  let reminder: string | null = null;
  try {
    reminder = await runEventReminder(await getCustomerPushConfig(), now);
  } catch (err) {
    errors.push(`recordatorio: ${err instanceof Error ? err.message : 'error'}`);
  }
  return { campaigns, sent, reminder, errors };
}

