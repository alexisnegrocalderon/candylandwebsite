/** "¿Quién tiene la app?" -- cada vez que el sitio se abre desde el ícono de
 * inicio (modo app), el teléfono avisa acá (client/src/lib/customerPush.ts).
 * El navegador no informa instalaciones ni desinstalaciones, así que se mide
 * por aperturas: "activa" = la abrió en los últimos N días. El email sale de
 * la última entrada abierta en ese teléfono (resolveEmail de customerPush). */
import { and, desc, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from './db';
import { recordSubscriptionOpen, resolveEmail } from './customerPush';
import { appDevices, customerPushSubscriptions, customers } from '../drizzle/schema';
import { emailKey } from '../shared/blockedMatch';
import { ALIAS_TAG_PREFIX } from '../shared/customerMerge';

/** Ventana con la que se considera que alguien "tiene la app". */
export const APP_ACTIVE_DAYS = 60;

/** Correos que se unieron a otra ficha (Clientes → Unir): alias → correo de la ficha principal. */
export async function aliasMap(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const db = await getDb();
    if (!db) return out;
    const rows = await db.select({ email: customers.email, tags: customers.tags }).from(customers).where(sql`${customers.tags} LIKE ${`%${ALIAS_TAG_PREFIX}%`}`);
    for (const r of rows) {
      let tags: unknown = r.tags;
      if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = []; } }
      for (const t of Array.isArray(tags) ? tags : []) {
        if (typeof t === 'string' && t.startsWith(ALIAS_TAG_PREFIX)) out.set(t.slice(ALIAS_TAG_PREFIX.length).toLowerCase(), r.email.toLowerCase());
      }
    }
  } catch { /* sin etiquetas: no hay alias */ }
  return out;
}

export async function recordAppOpen(input: { deviceId: string; platform: 'ios' | 'android' | 'desktop'; ticketCode?: string; endpoint?: string; memberEmail?: string | null }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const aliases = await aliasMap();
  const canon = (e: string) => aliases.get(emailKey(e)) ?? emailKey(e);
  const who = input.ticketCode ? await resolveEmail({ ticketCode: input.ticketCode }) : null;
  // La cuenta con la que entró a «Mi cuenta» en ese teléfono también lo identifica (sin necesidad de abrir una entrada).
  const memberKey = input.memberEmail ? canon(input.memberEmail) : '';
  const link = who ? { email: canon(who.email), emailNorm: canon(who.email) || null, orderId: who.orderId }
    : memberKey ? { email: memberKey, emailNorm: memberKey } : {};
  await db.insert(appDevices).values({ deviceId: input.deviceId, platform: input.platform, ...link })
    .onDuplicateKeyUpdate({ set: { platform: input.platform, lastSeenAt: new Date(), opens: sql`${appDevices.opens} + 1`, ...link } });
  if (input.endpoint) await recordSubscriptionOpen(input.endpoint);
}

/** Emails con la app instalada O con cuenta en «Mi cuenta»: lo que significa «Tiene la app» en el panel. */
export async function appUserEmails(): Promise<Set<string>> {
  const out = await appEmails();
  try {
    const db = await getDb();
    if (!db) return out;
    const rows = await db.select({ e: customers.email }).from(customers).where(isNotNull(customers.memberSince));
    for (const r of rows) if (r.e) out.add(r.e.toLowerCase());
  } catch { /* sin tabla: se queda con lo que hay */ }
  return out;
}

/** Emails con la app abierta en los últimos APP_ACTIVE_DAYS días. Si la tabla
 * todavía no existe (migración pendiente), vacío: nunca rompe Clientes. */
export async function appEmails(days = APP_ACTIVE_DAYS): Promise<Set<string>> {
  try {
    const db = await getDb();
    if (!db) return new Set();
    const [rows, aliases] = await Promise.all([
      db.selectDistinct({ e: appDevices.emailNorm }).from(appDevices).where(gte(appDevices.lastSeenAt, new Date(Date.now() - days * 86_400_000))),
      aliasMap(),
    ]);
    return new Set(rows.map((r) => r.e).filter((e): e is string => !!e).map((e) => aliases.get(e) ?? e));
  } catch {
    return new Set();
  }
}

