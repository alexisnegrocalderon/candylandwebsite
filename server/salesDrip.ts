/**
 * Aviso diario CONTINUO de venta de entradas -- pedido explícito del dueño
 * (15/10): los avisos por tanda (`foundersPromo.ts`, `tanda2Promo.ts`) se
 * apagaban solos al terminar una vuelta de 50 correos/día, porque marcaban a
 * cada destinatario con una etiqueta permanente. Este módulo los reemplaza:
 *
 *  - Sigue al evento destacado desde que sale a la venta hasta el día de la
 *    fiesta, sea cual sea el evento y la tanda en que esté (no hay nada que
 *    activar por evento).
 *  - Cada día manda hasta `dailyDripCap` correos (460 en la 1ª tanda, 100 desde la 2ª) a quienes todavía
 *    no compraron. A cada persona le llegan como MÁXIMO `MAX_EVENT_MAILS_PER_PERSON`
 *    (3) mails de este evento, contando el masivo del lanzamiento como el
 *    primero, y siempre separados por `salesDripIntervalDays` días (se mide
 *    sobre las campañas del evento y `mailingSendLog`). Se turnan: primero
 *    quienes menos mails llevan. Quien llega a 3 no recibe más; si queda
 *    gente con mails pendientes, mañana sigue.
 *  - El correo es una plantilla fija con datos vivos: precio actual de cada
 *    acceso (con el tachado), cupos, próximo precio y cuántos días faltan.
 *    Fecha, lugar y nombre salen del evento en la base, nunca de textos fijos.
 *  - Comparte el tope diario (50) con los avisos antiguos
 *    (`countTandaPromoEmailsSentToday`) para dejar cupo de Resend a las
 *    confirmaciones de compra y al carrito abandonado.
 *
 * ⚠️ Nunca dice "Founders" -- es un nombre interno del admin.
 */
import {
  getFeaturedEvent, listCustomers, getSalesDripSettings, hasApprovedOrderForEvent,
  countTandaPromoEmailsSentToday, getEventMailStatsByCustomer, hasMailingCampaignToday,
} from './db';
import { getMailingEventInfo, SALES_EMAIL_SECTIONS, sendMailingBatch, type MailingContent } from './mailing';
import { getEventPromoFacts } from './eventPromoFacts';
import { tandaLabel } from '../shared/tandaLabel';
import { resolveCurrentOffer, type Tanda2Offer } from './tanda2Promo';
import { checkAndAdvanceTandaIfNeeded } from './tandaAutoAdvance';
import { EMAIL_BASE_URL } from './emailLayout';
import { formatChileDate, formatChileTime, startOfChileDay } from '../shared/chileDate';
import { normalizeTandaSchedule, nextPhase, phasePriceFor } from '../shared/tandaSchedule';
import { MAX_EVENT_MAILS_PER_PERSON, pickDueForRotation, remainingMailsNeeded } from '../shared/mailRotation';

/** Cuántos correos de aviso de venta (drip + avisos por tanda) salen como máximo por día. */
export const SALES_DRIP_CAP_FIRST_TANDA = Number(process.env.SALES_DRIP_CAP_FIRST_TANDA) || 460;
export const SALES_DRIP_CAP_LATER_TANDAS = Number(process.env.SALES_DRIP_CAP_LATER_TANDAS) || 100;

/** Tope diario según la tanda vigente: en la 1ª (precio de lanzamiento) el aviso va más rápido para repartir el 2º
 * mail entre todos antes de que suba el precio; desde la 2ª sigue más despacio, turnando a quienes no han comprado.
 * (`SALES_DRIP_DAILY_CAP` ya no se usa.) */
