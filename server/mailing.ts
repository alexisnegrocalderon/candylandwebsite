import { z } from "zod";
import { nanoid } from "nanoid";
import { formatChileDate, formatChileTime } from "../shared/chileDate";
import { invokeLLM, extractContent } from "./_core/llm";
import { sendEmail, sendMarketingEmailBatch, resendTagValue, EMAIL_BATCH_MAX, buildMailingBlastEmail, type MailingEventInfo, type MailingEventSections, type MailingPriceRow } from "./email";
import { customerWhere, type CustomerPageFilters } from "./customerFilters";
import { appUserEmails } from "./appDevices";
import { syncLeadsAsMailingAudience } from "./leadsMailing";
import { customers } from "../drizzle/schema";
import * as db from "./db";
import { getMission300Status } from "./webhooks";
import { isMissionActiveForEvent, MISSION_300_DEPOSIT_PER_PERSON } from "../shared/mission300";

function formatEventDateTime(date: Date): string {
  return `${formatChileDate(date)}, ${formatChileTime(date)} hrs`;
}

/** Arma la info del "próximo evento destacado" para la tarjeta opcional del
 * mailing masivo (pedido explícito del usuario) -- siempre el mismo evento
 * sin importar el filtro de audiencia de la campaña. Devuelve null si no
 * hay ningún evento publicado. */
export async function getMailingEventInfo(): Promise<MailingEventInfo | null> {
  const event = await db.getFeaturedEvent();
  if (!event) return null;

  const eventDate = new Date(event.eventDate);
  let mission300: MailingEventInfo['mission300'] = null;
  if (isMissionActiveForEvent(event)) {
    const status = await getMission300Status(event.id);
    mission300 = { confirmed: status.totalPersonas, goal: status.goal, depositPrice: MISSION_300_DEPOSIT_PER_PERSON };
  }

  return {
    title: event.title,
    imageUrl: event.imageUrl ?? undefined,
    dateText: formatEventDateTime(eventDate),
    venue: event.venue ?? 'Valparaíso, Chile',
    address: event.address ?? undefined,
    mapsUrl: event.mapsUrl ?? undefined,
    mission300,
  };
}

/** Mailing masivo desde /admin (sección Clientes, pedido explícito del
 * usuario): la IA solo devuelve texto estructurado, nunca HTML -- el HTML
 * final siempre se arma con buildMailingBlastEmail() en server/email.ts,
 * que reusa los mismos helpers de marca que el resto de los emails. */
export const MailingContentSchema = z.object({
  subject: z.string().min(4).max(90),
  preheader: z.string().max(140).optional(),
  headline: z.string().min(4).max(80),
  paragraphs: z.array(z.string().min(4).max(500)).min(1).max(4),
  ctaText: z.string().max(40).optional(),
  highlightLabel: z.string().max(60).optional(),
  highlightValue: z.string().max(60).optional(),
  // Prueba A/B de asunto: la mitad de la lista (por id de cliente, par/impar) recibe `subject` y la otra mitad `subjectB`.
  subjectB: z.string().min(4).max(90).optional(),
  // Look del correo (campañas del aniversario); sin valor = el de siempre.
  theme: z.enum(["oro", "neon"]).optional(),
});
export type MailingContent = z.infer<typeof MailingContentSchema>;

/** Variante A/B de un cliente: determinista (par = A, impar = B), así el mismo cliente siempre cae en la misma. */
export function mailingVariantFor(customerId: number): "A" | "B" {
  return customerId % 2 === 0 ? "A" : "B";
}

export function mailingSubjectFor(content: { subject: string; subjectB?: string }, customerId: number): string {
  return mailingVariantFor(customerId) === "B" && content.subjectB ? content.subjectB : content.subject;
}

