/** Avisos push automáticos a clientes y la cola que los despacha (cron cada 15 min).
 *
 * Cada automático arma una campaña (queda en el historial con sus números) con
 * un segmento y deja que el envío normal haga el resto: tope diario, horas
 * silenciosas, bloqueados y no repetir a la misma persona (server/customerPush.ts).
 * Todos parten APAGADOS y se prenden en Notificaciones push → Automáticos. */
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb, getStockPoolRemaining } from './db';
import {
  advanceAbTests, createPushCampaign, finalizeCampaigns, getCustomerPushConfig, nextEvent, processDueDeliveries, sendPushCampaign,
} from './customerPush';
import { runMemberBenefits } from './members';
import { events, pushAutoLog, pushCampaigns, ticketTypes } from '../drizzle/schema';
import type { PushRule } from '../shared/pushSegments';
import { fillPushText, type CustomerPushConfig } from '../shared/customerPushConfig';
import { chileParts } from '../shared/pushSchedule';
import { isUnlimitedStock } from '../shared/stock';

type Ev = typeof events.$inferSelect;

/** Crea la campaña del automático y la envía. Devuelve a cuántos quedó dirigida. */
async function launch(input: {
  kind: string; title: string; body: string; url: string; include: PushRule[]; exclude?: PushRule[]; event?: Ev | null;
}): Promise<number> {
  const id = await createPushCampaign({
    title: fillPushText(input.title, { evento: input.event?.title }),
    body: fillPushText(input.body, { evento: input.event?.title }),
    url: input.url, kind: input.kind, eventId: input.event?.id ?? null, status: 'scheduled', scheduledAt: new Date(),
    segment: { type: 'combo', include: input.include, exclude: input.exclude ?? [] }, createdBy: 'automático',
  });
  const r = await sendPushCampaign(id);
  return r.targeted;
}

/** Una marca por (tipo, clave): para que un automático "una vez por evento/tanda" no se repita. */
async function claimOnce(kind: string, key: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [seen] = await db.select({ id: pushAutoLog.id }).from(pushAutoLog).where(and(eq(pushAutoLog.kind, `camp_${kind}`), eq(pushAutoLog.subjectKey, key))).limit(1);
  if (seen) return false;
  await db.insert(pushAutoLog).values({ kind: `camp_${kind}`, subjectKey: key });
  return true;
}

const evUrl = (ev: Ev) => `/eventos/${ev.slug}`;

/** Recordatorio del día del evento, a quienes tienen entrada: una vez por evento. */
async function runEventReminder(config: CustomerPushConfig, now: Date): Promise<string | null> {
  const rule = config.eventReminder;
  if (!rule.enabled) return null;
  const db = await getDb();
  if (!db) return null;
  const today = chileParts(now);
  if (today.hour < rule.hour) return null;
  const upcoming = await db.select().from(events)
    .where(and(inArray(events.status, ['published', 'soldout']), gte(events.eventDate, new Date(now.getTime() - 12 * 3_600_000)), lte(events.eventDate, new Date(now.getTime() + 36 * 3_600_000))));
  const ev = upcoming.find((e) => chileParts(new Date(e.eventDate)).day === today.day);
  if (!ev) return null;
  const [already] = await db.select({ id: pushCampaigns.id }).from(pushCampaigns).where(and(eq(pushCampaigns.kind, 'recordatorio'), eq(pushCampaigns.eventId, ev.id))).limit(1);
  if (already) return null;
  const n = await launch({ kind: 'recordatorio', title: rule.title, body: rule.body, url: '/mi-entrada', include: [{ type: 'event', eventId: ev.id }], event: ev });
  return `recordatorio ${ev.title}: ${n}`;
}

