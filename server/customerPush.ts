/** Avisos push a CLIENTES del sitio público -- promos, concursos, recordatorio
 * del evento, nuevo evento/preventa, carrito abandonado y el resto de los
 * automáticos (server/pushAutomations.ts). Mismo Web Push estándar (VAPID)
 * que el admin (server/push.ts); el service worker que los recibe es
 * client/public/sw-site.js.
 *
 * Cómo sale un aviso: la campaña elige a sus destinatarios (segmento) y cada
 * uno queda como una fila de `pushDeliveries` con su hora de salida (ahora, a
 * su mejor hora, o 09:00 si cae en la madrugada). Una cola (el cron cada 15
 * min, y al enviar) las despacha. De ahí salen "según avisos anteriores", la
 * prueba A/B, los toques y las ventas por campaña.
 *
 * Reglas: nada sale si el cliente se dio de baja o está en la lista de
 * bloqueados; los avisos de marketing respetan un tope de uno al día por
 * dispositivo; los links nunca llevan el código de una entrada (una
 * suscripción ligada por número de pedido no prueba que el dispositivo sea de
 * quien compró) -- el recordatorio abre /mi-entrada, que usa la última entrada
 * abierta en ese mismo teléfono. */
import webpush from 'web-push';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { adjustPlaycoinsManually, getDb, getSiteSettings, getEventById, getFeaturedEvent } from './db';
import { ensureConfigured } from './push';
import {
  appDevices, blockedCustomers, customerPushSubscriptions, customers, eventSurveys, events, exclusiveAmbassadors, orders,
  pushAutoLog, pushCampaigns, pushDeliveries, pushPresets, tickets,
} from '../drizzle/schema';
import { emailKey } from '../shared/blockedMatch';
import { clip, personalizeName, PUSH_BODY_MAX, PUSH_TITLE_MAX } from '../shared/pushText';
import { normalizeSegment, parseJsonValue, ruleKey, selectRecipients, MARKETING_GAP_MS, type PushRule, type PushSegment, type RuleMatch, type SegmentContext } from '../shared/pushSegments';
import { fillPushText, normalizeCustomerPushConfig, type CustomerPushConfig } from '../shared/customerPushConfig';
import { chileParts, computeSendAt, recordOpenHour } from '../shared/pushSchedule';
import { computeCustomerLevel, daysUntilBirthday, hasBirthdayInMonth } from '../shared/customerInsights';
import { foldText } from '../shared/igCustomerLink';
import { WELCOME_URL } from '../shared/welcome';

export type PushSource = 'ticket' | 'pago' | 'home' | 'concurso' | 'puntos' | 'app';
export type PushPlatform = 'ios' | 'android' | 'desktop';

export interface PushAction { label: string; url: string }

export interface CustomerPushPayload {
  title: string;
  body: string;
  url: string;
  image?: string | null;
  /** Id de la campaña y de la suscripción, para contar el toque (sw-site.js). */
  c?: number | null;
  s?: number | null;
  /** Botones del aviso (Android y computador): [{ action, title, url }]. */
  actions?: { action: string; title: string; url: string }[];
}

export function customerPushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function getCustomerPushConfig(): Promise<CustomerPushConfig> {
  const settings = await getSiteSettings();
  return normalizeCustomerPushConfig((settings as any)?.customerPushConfig);
}

/** Mensaje legible de un error de la base de datos. Drizzle envuelve el error real en `cause` y su
 * mensaje trae el SQL completo con los datos; acá se deja solo la causa (y se avisa si falta una migración). */
export function dbErrorMessage(err: unknown): string {
  const cause: any = (err as any)?.cause;
  const raw: string = cause?.sqlMessage ?? cause?.message ?? '';
  if (/unknown column|doesn't exist|does not exist/i.test(raw)) return `Falta aplicar una migración en la base de datos: ${raw}`;
  if (raw) return `Error de la base de datos: ${raw}`;
  const msg = err instanceof Error ? err.message : 'Error desconocido';
  return msg.split(' params:')[0].slice(0, 240);
}

/** Solo rutas del propio sitio: un link de campaña nunca saca a otra web. */
export function safePushUrl(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  return /^\/(?!\/)[^\s]*$/.test(s) ? s : '/';
}

/** Marca el link con utm de la campaña: la compra queda atribuida al aviso (último toque gana). */
export function withUtm(url: string, campaignId: number | null | undefined): string {
  const safe = safePushUrl(url);
  if (!campaignId) return safe;
  const u = new URL(safe, 'https://x.invalid');
  if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'push');
  if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'push');
  if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', `push-${campaignId}`);
  return `${u.pathname}${u.search}${u.hash}`;
}

/** Cómo se comporta cada tipo de campaña: si cuenta como marketing (tope diario), si respeta
 * las horas silenciosas y cada cuánto se puede repetir a la misma persona. */
export const KIND_RULES: Record<string, { marketing: boolean; quiet: boolean; dedupeDays?: number; perEvent?: boolean }> = {
  manual: { marketing: true, quiet: true },
  evento: { marketing: true, quiet: true },
  preventa: { marketing: true, quiet: true },
  pocos_cupos: { marketing: true, quiet: true, dedupeDays: 3650, perEvent: true },
  reactivacion: { marketing: true, quiet: true, dedupeDays: 45 },
  cumpleanos: { marketing: false, quiet: true, dedupeDays: 300 },
  gracias: { marketing: false, quiet: true, dedupeDays: 3650, perEvent: true },
  saldo: { marketing: false, quiet: true, dedupeDays: 3650, perEvent: true },
  recordatorio: { marketing: false, quiet: false },
};
const kindRule = (kind: string) => KIND_RULES[kind] ?? KIND_RULES.manual;

