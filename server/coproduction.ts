/* Co-producción con otra productora (ej. Playroom × Dalmore).
 *
 * Todo lo que ve el socio sale de acá, siempre acotado a SU evento: el
 * router nunca le acepta un eventId del cliente (ver `partnerProcedure`).
 * Las tablas son nuevas (drizzle/0108_coproductions.sql): si la migración no
 * está aplicada, las lecturas devuelven null/vacío en vez de romper el sitio. */
import { randomBytes, randomInt } from 'crypto';
import { and, desc, eq, gt, inArray, like, ne } from 'drizzle-orm';
import {
  coproductions, coproductionInvites, coproductionExpenses, coproductionContacts, adminAuditLog, rateLimits, events, expenses, orders, orderItems, tickets, ticketTypes,
  type Coproduction,
} from '../drizzle/schema';
import { getDb, getEventPnl, getOrderStats, getSalesByDay, getTicketTypesByEventId, createExpense, createManualOrder } from './db';
import { hashPin, verifyPin } from './caja/auth';
import { normalizeLanding, applyEventToLanding, splitProfit, generatePartnerPassword, COLAB_MIN_AGE, type ColabBrand, type CoproductionLanding } from '../shared/coproduction';
import { parseColabContacts } from '../shared/colabContacts';
import { escapeHtml } from '../shared/slideEdit';
import { chileDateKey } from '../shared/chileDate';
import { personasForTicket } from '../shared/mission300';
import { COLAB_HOSTS } from '../shared/colabHosts';
import { presaleParkingOnlyFor } from '../shared/colabPlaycard';
import { buildPlaymorePhases, tandaRowProblem, PLAYMORE_SOLTERO, type PlaymoreTandaRow } from '../shared/playmoreTandas';

const isMissingTable = (err: unknown) => /doesn't exist|no such table|unknown table/i.test(String((err as any)?.message ?? (err as any)?.cause?.message ?? err));

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (err) {
    if (isMissingTable(err)) return fallback;
    throw err;
  }
}

export async function getCoproductionBySlug(slug: string): Promise<Coproduction | null> {
  const db = await getDb();
  if (!db) return null;
  return safe(async () => (await db.select().from(coproductions).where(eq(coproductions.slug, slug)).limit(1))[0] ?? null, null);
}

export async function getCoproductionById(id: number): Promise<Coproduction | null> {
  const db = await getDb();
  if (!db) return null;
  return safe(async () => (await db.select().from(coproductions).where(eq(coproductions.id, id)).limit(1))[0] ?? null, null);
}

export async function listCoproductions(): Promise<Coproduction[]> {
  const db = await getDb();
  if (!db) return [];
  return safe(() => db.select().from(coproductions), []);
}

/** El evento pertenece a una co-producción que todavía NO está activa: no se
 * vende ni se muestra por link directo (sí desde el admin y la caja). */
export async function isEventHiddenByCoproduction(eventId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  return safe(async () => {
    const [row] = await db.select({ isLive: coproductions.isLive }).from(coproductions).where(eq(coproductions.eventId, eventId)).limit(1);
    return !!row && row.isLive !== 1;
  }, false);
}

/** La co-producción cuya clave es esta (para el login del socio). */
export async function findCoproductionByPassword(password: string): Promise<Coproduction | null> {
  if (!password) return null;
  for (const cp of await listCoproductions()) {
    if (cp.passwordHash && verifyPin(password, cp.passwordHash)) return cp;
  }
  return null;
}

/** Genera una clave nueva para el socio. Sube `sessionVersion` (cierra las
 * sesiones abiertas) y reinicia su 2FA: quien reciba la clave nueva lo
 * configura de cero. La clave legible se devuelve UNA vez. */
export async function resetPartnerPassword(id: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const cp = await getCoproductionById(id);
  if (!cp) throw new Error('Co-producción no encontrada');
  const password = generatePartnerPassword((max) => randomInt(max));
  await db.update(coproductions).set({
    passwordHash: hashPin(password),
    sessionVersion: cp.sessionVersion + 1,
    totpSecret: null, totpConfirmedAt: null, totpBackupCodes: null, totpLastUsedStep: null,
  }).where(eq(coproductions.id, id));
  return password;
}

/** Quita el acceso del socio: sin clave y con todas sus sesiones cerradas. */
export async function revokePartnerAccess(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const cp = await getCoproductionById(id);
  if (!cp) throw new Error('Co-producción no encontrada');
  await db.update(coproductions).set({
    passwordHash: null, sessionVersion: cp.sessionVersion + 1,
    totpSecret: null, totpConfirmedAt: null, totpBackupCodes: null, totpLastUsedStep: null,
  }).where(eq(coproductions.id, id));
}

export async function setPartnerTotp(id: number, patch: Partial<Pick<Coproduction, 'totpSecret' | 'totpConfirmedAt' | 'totpBackupCodes' | 'totpLastUsedStep'>>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(coproductions).set(patch).where(eq(coproductions.id, id));
}

