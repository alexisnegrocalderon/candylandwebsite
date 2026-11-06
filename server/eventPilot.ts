/* Piloto automático del evento (shared/eventPilot.ts): el dueño lo prende con un botón; un cron cada 15 minutos mira
 * qué pasos ya tocan y los deja como cross check (server/crossCheck.ts) con push al dueño. Recién al «Reportar» se
 * ejecuta cada paso (`runPilotStep`). Apagar el piloto descarta lo que estaba esperando. */
import { and, eq, inArray, like } from "drizzle-orm";
import { crossChecks, eventPilots, pushCampaigns } from "../drizzle/schema";
import { getEventById, updateSiteSettings } from "./db";
import { crossCheckDb, requestCrossCheck } from "./crossCheck";
import { createPushCampaign, getCustomerPushConfig, sendPushCampaign } from "./customerPush";
import { personasDelEvento, proyeccion } from "./insumos";
import { sendEventSurveys, surveyEmailBudget } from "./eventSurvey";
import { fillPushText } from "../shared/customerPushConfig";
import { duePilotSteps, PILOT_STEPS, pilotStepExpiry, pilotStepTime, type PilotStatus, type PilotStepKey, type PilotStepState } from "../shared/eventPilot";

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const dedupe = (eventId: number, key: PilotStepKey) => `pilot:${eventId}:${key}`;

/** Personas esperadas: las que tienen entrada; sin ninguna todavía, 300 (lo mismo que usa el asistente). */
async function expectedPeople(eventId: number): Promise<number> {
  const db = await crossCheckDb();
  return (await personasDelEvento(db, eventId)).expected || 300;
}

/** Previsión de la barra para la gente esperada: qué falta comprar y cuánto cuesta (tarjeta de Inicio y paso del piloto). */
export async function barShoppingSummary(eventId: number): Promise<{
  personas: number; conEntrada: number; missingCost: number; faltan: { name: string; comprar: number }[]; totalFaltan: number; sinStockPlayroom: boolean; text: string;
}> {
  const db = await crossCheckDb();
  const conEntrada = (await personasDelEvento(db, eventId)).expected;
  const personas = conEntrada || 300;
  const p = await proyeccion({ eventId, personas });
  const lineas = [...(p.insumos as any[]), ...((p.generales?.lineas ?? []) as any[])].filter((i) => Number(i.containersToBuy) > 0);
  lineas.sort((a, b) => Number(b.cost ?? 0) - Number(a.cost ?? 0));
  const missingCost = lineas.reduce((s, i) => s + Number(i.cost ?? 0), 0);
  const faltan = lineas.slice(0, 5).map((i) => ({ name: String(i.name), comprar: Number(i.containersToBuy) }));
  const quien = conEntrada ? `${personas} personas con entrada` : `${personas} personas (estimado: todavía no hay entradas)`;
  const compra = p.sinStockPlayroom ? 'hay que comprar' : 'faltan';
  const text = lineas.length === 0
    ? `Para ${quien} alcanza todo lo que hay en stock.`
    : `Para ${quien} ${compra} ${lineas.length} insumo${lineas.length === 1 ? '' : 's'}${missingCost > 0 ? ` (${clp(missingCost)})` : ''}${p.sinStockPlayroom ? ', sin usar el stock de Playroom' : ''}. ${faltan.map((f) => `${f.name}: comprar ${f.comprar}`).join(' · ')}${lineas.length > 5 ? ' …' : ''}`;
  return { personas, conEntrada, missingCost, faltan, totalFaltan: lineas.length, sinStockPlayroom: !!p.sinStockPlayroom, text };
}