/** Cumpleaños: cada persona una vez al año, a quien cumple hoy. */
async function runBirthday(config: CustomerPushConfig, now: Date): Promise<string | null> {
  const rule = config.birthday;
  if (!rule.enabled || chileParts(now).hour < 10) return null;
  const db = await getDb();
  if (!db) return null;
  const day = chileParts(now).day;
  if (!(await claimOnce('cumpleanos', day))) return null;
  const n = await launch({ kind: 'cumpleanos', title: rule.title, body: rule.body, url: '/beneficios-cumpleaneros', include: [{ type: 'birthdayToday' }] });
  return `cumpleaños: ${n}`;
}

/** Pocos cupos: cuando alguna tanda del próximo evento baja del umbral, a quienes aún no tienen entrada. */
async function runLowStock(config: CustomerPushConfig): Promise<string | null> {
  const rule = config.lowStock;
  if (!rule.enabled) return null;
  const db = await getDb();
  const ev = await nextEvent();
  if (!db || !ev) return null;
  const types = await db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, ev.id), eq(ticketTypes.category, 'acceso'), eq(ticketTypes.status, 'active')));
  const low: number[] = [];
  const checkedPools = new Set<number>();
  for (const t of types) {
    if (isUnlimitedStock(t.totalStock)) continue;
    let remaining = t.totalStock - t.soldCount;
    if (t.stockPoolId) {
      if (checkedPools.has(t.stockPoolId)) continue;
      checkedPools.add(t.stockPoolId);
      remaining = (await getStockPoolRemaining(t.stockPoolId))?.remaining ?? remaining;
    }
    if (remaining > 0 && remaining <= rule.threshold) low.push(t.id);
  }
  if (low.length === 0) return null;
  // Una vez por tanda: la marca es el menor id de las filas bajas (cambia al abrir la tanda siguiente).
  if (!(await claimOnce('pocos_cupos', `${ev.id}:${Math.min(...low)}`))) return null;
  const n = await launch({ kind: 'pocos_cupos', title: rule.title, body: rule.body, url: evUrl(ev), include: [{ type: 'nextEventNoTicket' }], event: ev });
  return `pocos cupos ${ev.title}: ${n}`;
}

/** Gracias + encuesta: al día siguiente del evento, a quienes fueron. */
async function runThanks(config: CustomerPushConfig, now: Date): Promise<string | null> {
  const rule = config.thanks;
  const db = await getDb();
  if (!rule.enabled || !db) return null;
  const today = chileParts(now);
  if (today.hour < rule.hour) return null;
  const recent = await db.select().from(events)
    .where(and(inArray(events.status, ['published', 'soldout', 'past']), gte(events.eventDate, new Date(now.getTime() - 60 * 3_600_000)), lte(events.eventDate, now)));
  const out: string[] = [];
  for (const ev of recent) {
    const evDay = new Date(`${chileParts(new Date(ev.eventDate)).day}T00:00:00Z`).getTime() + 86_400_000;
    if (new Date(`${today.day}T00:00:00Z`).getTime() !== evDay) continue;
    if (!(await claimOnce('gracias', String(ev.id)))) continue;
    out.push(`gracias ${ev.title}: ${await launch({ kind: 'gracias', title: rule.title, body: rule.body, url: '/', include: [{ type: 'attended', eventId: ev.id }], event: ev })}`);
  }
  return out.length ? out.join('; ') : null;
}

/** Reactivación: compraron alguna vez, llevan N días sin comprar y hay un evento por venir. */
async function runWinback(config: CustomerPushConfig, now: Date): Promise<string | null> {
  const rule = config.winback;
  if (!rule.enabled || chileParts(now).hour < 11) return null;
  const ev = await nextEvent();
  if (!ev || !(await claimOnce('reactivacion', chileParts(now).day))) return null;
  const n = await launch({
    kind: 'reactivacion', title: rule.title, body: rule.body, url: evUrl(ev), event: ev,
    include: [{ type: 'dormant', days: rule.days }], exclude: [{ type: 'nextEvent' }],
  });
  return `reactivación: ${n}`;
}