export async function updateCoproductionSetup(id: number, patch: {
  eventId?: number | null; splitPercentPartner?: number; partnerName?: string; landing?: Partial<CoproductionLanding>;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const cp = await getCoproductionById(id);
  if (!cp) throw new Error('Co-producción no encontrada');
  if (patch.eventId) {
    const [other] = await db.select({ id: coproductions.id }).from(coproductions)
      .where(and(eq(coproductions.eventId, patch.eventId), ne(coproductions.id, id))).limit(1);
    if (other) throw new Error('Ese evento ya está enlazado a otra co-producción.');
  }
  const touchesPresale = patch.eventId !== undefined || !!patch.landing;
  await db.update(coproductions).set({
    ...(patch.eventId !== undefined ? { eventId: patch.eventId } : {}),
    ...(patch.splitPercentPartner !== undefined ? { splitPercentPartner: Math.min(100, Math.max(0, Math.round(patch.splitPercentPartner))) } : {}),
    ...(patch.partnerName ? { partnerName: patch.partnerName.trim().slice(0, 100) } : {}),
    // `launchedAt` nunca viene del editor: una pestaña vieja del panel no puede borrarlo y hacer que el lanzamiento salga dos veces.
    ...(patch.landing ? { landing: normalizeLanding({ ...normalizeLanding(cp.landing), ...patch.landing, launchedAt: normalizeLanding(cp.landing).launchedAt }) } : {}),
  }).where(eq(coproductions.id, id));
  if (touchesPresale) await syncColabPresale(id);
}

/** El evento enlazado vende por la web solo entrada y estacionamiento mientras la colaboración NO use el sistema PlayCard
 * (el interruptor del panel). Se reutiliza `events.presaleParkingOnly`, que ya bloquea en el servidor cualquier otro extra o
 * recarga de saldo. Nunca lanza: un fallo acá no debe romper guardar la configuración. */
export async function syncColabPresale(coproductionId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const cp = await getCoproductionById(coproductionId);
    if (!cp?.eventId) return;
    await db.update(events).set({ presaleParkingOnly: presaleParkingOnlyFor(normalizeLanding(cp.landing).usesPlaycard) }).where(eq(events.id, cp.eventId));
  } catch (err) {
    console.error('[Coproducción] No se pudo sincronizar «solo entrada y estacionamiento»:', err);
  }
}

/** ¿Este evento es de una colaboración que NO usa el sistema PlayCard? Ahí la PlayCard no puede recibir cargos (saldo ni Playcoins),
 * esté la colaboración activa o todavía por venir. */
export async function colabBlocksPlaycard(eventId: number): Promise<boolean> {
  const cp = await getCoproductionByEventId(eventId);
  return !!cp && !normalizeLanding(cp.landing).usesPlaycard;
}

export async function rotatePreviewToken(id: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const token = randomBytes(16).toString('hex');
  await db.update(coproductions).set({ previewToken: token }).where(eq(coproductions.id, id));
  return token;
}

/** Activar = la landing deja de ser "Próximamente", el evento se publica y
 * pasa a destacado (aparece en la home). Desactivar lo vuelve a ocultar. */
export async function setCoproductionLive(id: number, live: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const cp = await getCoproductionById(id);
  if (!cp) throw new Error('Co-producción no encontrada');
  if (live && !cp.eventId) throw new Error('Primero enlaza el evento en Configuración.');
  await db.update(coproductions).set({ isLive: live ? 1 : 0 }).where(eq(coproductions.id, id));
  if (live) await syncColabPresale(id);
  if (cp.eventId) {
    await db.update(events).set(live ? { status: 'published', featured: 1 } : { status: 'draft', featured: 0 })
      .where(eq(events.id, cp.eventId));
  }
  // La primera activación también lanza el mailing a toda la base (si está prendido en Configuración).
  if (live) {
    try { await scheduleLaunchMailing(cp); } catch (err) { console.error('[Coproducción] No se pudo programar el mailing de lanzamiento:', err); }
  }
}

export const LAUNCH_CAMPAIGN_NAME = 'PLAYMORE · Lanzamiento de la venta';

/** Lanzamiento de la venta: una sola vez, al activar por primera vez. Sale el mailing a toda la base (clientes y leads)
 * que todavía no tiene entrada, y la notificación a la app, los dos juntos. Quedan programados para "ahora": el cron de
 * mailing (cada 5 min) arma y manda los correos en lotes; la notificación sale de inmediato. Cada parte se prende o se
 * apaga en Configuración y el fallo de una no frena a la otra. */