async function summaryFor(key: PilotStepKey, eventId: number, title: string): Promise<string> {
  switch (key) {
    case 'anuncio': return `Push a todos los que tienen la app anunciando ${title}.`;
    case 'aviso-diario': return 'Prende el correo diario a quienes no han comprado el próximo evento. Cada día te va a pedir su propio cross check antes de salir.';
    case 'compras-barra': return (await barShoppingSummary(eventId)).text;
    case 'recordatorio-dia': return `Push a quienes tienen entrada: hoy es ${title}.`;
    case 'encuesta': return 'Correo con la encuesta a quienes fueron a la fiesta.';
  }
}

/** Revisa los pilotos prendidos y pide los pasos que ya tocan. `onlyEventId`: solo ese (al prender el piloto). */
export async function runPilotTick(now: Date = new Date(), onlyEventId?: number): Promise<{ events: number; requested: number }> {
  const db = await crossCheckDb();
  const pilots = await db.select().from(eventPilots).where(onlyEventId ? and(eq(eventPilots.status, 'on'), eq(eventPilots.eventId, onlyEventId)) : eq(eventPilots.status, 'on'));
  let requested = 0;
  for (const pilot of pilots) {
    const ev = await getEventById(pilot.eventId);
    if (!ev || ev.status === 'cancelled') continue;
    const eventDate = new Date(ev.eventDate);
    const due = duePilotSteps(eventDate, new Date(pilot.startedAt), now);
    if (due.length === 0) continue;
    // Solo se arman los que todavía no se pidieron (la lista de compras calcula bastante).
    const asked = new Set((await db.select({ k: crossChecks.dedupeKey }).from(crossChecks)
      .where(inArray(crossChecks.dedupeKey, due.map((s) => dedupe(pilot.eventId, s.key))))).map((r) => r.k));
    for (const step of due) {
      if (asked.has(dedupe(pilot.eventId, step.key))) continue;
      try {
        const created = await requestCrossCheck({
          kind: `pilot:${step.key}`, dedupeKey: dedupe(pilot.eventId, step.key), eventId: pilot.eventId,
          title: `${step.title} · ${ev.title}`, summary: await summaryFor(step.key, pilot.eventId, ev.title),
          expiresAt: pilotStepExpiry(step, eventDate), pushBody: `Piloto ${ev.title}: ${step.title.toLowerCase()}`,
        });
        if (created) requested++;
      } catch (err) {
        console.error(`[Piloto] ${ev.title} · ${step.key}:`, err);
      }
    }
  }
  return { events: pilots.length, requested };
}

/** Lo que hace cada paso al reportarlo. Devuelve el texto del resultado. */
export async function runPilotStep(key: string, eventId: number | null, _payload: unknown): Promise<string> {
  if (!eventId) throw new Error('El paso no tiene evento.');
  const ev = await getEventById(eventId);
  if (!ev) throw new Error('El evento ya no existe.');
  const db = await crossCheckDb();
  switch (key as PilotStepKey) {
    case 'anuncio': {
      // Mismo aviso que «evento nuevo» (Notificaciones), aunque esté apagado allá: acá lo pidió el dueño.
      const [already] = await db.select({ id: pushCampaigns.id }).from(pushCampaigns)
        .where(and(eq(pushCampaigns.kind, 'evento'), eq(pushCampaigns.eventId, eventId))).limit(1);
      if (already) return 'Ya se había anunciado en la app: no se mandó de nuevo.';
      const rule = (await getCustomerPushConfig()).newEvent;
      const id = await createPushCampaign({
        title: fillPushText(rule.title, { evento: ev.title }), body: fillPushText(rule.body, { evento: ev.title }),
        url: `/eventos/${ev.slug}`, imageUrl: ev.imageUrl?.startsWith('http') ? ev.imageUrl : null,
        segment: { type: 'combo', include: [], exclude: [] }, kind: 'evento', eventId, status: 'scheduled', scheduledAt: new Date(), createdBy: 'piloto',
      });
      const r = await sendPushCampaign(id);
      return `Anuncio enviado a ${r.sentNow} dispositivo${r.sentNow === 1 ? '' : 's'}${r.later ? ` (${r.later} más en las próximas horas)` : ''}.`;
    }
    case 'aviso-diario':
      await updateSiteSettings({ salesDripEnabled: true });
      return 'Aviso diario de venta prendido. Desde su próxima hora te pedirá cross check cada día.';
    case 'compras-barra':
      return `Revisado. ${(await barShoppingSummary(eventId)).text}`;
    case 'recordatorio-dia': {
      const id = await createPushCampaign({
        title: `¡Hoy es ${ev.title}! 🎉`, body: 'Te esperamos esta noche. Tu entrada está en la app.',
        url: `/eventos/${ev.slug}`, segment: { type: 'combo', include: [{ type: 'event', eventId }], exclude: [] },
        kind: 'piloto-dia', eventId, status: 'scheduled', scheduledAt: new Date(), createdBy: 'piloto',
      });
      const r = await sendPushCampaign(id);
      return `Recordatorio enviado a ${r.sentNow} dispositivo${r.sentNow === 1 ? '' : 's'} de quienes tienen entrada.`;
    }
    case 'encuesta': {
      const r = await sendEventSurveys(eventId, await surveyEmailBudget());
      return `${r.sent} encuesta${r.sent === 1 ? '' : 's'} enviada${r.sent === 1 ? '' : 's'}${r.pending ? `, ${r.pending} quedan para después` : ''}.`;
    }
    default:
      throw new Error(`Paso del piloto desconocido: ${key}`);
  }
}