type SubRow = typeof customerPushSubscriptions.$inferSelect;
type CampaignRow = typeof pushCampaigns.$inferSelect;

/* ── Nombres ─────────────────────────────────────────────────────────────── */

/** Nombre completo por correo (para {nombre}). */
async function namesByEmail(emails: string[]): Promise<Map<string, string>> {
  const db = await getDb();
  const out = new Map<string, string>();
  const list = Array.from(new Set(emails.filter(Boolean)));
  if (!db) return out;
  for (let i = 0; i < list.length; i += 500) {
    const rows = await db.select({ email: customers.email, fullName: customers.fullName }).from(customers).where(inArray(customers.email, list.slice(i, i + 500)));
    for (const r of rows) if (r.fullName) out.set(r.email.toLowerCase(), r.fullName);
  }
  return out;
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

/** Regalo por activar los avisos (Playcoins, una vez por correo). Devuelve lo regalado. */
async function awardIncentive(email: string, config: CustomerPushConfig): Promise<number> {
  const amount = config.incentive.playcoins;
  const key = emailKey(email);
  const db = await getDb();
  if (!amount || !key || !db) return 0;
  const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, key)).limit(1);
  if (!cust) return 0;
  const [done] = await db.select({ id: pushAutoLog.id }).from(pushAutoLog).where(and(eq(pushAutoLog.kind, 'incentivo'), eq(pushAutoLog.subjectKey, key))).limit(1);
  if (done) return 0;
  // Se anota ANTES de regalar: ante un doble toque es mejor no regalar que regalar dos veces.
  await db.insert(pushAutoLog).values({ kind: 'incentivo', subjectKey: key });
  await adjustPlaycoinsManually(cust.id, amount, 'Regalo por activar los avisos de la app');
  return amount;
}

export async function subscribeCustomer(input: {
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  ticketCode?: string;
  orderNumber?: string;
  source: PushSource;
  platform: PushPlatform;
  standalone: boolean;
}): Promise<{ linked: boolean; gift: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const who = await resolveEmail(input);
  const keys = { p256dh: input.subscription.keys.p256dh, auth: input.subscription.keys.auth };
  const [existing] = await db.select({ id: customerPushSubscriptions.id, optedOutAt: customerPushSubscriptions.optedOutAt, hourHist: customerPushSubscriptions.hourHist })
    .from(customerPushSubscriptions).where(eq(customerPushSubscriptions.endpoint, input.subscription.endpoint)).limit(1);
  // Reactivar = volver a aceptar avisos: se limpia la baja. El email solo se
  // pisa si este pedido trae uno (desde la home no se pierde el que ya tenía).
  const update = {
    ...keys, optedOutAt: null, platform: input.platform, standalone: input.standalone ? 1 : 0,
    ...(who ? { email: who.email, emailNorm: emailKey(who.email) || null, orderId: who.orderId } : {}),
  };
  await db.insert(customerPushSubscriptions).values({
    endpoint: input.subscription.endpoint, source: input.source, ...update,
    email: who?.email ?? null, emailNorm: who ? emailKey(who.email) || null : null, orderId: who?.orderId ?? null,
    hourHist: recordOpenHour(null, chileParts(new Date()).hour),
  }).onDuplicateKeyUpdate({ set: update });

  // Bienvenida y regalo: solo la primera vez (o al reactivar).
  let gift = 0;
  if (!existing || existing.optedOutAt) {
    try {
      const config = await getCustomerPushConfig();
      if (who) gift = await awardIncentive(who.email, config);
      if (config.welcome.enabled || gift > 0) {
        const [sub] = await db.select().from(customerPushSubscriptions).where(eq(customerPushSubscriptions.endpoint, input.subscription.endpoint)).limit(1);
        const names = await namesByEmail(who ? [who.email.toLowerCase()] : []);
        const body = gift > 0 ? `${config.welcome.body} Te regalamos ${gift} Playcoins 🎁` : config.welcome.body;
        // La bienvenida abre la ventana de comunidad del sitio (shared/welcome.ts), no el inicio a secas.
        if (sub) await sendDirect([sub], { title: config.welcome.title, body, url: WELCOME_URL }, { names });
      }
    } catch (err) {
      console.error('[CustomerPush] Bienvenida:', err);
    }
  }
  return { linked: !!who, gift };
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
  try { await awardIncentive(who.email, await getCustomerPushConfig()); } catch (err) { console.error('[CustomerPush] Regalo:', err); }
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

/** Suma esta apertura (hora de Chile) al historial de la suscripción: "mejor hora por persona". */
export async function recordSubscriptionOpen(endpoint: string, now = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [sub] = await db.select({ id: customerPushSubscriptions.id, hourHist: customerPushSubscriptions.hourHist }).from(customerPushSubscriptions).where(eq(customerPushSubscriptions.endpoint, endpoint)).limit(1);
  if (!sub) return;
  await db.update(customerPushSubscriptions).set({ hourHist: recordOpenHour(sub.hourHist, chileParts(now).hour) }).where(eq(customerPushSubscriptions.id, sub.id));
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

const CONCURRENCY = 25;

type SendResult = 'ok' | 'stale' | 'fail';

async function sendOne(sub: SubRow, body: string): Promise<SendResult> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL: 12 * 3600 });
    return 'ok';
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) return 'stale';
    console.error('[CustomerPush] Error mandando:', err?.statusCode, err?.body || err?.message);
    return 'fail';
  }
}