async function scheduleLaunchMailing(cp: Coproduction): Promise<void> {
  const landing = normalizeLanding(cp.landing);
  if (landing.launchedAt || !cp.eventId || (!landing.launchMailing && !landing.launchPush)) return;
  const db = await getDb();
  if (!db) return;
  const [ev] = await db.select({ eventDate: events.eventDate, venue: events.venue, slug: events.slug, title: events.title }).from(events).where(eq(events.id, cp.eventId)).limit(1);
  const shown = applyEventToLanding(landing, ev);
  const launchedAt = new Date().toISOString();
  // Se marca antes de programar: un segundo clic en "Activar" ya no manda otra campaña.
  await db.update(coproductions).set({ landing: { ...landing, launchedAt } }).where(eq(coproductions.id, cp.id));
  const host = Object.entries(COLAB_HOSTS).find(([, s]) => s === cp.slug)?.[0] ?? 'dalmore.mansionplayroom.cl';
  let failures = 0;

  if (landing.launchMailing) {
    try {
      const { scheduleMailingCampaign } = await import('./mailing');
      await scheduleMailingCampaign({
        name: LAUNCH_CAMPAIGN_NAME,
        audienceDescription: `Toda la base (clientes y leads) sin entrada de ${landing.eventName}`,
        audienceFilters: { notPurchasedEventId: cp.eventId, includeLeads: true },
        content: {
          subject: `${landing.eventName}: se abrió la venta de entradas`,
          subjectB: `Ya puedes comprar tu entrada para ${landing.eventName} · Playroom × Dalmore`,
          preheader: 'Las fiestas liberales más grandes de la RM y la V Región, juntas por primera vez.',
          headline: `Se abrió la venta de ${landing.eventName}`,
          paragraphs: [
            'Las fiestas liberales más grandes de la Región Metropolitana y la V Región se juntan por primera vez. Playroom pone el juego, Dalmore la exclusividad: una noche nueva, libre y con respeto.',
            'Un nuevo spot especial en Providencia, dos comunidades y un line up de DJs pensado especialmente para esta fusión. Las entradas son nominativas y la primera tanda es la de mejor precio.',
            'La dirección exacta te llega por correo junto con tu entrada. Evento solo para mayores de 21.',
          ],
          ctaText: 'Comprar mi entrada',
          // El primer reel (colab con Dalmore en Instagram): solo si ya se cargó el link en Configuración.
          ...(landing.reelUrl ? { secondaryCtaText: 'Míralo en Instagram', secondaryCtaUrl: landing.reelUrl } : {}),
          highlightLabel: `${shown.dateText} · ${shown.timeText} hrs`,
          highlightValue: 'Venta abierta',
          theme: 'playmore',
        },
        ctaUrl: `https://${host}/?utm_source=mailing&utm_medium=email&utm_campaign=playmore-lanzamiento`,
        eventId: cp.eventId,
        scheduledAt: new Date(),
      });
    } catch (err) {
      failures++;
      console.error('[Coproducción] No se pudo programar el mailing de lanzamiento:', err);
    }
  }

  if (landing.launchPush) {
    try {
      const { createPushCampaign, sendPushCampaign } = await import('./customerPush');
      const id = await createPushCampaign({
        title: `${landing.eventName}: se abrió la venta`,
        body: 'Las fiestas liberales más grandes de la RM y la V Región, juntas por primera vez. Compra tu entrada.',
        url: `/checkout/${ev?.slug ?? ''}`,
        imageUrl: 'https://mansionplayroom.cl/playmore/og-playmore-v4.jpg',
        segment: { type: 'combo', include: [], exclude: [] },
        kind: 'lanzamiento-colab', eventId: cp.eventId, status: 'scheduled', scheduledAt: new Date(), createdBy: 'lanzamiento PLAYMORE',
      });
      await sendPushCampaign(id);
    } catch (err) {
      failures++;
      console.error('[Coproducción] No se pudo enviar la notificación de lanzamiento:', err);
    }
  }

  // Si todo falló, no queda marcado: el próximo "Activar" lo vuelve a intentar.
  const wanted = Number(landing.launchMailing) + Number(landing.launchPush);
  if (failures >= wanted) await db.update(coproductions).set({ landing: { ...landing, launchedAt: '' } }).where(eq(coproductions.id, cp.id));
}

/** Las 24 h siguientes a un lanzamiento el mailing puede salir completo (ver processMailingCronBatch). */
export async function launchMailingBoostActive(now: number = Date.now()): Promise<boolean> {
  for (const cp of await listCoproductions()) {
    const t = Date.parse(normalizeLanding(cp.landing).launchedAt);
    if (Number.isFinite(t) && now >= t && now - t < 24 * 3600_000) return true;
  }
  return false;
}

// ── Lo que ve el socio ───────────────────────────────────────────────────

async function requireEvent(cp: Coproduction) {
  if (!cp.eventId) return null;
  const db = await getDb();
  if (!db) return null;
  const [event] = await db.select().from(events).where(eq(events.id, cp.eventId)).limit(1);
  return event ?? null;
}

export async function getCoproductionOverview(cp: Coproduction) {
  const event = await requireEvent(cp);
  if (!event) return { event: null } as const;
  const db = (await getDb())!;

  const [web, caja, byDay, types] = await Promise.all([
    getOrderStats('web', event.id),
    getOrderStats('caja', event.id),
    getSalesByDay(event.id),
    getTicketTypesByEventId(event.id),
  ]);

  // Vendidas por tipo de acceso (órdenes aprobadas, web y caja).
  const itemRows = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, event.id), eq(orders.paymentStatus, 'approved')));
  const sold = new Map<number, { quantity: number; revenue: number }>();
  for (const r of itemRows) {
    const s = sold.get(r.ticketTypeId) ?? { quantity: 0, revenue: 0 };
    s.quantity += r.quantity;
    s.revenue += Number(r.totalPrice);
    sold.set(r.ticketTypeId, s);
  }

  // Personas (no entradas): un Dúo son 2, una invitación grupal son N.
  const ticketRows = await db.select({ groupSize: tickets.groupSize, accesoSlug: ticketTypes.accesoSlug, status: tickets.status })
    .from(tickets).innerJoin(orders, eq(orders.id, tickets.orderId)).innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(and(eq(orders.eventId, event.id), eq(orders.paymentStatus, 'approved'), ne(tickets.status, 'cancelled')));
  let personas = 0;
  let checkedIn = 0;
  for (const t of ticketRows) {
    const n = personasForTicket(t.groupSize, t.accesoSlug);
    personas += n;
    if (t.status === 'used') checkedIn += n;
  }

  return {
    event: { id: event.id, title: event.title, slug: event.slug, eventDate: event.eventDate, status: event.status },
    revenueWeb: Number(web?.totalRevenue ?? 0),
    revenueCaja: Number(caja?.totalRevenue ?? 0),
    ordersApproved: Number(web?.approvedOrders ?? 0) + Number(caja?.approvedOrders ?? 0),
    personas,
    checkedIn,
    byDay,
    ticketTypes: types.map((t: any) => ({
      id: t.id, name: t.name, price: Number(t.price), status: t.status,
      totalStock: t.totalStock ?? null, soldCount: t.soldCount ?? 0,
      quantity: sold.get(t.id)?.quantity ?? 0, revenue: sold.get(t.id)?.revenue ?? 0,
    })),
  } as const;
}