export async function getPilotStatus(eventId: number): Promise<PilotStatus> {
  const db = await crossCheckDb();
  const ev = await getEventById(eventId);
  const [pilot] = await db.select().from(eventPilots).where(eq(eventPilots.eventId, eventId)).limit(1);
  const rows = await db.select().from(crossChecks).where(like(crossChecks.dedupeKey, `pilot:${eventId}:%`));
  const byKey = new Map(rows.map((r) => [r.dedupeKey.split(':')[2], r]));
  const startedAt = pilot ? new Date(pilot.startedAt) : new Date();
  const eventDate = ev ? new Date(ev.eventDate) : new Date();
  const stateOf: Record<string, PilotStepState> = { pending: 'esperando', running: 'en curso', done: 'reportado', failed: 'fallo', discarded: 'descartado', expired: 'vencido' };
  return {
    eventId,
    on: pilot?.status === 'on',
    startedAt: pilot ? startedAt.toISOString() : null,
    steps: PILOT_STEPS.map((s) => {
      const row = byKey.get(s.key);
      const at = pilotStepTime(s, eventDate, startedAt);
      return {
        key: s.key, title: s.title, detail: s.detail, at: at.toISOString(),
        state: row ? stateOf[row.status] ?? 'esperando' : (Date.now() > pilotStepExpiry(s, eventDate).getTime() ? 'vencido' : 'futuro'),
        result: row?.result ?? null, crossCheckId: row?.id ?? null,
      };
    }),
  };
}

export async function startPilot(eventId: number): Promise<PilotStatus> {
  const ev = await getEventById(eventId);
  if (!ev) throw new Error('Evento no encontrado.');
  const db = await crossCheckDb();
  await db.insert(eventPilots).values({ eventId, status: 'on', startedAt: new Date() }).onDuplicateKeyUpdate({ set: { status: 'on' } });
  await runPilotTick(new Date(), eventId);
  return getPilotStatus(eventId);
}

export async function stopPilot(eventId: number): Promise<PilotStatus> {
  const db = await crossCheckDb();
  await db.update(eventPilots).set({ status: 'off' }).where(eq(eventPilots.eventId, eventId));
  await db.update(crossChecks).set({ status: 'discarded', decidedAt: new Date(), result: 'Piloto apagado' })
    .where(and(like(crossChecks.dedupeKey, `pilot:${eventId}:%`), eq(crossChecks.status, 'pending')));
  return getPilotStatus(eventId);
}

