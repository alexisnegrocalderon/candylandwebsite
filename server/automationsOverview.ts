/* «Automáticos» de Mailing (shared/automations.ts): todo lo que se manda solo a las personas, en una sola lista, para
 * saber qué está prendido, cuándo sale, a quién, con qué reglas y qué pasó la última vez. Solo lee: no manda nada. */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { crossChecks, eventPilots, mailingSendLog } from "../drizzle/schema";
import { countAutomatedEmailsSentToday, getDb, getEventById, getSurveyOverview, listAutoSurveyEventIds } from "./db";
import { crossCheckDb, getCrossCheckConfig } from "./crossCheck";
import { AUTOMATED_EMAIL_DAILY_CAP } from "./mailing";
import { getFoundersPromoStatus } from "./foundersPromo";
import { getTanda2PromoStatus } from "./tanda2Promo";
import { getSalesDripStatus } from "./salesDrip";
import { getOrdersDueForAbandonedCartReminder } from "./orderReminders";
import { getProgramConfig } from "./ambassadorProgram";
import { getPilotStatus } from "./eventPilot";
import { startOfChileDay, formatChileDateTime } from "../shared/chileDate";
import { CROSS_CHECK_LABELS, describeRunResult, type CrossCheckAutomation } from "../shared/crossCheck";
import { chileTimeOfUtc, weekdayName, type AutomationItem, type AutomationLastRun, type AutomationsOverview } from "../shared/automations";

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Cada lectura falla por separado: una tabla que todavía no existe no esconde las demás automatizaciones. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (err) { console.error('[Automáticos]', err instanceof Error ? err.message : err); return fallback; }
}

/** Qué pasó la última vez que cada automatización pasó por cross check. */
async function lastRuns(): Promise<Map<string, AutomationLastRun>> {
  const out = new Map<string, AutomationLastRun>();
  const db = await crossCheckDb();
  const rows = await db.select().from(crossChecks)
    .where(and(inArray(crossChecks.status, ['done', 'failed', 'expired', 'discarded']))).orderBy(desc(crossChecks.decidedAt)).limit(200);
  for (const r of rows) {
    if (out.has(r.kind)) continue;
    out.set(r.kind, {
      at: new Date(r.decidedAt ?? r.createdAt).toISOString(),
      status: r.status as AutomationLastRun['status'],
      result: r.result ?? (r.status === 'expired' ? 'Venció sin reportar' : r.status === 'discarded' ? 'Descartado' : 'Listo'),
    });
  }
  return out;
}

/** Lo enviado hoy y el último envío de cada aviso de venta (el que sale solo, sin cross check, queda en este registro). */
async function sendStats(now: Date): Promise<{ today: Map<string, number>; last: Map<string, AutomationLastRun> }> {
  const db = await getDb();
  const today = new Map<string, number>();
  const last = new Map<string, AutomationLastRun>();
  if (!db) return { today, last };
  const t = await db.select({ source: mailingSendLog.source, n: sql<number>`COALESCE(SUM(${mailingSendLog.success}), 0)` })
    .from(mailingSendLog).where(gte(mailingSendLog.sentAt, startOfChileDay(now))).groupBy(mailingSendLog.source);
  for (const r of t) today.set(r.source, Number(r.n));
  const l = await db.select({
    source: mailingSendLog.source, label: mailingSendLog.label, at: sql<Date>`MAX(${mailingSendLog.sentAt})`,
    sent: sql<number>`COALESCE(SUM(${mailingSendLog.success}), 0)`, total: sql<number>`COUNT(*)`,
  }).from(mailingSendLog).groupBy(mailingSendLog.source, mailingSendLog.batchId, mailingSendLog.label)
    .orderBy(desc(sql`MAX(${mailingSendLog.sentAt})`)).limit(40);
  for (const r of l) {
    if (last.has(r.source)) continue;
    const failed = Number(r.total) - Number(r.sent);
    last.set(r.source, { at: new Date(r.at).toISOString(), status: 'done', result: `«${r.label}»: ${r.sent} enviado${Number(r.sent) === 1 ? '' : 's'}${failed ? `, ${failed} con error` : ''}` });
  }
  return { today, last };
}

