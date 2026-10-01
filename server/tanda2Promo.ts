/**
 * Aviso automático diario de la 2ª tanda de venta (nuevo precio) -- pedido
 * explícito del dueño (01/10): ~50 correos/día a TODOS los clientes/leads que
 * todavía no compraron el evento destacado, avisándoles del nuevo precio.
 * Copia el patrón de `server/foundersPromo.ts` (1ª tanda): interruptor manual
 * en el admin, cron propio y envío directo con `sendMailingBatch`.
 *
 * Diferencias con la 1ª tanda:
 *  - La audiencia incluye a quienes ya recibieron el aviso de la 1ª tanda (el
 *    precio cambió, tiene sentido recontactarlos) -- solo se excluye a los
 *    que compraron y a quienes ya recibieron ESTE aviso (`TANDA2_PROMO_TAG`).
 *  - Solo corre mientras el evento está en la 2ª fase de la escala
 *    (`tandaPhaseIndex === 1`). Si todavía está en la 1ª no manda nada; si ya
 *    pasó a la 3ª se apaga solo.
 *  - El tope diario (50) es COMPARTIDO con la 1ª tanda y se cuenta sobre
 *    `mailingSendLog` (`countTandaPromoEmailsSentToday`): así ni dos avisos
 *    prendidos a la vez ni repetir "Mandar ahora" pueden pasar de 50 -- el
 *    resto de los ~100 diarios de Resend queda libre para confirmaciones de
 *    compra, carrito abandonado y otros correos.
 *
 * ⚠️ Nunca dice "Founders" -- es un nombre interno del admin.
 */
import { eq, and, asc } from 'drizzle-orm';
import {
  getDb, getFeaturedEvent, listCustomers, getSiteSettings, updateSiteSettings,
  hasApprovedOrderForEvent, countTandaPromoEmailsSentToday, getStockPoolRemaining,
} from './db';
import type { MailingPriceRow } from './email';
import { ticketTypes } from '../drizzle/schema';
import { sendMailingBatch, type MailingContent } from './mailing';
import { EMAIL_BASE_URL } from './emailLayout';
import { EVENT_BRAND } from '../shared/eventBrand';

/** Tag interna para no repetirle este aviso a quien ya lo recibió -- nunca
 * viaja al correo, solo vive en `customers.tags`. */
export const TANDA2_PROMO_TAG = 'promo-2da-tanda';

/** Índice (0-based) de la fase de la escala que corresponde a la 2ª tanda. */
export const TANDA2_PHASE_INDEX = 1;

/** Cuántos correos de aviso de tanda (1ª + 2ª juntos) salen como máximo por día. */
export const TANDA2_PROMO_DAILY_TARGET = Number(process.env.TANDA2_PROMO_DAILY_CAP) || 50;

export type Tanda2PromoRunResult =
  | { ran: false; reason: 'disabled' | 'no-event' | 'wrong-phase' | 'phase-ended' | 'no-price' | 'audience-exhausted' | 'daily-cap-reached' }
  | { ran: true; eventTitle: string; priceFrom: number; audienceSize: number; sent: number; failed: number; skipped: number };

const formatClp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export type Tanda2Offer = { prices: MailingPriceRow[]; priceFrom: number; remaining: number | null };

/** Lo que se ofrece HOY: el precio de CADA acceso activo (cada uno con su
 * precio general tachado, igual que la tarjeta del sitio) y, si todos
 * comparten un único cupo, cuántos quedan (mismo criterio que
 * `foundersPromo.ts`). Null si no hay accesos activos con precio. */
export async function resolveTanda2Offer(eventId: number): Promise<Tanda2Offer | null> {
  const db = await getDb();
  if (!db) return null;
  const activos = await db.select().from(ticketTypes).where(and(
    eq(ticketTypes.eventId, eventId),
    eq(ticketTypes.category, 'acceso'),
    eq(ticketTypes.status, 'active'),
  )).orderBy(asc(ticketTypes.sortOrder));

  const prices: MailingPriceRow[] = activos
    .map((a) => ({
      label: a.name,
      price: Number(a.price),
      originalPrice: a.originalPrice != null ? Number(a.originalPrice) : null,
    }))
    .filter((r) => Number.isFinite(r.price) && r.price > 0);
  if (prices.length === 0) return null;

  let remaining: number | null = null;
  const poolIds = Array.from(new Set(activos.map((a) => a.stockPoolId).filter((id): id is number => id != null)));
  if (poolIds.length === 1) {
    const info = await getStockPoolRemaining(poolIds[0]);
    if (info && info.remaining > 0) remaining = info.remaining;
  }

  return { prices, priceFrom: Math.min(...prices.map((r) => r.price)), remaining };
}

/** El copy es fijo (no se regenera con IA en cada corrida -- coherencia día a
 * día). El precio de cada acceso va en la tarjeta de precios del mail, no en
 * el texto. */