/** Texto final de un aviso para una persona: {nombre} resuelto, sin cortes a media palabra. */
function composeBody(payload: CustomerPushPayload, name: string | null | undefined): string {
  return JSON.stringify({
    ...payload,
    title: clip(personalizeName(payload.title, name), PUSH_TITLE_MAX),
    body: clip(personalizeName(payload.body, name), PUSH_BODY_MAX),
    url: safePushUrl(payload.url),
  });
}

/** Envío directo e inmediato (bienvenida, carrito abandonado, prueba), sin campaña.
 * Borra las suscripciones que el navegador invalidó (404/410). Nunca lanza. */
async function sendDirect(subs: SubRow[], payload: CustomerPushPayload, opts: { names?: Map<string, string>; marketing?: boolean } = {}): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured() || subs.length === 0) return { sent: 0, failed: 0 };
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };
  const okIds: number[] = [];
  const staleIds: number[] = [];
  let failed = 0;
  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    await Promise.all(subs.slice(i, i + CONCURRENCY).map(async (sub) => {
      const name = sub.emailNorm ? opts.names?.get(sub.emailNorm) : null;
      const r = await sendOne(sub, composeBody({ ...payload, s: sub.id }, name));
      if (r === 'ok') okIds.push(sub.id);
      else { failed++; if (r === 'stale') staleIds.push(sub.id); }
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

/** Aviso inmediato a todos los dispositivos de un correo (cupón nuevo, etc.). Devuelve cuántos recibieron. Nunca lanza. */
export async function pushToEmail(email: string, payload: CustomerPushPayload): Promise<number> {
  try {
    const db = await getDb();
    const key = emailKey(email);
    if (!db || !key) return 0;
    const subs = await db.select().from(customerPushSubscriptions).where(and(eq(customerPushSubscriptions.emailNorm, key), isNull(customerPushSubscriptions.optedOutAt)));
    return (await sendDirect(subs, payload, { names: await namesByEmail([key]) })).sent;
  } catch (err) {
    console.error('[CustomerPush] Aviso a un correo:', err);
    return 0;
  }
}

/* ── Segmentos ───────────────────────────────────────────────────────────── */

const emailSet = (rows: { e: string | null }[]): Set<string> => new Set(rows.map((r) => emailKey(r.e)).filter((e): e is string => !!e));

/** Próximo evento publicado (el destacado si hay). */
export async function nextEvent() {
  const ev = await getFeaturedEvent();
  return ev && new Date(ev.eventDate).getTime() > Date.now() - 12 * 3_600_000 ? ev : undefined;
}

async function activeSubs(): Promise<SubRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerPushSubscriptions).where(isNull(customerPushSubscriptions.optedOutAt));
}

/** Resuelve cada regla a "quiénes la cumplen" con consultas a la base. */
async function resolveRules(rules: PushRule[], subs: SubRow[]): Promise<Record<string, RuleMatch>> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const out: Record<string, RuleMatch> = {};
  const subEmails = new Set(subs.map((s) => s.emailNorm).filter((e): e is string => !!e));
  const approved = eq(orders.paymentStatus, 'approved');
  type Cust = { email: string; birthDate: string | null; gender: string | null; city: string | null; totalOrders: number; totalSpent: unknown; lastSeenAt: Date | null; levelOverride: string | null; prepaidBalance: number; memberSince: Date | null };
  let customerRows: Cust[] | null = null;
  const allCustomers = async (): Promise<Cust[]> => (customerRows ??= (await db.select({
    email: customers.email, birthDate: customers.birthDate, gender: customers.gender, city: customers.city, totalOrders: customers.totalOrders,
    totalSpent: customers.totalSpent, lastSeenAt: customers.lastSeenAt, levelOverride: customers.levelOverride, prepaidBalance: customers.prepaidBalance, memberSince: customers.memberSince,
  }).from(customers)) as Cust[]);
  const buyersOf = async (cond: any): Promise<Set<string>> => emailSet(await db.selectDistinct({ e: orders.buyerEmail }).from(orders).where(cond));
  const customerEmails = async (pred: (c: Cust) => boolean): Promise<Set<string>> =>
    new Set((await allCustomers()).filter(pred).map((c) => c.email.toLowerCase()));
  const minus = (all: Set<string>, remove: Set<string>) => new Set(Array.from(all).filter((e) => !remove.has(e)));

  for (const rule of rules) {
    const key = ruleKey(rule);
    if (out[key]) continue;
    switch (rule.type) {
      case 'event':
        out[key] = { emails: await buyersOf(and(approved, eq(orders.eventId, rule.eventId))) };
        break;
      case 'nextEvent': {
        const ev = await nextEvent();
        out[key] = { emails: ev ? await buyersOf(and(approved, eq(orders.eventId, ev.id))) : new Set() };
        break;
      }
      case 'nextEventNoTicket': {
        const ev = await nextEvent();
        const have = ev ? await buyersOf(and(approved, eq(orders.eventId, ev.id))) : new Set<string>();
        out[key] = { emails: minus(subEmails, have), anon: true };
        break;
      }
      case 'neverBought':
        out[key] = { emails: minus(subEmails, await buyersOf(approved)), anon: true };
        break;
      case 'recentBuyers':
        out[key] = { emails: await buyersOf(and(approved, gte(orders.createdAt, new Date(Date.now() - rule.days * 86_400_000)))) };
        break;
      case 'ambassadors':
        out[key] = { emails: emailSet(await db.select({ e: exclusiveAmbassadors.email }).from(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.active, 1))) };
        break;
      case 'level': {
        const now = new Date();
        out[key] = { emails: await customerEmails((c) => rule.levels.includes(computeCustomerLevel({
          totalOrders: c.totalOrders, totalSpent: Number(c.totalSpent), lastActivityAt: c.lastSeenAt, levelOverride: c.levelOverride, now,
        }))) };
        break;
      }
      case 'birthdayMonth':
        out[key] = { emails: await customerEmails((c) => hasBirthdayInMonth(c.birthDate, rule.month)) };
        break;
      case 'birthdayToday': {
        // "Hoy" en Chile, como fecha UTC a medianoche para el cálculo de días.
        const today = new Date(`${chileParts(new Date()).day}T00:00:00Z`);
        out[key] = { emails: await customerEmails((c) => daysUntilBirthday(c.birthDate, today) === 0) };
        break;
      }
      case 'city': {
        const needle = foldText(rule.city);
        out[key] = { emails: await customerEmails((c) => !!c.city && foldText(c.city).includes(needle)) };
        break;
      }
      case 'gender':
        out[key] = { emails: await customerEmails((c) => c.gender === rule.gender) };
        break;
      case 'dormant': {
        const before = Date.now() - rule.days * 86_400_000;
        out[key] = { emails: await customerEmails((c) => c.totalOrders > 0 && !!c.lastSeenAt && new Date(c.lastSeenAt).getTime() < before) };
        break;
      }
      case 'hasBalance':
        out[key] = { emails: await customerEmails((c) => c.prepaidBalance > 0) };
        break;
      case 'member':
        out[key] = { emails: await customerEmails((c) => !!c.memberSince) };
        break;
      case 'app': {
        const rows = await db.select({ e: appDevices.emailNorm, last: sql<Date>`max(${appDevices.lastSeenAt})` }).from(appDevices).where(isNotNull(appDevices.emailNorm)).groupBy(appDevices.emailNorm);
        const since = Date.now() - rule.days * 86_400_000;
        out[key] = { emails: new Set(rows.filter((r) => r.e && (rule.mode === 'active' ? new Date(r.last).getTime() >= since : new Date(r.last).getTime() < since)).map((r) => r.e as string)) };
        break;
      }
      case 'clicked': case 'notClicked': {
        const rows = await db.select({ s: pushDeliveries.subscriptionId }).from(pushDeliveries).where(and(
          eq(pushDeliveries.campaignId, rule.campaignId), eq(pushDeliveries.status, 'sent'),
          rule.type === 'clicked' ? isNotNull(pushDeliveries.clickedAt) : isNull(pushDeliveries.clickedAt),
        ));
        out[key] = { subs: new Set(rows.map((r) => r.s)) };
        break;
      }
      case 'attended': {
        const rows = await db.selectDistinct({ e: orders.buyerEmail }).from(tickets).innerJoin(orders, eq(tickets.orderId, orders.id))
          .where(and(eq(tickets.eventId, rule.eventId), eq(tickets.status, 'used')));
        out[key] = { emails: emailSet(rows) };
        break;
      }
    }
  }
  return out;
}