export async function getAutomationsOverview(now: Date = new Date()): Promise<AutomationsOverview> {
  const [config, runs, stats, automatedToday] = await Promise.all([
    safe(getCrossCheckConfig, null), safe(lastRuns, new Map<string, AutomationLastRun>()),
    safe(() => sendStats(now), { today: new Map<string, number>(), last: new Map<string, AutomationLastRun>() }),
    safe(() => countAutomatedEmailsSentToday(now), 0),
  ]);
  const stateOf = (kind: CrossCheckAutomation, enabled: boolean): AutomationItem['state'] => (!enabled ? 'off' : config && !config[kind].auto ? 'cross-check' : config ? 'auto' : 'cross-check');
  const newest = (a: AutomationLastRun | null | undefined, b: AutomationLastRun | null | undefined) => (!a ? b ?? null : !b ? a : new Date(a.at) >= new Date(b.at) ? a : b);
  const items: AutomationItem[] = [];

  // Avisos de venta (correo diario a quienes no han comprado).
  const founders = await safe(getFoundersPromoStatus, null);
  items.push({
    key: 'founders-promo', title: CROSS_CHECK_LABELS['founders-promo'].title,
    what: `Correo «quedan pocos cupos de la 1ª tanda»${founders?.eventTitle ? ` de ${founders.eventTitle}` : ''}${founders?.remaining != null ? `. Quedan ${founders.remaining} cupos` : ''}.`,
    when: `Todos los días, ${chileTimeOfUtc(14, 0, now)} (hora de Chile)`,
    how: `Hasta ${founders?.dailyTarget ?? 50} correos al día a quienes no han comprado. Cada persona lo recibe una sola vez. Se apaga solo cuando se acaban los cupos.`,
    state: stateOf('founders-promo', !!founders?.enabled), enabled: !!founders?.enabled, crossCheckKind: 'founders-promo',
    audience: founders?.audienceSize ?? null, sentToday: stats.today.get('founders-promo') ?? 0,
    lastRun: newest(runs.get('founders-promo'), stats.last.get('founders-promo')), section: null, enableKey: 'foundersPromoEnabled', upcoming: [],
  });
  const tanda2 = await safe(getTanda2PromoStatus, null);
  items.push({
    key: 'tanda2-promo', title: CROSS_CHECK_LABELS['tanda2-promo'].title,
    what: `Correo con el precio de la 2ª tanda${tanda2?.eventTitle ? ` de ${tanda2.eventTitle}` : ''}${tanda2?.priceFrom ? `, desde ${clp(tanda2.priceFrom)}` : ''}.`,
    when: `Todos los días, ${chileTimeOfUtc(15, 0, now)} (hora de Chile)`,
    how: `Hasta ${tanda2?.dailyTarget ?? 50} correos al día a quienes no han comprado; comparte tope con el aviso de primeros cupos.`,
    state: stateOf('tanda2-promo', !!tanda2?.enabled), enabled: !!tanda2?.enabled, crossCheckKind: 'tanda2-promo',
    audience: tanda2?.audienceSize ?? null, sentToday: stats.today.get('tanda2-promo') ?? 0,
    lastRun: newest(runs.get('tanda2-promo'), stats.last.get('tanda2-promo')), section: null, enableKey: 'tanda2PromoEnabled', upcoming: [],
  });
  const drip = await safe(() => getSalesDripStatus(now), null);
  items.push({
    key: 'sales-drip', title: CROSS_CHECK_LABELS['sales-drip'].title,
    what: `Correo de venta del próximo evento${drip?.eventTitle ? ` (${drip.eventTitle}${drip.daysLeft != null ? `, faltan ${drip.daysLeft} días` : ''})` : ''}${drip?.priceFrom ? `, desde ${clp(drip.priceFrom)}` : ''}.`,
    when: `Todos los días, ${chileTimeOfUtc(14, 20, now)} (hora de Chile)`,
    how: `Hasta ${drip?.dailyTarget ?? 50} correos al día a quienes no han comprado, esperando ${drip?.intervalDays ?? 4} días entre correos a la misma persona (máximo ${drip?.maxPerPerson ?? '—'} por evento). Se pausa el día que hay una campaña programada.`,
    state: stateOf('sales-drip', !!drip?.enabled), enabled: !!drip?.enabled, crossCheckKind: 'sales-drip',
    audience: drip?.dueToday ?? null, sentToday: stats.today.get('sales-drip') ?? 0,
    lastRun: newest(runs.get('sales-drip'), stats.last.get('sales-drip')), section: null, enableKey: 'salesDripEnabled', upcoming: [],
  });

  // Carritos abandonados (siempre prendido: lo configuras en el pedido).
  const due = await safe(async () => (await getOrdersDueForAbandonedCartReminder()).length, null);
  items.push({
    key: 'abandoned-cart', title: CROSS_CHECK_LABELS['abandoned-cart'].title,
    what: 'Recordatorio amable por correo, y push a quien tiene la app, a quien empezó a comprar y no pagó.',
    when: 'Se revisa cada hora',
    how: `Una vez por pedido. Comparte el cupo diario de correos automáticos (${AUTOMATED_EMAIL_DAILY_CAP}) con el mailing y las encuestas, y deja siempre cupo para las confirmaciones de compra.`,
    state: stateOf('abandoned-cart', true), enabled: true, crossCheckKind: 'abandoned-cart',
    audience: due, sentToday: null, lastRun: runs.get('abandoned-cart') ?? null, section: null, enableKey: null, upcoming: [],
  });

  // Correo semanal a embajadores.
  const program = await safe(getProgramConfig, null);
  items.push({
    key: 'ambassador-weekly', title: CROSS_CHECK_LABELS['ambassador-weekly'].title,
    what: 'Resumen de la semana con su material y sus links del evento destacado.',
    when: program ? `Cada ${weekdayName(program.weeklyEmailWeekday)} a las ${String(program.weeklyEmailHourChile).padStart(2, '0')}:00 (hora de Chile)` : 'Una vez por semana',
    how: 'Les llega a los embajadores VIP activos. Se configura en Embajadores VIP.',
    state: stateOf('ambassador-weekly', !!program?.weeklyEmailEnabled), enabled: !!program?.weeklyEmailEnabled, crossCheckKind: 'ambassador-weekly',
    audience: null, sentToday: null, lastRun: runs.get('ambassador-weekly') ?? null, section: 'ambassadors', enableKey: null, upcoming: [],
  });

  // Encuestas post-fiesta: una línea por fiesta con envío automático.
  const surveyEvents = await safe(async () => {
    const ids = await listAutoSurveyEventIds();
    const list: string[] = [];
    for (const id of ids) {
      const ev = await getEventById(id);
      if (!ev || ev.status === 'cancelled' || ev.status === 'draft') continue;
      const o = await getSurveyOverview(id);
      list.push(`${ev.title}: ${o.sent} enviadas, ${o.pending} por mandar, ${o.responses.length} respuestas`);
    }
    return list;
  }, [] as string[]);
  items.push({
    key: 'survey', title: CROSS_CHECK_LABELS.survey.title,
    what: 'Correo con la encuesta «¿Cómo estuvo?» a quienes fueron a la fiesta.',
    when: 'Entre 12:00 y 20:00 (hora de Chile), desde el día siguiente a la fiesta',
    how: 'Solo en las fiestas que tienen el envío automático prendido (se activa en Encuestas, dentro de Cierre). Cada persona la recibe una vez, hasta el cupo de correos del día.',
    state: stateOf('survey', surveyEvents.length > 0), enabled: surveyEvents.length > 0, crossCheckKind: 'survey',
    audience: null, sentToday: null, lastRun: runs.get('survey') ?? null, section: 'event-survey', enableKey: null, upcoming: surveyEvents,
  });

  // Piloto de cada evento prendido: sus próximos pasos.
  const piloted = await safe(async () => {
    const db = await crossCheckDb();
    const on = await db.select().from(eventPilots).where(eq(eventPilots.status, 'on'));
    const lines: string[] = [];
    for (const p of on) {
      const ev = await getEventById(p.eventId);
      const st = await getPilotStatus(p.eventId);
      for (const s of st.steps) if (s.state === 'futuro' || s.state === 'esperando') lines.push(`${ev?.title ?? 'Evento'} · ${s.title} — ${s.state === 'esperando' ? 'esperando tu cross check' : formatChileDateTime(s.at)}`);
    }
    return lines;
  }, [] as string[]);
  items.push({
    key: 'pilot', title: 'Piloto automático del evento',
    what: 'Anuncio en la app, aviso diario de venta, lista de compras de la barra, recordatorio del día y encuesta.',
    when: 'Cada paso a su hora, según la fecha del evento',
    how: 'Cada paso pide su propio cross check. Se prende por evento en Preparar → Piloto automático.',
    state: piloted.length > 0 ? 'cross-check' : 'off', enabled: piloted.length > 0, crossCheckKind: null,
    audience: null, sentToday: null, lastRun: null, section: 'piloto', enableKey: null, upcoming: piloted,
  });

  return { dailyCap: { sent: automatedToday, cap: AUTOMATED_EMAIL_DAILY_CAP }, items };
}