/** Asistentes del evento: compras aprobadas y cortesías, con contacto (lo
 * decidió el dueño). Nunca mira otros eventos ni el historial del cliente. */
export async function getCoproductionAttendees(cp: Coproduction) {
  const event = await requireEvent(cp);
  if (!event) return [];
  const db = (await getDb())!;
  const rows = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, buyerName: orders.buyerName, buyerEmail: orders.buyerEmail,
    buyerPhone: orders.buyerPhone, total: orders.total, paymentStatus: orders.paymentStatus, channel: orders.channel,
    createdAt: orders.createdAt,
  }).from(orders).where(and(eq(orders.eventId, event.id), inArray(orders.paymentStatus, ['approved', 'refunded'])))
    .orderBy(desc(orders.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const ticketRows = await db.select({ orderId: tickets.orderId, status: tickets.status, groupSize: tickets.groupSize, accesoSlug: ticketTypes.accesoSlug, typeName: ticketTypes.name })
    .from(tickets).innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId)).where(inArray(tickets.orderId, ids));
  const invites = await safe(() => db.select().from(coproductionInvites).where(inArray(coproductionInvites.orderId, ids)), []);
  const inviteBy = new Map(invites.map((i) => [i.orderId, i.createdBy]));

  return rows.map((r) => {
    const ts = ticketRows.filter((t) => t.orderId === r.id && t.status !== 'cancelled');
    const accesos = Array.from(new Set(ts.map((t) => t.typeName)));
    return {
      ...r,
      total: Number(r.total),
      accesos,
      personas: ts.reduce((s, t) => s + personasForTicket(t.groupSize, t.accesoSlug), 0),
      checkedIn: ts.length > 0 && ts.every((t) => t.status === 'used'),
      invitedBy: inviteBy.get(r.id) ?? null,
    };
  });
}

/** Cortesía: un acceso manual sin costo (cuenta para el aforo y le llega la
 * entrada por correo), marcado con quién la creó. */
export async function createCoproductionInvite(cp: Coproduction, input: {
  buyerName: string; buyerEmail: string; buyerPhone?: string; ticketTypeId: number; quantity: number;
}, createdBy: 'playroom' | 'partner') {
  const event = await requireEvent(cp);
  if (!event) throw new Error('Todavía no hay evento enlazado a la co-producción.');
  const types = await getTicketTypesByEventId(event.id);
  if (!types.some((t: any) => t.id === input.ticketTypeId)) throw new Error('Ese tipo de acceso no es de este evento.');
  const result = await createManualOrder({
    eventSlug: event.slug,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    items: [{ ticketTypeId: input.ticketTypeId, quantity: input.quantity, unitPrice: 0 }],
    kind: 'invitation',
  });
  const db = (await getDb())!;
  await db.insert(coproductionInvites).values({ coproductionId: cp.id, orderId: result.orderId, createdBy });
  return result;
}

// ── Base de contactos del socio ──────────────────────────────────────────
// Aparte de `customers`: no entra a los mailings ni a las audiencias de Playroom.

export async function listCoproductionContacts(cp: Coproduction) {
  const db = await getDb();
  if (!db) return [];
  return safe(() => db.select().from(coproductionContacts).where(eq(coproductionContacts.coproductionId, cp.id)).orderBy(desc(coproductionContacts.createdAt), desc(coproductionContacts.id)), []);
}

/** Importa la planilla (CSV o pegada). Los correos que ya están se saltan; devuelve el conteo. */
export async function importCoproductionContacts(cp: Coproduction, text: string, createdBy: 'playroom' | 'partner') {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const parsed = parseColabContacts(text);
  if (parsed.rows.length === 0) throw new Error('No encontré correos válidos en la planilla. Necesita una columna de correo.');
  const existing = new Set((await listCoproductionContacts(cp)).map((c) => c.email));
  const fresh = parsed.rows.filter((r) => !existing.has(r.email));
  for (let i = 0; i < fresh.length; i += 500) {
    await db.insert(coproductionContacts).values(fresh.slice(i, i + 500).map((r) => ({ coproductionId: cp.id, email: r.email, fullName: r.fullName, phone: r.phone, createdBy })));
  }
  return { added: fresh.length, alreadyThere: parsed.rows.length - fresh.length, invalid: parsed.invalid, duplicates: parsed.duplicates, tooMany: parsed.tooMany };
}

export async function deleteCoproductionContact(cp: Coproduction, id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(coproductionContacts).where(and(eq(coproductionContacts.id, id), eq(coproductionContacts.coproductionId, cp.id)));
}

/** Tope de destinatarios por aviso: una sola corrida del servidor (300 s) los manda en lotes de 100. */
export const COLAB_MAILING_MAX = 3000;

export function defaultColabMailing(landing: CoproductionLanding): { subject: string; message: string } {
  return {
    subject: `${landing.eventName}: tu entrada ya está disponible`,
    message: `Te escribimos porque queremos que vivas ${landing.eventName} con nosotros: ${landing.dateText}, ${landing.timeText} hrs.\n\nLas entradas son nominativas y el cupo es limitado. Evento solo para mayores de ${COLAB_MIN_AGE}.`,
  };
}

