/** "¿Quién tiene la app?" -- cada vez que el sitio se abre desde el ícono de
 * inicio (modo app), el teléfono avisa acá (client/src/lib/customerPush.ts).
 * El navegador no informa instalaciones ni desinstalaciones, así que se mide
 * por aperturas: "activa" = la abrió en los últimos N días. El email sale de
 * la última entrada abierta en ese teléfono (resolveEmail de customerPush). */
import { and, desc, gte, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from './db';
import { recordSubscriptionOpen, resolveEmail } from './customerPush';
import { appDevices, customerPushSubscriptions, customers } from '../drizzle/schema';
import { emailKey } from '../shared/blockedMatch';

/** Ventana con la que se considera que alguien "tiene la app". */
export const APP_ACTIVE_DAYS = 60;

export async function recordAppOpen(input: { deviceId: string; platform: 'ios' | 'android' | 'desktop'; ticketCode?: string; endpoint?: string }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const who = input.ticketCode ? await resolveEmail({ ticketCode: input.ticketCode }) : null;
  const link = who ? { email: who.email, emailNorm: emailKey(who.email) || null, orderId: who.orderId } : {};
  await db.insert(appDevices).values({ deviceId: input.deviceId, platform: input.platform, ...link })
    .onDuplicateKeyUpdate({ set: { platform: input.platform, lastSeenAt: new Date(), opens: sql`${appDevices.opens} + 1`, ...link } });
  if (input.endpoint) await recordSubscriptionOpen(input.endpoint);
}

/** Emails con la app abierta en los últimos APP_ACTIVE_DAYS días. Si la tabla
 * todavía no existe (migración pendiente), vacío: nunca rompe Clientes. */
export async function appEmails(days = APP_ACTIVE_DAYS): Promise<Set<string>> {
  try {
    const db = await getDb();
    if (!db) return new Set();
    const rows = await db.selectDistinct({ e: appDevices.emailNorm }).from(appDevices)
      .where(gte(appDevices.lastSeenAt, new Date(Date.now() - days * 86_400_000)));
    return new Set(rows.map((r) => r.e).filter((e): e is string => !!e));
  } catch {
    return new Set();
  }
}

export async function appInstallStats() {
  const db = await getDb();
  const empty = { total: 0, active7: 0, active30: 0, ios: 0, android: 0, desktop: 0, identified: 0, withPush: 0, people: [] as AppPerson[] };
  if (!db) return empty;
  const rows = await db.select().from(appDevices).orderBy(desc(appDevices.lastSeenAt));
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

  return {
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

