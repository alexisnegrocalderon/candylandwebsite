import {
  getEventById,
  getFeaturedEvent,
  getWinbackData,
  getCustomerIdsByEmails,
  getAccessTicketMix,
  listMailingCampaigns,
} from './db';
import { MailingContentSchema, generateMailingTemplate, createAutoMailingCampaign, AUTOMATED_EMAIL_DAILY_CAP, type MailingContent } from './mailing';
import { EMAIL_BASE_URL } from './emailLayout';
import { formatChileDate, formatChileTime } from '../shared/chileDate';
import { normalizeTandaSchedule, nextPhase } from '../shared/tandaSchedule';
import { isUnlimitedStock } from '../shared/stock';
import {
  WINBACK_SEGMENTS,
  WINBACK_SEGMENT_BY_KEY,
  classifyWinback,
  winbackCampaignName,
  winbackCtaUrl,
  winbackDaysToSend,
  type WinbackSegmentKey,
} from '../shared/winback';

/* Reactivación de clientes (plan del 02/10). La IA ya escribe los correos del
 * mailing; lo que faltaba era A QUIÉN decirle qué. Acá se agrupa a la gente
 * que ya compró alguna fiesta (segmentos excluyentes, ver shared/winback.ts),
 * la IA redacta un correo distinto para cada grupo con los datos REALES del
 * próximo evento, y el dueño lo revisa y lo edita antes de crear la campaña.
 *
 * Nada se manda solo ni al redactar: crear la campaña la deja en la cola del
 * mailing que ya existe (server/mailing.ts), que sale de a poco bajo el tope
 * diario compartido y salta a quien compre el evento mientras espera. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

async function resolveTargetEvent(targetEventId: number | undefined, now: Date) {
  const event = targetEventId ? await getEventById(targetEventId) : await getFeaturedEvent();
  if (!event) throw new Error('No hay ningún evento publicado al que invitar.');
  if (new Date(event.eventDate).getTime() <= now.getTime()) {
    throw new Error(`"${event.title}" ya pasó. Elige un evento que todavía no ocurra.`);
  }
  return event;
}

export type WinbackSegmentSummary = {
  key: WinbackSegmentKey;
  label: string;
  description: string;
  /** Personas que recibirían el correo (con ficha de cliente, o sea, alcanzables por el mailing). */
  count: number;
};

export type WinbackOverview = {
  event: { id: number; title: string; slug: string; eventDate: string };
  latestPastEvent: string | null;
  segments: WinbackSegmentSummary[];
  /** Quienes ya compraron este evento: quedan fuera de todo. */
  alreadyBought: number;
  dailyCap: number;
};

/** Cada segmento con cuánta gente tiene, para el evento al que se quiere
 * invitar. Solo lectura. */
export async function getWinbackOverview(targetEventId?: number, now: Date = new Date()): Promise<WinbackOverview> {
  const event = await resolveTargetEvent(targetEventId, now);
  const emailsBySegment = await segmentEmails(event.id, now);
  const segments: WinbackSegmentSummary[] = [];
  for (const def of WINBACK_SEGMENTS) {
    segments.push({
      key: def.key,
      label: def.label,
      description: def.description,
      count: (await getCustomerIdsByEmails(emailsBySegment.segments[def.key])).length,
    });
  }
  return {
    event: { id: event.id, title: event.title, slug: event.slug, eventDate: new Date(event.eventDate).toISOString() },
    latestPastEvent: emailsBySegment.latestPastTitle,
    segments,
    alreadyBought: emailsBySegment.alreadyBought,
    dailyCap: AUTOMATED_EMAIL_DAILY_CAP,
  };
}

async function segmentEmails(targetEventId: number, now: Date = new Date()) {
  const { participation, pastEvents } = await getWinbackData(now);
  const latest = pastEvents.find((e) => e.id !== targetEventId) ?? null;

  // Solo cuentan las fiestas que YA pasaron (y el evento objetivo, para dejar
  // afuera a quien ya lo compró). Si alguien compró OTRO evento futuro, esa
  // compra no es haber "venido": no debe contarlo como fiesta pasada.
  const countable = new Set<number>([targetEventId, ...pastEvents.map((e) => e.id)]);
  const onlyPast = new Map<string, Set<number>>();
  participation.forEach((events, email) => {
    onlyPast.set(email, new Set(Array.from(events).filter((id) => countable.has(id))));
  });
  const classified = classifyWinback({ participation: onlyPast, latestPastEventId: latest?.id ?? null, targetEventId });
  return { ...classified, latestPastTitle: latest?.title ?? null };
}