/** Aviso del evento a la base de contactos del socio. Lo manda el socio (o el dueño) desde su panel.
 * - Con `testTo` manda UNA prueba a ese correo y no gasta el envío del día.
 * - Real: un solo aviso por colab por día, sin quienes ya tienen entrada ni quienes pidieron la baja.
 * Cada correo lleva el pie y los headers de baja del mailing de Playroom. El texto del socio se escapa. */
export async function sendCoproductionMailing(cp: Coproduction, input: { subject: string; message: string; testTo?: string }, sentBy: 'playroom' | 'partner') {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (!cp.eventId) throw new Error('Todavía no hay evento enlazado a la co-producción.');
  const landing = normalizeLanding(cp.landing);
  const [ev] = await db.select({ eventDate: events.eventDate, venue: events.venue, slug: events.slug }).from(events).where(eq(events.id, cp.eventId)).limit(1);
  const shown = applyEventToLanding(landing, ev);
  const host = Object.entries(COLAB_HOSTS).find(([, slug]) => slug === cp.slug)?.[0] ?? 'dalmore.mansionplayroom.cl';
  const subject = input.subject.trim().slice(0, 150);
  const paragraphs = input.message.replace(/\r/g, '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).slice(0, 8)
    .map((t) => escapeHtml(t).replace(/\n/g, '<br>'));
  if (!subject || paragraphs.length === 0) throw new Error('Escribe el asunto y el mensaje.');

  const { buildMailingBlastEmail, resendTagValue, sendEmail, sendMarketingEmailBatch } = await import('./email');
  const build = (name: string | null) => buildMailingBlastEmail({
    buyerName: escapeHtml((name ?? '').trim().split(/\s+/)[0] ?? ''),
    preheader: subject,
    headline: escapeHtml(landing.eventName),
    paragraphs,
    ctaText: 'Comprar mi entrada',
    ctaUrl: `https://${host}/?utm_source=colab-contactos&utm_medium=email&utm_campaign=${resendTagValue(cp.slug)}`,
    highlightLabel: `${shown.dateText} · ${shown.timeText} hrs`,
    highlightValue: escapeHtml(landing.eventName),
    theme: 'playmore',
  });
  const tags = [{ name: 'campaign', value: resendTagValue(`colab-${cp.slug}`) }];

  if (input.testTo) {
    const r = await sendEmail({ to: input.testTo, subject: `[PRUEBA] ${subject}`, html: build('Prueba'), marketing: true, tags });
    if (!r.success) throw new Error('No se pudo enviar la prueba. Revisa el correo e intenta de nuevo.');
    return { test: true as const };
  }

  // Sin quienes ya compraron (o tienen cortesía) para este evento.
  const buyers = await db.select({ email: orders.buyerEmail }).from(orders)
    .where(and(eq(orders.eventId, cp.eventId), eq(orders.paymentStatus, 'approved')));
  const hasTicket = new Set(buyers.map((b) => (b.email ?? '').toLowerCase()));
  const contacts = await listCoproductionContacts(cp);
  const targets = contacts.filter((c) => !hasTicket.has(c.email));
  if (targets.length === 0) throw new Error(contacts.length ? 'Todos tus contactos ya tienen entrada. No hay a quién avisar.' : 'Primero importa tu planilla de contactos.');
  if (targets.length > COLAB_MAILING_MAX) throw new Error(`Son ${targets.length} destinatarios y el máximo por aviso es ${COLAB_MAILING_MAX}. Quita contactos de la lista e intenta de nuevo.`);

  // Un aviso por colab por día: reclamo atómico (la clave es única).
  const claimKey = `colab-mailing:${cp.id}:${chileDateKey(new Date())}`;
  try {
    await db.insert(rateLimits).values({ key: claimKey, attempts: targets.length });
  } catch {
    throw new Error('Hoy ya se envió un aviso a esta lista. Se puede mandar uno nuevo mañana.');
  }

  let results: Awaited<ReturnType<typeof sendMarketingEmailBatch>> = [];
  try {
    results = await sendMarketingEmailBatch(targets.map((c) => ({ to: c.email, subject, html: build(c.fullName), marketing: true, tags })));
  } catch (err) {
    await db.delete(rateLimits).where(eq(rateLimits.key, claimKey));
    throw err;
  }
  const sent = results.filter((r) => r.success).length;
  const optedOut = results.filter((r) => r.reason === 'Pidió no recibir correos').length;
  // Si no salió ninguno, no se gasta el envío del día.
  if (sent === 0) await db.delete(rateLimits).where(eq(rateLimits.key, claimKey));
  else {
    const { recordAdminAudit } = await import('./db');
    await recordAdminAudit({
      action: 'coproduction.mailing', targetType: 'coproduction', targetId: cp.slug, eventId: cp.eventId,
      payload: { detail: `Aviso del evento por correo a la base de ${cp.partnerName}: «${subject}» · ${sent} enviados`, by: sentBy === 'partner' ? cp.partnerName : 'Playroom' },
    });
  }
  return { test: false as const, sent, failed: results.length - sent - optedOut, optedOut, skippedWithTicket: contacts.length - targets.length };
}

/** Bitácora única de transparencia: todo lo que mueve el evento, de más nuevo a más viejo.
 * Ventas (web y caja), cortesías (con quién las creó), reembolsos, gastos (cargados, aprobados,
 * rechazados) y los cambios que hace Playroom a la venta (activar, tandas, reparto). Solo el
 * evento de la colab: nada de otros eventos ni de los gastos generales de Playroom. */
export type CoproductionMovement = {
  key: string; at: Date; kind: 'sale' | 'courtesy' | 'refund' | 'expense' | 'change';
  title: string; detail: string; amount: number | null; by: string;
};

export async function getCoproductionMovements(cp: Coproduction, limit = 400): Promise<CoproductionMovement[]> {
  const db = await getDb();
  if (!db || !cp.eventId) return [];
  const eventId = cp.eventId;
  const out: CoproductionMovement[] = [];

  const orderRows = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, buyerName: orders.buyerName, total: orders.total,
    paymentStatus: orders.paymentStatus, channel: orders.channel, createdAt: orders.createdAt,
  }).from(orders).where(and(eq(orders.eventId, eventId), inArray(orders.paymentStatus, ['approved', 'refunded'])))
    .orderBy(desc(orders.createdAt)).limit(limit);
  const ids = orderRows.map((o) => o.id);
  const invites = ids.length ? await safe(() => db.select().from(coproductionInvites).where(inArray(coproductionInvites.orderId, ids)), []) : [];
  const inviteBy = new Map(invites.map((i) => [i.orderId, i.createdBy]));
  const items = ids.length
    ? await db.select({ orderId: orderItems.orderId, quantity: orderItems.quantity, name: ticketTypes.name })
        .from(orderItems).innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId)).where(inArray(orderItems.orderId, ids))
    : [];
  for (const o of orderRows) {
    const total = Number(o.total);
    const what = items.filter((i) => i.orderId === o.id).map((i) => `${i.quantity}× ${i.name}`).join(' + ');
    const invitedBy = inviteBy.get(o.id);
    const isCourtesy = !!invitedBy || total === 0;
    out.push({
      key: `o${o.id}`, at: o.createdAt,
      kind: o.paymentStatus === 'refunded' ? 'refund' : isCourtesy ? 'courtesy' : 'sale',
      title: `${o.buyerName} · ${o.orderNumber}`,
      detail: `${what}${isCourtesy ? '' : ` · ${o.channel === 'caja' ? 'Caja' : 'Web'}`}`,
      amount: isCourtesy ? 0 : total,
      by: isCourtesy ? (invitedBy === 'partner' ? cp.partnerName : 'Playroom') : o.channel === 'caja' ? 'Caja' : 'Compra web',
    });
  }

  const submitted = await safe(() => db.select().from(coproductionExpenses).where(eq(coproductionExpenses.coproductionId, cp.id)), []);
  for (const e of submitted) {
    out.push({
      key: `e${e.id}`, at: e.createdAt, kind: 'expense', title: `Gasto cargado: ${e.description}`,
      detail: `${e.category}${e.supplier ? ` · ${e.supplier}` : ''} · ${e.status === 'approved' ? 'aprobado' : e.status === 'rejected' ? `rechazado${e.rejectReason ? ` (${e.rejectReason})` : ''}` : 'por aprobar'}`,
      amount: e.amountTotal, by: e.submittedBy === 'partner' ? cp.partnerName : 'Playroom',
    });
    if (e.reviewedAt && e.status !== 'pending') {
      out.push({ key: `er${e.id}`, at: e.reviewedAt, kind: 'expense', title: `Gasto ${e.status === 'approved' ? 'aprobado' : 'rechazado'}: ${e.description}`, detail: '', amount: e.amountTotal, by: 'Playroom' });
    }
  }

  const audit = await safe(() => db.select().from(adminAuditLog)
    .where(and(eq(adminAuditLog.eventId, eventId), like(adminAuditLog.action, 'coproduction.%')))
    .orderBy(desc(adminAuditLog.createdAt)).limit(limit), []);
  for (const a of audit) {
    const detail = (a.payload as { detail?: string } | null)?.detail ?? '';
    out.push({ key: `a${a.id}`, at: a.createdAt, kind: 'change', title: detail || a.action, detail: '', amount: null, by: (a.payload as { by?: string } | null)?.by ?? 'Playroom' });
  }

  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