export function dailyDripCap(tandaPhaseIndex: number): number {
  return tandaPhaseIndex <= 0 ? SALES_DRIP_CAP_FIRST_TANDA : SALES_DRIP_CAP_LATER_TANDAS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type SalesDripRunResult =
  | { ran: false; reason: 'disabled' | 'campaign-today' | 'no-event' | 'event-over' | 'no-price' | 'daily-cap-reached' | 'nobody-due' }
  | { ran: true; eventTitle: string; daysLeft: number; priceFrom: number; dueCount: number; sent: number; failed: number; skipped: number };

type DripEvent = {
  id: number;
  title: string;
  slug: string;
  eventDate: Date | string;
  venue?: string | null;
  tandaPhaseIndex: number;
  tandaDiscountSchedule?: unknown;
};

const formatClp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Días de calendario (hora de Chile) que faltan para la fiesta: 0 = hoy. */
export function daysUntilEvent(eventDate: Date | string, now: Date = new Date()): number {
  return Math.round((startOfChileDay(new Date(eventDate)).getTime() - startOfChileDay(now).getTime()) / DAY_MS);
}

/** Segundo precio que viene después de la tanda actual (el más bajo de los
 * accesos), o null si no hay siguiente fase o no se puede calcular con datos
 * reales. */
export function resolveNextPrice(event: DripEvent, offer: Tanda2Offer): { price: number; untilDate: string } | null {
  const schedule = normalizeTandaSchedule(event.tandaDiscountSchedule);
  const current = schedule[event.tandaPhaseIndex];
  const next = nextPhase(event.tandaPhaseIndex, schedule);
  if (!current?.untilDate || !next) return null;
  const prices = offer.prices
    .filter((r) => r.originalPrice != null && r.originalPrice > 0)
    .map((r) => phasePriceFor(next.phase, r.accesoSlug, Number(r.originalPrice)))
    .filter((p) => p > 0);
  if (prices.length === 0) return null;
  return { price: Math.min(...prices), untilDate: current.untilDate };
}

/** Plantilla fija con datos vivos. El tono cambia según cuánto falta (no
 * suena igual a 30 días que a 2), pero los datos siempre son los de la base. */
export function buildSalesDripContent(event: DripEvent, offer: Tanda2Offer, now: Date = new Date()): MailingContent {
  const days = daysUntilEvent(event.eventDate, now);
  const date = new Date(event.eventDate);
  const when = `${formatChileDate(date, { withWeekday: true })}, ${formatChileTime(date)} hrs`;
  const where = event.venue ? ` en ${event.venue}` : '';
  const from = formatClp(offer.priceFrom);
  const next = resolveNextPrice(event, offer);

  const daysText = days <= 0 ? 'Hoy' : days === 1 ? 'Mañana' : `Faltan ${days} días`;

  // ¿Hoy termina la tanda vigente (precio preventa)? Entonces el aviso lo dice y avisa el precio de las 00:00.
  const current = normalizeTandaSchedule(event.tandaDiscountSchedule)[event.tandaPhaseIndex];
  const lastDay = !!(next && current?.untilDate && startOfChileDay(new Date(current.untilDate)).getTime() === startOfChileDay(now).getTime());

  let subject: string;
  let headline: string;
  let intro: string;
  if (lastDay) {
    subject = `Hoy es el último día del precio preventa de ${event.title}`;
    headline = `Hoy es el último día del precio especial 🕹️`;
    intro = `Hoy termina el precio preventa de ${event.title} (${when}${where}). Desde mañana a las 00:00 sube el precio. Si quieres tu entrada al valor de hoy, este es el momento.`;
  } else if (days <= 0) {
    subject = `Hoy es ${event.title}: todavía hay entradas desde ${from}`;
    headline = `Hoy es la fiesta 🎉`;
    intro = `Hoy es ${event.title} y todavía puedes sumarte. Compra tu entrada online en un minuto y llega directo con tu QR.`;
  } else if (days === 1) {
    subject = `Mañana es ${event.title} · entradas desde ${from}`;
    headline = `Mañana nos vemos 🎉`;
    intro = `Mañana es ${event.title} (${when}${where}) y todavía no tienes tu entrada. Aún alcanzas a comprarla.`;
  } else if (days <= 7) {
    subject = `Faltan ${days} días para ${event.title} · entradas desde ${from}`;
    headline = `Ya casi: faltan ${days} días`;
    intro = `Falta muy poco para ${event.title} (${when}${where}) y vimos que todavía no compraste tu entrada.`;
  } else if (days <= 14) {
    subject = `Faltan ${days} días para ${event.title} · entradas desde ${from}`;
    headline = `Faltan ${days} días 🍬`;
    intro = `Se acerca ${event.title} (${when}${where}) y todavía no tienes tu entrada. Este es el precio de hoy.`;
  } else {
    subject = `${event.title}: entradas desde ${from} (faltan ${days} días)`;
    headline = `Tu entrada para ${event.title}`;
    intro = `Estás en nuestra lista para ${event.title} (${when}${where}) y todavía no compraste tu entrada. Te dejamos el precio de hoy.`;
  }

  const paragraphs = [intro];
  if (next && lastDay) {
    paragraphs.push(`Hoy es el último día de este precio. A las 00:00 sube a ${formatClp(next.price)} (desde) para todos los accesos.`);
  } else if (next) {
    paragraphs.push(
      `Este precio rige hasta el ${formatChileDate(new Date(next.untilDate), { withWeekday: true })}; después sube a ${formatClp(next.price)} (desde).`,
    );
  } else {
    paragraphs.push('Los precios pueden subir cuando se cierre esta etapa de venta, así que conviene asegurar tu lugar.');
  }
  if (offer.remaining != null) {
    paragraphs.push(`Quedan ${offer.remaining} cupos en esta etapa.`);
  }

  return {
    subject: subject.slice(0, 90),
    preheader: `${daysText} · precio de cada acceso hoy, con cupos actualizados.`.slice(0, 140),
    headline: headline.slice(0, 80),
    paragraphs: paragraphs.map((p) => p.slice(0, 500)),
    ctaText: 'Comprar mi entrada',
    highlightLabel: lastDay ? 'Último día' : days <= 0 ? 'La fiesta es' : 'Faltan',
    highlightValue: lastDay ? 'precio preventa' : days <= 0 ? 'hoy' : days === 1 ? '1 día' : `${days} días`,
  };
}

type Customer = { id: number; email: string };

/** Quiénes les toca el correo hoy: no han comprado (listCustomers ya deja
 * fuera compradores y bajas), todavía no llegaron al tope de
 * `MAX_EVENT_MAILS_PER_PERSON` mails de ESTE evento (el masivo del lanzamiento
 * cuenta como el primero) y cumplieron su espera desde el último. Salen primero
 * los que menos mails llevan, luego el último envío más antiguo: así se turnan
 * y a todos les llega el 2º antes de que a alguien le llegue el 3º. */
export async function selectDueCustomers(eventId: number, intervalDays: number, now: Date = new Date()) {
  const [eligible, stats] = await Promise.all([
    listCustomers({ forMailing: true, notPurchasedEventId: eventId }) as Promise<Customer[]>,
    getEventMailStatsByCustomer(eventId),
  ]);
  const due = pickDueForRotation(eligible, stats, { maxPerPerson: MAX_EVENT_MAILS_PER_PERSON, intervalDays, now });
  return { eligibleCount: eligible.length, due, mailsStillNeeded: remainingMailsNeeded(eligible.map((c) => c.id), stats) };
}

/** La corrida diaria (`/api/cron/sales-drip`). Nunca se apaga sola. */
export async function runSalesDripDaily(now: Date = new Date(), opts: { cap?: number } = {}): Promise<SalesDripRunResult> {
  const settings = await getSalesDripSettings();
  if (!settings.enabled) return { ran: false, reason: 'disabled' };
  // Un día con campaña programada (ej. el último día de preventa) el aviso diario se pausa: la campaña ya le escribe
  // a esa misma gente, y dos correos el mismo día queman la lista.
  if (await hasMailingCampaignToday(now)) return { ran: false, reason: 'campaign-today' };

  const event = await getFeaturedEvent();
  if (!event) return { ran: false, reason: 'no-event' };
  if (new Date(event.eventDate).getTime() <= now.getTime()) return { ran: false, reason: 'event-over' };

  // Que el precio del correo sea el vigente aunque nadie haya entrado al sitio.
  await checkAndAdvanceTandaIfNeeded(event.id);
  const fresh = (await getFeaturedEvent()) ?? event;

  const offer = await resolveCurrentOffer(fresh.id);
  if (!offer) return { ran: false, reason: 'no-price' };

  // `opts.cap`: tope de HOY pedido a mano por el admin (para llegar a toda la lista el último día); no cambia el tope normal.
  const cap = opts.cap ?? dailyDripCap(fresh.tandaPhaseIndex);
  const budget = cap - (await countTandaPromoEmailsSentToday(now));
  if (budget <= 0) return { ran: false, reason: 'daily-cap-reached' };

  const { due } = await selectDueCustomers(fresh.id, settings.intervalDays, now);

  // Entre armar la lista y mandar puede haber entrado una compra: se
  // re-verifica uno a uno y se completa con los siguientes hasta el cupo.
  const batch: Customer[] = [];
  let skipped = 0;
  for (const customer of due) {
    if (batch.length >= budget) break;
    if (await hasApprovedOrderForEvent(customer.email, fresh.id)) { skipped++; continue; }
    batch.push(customer);
  }
  if (batch.length === 0) return { ran: false, reason: 'nobody-due' };

  const content = { ...buildSalesDripContent(fresh as DripEvent, offer, now), theme: (await getEventPromoFacts(fresh)).theme };
  const { results } = await sendMailingBatch(
    batch.map((c) => c.id),
    content,
    `${EMAIL_BASE_URL}/checkout/${fresh.slug}`,
    undefined,
    await getMailingEventInfo(),
    SALES_EMAIL_SECTIONS,
    'sales-drip',
    { priceList: offer.prices, remaining: offer.remaining, eventId: fresh.id, tandaLabel: tandaLabel(fresh.tandaPhaseIndex, normalizeTandaSchedule(fresh.tandaDiscountSchedule).length) },
  );

  return {
    ran: true,
    eventTitle: fresh.title,
    daysLeft: daysUntilEvent(fresh.eventDate, now),
    priceFrom: offer.priceFrom,
    dueCount: due.length,
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    skipped,
  };
}

/** Estado en vivo para el panel de admin -- sin mandar nada. */
export async function getSalesDripStatus(now: Date = new Date()) {
  const settings = await getSalesDripSettings();
  const base = { enabled: settings.enabled, intervalDays: settings.intervalDays, dailyTarget: SALES_DRIP_CAP_FIRST_TANDA, maxPerPerson: MAX_EVENT_MAILS_PER_PERSON, mailsStillNeeded: 0 };
  const event = await getFeaturedEvent();
  if (!event || new Date(event.eventDate).getTime() <= now.getTime()) {
    return { ...base, eventTitle: null, daysLeft: null, priceFrom: null, prices: [] as Tanda2Offer['prices'], remaining: null, audienceSize: 0, dueToday: 0, sentToday: 0 };
  }
  const [offer, due, sentToday] = await Promise.all([
    resolveCurrentOffer(event.id),
    selectDueCustomers(event.id, settings.intervalDays, now),
    countTandaPromoEmailsSentToday(now),
  ]);
  return {
    ...base,
    dailyTarget: dailyDripCap(event.tandaPhaseIndex),
    eventTitle: event.title,
    daysLeft: daysUntilEvent(event.eventDate, now),
    priceFrom: offer?.priceFrom ?? null,
    prices: offer?.prices ?? [],
    remaining: offer?.remaining ?? null,
    audienceSize: due.eligibleCount,
    dueToday: due.due.length,
    maxPerPerson: MAX_EVENT_MAILS_PER_PERSON,
    mailsStillNeeded: due.mailsStillNeeded,
    sentToday,
  };
}