/** Saldo PlayCard sin gastar a ≤3 días del evento. */
async function runBalance(config: CustomerPushConfig, now: Date): Promise<string | null> {
  const rule = config.balance;
  if (!rule.enabled || chileParts(now).hour < 12) return null;
  const ev = await nextEvent();
  if (!ev) return null;
  const days = (new Date(`${chileParts(new Date(ev.eventDate)).day}T00:00:00Z`).getTime() - new Date(`${chileParts(now).day}T00:00:00Z`).getTime()) / 86_400_000;
  if (days < 0 || days > 3) return null;
  if (!(await claimOnce('saldo', `${ev.id}:${chileParts(now).day}`))) return null;
  const n = await launch({ kind: 'saldo', title: rule.title, body: rule.body, url: '/mi-entrada', include: [{ type: 'hasBalance' }], event: ev });
  return `saldo: ${n}`;
}

/** Cupones de socios (nivel del mes y cumpleaños): una vez al día desde las 10:00, con aviso a quien tiene las notificaciones. */
async function runMembers(now: Date): Promise<string | null> {
  if (chileParts(now).hour < 10 || !(await claimOnce('socios', chileParts(now).day))) return null;
  const r = await runMemberBenefits(now);
  return r.granted > 0 ? `cupones de socios: ${r.granted} (${r.notified} avisados)` : null;
}

/** Cron cada 15 min: campañas programadas que ya tocan, pruebas A/B, entregas en cola y automáticos (1 vez por hora). */
export async function runPushQueue(now = new Date()): Promise<{ campaigns: number; delivered: number; abAdvanced: number; automatic: string[]; errors: string[] }> {
  const db = await getDb();
  if (!db) return { campaigns: 0, delivered: 0, abAdvanced: 0, automatic: [], errors: ['Database not available'] };
  const errors: string[] = [];
  const automatic: string[] = [];
  let campaigns = 0;

  const due = await db.select({ id: pushCampaigns.id }).from(pushCampaigns).where(and(eq(pushCampaigns.status, 'scheduled'), lte(pushCampaigns.scheduledAt, now)));
  for (const c of due) {
    try { await sendPushCampaign(c.id, now); campaigns++; } catch (err) { errors.push(`#${c.id}: ${err instanceof Error ? err.message : 'error'}`); }
  }

  let abAdvanced = 0;
  try { abAdvanced = await advanceAbTests(now); } catch (err) { errors.push(`A/B: ${err instanceof Error ? err.message : 'error'}`); }

  // Las automáticas se revisan en la primera vuelta de cada hora (el cron corre cada 15 min).
  if (now.getUTCMinutes() < 15) {
    try {
      const config = await getCustomerPushConfig();
      const runners: [string, () => Promise<string | null>][] = [
        ['recordatorio', () => runEventReminder(config, now)], ['cumpleaños', () => runBirthday(config, now)], ['pocos cupos', () => runLowStock(config)],
        ['gracias', () => runThanks(config, now)], ['reactivación', () => runWinback(config, now)], ['saldo', () => runBalance(config, now)],
        ['socios', () => runMembers(now)],
      ];
      for (const [name, run] of runners) {
        try { const r = await run(); if (r) automatic.push(r); } catch (err) { errors.push(`${name}: ${err instanceof Error ? err.message : 'error'}`); }
      }
    } catch (err) {
      errors.push(`automáticos: ${err instanceof Error ? err.message : 'error'}`);
    }
  }

  let delivered = 0;
  try {
    // Hasta ~2.400 por corrida (4 tandas de 600): las campañas grandes con "mejor hora" se reparten en el día.
    for (let i = 0; i < 4; i++) {
      const n = await processDueDeliveries(now, 600);
      delivered += n;
      if (n < 600) break;
    }
    await finalizeCampaigns();
  } catch (err) {
    errors.push(`cola: ${err instanceof Error ? err.message : 'error'}`);
  }
  return { campaigns, delivered, abAdvanced, automatic, errors };
}