// ── Gastos y reparto ─────────────────────────────────────────────────────

/** Gastos del evento: los reales (en `expenses`, ya cuentan) + los del socio
 * que esperan aprobación o se rechazaron. */
export async function listCoproductionExpenses(cp: Coproduction) {
  const db = await getDb();
  if (!db) return [];
  const submitted = await safe(() => db.select().from(coproductionExpenses).where(eq(coproductionExpenses.coproductionId, cp.id)).orderBy(desc(coproductionExpenses.createdAt)), []);
  const byExpenseId = new Map(submitted.filter((s) => s.expenseId).map((s) => [s.expenseId!, s]));

  const real = cp.eventId
    ? await db.select().from(expenses).where(and(eq(expenses.scope, 'evento'), eq(expenses.eventId, cp.eventId), eq(expenses.excludeFromPnl, 0), eq(expenses.recurrence, 'none')))
    : [];

  return [
    ...submitted.filter((s) => s.status !== 'approved').map((s) => ({
      key: `c${s.id}`, coproductionExpenseId: s.id, status: s.status, submittedBy: s.submittedBy, category: s.category,
      description: s.description, supplier: s.supplier, amountTotal: s.amountTotal, expenseDate: s.expenseDate,
      receiptUrl: s.receiptUrl, rejectReason: s.rejectReason,
    })),
    ...real.map((e) => ({
      key: `e${e.id}`, coproductionExpenseId: byExpenseId.get(e.id)?.id ?? null, status: 'approved' as const,
      submittedBy: byExpenseId.get(e.id)?.submittedBy ?? 'playroom', category: e.category, description: e.description,
      supplier: e.supplier, amountTotal: Number(e.amountTotal), expenseDate: e.expenseDate, receiptUrl: e.receiptUrl, rejectReason: null,
    })),
  ];
}