/** Los datos reales del evento que se le pasan a la IA: ella escribe el
 * correo, pero fecha, lugar y precio salen de la base -- nunca inventados. */
export async function buildEventFacts(event: NonNullable<Awaited<ReturnType<typeof getEventById>>>): Promise<string> {
  const date = new Date(event.eventDate);
  const lines = [
    `- Evento: ${event.title}`,
    `- Fecha: ${formatChileDate(date, { withWeekday: true })}, ${formatChileTime(date)} hrs`,
  ];
  if (event.venue) lines.push(`- Lugar: ${event.venue}`);
  if (event.shortDescription) lines.push(`- De qué se trata: ${event.shortDescription.slice(0, 300)}`);

  const mix = (await getAccessTicketMix(event.id)).filter((t) => t.status === 'active' && Number(t.price) > 0);
  if (mix.length > 0) {
    const cheapest = mix.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
    lines.push(`- Entradas desde ${clp(Number(cheapest.price))} (${cheapest.name}), precio de la tanda actual.`);
    const limited = mix.filter((t) => !isUnlimitedStock(Number(t.totalStock)));
    if (limited.length > 0) lines.push('- Hay cupos limitados en algunos accesos.');
  }

  const schedule = normalizeTandaSchedule(event.tandaDiscountSchedule);
  const current = schedule[event.tandaPhaseIndex];
  const next = nextPhase(event.tandaPhaseIndex, schedule);
  if (next && current) {
    lines.push(current.untilDate
      ? `- El precio actual rige hasta el ${formatChileDate(new Date(current.untilDate), { withWeekday: true })}; después sube.`
      : '- El precio actual es de esta tanda y sube cuando se cierre.');
  }
  return lines.join('\n');
}

/** Redacta con IA el correo de un segmento, sobre el evento al que se lo
 * quiere invitar. El dueño lo revisa y edita antes de crear nada. */
export async function draftWinbackEmail(segmentKey: WinbackSegmentKey, targetEventId?: number, now: Date = new Date()): Promise<MailingContent> {
  const event = await resolveTargetEvent(targetEventId, now);
  const segment = WINBACK_SEGMENT_BY_KEY[segmentKey];
  const facts = await buildEventFacts(event);

  const objective = [
    segment.objective,
    '',
    'Datos reales del próximo evento (usa SOLO estos datos; no inventes precios, fechas, shows ni invitados):',
    facts,
    '',
    'Reglas del correo: un solo botón de compra y nada de links dentro del texto; tono cercano y cálido, sin desesperación ni "última oportunidad"; si hay urgencia real (el precio sube), dila una sola vez como un dato útil; no menciones cuántas veces compró la persona ni nada de su historial.',
  ].join('\n');

  return generateMailingTemplate(objective, segment.description);
}

export type WinbackCampaignResult = { campaignId: number; recipients: number; days: number };

/** Crea la campaña de un segmento en la cola del mailing. El segmento se
 * RECALCULA acá (no se confía en una lista que mande el navegador), y no se
 * deja crear dos veces la misma campaña para el mismo evento. */
export async function createWinbackCampaign(input: {
  segmentKey: WinbackSegmentKey;
  targetEventId?: number;
  content: unknown;
}, now: Date = new Date()): Promise<WinbackCampaignResult> {
  const content = MailingContentSchema.safeParse(input.content);
  if (!content.success) {
    throw new Error(`El correo no tiene el formato esperado: ${content.error.issues[0]?.message ?? 'revisa los campos'}.`);
  }
  const event = await resolveTargetEvent(input.targetEventId, now);
  const segment = WINBACK_SEGMENT_BY_KEY[input.segmentKey];
  const name = winbackCampaignName(segment.label, event.title);

  const existing = (await listMailingCampaigns()).find((c) => c.name === name && c.status !== 'cancelled');
  if (existing) {
    throw new Error('Ya hay una campaña de este grupo para este evento. Cancélala desde el historial de Mailing si quieres armar otra.');
  }

  const { segments } = await segmentEmails(event.id, now);
  const customerIds = await getCustomerIdsByEmails(segments[input.segmentKey]);
  if (customerIds.length === 0) throw new Error('Este grupo no tiene a nadie por ahora.');

  const { campaignId } = await createAutoMailingCampaign({
    name,
    audienceDescription: segment.description,
    customerIds,
    content: content.data,
    ctaUrl: winbackCtaUrl(EMAIL_BASE_URL, event.slug, input.segmentKey),
    eventId: event.id,
  });
  return { campaignId, recipients: customerIds.length, days: winbackDaysToSend(customerIds.length, AUTOMATED_EMAIL_DAILY_CAP) };
}