export async function appInstallStats() {
  const db = await getDb();
  const empty = { accounts: [] as AppAccount[], totalAccounts: 0, total: 0, active7: 0, active30: 0, ios: 0, android: 0, desktop: 0, identified: 0, withPush: 0, people: [] as AppPerson[] };
  if (!db) return empty;
  const aliases = await aliasMap();
  // Un teléfono ligado a un correo que después se unió a otra ficha se muestra con el correo de la ficha principal.
  const rows = (await db.select().from(appDevices).orderBy(desc(appDevices.lastSeenAt)))
    .map((r) => (r.emailNorm && aliases.has(r.emailNorm) ? { ...r, emailNorm: aliases.get(r.emailNorm)!, email: aliases.get(r.emailNorm)! } : r));
  const now = Date.now();
  const since = (d: number) => rows.filter((r) => now - new Date(r.lastSeenAt).getTime() <= d * 86_400_000);
  const active = since(APP_ACTIVE_DAYS);

  // Una persona puede tener la app en más de un teléfono: se agrupa por email.
  const byEmail = new Map<string, typeof rows>();
  for (const r of active) if (r.emailNorm) byEmail.set(r.emailNorm, [...(byEmail.get(r.emailNorm) ?? []), r]);
  const emails = Array.from(byEmail.keys());
  const [names, live] = emails.length ? await Promise.all([
    db.select({ email: customers.email, fullName: customers.fullName, id: customers.id }).from(customers).where(inArray(customers.email, emails)),
    db.selectDistinct({ e: customerPushSubscriptions.emailNorm }).from(customerPushSubscriptions)
      .where(and(inArray(customerPushSubscriptions.emailNorm, emails), isNull(customerPushSubscriptions.optedOutAt))),
  ]) : [[], []];
  const nameOf = new Map(names.map((n) => [n.email.toLowerCase(), n]));
  const activePush = new Set(live.map((r) => r.e));

  const people: AppPerson[] = emails.map((e) => {
    const devs = byEmail.get(e)!;
    const c = nameOf.get(e);
    return {
      email: devs[0].email ?? e,
      name: c?.fullName ?? null,
      customerId: c?.id ?? null,
      devices: devs.length,
      platforms: Array.from(new Set(devs.map((d) => d.platform))),
      opens: devs.reduce((s, d) => s + d.opens, 0),
      firstSeenAt: devs.reduce((m, d) => (new Date(d.firstSeenAt) < m ? new Date(d.firstSeenAt) : m), new Date(devs[0].firstSeenAt)),
      lastSeenAt: new Date(devs[0].lastSeenAt),
      push: activePush.has(e),
    };
  });

  // Quienes ya tienen cuenta en la app (entraron a «Mi cuenta») aunque ese teléfono no se haya identificado.
  const identified = new Set(people.map((p) => p.email.toLowerCase()));
  const accountRows = await db.select({ id: customers.id, email: customers.email, fullName: customers.fullName, memberSince: customers.memberSince })
    .from(customers).where(isNotNull(customers.memberSince)).orderBy(desc(customers.memberSince));
  const accounts: AppAccount[] = accountRows.filter((r) => !identified.has(r.email.toLowerCase()))
    .map((r) => ({ customerId: r.id, email: r.email, name: r.fullName, memberSince: r.memberSince! }));

  return {
    accounts,
    totalAccounts: accountRows.length,
    total: rows.length,
    active7: since(7).length,
    active30: since(30).length,
    ios: active.filter((r) => r.platform === 'ios').length,
    android: active.filter((r) => r.platform === 'android').length,
    desktop: active.filter((r) => r.platform === 'desktop').length,
    identified: people.length,
    withPush: people.filter((p) => p.push).length,
    people,
  };
}

export interface AppAccount { customerId: number; email: string; name: string | null; memberSince: Date }

export interface AppPerson {
  email: string;
  name: string | null;
  customerId: number | null;
  devices: number;
  platforms: string[];
  opens: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  push: boolean;
}