export const COPRODUCTION_EXPENSE_CATEGORIES = ['arriendo', 'barra', 'staff', 'produccion', 'decoracion', 'marketing', 'transporte', 'otros'] as const;
export const COPRODUCTION_DOCUMENT_TYPES = ['boleta', 'factura', 'boleta_honorarios', 'sin_documento'] as const;

export async function createCoproductionExpense(cp: Coproduction, input: {
  category: string; description: string; supplier?: string; documentType: string; amountTotal: number; expenseDate: Date; receiptUrl?: string;
}, submittedBy: 'playroom' | 'partner') {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  if (!cp.eventId) throw new Error('Todavía no hay evento enlazado a la co-producción.');
  const values = {
    coproductionId: cp.id, submittedBy, category: input.category, description: input.description.trim().slice(0, 255),
    supplier: input.supplier?.trim().slice(0, 160) || null, documentType: input.documentType,
    amountTotal: Math.round(input.amountTotal), expenseDate: input.expenseDate, receiptUrl: input.receiptUrl || null,
  };
  const [res] = await db.insert(coproductionExpenses).values({ ...values, status: 'pending' }) as any;
  const id = Number(res?.insertId);
  // Lo que carga Playroom entra directo; lo del socio espera aprobación.
  if (submittedBy === 'playroom' && id) await approveCoproductionExpense(cp, id);
  return { id };
}

export async function approveCoproductionExpense(cp: Coproduction, id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [row] = await db.select().from(coproductionExpenses).where(and(eq(coproductionExpenses.id, id), eq(coproductionExpenses.coproductionId, cp.id))).limit(1);
  if (!row) throw new Error('Gasto no encontrado');
  if (row.status === 'approved') return;
  if (!cp.eventId) throw new Error('Todavía no hay evento enlazado a la co-producción.');
  const created = await createExpense({
    scope: 'evento', eventId: cp.eventId, category: row.category, description: `${row.description}${row.submittedBy === 'partner' ? ` (cargado por ${cp.partnerName})` : ''}`,
    supplier: row.supplier, documentType: row.documentType, amountTotal: row.amountTotal, expenseDate: row.expenseDate,
    paymentMethod: 'otro', receiptUrl: row.receiptUrl,
  });
  await db.update(coproductionExpenses).set({ status: 'approved', expenseId: created.id, reviewedAt: new Date(), rejectReason: null })
    .where(eq(coproductionExpenses.id, id));
}

export async function rejectCoproductionExpense(cp: Coproduction, id: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [row] = await db.select().from(coproductionExpenses).where(and(eq(coproductionExpenses.id, id), eq(coproductionExpenses.coproductionId, cp.id))).limit(1);
  if (!row) throw new Error('Gasto no encontrado');
  if (row.status === 'approved') throw new Error('Ese gasto ya está aprobado: para quitarlo bórralo en Gastos y P&L.');
  await db.update(coproductionExpenses).set({ status: 'rejected', rejectReason: reason.trim().slice(0, 255) || null, reviewedAt: new Date() })
    .where(eq(coproductionExpenses.id, id));
}

/** Utilidad del evento SIN gastos generales de Playroom, repartida según el
 * porcentaje acordado. Los gastos del socio sin aprobar no cuentan. */
export async function getCoproductionSplit(cp: Coproduction) {
  if (!cp.eventId) return null;
  const pnl = await getEventPnl(cp.eventId, { excludeGeneral: true });
  if (!pnl) return null;
  const pending = (await listCoproductionExpenses(cp)).filter((e) => e.status === 'pending');
  return {
    pnl,
    split: splitProfit(pnl.netProfit, cp.splitPercentPartner),
    partnerName: cp.partnerName,
    pendingExpenses: pending.length,
    pendingAmount: pending.reduce((s, e) => s + e.amountTotal, 0),
  };
}

/** Marca compartida de un evento con co-producción activa: lo que ven el
 * checkout, los correos y la entrada. null si no es una colab (o no está activa). */
export async function getEventColabBrand(eventId: number, opts: { allowNotLive?: boolean } = {}): Promise<ColabBrand | null> {
  const db = await getDb();
  if (!db) return null;
  return safe(async () => {
    const [cp] = await db.select().from(coproductions).where(eq(coproductions.eventId, eventId)).limit(1);
    if (!cp || (cp.isLive !== 1 && !opts.allowNotLive)) return null;
    const [ev] = await db.select({ slug: events.slug, eventDate: events.eventDate, venue: events.venue }).from(events).where(eq(events.id, eventId)).limit(1);
    const landing = applyEventToLanding(normalizeLanding(cp.landing), ev);
    return {
      eventSlug: ev?.slug ?? '',
      slug: cp.slug, partnerName: cp.partnerName, partnerLogoUrl: landing.partnerLogoUrl, eventName: landing.eventName,
      countdownIso: landing.countdownIso, timeText: landing.timeText, venueText: landing.venueText,
      dressCode: landing.dressCode, highlights: landing.highlights, about: landing.subheadline,
    };
  }, null);
}

