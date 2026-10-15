/**
 * Aviso diario CONTINUO de venta de entradas -- pedido explícito del dueño
 * (15/10): los avisos por tanda (`foundersPromo.ts`, `tanda2Promo.ts`) se
 * apagaban solos al terminar una vuelta de 50 correos/día, porque marcaban a
 * cada destinatario con una etiqueta permanente. Este módulo los reemplaza:
 *
 *  - Sigue al evento destacado desde que sale a la venta hasta el día de la
 *    fiesta, sea cual sea el evento y la tanda en que esté (no hay nada que
 *    activar por evento).
 *  - Cada día manda hasta `SALES_DRIP_DAILY_TARGET` (50) correos a quienes
 *    todavía no compraron. A cada persona le escribe como máximo cada
 *    `salesDripIntervalDays` días (la "espera" se mide sobre `mailingSendLog`,
 *    no con etiquetas), así que cuando termina una vuelta simplemente empieza
 *    la siguiente. Nunca se apaga por falta de audiencia: mañana puede haber
 *    leads nuevos, o alguien cumplió su espera.
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
  countTandaPromoEmailsSentToday, getLastSalesDripByCustomer,
} from './db';
import { sendMailingBatch, type MailingContent } from './mailing';
import { resolveCurrentOffer, type Tanda2Offer } from './tanda2Promo';
import { checkAndAdvanceTandaIfNeeded } from './tandaAutoAdvance';
import { EMAIL_BASE_URL } from './emailLayout';
import { formatChileDate, formatChileTime, startOfChileDay } from '../shared/chileDate';
import { normalizeTandaSchedule, nextPhase, computePhasePrice } from '../shared/tandaSchedule';

/** Cuántos correos de aviso de venta (drip + avisos por tanda) salen como máximo por día. */
export const SALES_DRIP_DAILY_TARGET = Number(process.env.SALES_DRIP_DAILY_CAP) || 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SalesDripRunResult =
  | { ran: false; reason: 'disabled' | 'no-event' | 'event-over' | 'no-price' | 'daily-cap-reached' | 'nobody-due' }
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
    .map((r) => computePhasePrice(Number(r.originalPrice), next.phase.percent))
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

  let subject: string;
  let headline: string;
  let intro: string;
  if (days <= 0) {
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
  if (next) {
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
    highlightLabel: days <= 0 ? 'La fiesta es' : 'Faltan',
    highlightValue: days <= 0 ? 'hoy' : days === 1 ? '1 día' : `${days} días`,
  };
}

type Customer = { id: number; email: string };

/** Quiénes les toca el correo hoy: no han comprado (listCustomers ya deja
 * fuera compradores y bajas) y cumplieron su espera. Primero quienes nunca
 * recibieron uno de este evento, luego el último aviso más antiguo. */
export async function selectDueCustomers(eventId: number, intervalDays: number, now: Date = new Date()) {
  const [eligible, lastByCustomer] = await Promise.all([
    listCustomers({ forMailing: true, notPurchasedEventId: eventId }) as Promise<Customer[]>,
    getLastSalesDripByCustomer(eventId),
  ]);
  const cutoff = now.getTime() - intervalDays * DAY_MS;
  const due = eligible
    .filter((c) => {
      const last = lastByCustomer.get(c.id);
      return !last || last.getTime() <= cutoff;
    })
    .sort((a, b) => (lastByCustomer.get(a.id)?.getTime() ?? 0) - (lastByCustomer.get(b.id)?.getTime() ?? 0));
  return { eligibleCount: eligible.length, due };
}

/** La corrida diaria (`/api/cron/sales-drip`). Nunca se apaga sola. */
export async function runSalesDripDaily(now: Date = new Date()): Promise<SalesDripRunResult> {
  const settings = await getSalesDripSettings();
  if (!settings.enabled) return { ran: false, reason: 'disabled' };

  const event = await getFeaturedEvent();
  if (!event) return { ran: false, reason: 'no-event' };
  if (new Date(event.eventDate).getTime() <= now.getTime()) return { ran: false, reason: 'event-over' };

  // Que el precio del correo sea el vigente aunque nadie haya entrado al sitio.
  await checkAndAdvanceTandaIfNeeded(event.id);
  const fresh = (await getFeaturedEvent()) ?? event;

  const offer = await resolveCurrentOffer(fresh.id);
  if (!offer) return { ran: false, reason: 'no-price' };

  const budget = SALES_DRIP_DAILY_TARGET - (await countTandaPromoEmailsSentToday(now));
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

  const content = buildSalesDripContent(fresh as DripEvent, offer, now);
  const { results } = await sendMailingBatch(
    batch.map((c) => c.id),
    content,
    `${EMAIL_BASE_URL}/checkout/${fresh.slug}`,
    undefined,
    null,
    undefined,
    'sales-drip',
    { priceList: offer.prices, remaining: offer.remaining, eventId: fresh.id },
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
  const base = { enabled: settings.enabled, intervalDays: settings.intervalDays, dailyTarget: SALES_DRIP_DAILY_TARGET };
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
    eventTitle: event.title,
    daysLeft: daysUntilEvent(event.eventDate, now),
    priceFrom: offer?.priceFrom ?? null,
    prices: offer?.prices ?? [],
    remaining: offer?.remaining ?? null,
    audienceSize: due.eligibleCount,
    dueToday: due.due.length,
    sentToday,
  };
}
