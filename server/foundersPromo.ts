/**
 * Aviso automático diario de "primeros cupos" -- pedido explícito del dueño
 * (04/09): mandar ~50 correos/día a clientes que todavía no compraron el
 * evento destacado, contándoles del precio de la primera etapa de venta,
 * con el cupo REAL (`stockPools`) resuelto de nuevo cada vez que sale un
 * correo -- nunca un número congelado al armar la campaña.
 *
 * ⚠️ Nunca dice "Founders" -- ese es el nombre INTERNO del admin
 * (`candyland.ts`, comentarios de `drizzle/schema.ts`). El cliente nunca lo
 * ve, ni en el sitio (`TandaUrgencyCard` tampoco lo dice) ni acá.
 *
 * ⚠️ Presupuesto propio, INDEPENDIENTE de `AUTOMATED_EMAIL_DAILY_CAP`
 * (server/mailing.ts) -- ese tope es compartido entre el mailing masivo
 * manual y los recordatorios de carrito abandonado (que SÍ hay que proteger:
 * son "ventas", no "marketing", y corren cada hora). Si este aviso
 * compartiera la misma cuota, una corrida temprano en el día podría gastarse
 * los recordatorios de todo el resto del día. Por eso este módulo manda
 * directo con `sendMailingBatch` (server/mailing.ts) en vez de encolar en
 * `mailingCampaigns`/`mailingRecipients` -- no pasa por el cron compartido
 * `processMailingCronBatch`, tiene su propio cron (`/api/cron/founders-promo`,
 * una corrida por día) y su propio tope fijo.
 *
 * Con el plan free de Resend (~100/día, confirmado con el dueño) y este
 * aviso topado a 50, quedan ~50 para confirmaciones de compra (sin límite,
 * nunca se bloquean) + recordatorios de carrito + campañas manuales
 * ocasionales -- holgado en un día normal. Si algún día ese resto se
 * excede, el peor caso es que Resend rechace ALGÚN correo no esencial (se
 * loguea como `failed`, nunca rompe una compra real) -- no hay forma de
 * consultarle a Resend su cupo restante en vivo, así que esto es un
 * presupuesto conservador, no una garantía matemática.
 */
import { eq, and } from 'drizzle-orm';
import { getDb, getFeaturedEvent, getStockPoolRemaining, listCustomers, getSiteSettings, updateSiteSettings } from './db';
import { ticketTypes } from '../drizzle/schema';
import { sendMailingBatch, type MailingContent, type MailingSendResult } from './mailing';
import { EMAIL_BASE_URL } from './emailLayout';
import { EVENT_BRAND } from '../shared/eventBrand';

/** Tag interna para no repetirle el aviso a quien ya lo recibió -- nunca
 * viaja al correo, solo vive en `customers.tags` (mismo mecanismo que ya
 * usa el resto del mailing, ver `excludeTags` en `listCustomers`). */
export const FOUNDERS_PROMO_TAG = 'promo-primeros-cupos';

/** Cuántos correos manda como máximo cada corrida diaria. */
export const FOUNDERS_PROMO_DAILY_TARGET = Number(process.env.FOUNDERS_PROMO_DAILY_CAP) || 50;

export type FoundersPromoRunResult =
  | { ran: false; reason: 'disabled' | 'no-event' | 'no-shared-pool' | 'sold-out' | 'audience-exhausted' }
  | { ran: true; eventTitle: string; remaining: number; audienceSize: number; sent: number; failed: number };

/** Mismo criterio de detección de pool que `checkAndAdvanceTandaIfNeeded`
 * (server/tandaAutoAdvance.ts): solo hay un remanente sin ambigüedad si
 * TODOS los accesos activos del evento comparten el mismo cupo compartido.
 * Si no hay pool o hay varios distintos, no hay una cifra clara de "cupos
 * quedan" y este aviso no tiene qué contar -- se detiene solo. */
async function resolveSharedPoolRemaining(eventId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const activos = await db.select().from(ticketTypes).where(and(
    eq(ticketTypes.eventId, eventId),
    eq(ticketTypes.category, 'acceso'),
    eq(ticketTypes.status, 'active'),
  ));
  const poolIds = Array.from(new Set(activos.map((a) => a.stockPoolId).filter((id): id is number => id != null)));
  if (poolIds.length !== 1) return null;
  const info = await getStockPoolRemaining(poolIds[0]);
  return info ? info.remaining : null;
}