async function buildContext(seg: PushSegment, subs: SubRow[]): Promise<SegmentContext> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [rules, blocked] = await Promise.all([
    resolveRules([...seg.include, ...seg.exclude], subs),
    db.select({ e: blockedCustomers.emailNorm }).from(blockedCustomers).where(isNotNull(blockedCustomers.emailNorm)).then(emailSet).catch(() => new Set<string>()),
  ]);
  return { rules, blocked };
}

export async function previewSegment(raw: unknown): Promise<{ recipients: number; cappedOut: number; total: number; byPlatform: Record<string, number>; named: number }> {
  const seg = normalizeSegment(raw);
  const subs = await activeSubs();
  const { recipients, cappedOut } = selectRecipients(subs, seg, await buildContext(seg, subs), { marketing: true });
  const byPlatform: Record<string, number> = {};
  for (const s of recipients) byPlatform[s.platform] = (byPlatform[s.platform] ?? 0) + 1;
  const names = await namesByEmail(recipients.map((s) => s.emailNorm ?? '').filter(Boolean));
  const named = recipients.filter((s) => s.emailNorm && names.has(s.emailNorm)).length;
  return { recipients: recipients.length, cappedOut, total: subs.length, byPlatform, named };
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
  kind?: string;
  eventId?: number | null;
  status?: 'draft' | 'scheduled';
  createdBy?: string | null;
  titleB?: string | null;
  bodyB?: string | null;
  abPercent?: number;
  abWaitMin?: number;
  smartHour?: boolean;
  actions?: PushAction[] | null;
}

/** Botones válidos: máx. 2, con texto corto y link del propio sitio. */
export function cleanActions(raw: unknown): PushAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a: any) => ({ label: String(a?.label ?? '').trim().slice(0, 24), url: safePushUrl(a?.url) })).filter((a) => a.label).slice(0, 2);
}