/** Compras web recientes de un evento para el aviso "en vivo" de la landing:
 * solo el nombre del acceso y cuándo. Sin nombres, montos ni cantidades. */
export async function getRecentPurchases(eventId: number, hours = 48): Promise<{ name: string; at: string }[]> {
  const db = await getDb();
  if (!db) return [];
  return safe(async () => {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await db.select({ name: ticketTypes.name, at: orders.createdAt })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
      .where(and(
        eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved'), eq(orders.channel, 'web'),
        eq(ticketTypes.category, 'acceso'), gt(orders.createdAt, since),
      ))
      .orderBy(desc(orders.createdAt))
      .limit(8);
    return rows.map((r) => ({ name: r.name, at: new Date(r.at).toISOString() }));
  }, []);
}

/** Marca de la colab de una orden por su número (páginas de resultado del pago). */
export async function getBrandForOrder(orderNumber: string): Promise<ColabBrand | null> {
  const db = await getDb();
  if (!db) return null;
  const [o] = await safe(() => db.select({ eventId: orders.eventId }).from(orders).where(eq(orders.orderNumber, orderNumber.trim())).limit(1), []);
  return o ? getEventColabBrand(o.eventId) : null;
}

/** El evento está enlazado a una co-producción (sus entradas son nominativas: una por compra). */
export async function isEventColab(eventId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  return safe(async () => {
    const [row] = await db.select({ id: coproductions.id }).from(coproductions).where(eq(coproductions.eventId, eventId)).limit(1);
    return !!row;
  }, false);
}

/** La co-producción enlazada a un evento (o null). */
export async function getCoproductionByEventId(eventId: number): Promise<Coproduction | null> {
  const db = await getDb();
  if (!db) return null;
  return safe(async () => (await db.select().from(coproductions).where(eq(coproductions.eventId, eventId)).limit(1))[0] ?? null, null);
}

/** Cómo se puede mirar el checkout de un evento de colab que TODAVÍA no está a la venta:
 *  'owner' = el dueño (sesión admin) o quien trae el link de vista previa: recorre todo, incluido el pago simulado;
 *  'early' = "mostrar tickets antes de lanzar": cualquiera recorre los pasos, pero el pago queda cerrado;
 *  null    = no se ve. Nunca permite crear una orden (eso lo rechaza el servidor mientras no esté activo). */
export function checkoutPreviewAccess(
  cp: Coproduction | null,
  opts: { isAdmin: boolean; previewOk: boolean },
): 'owner' | 'early' | null {
  if (!cp || cp.isLive === 1) return null;
  if (opts.isAdmin || opts.previewOk) return 'owner';
  return normalizeLanding(cp.landing).showTicketsEarly ? 'early' : null;
}

/** Carga en el evento de la colab las 3 tandas con el precio exacto de cada acceso (shared/playmoreTandas.ts):
 * deja la 1ª tanda vigente (price = 1ª, originalPrice = general), guarda las fases en el evento y fija el soltero
 * (precio único y pocos cupos, sin tandas). Si ya hay entradas vendidas pide `force` para no pisar una tanda en curso. */
export async function applyPlaymoreTandas(
  coproductionId: number, rows: PlaymoreTandaRow[], until: (string | null)[],
  solteroPrice: number, solteroStock: number, force: boolean,
): Promise<{ updated: string[]; missing: string[]; percents: { slug: string; t1: number; t2: number }[] }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const cp = await getCoproductionById(coproductionId);
  if (!cp?.eventId) throw new Error('Primero enlaza el evento en Configuración.');
  for (const r of rows) { const p = tandaRowProblem(r); if (p) throw new Error(p); }
  if (!(Number.isInteger(solteroPrice) && solteroPrice > 0) || !(Number.isInteger(solteroStock) && solteroStock > 0)) throw new Error('Voy solo: precio y cupos deben ser enteros mayores a 0.');
  const tts = (await db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, cp.eventId), eq(ticketTypes.category, 'acceso'), eq(ticketTypes.status, 'active'))));
  const sold = tts.filter((t) => t.soldCount > 0);
  if (sold.length && !force) throw new Error('Ya hay entradas vendidas en este evento: aplicar las tandas de nuevo pisaría la tanda en curso. Confirma para forzarlo.');
  const updated: string[] = []; const missing: string[] = [];
  for (const r of rows) {
    const tt = tts.find((t) => t.accesoSlug === r.slug);
    if (!tt) { missing.push(r.slug); continue; }
    await db.update(ticketTypes).set({ price: String(r.t1), originalPrice: String(r.general) }).where(eq(ticketTypes.id, tt.id));
    updated.push(r.slug);
  }
  const sol = tts.find((t) => t.accesoSlug === PLAYMORE_SOLTERO.slug);
  if (sol) {
    await db.update(ticketTypes).set({ price: String(solteroPrice), originalPrice: null, totalStock: Math.max(solteroStock, sol.soldCount) }).where(eq(ticketTypes.id, sol.id));
    updated.push(sol.accesoSlug!);
  } else missing.push(PLAYMORE_SOLTERO.slug);
  await db.update(events).set({ tandaDiscountSchedule: buildPlaymorePhases(rows, until) as any, tandaPhaseIndex: 0 }).where(eq(events.id, cp.eventId));
  const { exactPercents } = await import('../shared/playmoreTandas');
  return { updated, missing, percents: rows.map((r) => ({ slug: r.slug, ...(({ t1, t2 }) => ({ t1, t2 }))(exactPercents(r)) })) };
}