export function buildTanda2PromoContent(priceFrom: number, event: { title: string; slug: string }): MailingContent {
  return {
    subject: `Nuevo precio para ${event.title}: entradas desde ${formatClp(priceFrom)}`,
    preheader: `La primera etapa de venta ya cerró -- mira el precio de cada acceso en la 2ª tanda.`,
    headline: `Ya está disponible la 2ª tanda 🎃`,
    paragraphs: [
      `Estás en nuestra lista para ${event.title} (${EVENT_BRAND.fechaTexto}) y vimos que todavía no compraste tu entrada.`,
      `La primera etapa de venta ya cerró y abrimos la 2ª tanda con nuevos precios. Es más conveniente que las etapas que vienen: cuando se acabe esta, el valor vuelve a subir.`,
      `${EVENT_BRAND.dressCode}`,
    ],
    ctaText: 'Comprar mi entrada',
  };
}

/** La corrida diaria (`/api/cron/tanda2-promo`). Nunca lanza -- cualquier
 * error queda logueado y la próxima corrida (mañana) lo vuelve a intentar. */
export async function runTanda2PromoDaily(): Promise<Tanda2PromoRunResult> {
  const settings = await getSiteSettings();
  if (!settings.tanda2PromoEnabled) return { ran: false, reason: 'disabled' };

  const event = await getFeaturedEvent();
  if (!event) return { ran: false, reason: 'no-event' };

  // El dueño lo prende a mano al abrir la 2ª tanda. Antes de eso (fase 1) no
  // se manda ni se apaga; si ya se pasó a la 3ª o más, esta oferta terminó.
  if (event.tandaPhaseIndex < TANDA2_PHASE_INDEX) return { ran: false, reason: 'wrong-phase' };
  if (event.tandaPhaseIndex > TANDA2_PHASE_INDEX) {
    await updateSiteSettings({ tanda2PromoEnabled: false });
    return { ran: false, reason: 'phase-ended' };
  }

  const offer = await resolveTanda2Offer(event.id);
  if (!offer) return { ran: false, reason: 'no-price' };

  // Tope diario compartido con la 1ª tanda (ver comentario del archivo).
  const sentToday = await countTandaPromoEmailsSentToday();
  const budget = TANDA2_PROMO_DAILY_TARGET - sentToday;
  if (budget <= 0) return { ran: false, reason: 'daily-cap-reached' };

  const eligible = await listCustomers({ notPurchasedEventId: event.id, excludeTags: [TANDA2_PROMO_TAG] });
  if (eligible.length === 0) {
    await updateSiteSettings({ tanda2PromoEnabled: false });
    return { ran: false, reason: 'audience-exhausted' };
  }

  // `listCustomers` ya dejó fuera a los que compraron, pero entre armar la
  // lista y mandar puede haber entrado una compra: se re-verifica uno a uno
  // sobre el lote y se completa con los siguientes hasta llenar el cupo.
  const batch: any[] = [];
  let skipped = 0;
  for (const customer of eligible as any[]) {
    if (batch.length >= budget) break;
    if (await hasApprovedOrderForEvent(customer.email, event.id)) { skipped++; continue; }
    batch.push(customer);
  }
  if (batch.length === 0) {
    await updateSiteSettings({ tanda2PromoEnabled: false });
    return { ran: false, reason: 'audience-exhausted' };
  }

  const content = buildTanda2PromoContent(offer.priceFrom, event);
  const ctaUrl = `${EMAIL_BASE_URL}/checkout/${event.slug}`;
  const { results } = await sendMailingBatch(
    batch.map((c) => c.id),
    content,
    ctaUrl,
    TANDA2_PROMO_TAG,
    null,
    undefined,
    'tanda2-promo',
    { priceList: offer.prices, remaining: offer.remaining },
  );

  return {
    ran: true,
    eventTitle: event.title,
    priceFrom: offer.priceFrom,
    audienceSize: eligible.length,
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    skipped,
  };
}

/** Estado en vivo para el panel de admin -- sin mandar nada. */
export async function getTanda2PromoStatus() {
  const settings = await getSiteSettings();
  const event = await getFeaturedEvent();
  const base = { enabled: !!settings.tanda2PromoEnabled, dailyTarget: TANDA2_PROMO_DAILY_TARGET };
  // `remaining` solo existe con evento; el caso sin evento lo devuelve null.
  if (!event) return { ...base, eventTitle: null, priceFrom: null, prices: [] as MailingPriceRow[], remaining: null, phaseIndex: null, audienceSize: 0, sentToday: 0 };

  const [offer, eligible, sentToday] = await Promise.all([
    resolveTanda2Offer(event.id),
    listCustomers({ notPurchasedEventId: event.id, excludeTags: [TANDA2_PROMO_TAG] }),
    countTandaPromoEmailsSentToday(),
  ]);
  return {
    ...base,
    eventTitle: event.title,
    priceFrom: offer?.priceFrom ?? null,
    prices: offer?.prices ?? [],
    remaining: offer?.remaining ?? null,
    phaseIndex: event.tandaPhaseIndex,
    audienceSize: eligible.length,
    sentToday,
  };
}