function campaignValues(input: CampaignInput) {
  const ab = !!(input.abPercent && input.titleB?.trim() && input.bodyB?.trim());
  return {
    title: clip(input.title, PUSH_TITLE_MAX), body: clip(input.body, PUSH_BODY_MAX), url: safePushUrl(input.url),
    imageUrl: input.imageUrl || null, segment: normalizeSegment(input.segment),
    titleB: ab ? clip(input.titleB!, PUSH_TITLE_MAX) : null, bodyB: ab ? clip(input.bodyB!, PUSH_BODY_MAX) : null,
    abPercent: ab ? Math.min(50, Math.max(10, Math.round(input.abPercent!))) : 0,
    abWaitMin: Math.min(1440, Math.max(30, Math.round(input.abWaitMin ?? 180))),
    smartHour: input.smartHour ? 1 : 0,
    actions: cleanActions(input.actions),
  };
}

export async function createPushCampaign(input: CampaignInput): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [res] = await db.insert(pushCampaigns).values({
    ...campaignValues(input), kind: input.kind ?? 'manual', eventId: input.eventId ?? null,
    status: input.status ?? (input.scheduledAt ? 'scheduled' : 'draft'), scheduledAt: input.scheduledAt ?? null, createdBy: input.createdBy ?? null,
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
    ...campaignValues(input), status: input.scheduledAt ? 'scheduled' : 'draft', scheduledAt: input.scheduledAt ?? null,
  }).where(eq(pushCampaigns.id, id));
}

export async function cancelPushCampaign(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(pushCampaigns).set({ status: 'cancelled' })
    .where(and(eq(pushCampaigns.id, id), inArray(pushCampaigns.status, ['draft', 'scheduled'])));
  // Una campaña en curso (con envíos todavía en cola) se detiene: lo ya enviado queda.
  await db.update(pushCampaigns).set({ status: 'cancelled' }).where(and(eq(pushCampaigns.id, id), inArray(pushCampaigns.status, ['sending', 'testing'])));
  await db.delete(pushDeliveries).where(and(eq(pushDeliveries.campaignId, id), eq(pushDeliveries.status, 'queued')));
}

export interface CampaignStats {
  sent: number; failed: number; queued: number; clicks: number;
  variants: Record<string, { sent: number; clicks: number }>;
  orders: number; revenue: number;
}