export const MAILING_JSON_SCHEMA = {
  name: "mailing_template",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "headline", "paragraphs"],
    properties: {
      subject: { type: "string", description: "Asunto del email, corto y directo, sin emojis excesivos." },
      preheader: { type: "string", description: "Texto de preview que se ve junto al asunto en la bandeja de entrada (una frase corta)." },
      headline: { type: "string", description: "Título grande dentro del email." },
      paragraphs: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description: "Uno a cuatro párrafos cortos con el cuerpo del mensaje, tono cercano y conversacional.",
      },
      ctaText: { type: "string", description: "Texto del botón de acción, ej. 'Comprar mi entrada'." },
      highlightLabel: { type: "string", description: "Etiqueta chica de un dato destacado, ej. 'Solo por hoy'. Opcional, solo si el objetivo tiene un dato numérico o urgente que resaltar." },
      highlightValue: { type: "string", description: "El dato destacado en sí, ej. '41 entradas' o '$50.000 en consumos'. Opcional, va junto a highlightLabel." },
    },
  },
} as const;

const SYSTEM_PROMPT = `Eres quien escribe los emails de marketing de Mansion Playroom / Candyland, una productora de fiestas en Valparaíso/Viña del Mar, Chile.
Tono: cercano, conversacional, en español chileno, sin ser vulgar ni gritar en mayúsculas. Nada de lenguaje corporativo genérico.
La marca usa una paleta pastel (rosa/celeste/amarillo/lila) y emojis con moderación (🍬🎉✨), pero el contenido que generas es solo texto, no HTML ni estilos.
Responde ÚNICAMENTE con el JSON pedido, sin explicaciones adicionales. Usa "highlightLabel"/"highlightValue" solo si el objetivo menciona un dato concreto que valga la pena destacar en grande (un número de entradas, un precio, un premio); si no aplica, omítelos.`;