/** El copy es fijo (no se regenera con IA en cada corrida -- mismo criterio
 * documentado en `buildMailingBlastEmail`: coherencia día a día, solo cambia
 * el número). Sin mencionar nunca la palabra "Founders". */
export function buildFoundersPromoContent(remaining: number, event: { title: string; slug: string }): MailingContent {
  return {
    subject: `Quedan ${remaining} cupos a precio especial para ${event.title}`,
    preheader: `Todavía no compraste tu entrada -- quedan ${remaining} cupos a este valor.`,
    headline: `Quedan ${remaining} cupos a precio especial 🍬`,
    paragraphs: [
      `Estás en nuestra lista para ${event.title} (${EVENT_BRAND.fechaTexto}) y vimos que todavía no compraste tu entrada.`,
      `Ahora mismo estamos en la primera etapa de venta -- el precio más bajo de toda la campaña. Quedan pocos cupos a este valor; una vez que se agoten, la próxima etapa sube de precio.`,
      `${EVENT_BRAND.dressCode}`,
    ],
    ctaText: 'Comprar mi entrada',
    highlightLabel: 'Quedan',
    highlightValue: `${remaining} cupos`,
  };
}

/** La corrida diaria (`/api/cron/founders-promo`). Nunca lanza -- cualquier
 * error queda logueado y la próxima corrida (mañana) lo vuelve a intentar. */
export async function runFoundersPromoDaily(): Promise<FoundersPromoRunResult> {
  const settings = await getSiteSettings();
  if (!settings.foundersPromoEnabled) return { ran: false, reason: 'disabled' };

  const event = await getFeaturedEvent();
  if (!event) return { ran: false, reason: 'no-event' };

  const remaining = await resolveSharedPoolRemaining(event.id);
  if (remaining === null) {
    // Ya no hay un cupo compartido claro (o nunca lo hubo) -- este aviso no
    // tiene qué contar. Se apaga solo en vez de quedar prendido mandando
    // correos sin sentido para siempre sin que el dueño se entere.
    await updateSiteSettings({ foundersPromoEnabled: false });
    return { ran: false, reason: 'no-shared-pool' };
  }
  if (remaining <= 0) {
    await updateSiteSettings({ foundersPromoEnabled: false });
    return { ran: false, reason: 'sold-out' };
  }

  const eligible = await listCustomers({ notPurchasedEventId: event.id, excludeTags: [FOUNDERS_PROMO_TAG] });
  if (eligible.length === 0) {
    await updateSiteSettings({ foundersPromoEnabled: false });
    return { ran: false, reason: 'audience-exhausted' };
  }

  const batch = eligible.slice(0, FOUNDERS_PROMO_DAILY_TARGET);
  const content = buildFoundersPromoContent(remaining, event);
  const ctaUrl = `${EMAIL_BASE_URL}/checkout/${event.slug}`;
  const results: MailingSendResult[] = await sendMailingBatch(
    batch.map((c: any) => c.id),
    content,
    ctaUrl,
    FOUNDERS_PROMO_TAG,
    null,
    undefined,
  );

  return {
    ran: true,
    eventTitle: event.title,
    remaining,
    audienceSize: eligible.length,
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };
}

/** Estado en vivo para el panel de admin -- sin mandar nada. */
export async function getFoundersPromoStatus() {
  const settings = await getSiteSettings();
  const event = await getFeaturedEvent();
  if (!event) return { enabled: !!settings.foundersPromoEnabled, eventTitle: null, remaining: null, audienceSize: 0, dailyTarget: FOUNDERS_PROMO_DAILY_TARGET };

  const remaining = await resolveSharedPoolRemaining(event.id);
  const eligible = await listCustomers({ notPurchasedEventId: event.id, excludeTags: [FOUNDERS_PROMO_TAG] });
  return {
    enabled: !!settings.foundersPromoEnabled,
    eventTitle: event.title,
    remaining,
    audienceSize: eligible.length,
    dailyTarget: FOUNDERS_PROMO_DAILY_TARGET,
  };
}