/** Campañas con sus números en vivo: envíos, toques, A/B y ventas atribuidas (utm push-<id>). */
export async function listPushCampaigns(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(pushCampaigns).orderBy(desc(pushCampaigns.createdAt)).limit(limit);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [agg, sales] = await Promise.all([
    db.select({
      campaignId: pushDeliveries.campaignId, variant: pushDeliveries.variant, status: pushDeliveries.status,
      n: sql<number>`count(*)`, clicks: sql<number>`sum(case when ${pushDeliveries.clickedAt} is null then 0 else 1 end)`,
    }).from(pushDeliveries).where(inArray(pushDeliveries.campaignId, ids)).groupBy(pushDeliveries.campaignId, pushDeliveries.variant, pushDeliveries.status),
    db.select({ c: orders.utmCampaign, n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${orders.total}), 0)` }).from(orders)
      .where(and(eq(orders.paymentStatus, 'approved'), inArray(orders.utmCampaign, ids.map((i) => `push-${i}`)))).groupBy(orders.utmCampaign),
  ]);
  const stats = new Map<number, CampaignStats>();
  const get = (id: number): CampaignStats => stats.get(id) ?? (stats.set(id, { sent: 0, failed: 0, queued: 0, clicks: 0, variants: {}, orders: 0, revenue: 0 }), stats.get(id)!);
  for (const a of agg) {
    const s = get(a.campaignId);
    const n = Number(a.n), clicks = Number(a.clicks ?? 0);
    if (a.status === 'sent') {
      s.sent += n; s.clicks += clicks;
      const v = (s.variants[a.variant] ??= { sent: 0, clicks: 0 });
      v.sent += n; v.clicks += clicks;
    } else if (a.status === 'queued') s.queued += n;
    else s.failed += n;
  }
  for (const sale of sales) {
    const id = Number(String(sale.c).replace('push-', ''));
    const s = get(id);
    s.orders = Number(sale.n); s.revenue = Number(sale.total);
  }
  return rows.map((r) => ({ ...r, stats: get(r.id) }));
}

/* ── Cola de envío ───────────────────────────────────────────────────────── */

/** Una persona (suscripción) por cada fila: cuándo sale y con qué variante. */
async function queueDeliveries(campaign: CampaignRow, items: { sub: SubRow; variant: 'A' | 'B'; urlOverride?: string | null }[], now: Date): Promise<{ now: number; later: number }> {
  const db = await getDb();
  if (!db || items.length === 0) return { now: 0, later: 0 };
  const rule = kindRule(campaign.kind);
  let immediate = 0;
  const rows = items.map(({ sub, variant, urlOverride }) => {
    const sendAt = computeSendAt(now, sub.hourHist, { smart: campaign.smartHour === 1, respectQuiet: rule.quiet });
    if (sendAt.getTime() <= now.getTime()) immediate++;
    return { campaignId: campaign.id, subscriptionId: sub.id, variant, status: 'queued', sendAt, urlOverride: urlOverride ?? null };
  });
  for (let i = 0; i < rows.length; i += 500) await db.insert(pushDeliveries).values(rows.slice(i, i + 500));
  return { now: immediate, later: rows.length - immediate };
}

/** Despacha las entregas en cola que ya les toca. Devuelve cuántas salieron. */
export async function processDueDeliveries(now = new Date(), limit = 600, onlyCampaignId?: number): Promise<number> {
  const db = await getDb();
  if (!db || !ensureConfigured()) return 0;
  const due = await db.select().from(pushDeliveries)
    .where(and(eq(pushDeliveries.status, 'queued'), lte(pushDeliveries.sendAt, now), ...(onlyCampaignId ? [eq(pushDeliveries.campaignId, onlyCampaignId)] : [])))
    .orderBy(pushDeliveries.sendAt).limit(limit);
  if (due.length === 0) return 0;

  const campaigns = new Map((await db.select().from(pushCampaigns).where(inArray(pushCampaigns.id, Array.from(new Set(due.map((d) => d.campaignId)))))).map((c) => [c.id, c]));
  const subs = new Map((await db.select().from(customerPushSubscriptions).where(inArray(customerPushSubscriptions.id, Array.from(new Set(due.map((d) => d.subscriptionId)))))).map((s) => [s.id, s]));
  const names = await namesByEmail(Array.from(subs.values()).map((s) => s.emailNorm ?? '').filter(Boolean));

  const sentIds: number[] = [];
  const failedIds: number[] = [];
  const staleSubIds: number[] = [];
  const marketingSubIds: number[] = [];
  const otherSubIds: number[] = [];

  for (let i = 0; i < due.length; i += CONCURRENCY) {
    await Promise.all(due.slice(i, i + CONCURRENCY).map(async (d) => {
      const c = campaigns.get(d.campaignId);
      const sub = subs.get(d.subscriptionId);
      // Campaña cancelada, suscripción borrada o dada de baja: no se manda.
      if (!c || c.status === 'cancelled' || !sub || sub.optedOutAt) { failedIds.push(d.id); return; }
      const rule = kindRule(c.kind);
      // Tope diario revisado también al salir (otro aviso pudo salir entre medio).
      if (rule.marketing && sub.lastMarketingAt && now.getTime() - new Date(sub.lastMarketingAt).getTime() < MARKETING_GAP_MS) { failedIds.push(d.id); return; }
      const useB = d.variant === 'B' && c.titleB && c.bodyB;
      const url = d.urlOverride ?? c.url;
      const rawActions = parseJsonValue(c.actions);
      const actions = (Array.isArray(rawActions) ? (rawActions as PushAction[]) : []).map((a, n) => ({ action: `a${n}`, title: a.label, url: withUtm(a.url, c.id) }));
      const body = composeBody({
        title: useB ? c.titleB! : c.title, body: useB ? c.bodyB! : c.body, url: withUtm(url, c.id), image: c.imageUrl, c: c.id, s: sub.id,
        ...(actions.length ? { actions } : {}),
      }, sub.emailNorm ? names.get(sub.emailNorm) : null);
      const r = await sendOne(sub, body);
      if (r === 'ok') { sentIds.push(d.id); (rule.marketing ? marketingSubIds : otherSubIds).push(sub.id); }
      else { failedIds.push(d.id); if (r === 'stale') staleSubIds.push(sub.id); }
    }));
  }

  const stamp = new Date();
  for (let i = 0; i < sentIds.length; i += 500) await db.update(pushDeliveries).set({ status: 'sent', sentAt: stamp }).where(inArray(pushDeliveries.id, sentIds.slice(i, i + 500)));
  for (let i = 0; i < failedIds.length; i += 500) await db.update(pushDeliveries).set({ status: 'failed' }).where(inArray(pushDeliveries.id, failedIds.slice(i, i + 500)));
  for (let i = 0; i < marketingSubIds.length; i += 500) await db.update(customerPushSubscriptions).set({ lastSentAt: stamp, lastMarketingAt: stamp }).where(inArray(customerPushSubscriptions.id, marketingSubIds.slice(i, i + 500)));
  for (let i = 0; i < otherSubIds.length; i += 500) await db.update(customerPushSubscriptions).set({ lastSentAt: stamp }).where(inArray(customerPushSubscriptions.id, otherSubIds.slice(i, i + 500)));
  if (staleSubIds.length) await db.delete(customerPushSubscriptions).where(inArray(customerPushSubscriptions.id, staleSubIds));
  return sentIds.length;
}

/** Cierra las campañas "enviando" que ya no tienen nada en cola. */
export async function finalizeCampaigns(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const running = await db.select({ id: pushCampaigns.id }).from(pushCampaigns).where(eq(pushCampaigns.status, 'sending'));
  for (const c of running) {
    const rows = await db.select({ status: pushDeliveries.status, n: sql<number>`count(*)` }).from(pushDeliveries).where(eq(pushDeliveries.campaignId, c.id)).groupBy(pushDeliveries.status);
    const n = (st: string) => Number(rows.find((r) => r.status === st)?.n ?? 0);
    if (n('queued') > 0) continue;
    await db.update(pushCampaigns).set({ status: 'sent', sentAt: new Date(), targeted: n('sent') + n('failed'), sent: n('sent'), failed: n('failed') }).where(eq(pushCampaigns.id, c.id));
  }
}

/** Quiénes de `recipients` ya recibieron este automático dentro de la ventana (no se repite). */
async function dropAlreadySent<T extends SubRow>(kind: string, eventId: number | null, recipients: T[]): Promise<T[]> {
  const rule = kindRule(kind);
  const db = await getDb();
  if (!db || !rule.dedupeDays) return recipients;
  const keyOf = (s: SubRow) => `${kind}:${rule.perEvent ? eventId ?? '-' : '-'}:${s.emailNorm ?? `sub${s.id}`}`;
  const since = new Date(Date.now() - rule.dedupeDays * 86_400_000);
  const seen = new Set<string>();
  const keys = recipients.map(keyOf);
  for (let i = 0; i < keys.length; i += 500) {
    const rows = await db.select({ k: pushAutoLog.subjectKey }).from(pushAutoLog).where(and(eq(pushAutoLog.kind, kind), gte(pushAutoLog.sentAt, since), inArray(pushAutoLog.subjectKey, keys.slice(i, i + 500))));
    for (const r of rows) seen.add(r.k);
  }
  return recipients.filter((s) => !seen.has(keyOf(s)));
}

async function logAutoSent(kind: string, eventId: number | null, subs: SubRow[]): Promise<void> {
  const rule = kindRule(kind);
  const db = await getDb();
  if (!db || !rule.dedupeDays || subs.length === 0) return;
  const rows = subs.map((s) => ({ kind, subjectKey: `${kind}:${rule.perEvent ? eventId ?? '-' : '-'}:${s.emailNorm ?? `sub${s.id}`}` }));
  for (let i = 0; i < rows.length; i += 500) await db.insert(pushAutoLog).values(rows.slice(i, i + 500));
}

/** Link propio de cada persona para la encuesta del evento (solo a quien aún no respondió). */
async function surveyLinks(eventId: number | null): Promise<Map<string, string>> {
  const db = await getDb();
  const out = new Map<string, string>();
  if (!db || !eventId) return out;
  const rows = await db.select({ email: eventSurveys.buyerEmail, token: eventSurveys.token }).from(eventSurveys).where(and(eq(eventSurveys.eventId, eventId), isNull(eventSurveys.respondedAt)));
  for (const r of rows) out.set(r.email.toLowerCase(), `/encuesta/${r.token}`);
  return out;
}

/** Orden estable y "al azar" para repartir la prueba A/B sin sesgo por antigüedad. */
const scramble = (id: number) => (Math.imul(id, 2654435761) >>> 0);

/** Arma los destinatarios de una campaña y los deja en cola; lo que ya toca sale al tiro. */
export async function sendPushCampaign(id: number, now = new Date()): Promise<{ targeted: number; sentNow: number; later: number; cappedOut: number; testing: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (!ensureConfigured()) throw new Error('Faltan las claves VAPID en el servidor');
  const [claim] = await db.update(pushCampaigns).set({ status: 'sending' })
    .where(and(eq(pushCampaigns.id, id), inArray(pushCampaigns.status, ['draft', 'scheduled']))) as any;
  if (!Number(claim?.affectedRows)) throw new Error('Esa campaña ya se envió o se está enviando');
  const [c] = await db.select().from(pushCampaigns).where(eq(pushCampaigns.id, id)).limit(1);
  try {
    const seg = normalizeSegment(c.segment);
    const rule = kindRule(c.kind);
    const subs = await activeSubs();
    const picked = selectRecipients(subs, seg, await buildContext(seg, subs), { marketing: rule.marketing, now });
    const recipients = await dropAlreadySent(c.kind, c.eventId, picked.recipients);
    if (recipients.length === 0) {
      await db.update(pushCampaigns).set({ status: 'sent', sentAt: now, targeted: 0 }).where(eq(pushCampaigns.id, id));
      return { targeted: 0, sentNow: 0, later: 0, cappedOut: picked.cappedOut, testing: false };
    }
    const links = c.kind === 'gracias' ? await surveyLinks(c.eventId) : null;
    const urlFor = (s: SubRow) => (links ? links.get(s.emailNorm ?? '') ?? null : null);

    // Prueba A/B: a una muestra (mitad A, mitad B) y el ganador sale al resto más tarde.
    const sorted = [...recipients].sort((a, b) => scramble(a.id) - scramble(b.id));
    const testSize = c.abPercent > 0 && c.titleB ? Math.max(2, Math.ceil((recipients.length * c.abPercent) / 100)) : 0;
    const testing = testSize >= 2 && recipients.length - testSize >= 1;
    const items = (testing ? sorted.slice(0, testSize) : sorted).map((sub, i) => ({ sub, variant: (testing && i % 2 === 1 ? 'B' : 'A') as 'A' | 'B', urlOverride: urlFor(sub) }));
    const q = await queueDeliveries(c, items, now);
    await logAutoSent(c.kind, c.eventId, items.map((i) => i.sub));
    await db.update(pushCampaigns).set(testing ? { status: 'testing', abTestAt: now, targeted: recipients.length } : { status: 'sending', targeted: recipients.length }).where(eq(pushCampaigns.id, id));
    const sentNow = await processDueDeliveries(now, 400, id);
    await finalizeCampaigns();
    return { targeted: recipients.length, sentNow, later: items.length - sentNow, cappedOut: picked.cappedOut, testing };
  } catch (err) {
    await db.update(pushCampaigns).set({ status: 'draft' }).where(eq(pushCampaigns.id, id));
    throw err;
  }
}

/** Pasa a la 2.ª etapa las pruebas A/B que ya esperaron: gana el título más tocado y sale al resto. */
export async function advanceAbTests(now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const tests = await db.select().from(pushCampaigns).where(eq(pushCampaigns.status, 'testing'));
  let advanced = 0;
  for (const c of tests) {
    if (!c.abTestAt || now.getTime() < new Date(c.abTestAt).getTime() + c.abWaitMin * 60_000) continue;
    const rows = await db.select({ variant: pushDeliveries.variant, status: pushDeliveries.status, n: sql<number>`count(*)`, clicks: sql<number>`sum(case when ${pushDeliveries.clickedAt} is null then 0 else 1 end)` })
      .from(pushDeliveries).where(eq(pushDeliveries.campaignId, c.id)).groupBy(pushDeliveries.variant, pushDeliveries.status);
    // Si la prueba todavía tiene envíos en cola (a su mejor hora), se espera.
    if (rows.some((r) => r.status === 'queued')) continue;
    const rate = (v: string) => {
      const sent = Number(rows.find((r) => r.variant === v && r.status === 'sent')?.n ?? 0);
      const clicks = Number(rows.find((r) => r.variant === v && r.status === 'sent')?.clicks ?? 0);
      return sent ? clicks / sent : 0;
    };
    const winner: 'A' | 'B' = rate('B') > rate('A') ? 'B' : 'A';

    const already = new Set((await db.select({ s: pushDeliveries.subscriptionId }).from(pushDeliveries).where(eq(pushDeliveries.campaignId, c.id))).map((r) => r.s));
    const seg = normalizeSegment(c.segment);
    const subs = await activeSubs();
    const picked = selectRecipients(subs, seg, await buildContext(seg, subs), { marketing: kindRule(c.kind).marketing, now });
    const rest = picked.recipients.filter((s) => !already.has(s.id));
    await queueDeliveries(c, rest.map((sub) => ({ sub, variant: winner })), now);
    await db.update(pushCampaigns).set({ status: 'sending', abWinner: winner, targeted: already.size + rest.length }).where(eq(pushCampaigns.id, c.id));
    advanced++;
  }
  return advanced;
}

/** Prueba: a los dispositivos de un email (el del dueño), sin campaña ni tope. */
export async function sendPushTest(email: string, payload: CustomerPushPayload): Promise<{ sent: number; devices: number }> {
  const db = await getDb();
  const key = emailKey(email);
  if (!db || !key) return { sent: 0, devices: 0 };
  if (!ensureConfigured()) throw new Error('Faltan las claves VAPID en el servidor');
  const subs = await db.select().from(customerPushSubscriptions).where(and(eq(customerPushSubscriptions.emailNorm, key), isNull(customerPushSubscriptions.optedOutAt)));
  const r = await sendDirect(subs, { ...payload, c: null }, { names: await namesByEmail([key]) });
  return { sent: r.sent, devices: subs.length };
}

/** Toque en un aviso: marca la entrega y suma a la campaña (una sola vez por entrega). */
export async function recordPushClick(campaignId: number, subscriptionId?: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (subscriptionId) {
    const [res] = await db.update(pushDeliveries).set({ clickedAt: new Date() })
      .where(and(eq(pushDeliveries.campaignId, campaignId), eq(pushDeliveries.subscriptionId, subscriptionId), isNull(pushDeliveries.clickedAt))) as any;
    if (!Number(res?.affectedRows)) return;
  }
  await db.update(pushCampaigns).set({ clicks: sql`${pushCampaigns.clicks} + 1` }).where(eq(pushCampaigns.id, campaignId));
}

/* ── Plantillas y audiencias guardadas ───────────────────────────────────── */

export async function listPresets(kind: 'template' | 'audience') {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushPresets).where(eq(pushPresets.kind, kind)).orderBy(desc(pushPresets.createdAt)).limit(100);
}

export async function savePreset(kind: 'template' | 'audience', name: string, data: unknown): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const clean = kind === 'audience'
    ? normalizeSegment(data)
    : (() => {
        const d = (data ?? {}) as any;
        return { title: clip(String(d.title ?? ''), PUSH_TITLE_MAX), body: clip(String(d.body ?? ''), PUSH_BODY_MAX), url: safePushUrl(d.url), imageUrl: d.imageUrl || null, actions: cleanActions(d.actions) };
      })();
  const [res] = await db.insert(pushPresets).values({ kind, name: name.trim().slice(0, 80), data: clean }) as any;
  return Number(res.insertId);
}

export async function deletePreset(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushPresets).where(eq(pushPresets.id, id));
}

/* ── Avisos que arma el sistema ──────────────────────────────────────────── */

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
      segment: { type: 'combo', include: [], exclude: [] }, kind, eventId,
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
    const names = await namesByEmail(rows.map((o) => o.email.toLowerCase()));
    let sent = 0;
    for (const o of rows) {
      const key = emailKey(o.email);
      if (o.status !== 'pending' || !key) continue;
      const subs = await db.select().from(customerPushSubscriptions)
        .where(and(eq(customerPushSubscriptions.emailNorm, key), isNull(customerPushSubscriptions.optedOutAt)));
      const r = await sendDirect(subs, {
        title: fillPushText(config.abandonedCart.title, { evento: o.eventName }),
        body: fillPushText(config.abandonedCart.body, { evento: o.eventName }),
        url: withUtm(o.slug ? `/checkout/${o.slug}` : '/eventos', null),
      }, { names });
      sent += r.sent;
    }
    return sent;
  } catch (err) {
    console.error('[CustomerPush] Carrito abandonado:', err);
    return 0;
  }
}