export async function generateMailingTemplate(objective: string, audienceDescription: string): Promise<MailingContent> {
  const result = await invokeLLM({ feature: "mailing",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Objetivo del mail: ${objective}\n\nA quién se le manda: ${audienceDescription}` },
    ],
    responseFormat: { type: "json_schema", json_schema: MAILING_JSON_SCHEMA },
  });

  const raw = extractContent(result.choices[0]?.message ?? { content: "" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvió un JSON válido. Intenta de nuevo con un objetivo más claro.");
  }

  const validated = MailingContentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`La plantilla generada no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}

/** Tope duro por request tRPC -- el cliente trocea en lotes más chicos (25)
 * para dejar margen bajo el maxDuration:30 de la función serverless de
 * Vercel (ver vercel.json); esto es el límite máximo que el server acepta
 * aunque alguien mande más desde afuera. */
export const MAILING_BATCH_MAX = 50;

export type MailingSendResult = {
  customerId: number;
  email: string;
  success: boolean;
  reason?: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Resend permite 2 envíos por segundo por API (también en Pro): 550 ms entre
 * correos deja margen. Se puede cambiar con la variable MAILING_THROTTLE_MS. */
const THROTTLE_MS = Number(process.env.MAILING_THROTTLE_MS) || 550;

export async function sendMailingBatch(
  customerIds: number[],
  content: MailingContent,
  ctaUrl: string,
  campaignTag?: string,
  eventInfo?: MailingEventInfo | null,
  eventSections?: MailingEventSections,
  // Quién dispara este envío -- solo para el log de Historial de Mailing
  // (ver mailingSendLog en drizzle/schema.ts), no cambia nada del envío en
  // sí. Los dos llamadores de hoy se identifican solos: el aviso automático
  // de primeros cupos y el botón manual "Enviar a N clientes".
  source: 'founders-promo' | 'tanda2-promo' | 'sales-drip' | 'manual' = 'manual',
  // Tarjeta de precios por acceso de la tanda vigente (aviso de 2ª tanda).
  extras?: { priceList?: MailingPriceRow[]; remaining?: number | null; eventId?: number | null }
): Promise<{ batchId: string; results: MailingSendResult[] }> {
  const allRecipients = await db.listCustomersByIds(customerIds);
  const results: MailingSendResult[] = [];
  // Quien pidió la baja de correos no recibe nada, aunque haya quedado en una
  // lista armada antes de que la pidiera (ficha de cliente → Permisos).
  const recipients = allRecipients.filter((c) => {
    if (!c.emailOptOut) return true;
    results.push({ customerId: c.id, email: c.email, success: false, reason: 'Pidió no recibir correos' });
    return false;
  });
  const cleanCampaignTag = campaignTag?.trim();
  // Agrupa todas las filas de este log bajo una misma corrida -- así el
  // admin ve "la tanda de hoy" como una sola entrada, no una por email.
  const batchId = nanoid();

  for (const customer of recipients) {
    const html = buildMailingBlastEmail({
      buyerName: customer.fullName ?? "",
      preheader: content.preheader,
      headline: content.headline,
      paragraphs: content.paragraphs,
      ctaText: content.ctaText,
      ctaUrl,
      highlightLabel: content.highlightLabel,
      highlightValue: content.highlightValue,
      eventInfo,
      eventSections,
      priceList: extras?.priceList,
      remaining: extras?.remaining,
    });
    const sent = await sendEmail({ to: customer.email, subject: content.subject, html, marketing: true });
    results.push({ customerId: customer.id, email: customer.email, success: sent.success, reason: sent.reason });

    // Tagueo automático (pedido explícito del usuario): con el límite de
    // ~100 emails/día del plan free de Resend, hace falta saber quién ya
    // recibió esta campaña para retomar al día siguiente excluyendo la tag.
    // No aborta el lote si el tag falla -- el email ya se mandó igual.
    if (sent.success && cleanCampaignTag) {
      try {
        await db.addCustomerTag(customer.id, cleanCampaignTag);
      } catch (err) {
        console.error('[Mailing] No se pudo taguear al cliente tras el envío:', err);
      }
    }

    // Log puramente informativo para Historial de Mailing (ver
    // mailingSendLog) -- si falla, el correo ya se mandó igual, no aborta
    // el lote. A propósito NO es mailingRecipients: esa tabla cuenta para
    // el presupuesto diario compartido que protege los recordatorios de
    // carrito abandonado (ver server/foundersPromo.ts).
    try {
      await db.logMailingSend({
        batchId,
        source,
        eventId: extras?.eventId ?? null,
        label: content.subject,
        customerId: customer.id,
        email: customer.email,
        success: sent.success,
        reason: sent.reason,
      });
    } catch (err) {
      console.error('[Mailing] No se pudo loguear el envío:', err);
    }

    await sleep(THROTTLE_MS);
  }

  return { batchId, results };
}

/** Crea una campaña de envío automático (pedido explícito del usuario): a
 * diferencia de sendMailingBatch() de arriba (que manda ya mismo, disparado
 * desde el navegador), esto solo persiste el contenido ya definido y la lista
 * de destinatarios -- el cron diario (processMailingCronBatch, más abajo) es
 * quien realmente los manda, de a poco, día a día. */
export async function createAutoMailingCampaign(input: {
  name: string;
  audienceDescription: string;
  customerIds: number[];
  content: MailingContent;
  ctaUrl: string;
  eventSections?: MailingEventSections;
  // Evento al que se refiere la campaña, si el admin armó la audiencia con
  // el filtro de evento en Mailing -- ver mailingCampaigns.eventId.
  eventId?: number | null;
}): Promise<{ campaignId: number }> {
  const name = input.name.trim();
  if (!name) throw new Error("Falta el nombre de la campaña.");
  return db.createMailingCampaign({
    name,
    audienceDescription: input.audienceDescription,
    content: input.content,
    ctaUrl: input.ctaUrl,
    eventSections: input.eventSections ?? null,
    customerIds: input.customerIds,
    eventId: input.eventId ?? null,
  });
}

/** Cuánto puede durar como máximo una corrida del cron antes de cortar y dejar el resto para la próxima (la función
 * serverless permite 300 s, ver vercel.json). Cortar a mitad de camino no pierde nada: cada lote se marca
 * sent/failed apenas sale, y lo que no se alcanzó a tocar sigue 'pending' para la próxima corrida. */
const CRON_TIME_BUDGET_MS = Number(process.env.MAILING_CRON_BUDGET_MS) || 240_000;

/** Tope de emails por corrida. Con el envío en lotes de 100 (Resend `/emails/batch`) una corrida manda varios
 * miles dentro del presupuesto de tiempo; el tope diario (abajo) sigue siendo el freno real. */
const CRON_MAX_PER_RUN = Number(process.env.MAILING_CRON_RUN_CAP) || 500;

/** Tope de emails automáticos POR DÍA, compartido entre el mailing masivo y
 * los recordatorios de carrito abandonado.
 *
 * Es la pieza que hace segura la frecuencia alta. Antes el cron corría una
 * vez al día, así que el tope por corrida ERA el tope diario; a 96 corridas
 * por día ese mismo número vaciaría la cuota de Resend (~100/día en el plan
 * free) en una hora, y los correos que de verdad no pueden fallar --  la
 * confirmación de compra con el QR de la entrada -- se quedarían sin cupo.
 *
 * El default deja margen para los transaccionales. Súbelo con la env var
 * `AUTOMATED_EMAIL_DAILY_CAP` si hace falta más (600 desde Resend Pro, 21/10). */
export const AUTOMATED_EMAIL_DAILY_CAP = Number(process.env.AUTOMATED_EMAIL_DAILY_CAP) || 600;

export type MailingCronResult = {
  processed: number;
  sent: number;
  failed: number;
  // Pendientes que se saltaron porque, cuando les tocó el turno, ya habían
  // comprado la entrada del evento de la campaña (ver
  // markMailingRecipientSkipped) -- no gastan cupo diario, no son un envío.
  skipped: number;
  campaignsTouched: number;
};

/** Precio de hoy de cada acceso (y cupos) del evento de la campaña, siempre de la base: el correo del aniversario
 * muestra «último día a este valor» y no puede quedar con un precio que ya cambió. Import dinámico porque
 * tanda2Promo importa este módulo. Null si el evento no tiene accesos con precio. */
export async function getCampaignOffer(eventId: number | null | undefined): Promise<{ priceList: MailingPriceRow[]; remaining: number | null } | null> {
  if (!eventId) return null;
  const { resolveCurrentOffer } = await import("./tanda2Promo");
  const offer = await resolveCurrentOffer(eventId);
  return offer ? { priceList: offer.prices, remaining: offer.remaining } : null;
}

/** A quién va una campaña programada. Se resuelve RECIÉN cuando llega la hora (ver `materializeDueCampaigns`). */
export const AudienceFiltersSchema = z.object({
  /** Quienes NO tienen entrada aprobada de este evento. */
  notPurchasedEventId: z.number().int().optional(),
  /** Suma a quienes dejaron su correo (leads) y todavía no compraron. */
  includeLeads: z.boolean().optional(),
  /** Solo quienes todavía no tienen la app. */
  withoutApp: z.boolean().optional(),
  excludeTags: z.array(z.string().max(100)).max(20).optional(),
});
export type AudienceFilters = z.infer<typeof AudienceFiltersSchema>;

/** Los clientes que cumplen los filtros AHORA (sin baja, sin cuentas internas, sin entrada del evento). */
export async function resolveAudienceCustomerIds(filters: AudienceFilters, now: Date = new Date()): Promise<number[]> {
  const rawDb = await db.getDb();
  if (!rawDb) throw new Error("Base de datos no disponible");
  if (filters.includeLeads) await syncLeadsAsMailingAudience(rawDb, filters.notPurchasedEventId ? { eventId: filters.notPurchasedEventId } : {});
  const pageFilters: CustomerPageFilters = {
    forMailing: true,
    notPurchasedEventId: filters.notPurchasedEventId,
    excludeTags: filters.excludeTags,
    withoutApp: filters.withoutApp,
  };
  const where = customerWhere(pageFilters, now, filters.withoutApp ? await appUserEmails() : undefined);
  const rows = await rawDb.select({ id: customers.id }).from(customers).where(where).orderBy(customers.id);
  return rows.map((r: { id: number }) => r.id);
}

/** Guarda una campaña PROGRAMADA: sin destinatarios todavía, salen a `scheduledAt` según `audienceFilters`. */
export async function scheduleMailingCampaign(input: {
  name: string;
  audienceDescription: string;
  audienceFilters: AudienceFilters;
  content: MailingContent;
  ctaUrl: string;
  eventSections?: MailingEventSections;
  eventId?: number | null;
  scheduledAt: Date;
}): Promise<{ campaignId: number }> {
  const name = input.name.trim();
  if (!name) throw new Error("Falta el nombre de la campaña.");
  if (!(input.scheduledAt.getTime() > Date.now() - 60_000)) throw new Error("La hora de envío ya pasó.");
  return db.createScheduledMailingCampaign({
    name,
    audienceDescription: input.audienceDescription,
    content: input.content,
    ctaUrl: input.ctaUrl,
    eventSections: input.eventSections ?? null,
    eventId: input.eventId ?? input.audienceFilters.notPurchasedEventId ?? null,
    scheduledAt: input.scheduledAt,
    audienceFilters: input.audienceFilters,
  });
}

/** Las campañas programadas que ya cumplieron su hora pasan a 'sending' con la audiencia de ESE momento: así el
 * recordatorio de la tarde y el del viernes dejan fuera a quien compró entremedio. Solo una corrida toma cada
 * campaña (`claimScheduledCampaign`); si armar la lista falla, vuelve a quedar programada para reintentar. */
export async function materializeDueCampaigns(now: Date = new Date()): Promise<{ campaigns: number; recipients: number }> {
  const due = await db.listDueScheduledCampaigns(now);
  let recipients = 0;
  let campaigns = 0;
  for (const campaign of due) {
    if (!(await db.claimScheduledCampaign(campaign.id))) continue;
    try {
      const filters = AudienceFiltersSchema.parse(campaign.audienceFilters ?? {});
      const ids = await resolveAudienceCustomerIds(filters, now);
      await db.insertMailingRecipients(campaign.id, ids);
      recipients += ids.length;
      campaigns++;
    } catch (err) {
      console.error(`[Mailing] No se pudo armar la audiencia de la campaña ${campaign.id}, se reintenta:`, err);
      await db.revertScheduledCampaign(campaign.id);
    }
  }
  return { campaigns, recipients };
}

/** Corrida del cron (server/cronRoutes.ts, cada pocos minutos): primero arma las campañas programadas que ya
 * llegaron a su hora y después manda los pendientes de las campañas 'sending', de la más vieja a la más nueva, en
 * lotes de 100 por la API batch de Resend. Se saltan (sin gastar cupo) quienes ya compraron el evento de la campaña
 * o pidieron la baja mientras esperaban. El evento destacado se resuelve UNA vez por corrida. */
export async function processMailingCronBatch(): Promise<MailingCronResult> {
  const start = Date.now();

  // Si la migración 0139 todavía no se corrió, armar campañas programadas falla: no debe frenar la cola de siempre.
  try { await materializeDueCampaigns(); } catch (err) { console.error('[Mailing] No se pudieron armar las campañas programadas (¿falta la migración 0139?):', err); }

  // Presupuesto diario compartido: ver AUTOMATED_EMAIL_DAILY_CAP.
  const sentToday = await db.countAutomatedEmailsSentToday();
  const dailyRemaining = AUTOMATED_EMAIL_DAILY_CAP - sentToday;
  if (dailyRemaining <= 0) {
    return { processed: 0, sent: 0, failed: 0, skipped: 0, campaignsTouched: 0 };
  }

  const pending = await db.getPendingMailingRecipients(Math.min(CRON_MAX_PER_RUN, dailyRemaining));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const campaignsTouched = new Set<number>();
  let eventInfo: MailingEventInfo | null | undefined;
  const buyersByEvent = new Map<number, Set<string>>();

  // Los pendientes llegan ordenados por campaña: se procesa una campaña a la vez.
  const byCampaign = new Map<number, typeof pending>();
  for (const r of pending) byCampaign.set(r.campaignId, [...(byCampaign.get(r.campaignId) ?? []), r]);

  for (const [campaignId, rows] of Array.from(byCampaign.entries())) {
    if (Date.now() - start > CRON_TIME_BUDGET_MS) break;
    campaignsTouched.add(campaignId);

    // Compró mientras esperaba (pedido del dueño, 14/09) o pidió la baja: se salta, sin gastar cupo.
    const eventId = rows[0].campaignEventId;
    let buyers: Set<string> | undefined;
    if (eventId) {
      buyers = buyersByEvent.get(eventId) ?? await db.approvedBuyerEmailsForEvent(eventId);
      buyersByEvent.set(eventId, buyers);
    }
    const skipBought = rows.filter((r) => buyers?.has(r.email.trim().toLowerCase()));
    const skipOptOut = rows.filter((r) => !skipBought.includes(r) && r.emailOptOut);
    await db.markMailingRecipientsSkipped(campaignId, skipBought.map((r) => r.id), 'Ya había comprado esta entrada');
    await db.markMailingRecipientsSkipped(campaignId, skipOptOut.map((r) => r.id), 'Pidió no recibir correos');
    skipped += skipBought.length + skipOptOut.length;
    const toSend = rows.filter((r) => !skipBought.includes(r) && !skipOptOut.includes(r));
    if (toSend.length === 0) continue;

    const content = toSend[0].content as MailingContent;
    const eventSections = (toSend[0].eventSections ?? undefined) as MailingEventSections | undefined;
    if (eventSections && eventInfo === undefined) eventInfo = await getMailingEventInfo();
    const campaignTag = resendTagValue(toSend[0].campaignName);
    // Con look de aniversario el precio de cada acceso se lee de la base en cada corrida.
    const offer = content.theme ? await getCampaignOffer(eventId) : null;

    for (let i = 0; i < toSend.length; i += EMAIL_BATCH_MAX) {
      if (Date.now() - start > CRON_TIME_BUDGET_MS) break;
      const chunk = toSend.slice(i, i + EMAIL_BATCH_MAX);
      const results = await sendMarketingEmailBatch(chunk.map((recipient) => ({
        to: recipient.email,
        subject: mailingSubjectFor(content, recipient.customerId),
        html: buildMailingBlastEmail({
          buyerName: recipient.fullName ?? "",
          preheader: content.preheader,
          headline: content.headline,
          paragraphs: content.paragraphs,
          ctaText: content.ctaText,
          ctaUrl: recipient.ctaUrl,
          highlightLabel: content.highlightLabel,
          highlightValue: content.highlightValue,
          eventInfo: eventSections ? eventInfo : null,
          eventSections,
          theme: content.theme,
          priceList: offer?.priceList,
          remaining: offer?.remaining,
        }),
        marketing: true,
        tags: [
          { name: "campaign", value: campaignTag },
          { name: "variant", value: mailingVariantFor(recipient.customerId) },
        ],
      })));
      const marked = chunk.map((recipient, idx) => ({ recipientId: recipient.id, success: results[idx].success, reason: results[idx].reason }));
      await db.markMailingRecipientsResults(campaignId, marked);
      const okIds = chunk.filter((_, idx) => results[idx].success).map((r) => r.customerId);
      sent += okIds.length;
      failed += chunk.length - okIds.length;
      try {
        await db.bulkAddCustomerTag(okIds, toSend[0].campaignName);
      } catch (err) {
        console.error('[Mailing] No se pudo taguear a los clientes tras el envío automático:', err);
      }
    }
  }

  return { processed: sent + failed, sent, failed, skipped, campaignsTouched: campaignsTouched.size };
}
