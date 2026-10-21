/* Concursos de Instagram: el motor. Las reglas puras (chances, sorteo,
 * plantillas) viven en shared/contest.ts; acá lo que toca base de datos y Meta.
 *
 * Todo corre solo, sin que nadie tenga que mirar el concurso:
 * - Comentario en el post del concurso (webhook o sincronización cada 15 min):
 *   registra a la persona, cuenta sus etiquetas y le manda por DM privado su
 *   premio de consuelo (cupón o regalos de asistente) y su link para invitar.
 * - Mención en historia: suma el bonus. Palabra clave por DM: participa.
 *   Responder con el correo de su compra: pasa a "con entrada" y recibe los
 *   regalos de asistente.
 * - Compra aprobada (webhooks.ts): suma chances a quien invitó y, si quien
 *   compra participaba sin entrada, lo pasa al sorteo VIP con x3.
 * - Cron (cronRoutes.ts, instagram-followup): a la hora del sorteo sortea,
 *   entrega los premios que se pueden entregar y avisa; si un ganador no
 *   reclama a tiempo, pasa el suplente.
 *
 * Nada de esto puede romper el webhook ni la compra: cada punto de entrada
 * atrapa sus errores (por ejemplo, si la migración 0109 no se corrió). */
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import type { Express, Request, Response } from 'express';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  contestLog, contestParticipants, contestWinners, contests, customers, discountCodes, events, igThreads, orderItems,
  blockedCustomers, orders, ticketTypes, tickets, type Contest, type ContestParticipant, type ContestWinner,
} from '../drizzle/schema';
import { adjustPlaycoinsManually, appendIgMessage, countEmailsSentToday, findCustomersByInstagram, getDb } from './db';
import { ENV } from './_core/env';
import {
  canReplyWithinWindow, fetchInstagramProfile, fetchMediaComments, fetchOwnProfile, replyToComment, sendButtonMessage, sendInstagramMessage,
  sendPrivateReply,
} from './instagramSend';
import { buildContestHolderInviteEmail, buildContestWinnerEmail, sendEmail } from './email';
import { generateTicketQR } from './qr';
import { fallbackInternalCode, generateDisplayCode } from './caja/displayCode';
import { formatChileDate, formatChileTime } from '../shared/chileDate';
import { normalizeTandaSchedule } from '../shared/tandaSchedule';
import { normalizeIgHandle } from '../shared/igCustomerLink';
import {
  commentEnrolls, computeChances, contestPhase, defaultDrawAt, dmFallbackReply, drawPoolFor, fitDmText, extractEmail, dmEnrolls, matchesAllKeywords, utf8Bytes, parseKeywords, priceLockCodePercent, refundAmountFor, mergeMentions, normalizeContestConfig, parseMentions,
  prizeLabels, randomContestCode, randomInviteCode, renderContestTemplate, weightedDraw, type ContestConfig,
} from '../shared/contest';
import { buildRanking, pickGuaranteedLeader } from '../shared/contestRanking';
import { buildTemplateConfig, getContestTemplate, type ContestTemplateKey } from '../shared/contestTemplates';
import { CONTEST_EMAIL_DAILY_LIMIT } from '../shared/emailQuota';
import { asksForMilestoneCode, milestoneState } from '../shared/contestMilestones';
import { answerMatches } from '../shared/contestQuiz';
import { flashBlockers } from '../shared/contestFlash';
import type { PhotoAttachment } from '../shared/contestPhoto';
import { countdownMetaText, countdownState } from '../shared/contestCountdown';
import { ageOn, isVerifyComplete, missingVerifyFields, parseVerifyReply } from '../shared/contestVerify';

const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');
/** Meta deja mandar un DM privado a un comentario hasta 7 días después. */
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface ContestCtx {
  contest: Contest;
  config: ContestConfig;
  event: { id: number; title: string; slug: string; eventDate: Date };
  prizeName: string | null;
  vipPrizeName: string | null;
  giftName: string | null;
}

/* ── Lectura ─────────────────────────────────────────────────────────────── */

async function loadCtx(db: Db, contest: Contest): Promise<ContestCtx | null> {
  const [event] = await db.select({ id: events.id, title: events.title, slug: events.slug, eventDate: events.eventDate })
    .from(events).where(eq(events.id, contest.eventId)).limit(1);
  if (!event) return null;
  const config = normalizeContestConfig(contest.config);
  const ids = [config.prizes.prizeTicketTypeId, config.prizes.vipPrizeTicketTypeId, config.prizes.holderGiftTicketTypeId]
    .filter((x): x is number => x !== null);
  const types = ids.length ? await db.select({ id: ticketTypes.id, name: ticketTypes.name }).from(ticketTypes).where(inArray(ticketTypes.id, ids)) : [];
  const nameOf = (id: number | null) => (id ? types.find((t) => t.id === id)?.name ?? null : null);
  return {
    contest, config, event,
    prizeName: nameOf(config.prizes.prizeTicketTypeId),
    vipPrizeName: nameOf(config.prizes.vipPrizeTicketTypeId),
    giftName: nameOf(config.prizes.holderGiftTicketTypeId),
  };
}

/** El concurso "principal" que está corriendo (el ranking si lo hay, si no
 * el más reciente). `null` si no hay o si la tabla no existe todavía. */
export async function getActiveContestCtx(): Promise<ContestCtx | null> {
  const all = await getActiveContestCtxs();
  return all.find((c) => c.contest.template === 'ranking') ?? all[0] ?? null;
}

/** Todos los concursos corriendo (pueden convivir varios, cada uno con su
 * publicación). El más reciente primero. */
export async function getActiveContestCtxs(): Promise<ContestCtx[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(contests).where(eq(contests.status, 'active')).orderBy(desc(contests.id));
    const out: ContestCtx[] = [];
    for (const contest of rows) {
      const ctx = await loadCtx(db, contest);
      if (ctx) out.push(ctx);
    }
    return out;
  } catch {
    return [];
  }
}

export async function getCtxById(id: number): Promise<ContestCtx | null> {
  const db = await getDb();
  if (!db) return null;
  const [contest] = await db.select().from(contests).where(eq(contests.id, id)).limit(1);
  return contest ? loadCtx(db, contest) : null;
}

let ownUsernameCache: { value: string; at: number } | null = null;
/** @ de la propia cuenta, para que etiquetarla no sume. Se cachea 1 h. */
export async function ownUsername(): Promise<string> {
  if (ownUsernameCache && Date.now() - ownUsernameCache.at < 60 * 60 * 1000) return ownUsernameCache.value;
  try {
    const profile = await fetchOwnProfile();
    ownUsernameCache = { value: (profile.username ?? '').toLowerCase(), at: Date.now() };
  } catch {
    ownUsernameCache = { value: ownUsernameCache?.value ?? '', at: Date.now() };
  }
  return ownUsernameCache.value;
}

export function chancesOf(p: ContestParticipant, config: ContestConfig): number {
  return computeChances({
    mentionCount: (p.mentions ?? []).length,
    storyMentioned: p.storyMentioned === 1,
    invitedPurchases: p.invitedPurchases,
    boughtDuringContest: p.boughtDuringContest === 1,
  }, config.chances);
}

/* ── Links y textos ──────────────────────────────────────────────────────── */

export function checkoutUrl(ctx: ContestCtx, opts: { code?: string | null; content: string }): string {
  const params = new URLSearchParams();
  if (opts.code) params.set('code', opts.code);
  params.set('utm_source', 'instagram');
  params.set('utm_medium', 'concurso');
  params.set('utm_campaign', `concurso-${ctx.contest.id}`);
  params.set('utm_content', opts.content);
  return `${APP_URL}/checkout/${ctx.event.slug}?${params.toString()}`;
}

export const inviteLink = (code: string) => `${APP_URL}/c/${code}`;
export const positionLink = (code: string) => `${APP_URL}/r/${code}`;
export const CONTEST_APP_URL = APP_URL;
export const BASES_URL = `${APP_URL}/concurso`;

export function drawDateText(config: ContestConfig): string {
  if (!config.drawAt) return 'antes de la fiesta';
  return `${formatChileDate(config.drawAt, { withWeekday: true })} a las ${formatChileTime(config.drawAt)}`;
}

/** Avance del reto por hitos (lo guarda server/contestMilestones.ts en drawLog). */
function milestoneVars(ctx: ContestCtx): Record<string, string | number> {
  if (ctx.contest.template !== 'milestones') return {};
  const log = (ctx.contest.drawLog ?? {}) as { count?: number; code?: string | null };
  const count = Number(log.count ?? 0);
  const state = milestoneState(count, ctx.config.milestones.steps);
  return {
    comentarios: count,
    hito_porcentaje: state.percent,
    hito_codigo: log.code ?? '',
    proximo_hito: state.next?.comments ?? '',
    proximo_porcentaje: state.next?.percent ?? '',
    faltan: state.remaining,
  };
}

/** Avance de la cuenta regresiva (lo guarda server/contestCountdown.ts en drawLog). */
function countdownVars(ctx: ContestCtx): Record<string, string | number> {
  if (ctx.contest.template !== 'countdown') return {};
  const sold = Number(((ctx.contest.drawLog ?? {}) as { sold?: number }).sold ?? 0);
  const state = countdownState(sold, ctx.config.countdown.steps);
  return {
    vendidas: sold,
    ganadores_actuales: state.winners,
    proxima_meta: state.next?.tickets ?? '',
    proximos_ganadores: state.next?.winners ?? '',
    faltan_meta: state.remaining,
    meta_texto: countdownMetaText(state),
  };
}

function giftLines(ctx: ContestCtx, p: { orderId: number | null; email: string | null }): string {
  const lines: string[] = [];
  if (ctx.giftName && p.orderId) lines.push(`• 1 ${ctx.giftName} gratis: ya está en tu entrada, se canjea en caja`);
  if (ctx.config.prizes.holderPlaycoins > 0 && p.email) lines.push(`• ${ctx.config.prizes.holderPlaycoins.toLocaleString('es-CL')} PlayCoins en tu PlayCard`);
  if (lines.length === 0) lines.push('• Tu código para un amigo (abajo) 💌');
  return lines.join('\n');
}

/** Hasta cuándo dura el precio congelado: X h después del sorteo (o, sin
 * fecha de sorteo, hasta la fiesta). */
function priceLockUntil(ctx: ContestCtx): Date {
  const base = ctx.config.drawAt ? new Date(ctx.config.drawAt).getTime() + ctx.config.prizes.priceLockHoursAfterDraw * 60 * 60 * 1000 : new Date(ctx.event.eventDate).getTime();
  return new Date(Math.min(base, new Date(ctx.event.eventDate).getTime()));
}

const dateTimeText = (d: Date | string) => `${formatChileDate(d, { withWeekday: true })} a las ${formatChileTime(d)}`;

export function templateVars(ctx: ContestCtx, p: ContestParticipant, extra: Record<string, string | number | null | undefined> = {}) {
  const { prizes, chances } = ctx.config;
  const labels = prizeLabels(ctx.prizeName, prizes.doubleWinners);
  return {
    nombre: p.username ? `@${p.username}` : '',
    chances: chancesOf(p, ctx.config),
    ganadores_doble: prizes.doubleWinners,
    premio: labels.plural,
    premio_singular: labels.singular,
    premio_vip: prizes.vipPrizeLabel,
    por_etiqueta: chances.perMention,
    max_etiquetas: chances.maxMentions,
    bonus_historia: chances.storyBonus,
    bonus_compra_amigo: chances.perInvitedPurchase,
    multiplicador: chances.buyerMultiplier,
    porcentaje: prizes.couponPercent,
    horas: prizes.couponHours,
    cupon: p.couponCode,
    porcentaje_amigo: prizes.friendPercent,
    codigo_amigo: p.friendCode,
    link_invitar: inviteLink(p.inviteCode),
    fecha_sorteo: drawDateText(ctx.config),
    link_bases: BASES_URL,
    evento: ctx.event.title,
    lista_regalos: giftLines(ctx, p),
    link_posicion: positionLink(p.inviteCode),
    ...milestoneVars(ctx),
    ...countdownVars(ctx),
    congelado_hasta: dateTimeText(priceLockUntil(ctx)),
    ...extra,
  };
}

/* ── Envío ───────────────────────────────────────────────────────────────── */

export type Channel = { kind: 'comment'; commentId: string } | { kind: 'dm'; igUserId: string; threadId: number | null };

export async function send(channel: Channel, text: string, button?: { title: string; url: string } | null): Promise<void> {
  if (channel.kind === 'comment') {
    // Instagram deja UN solo mensaje por comentario (respuesta privada): el
    // link va dentro del texto, no como un segundo mensaje con botón.
    await sendPrivateReply(channel.commentId, fitDmText(button ? `${text}\n\n👉 ${button.url}` : text));
    return;
  }
  const { mid } = await sendInstagramMessage({ recipientId: channel.igUserId, text });
  if (channel.threadId) await appendIgMessage({ threadId: channel.threadId, mid, direction: 'out', source: 'bot', text });
  if (button) {
    const { mid: buttonMid } = await sendButtonMessage({ id: channel.igUserId }, '👇', button);
    if (channel.threadId) await appendIgMessage({ threadId: channel.threadId, mid: buttonMid, direction: 'out', source: 'bot', text: `[botón] ${button.title}` });
  }
}

/** Canal por el que todavía se le puede escribir a alguien que ya participa:
 * su chat si escribió hace menos de 24 h, o un comentario suyo sin usar
 * (menos de 7 días). `null` = hoy no hay forma de mandarle un DM. */
export async function reachableChannel(db: Db, p: ContestParticipant): Promise<Channel | null> {
  const [thread] = await db.select({ id: igThreads.id, lastInboundAt: igThreads.lastInboundAt })
    .from(igThreads).where(eq(igThreads.igUserId, p.igUserId)).limit(1);
  if (thread && canReplyWithinWindow(thread.lastInboundAt)) return { kind: 'dm', igUserId: p.igUserId, threadId: thread.id };
  if (p.spareCommentId && p.spareCommentAt && Date.now() - new Date(p.spareCommentAt).getTime() < PRIVATE_REPLY_WINDOW_MS) {
    // Se gasta: Meta acepta un solo DM privado por comentario.
    await db.update(contestParticipants).set({ spareCommentId: null, spareCommentAt: null }).where(eq(contestParticipants.id, p.id));
    return { kind: 'comment', commentId: p.spareCommentId };
  }
  return null;
}

/* ── Códigos y regalos ───────────────────────────────────────────────────── */

export async function createCode(db: Db, input: {
  prefix: string; type: 'percentage' | 'fixed'; value: number; maxUses: number; validUntil: Date; eventId: number;
  description: string; applicableTicketTypeIds?: number[] | null; basedOnOriginalPrice?: boolean;
}): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomContestCode(input.prefix);
    try {
      await db.insert(discountCodes).values({
        code,
        description: input.description.slice(0, 255),
        discountType: input.type,
        discountValue: String(input.value),
        // Más de un uso a propósito en cupones de consuelo: el uso se descuenta
        // al crear la orden, y un pago que falla no lo devuelve.
        maxUses: input.maxUses,
        eventId: input.eventId,
        applicableTicketTypeIds: input.applicableTicketTypeIds ?? null,
        basedOnOriginalPrice: input.basedOnOriginalPrice ? 1 : 0,
        validUntil: input.validUntil,
        isActive: 1,
      });
      return code;
    } catch (err) {
      if (attempt === 5) throw err;
    }
  }
  throw new Error('No se pudo crear el código.');
}

/** % de descuento de la tanda vigente del evento (sobre el precio general). */
async function currentPhasePercent(db: Db, eventId: number): Promise<number> {
  const [event] = await db.select({ schedule: events.tandaDiscountSchedule, index: events.tandaPhaseIndex }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return 0;
  const schedule = normalizeTandaSchedule(event.schedule);
  return schedule[Math.min(event.index, schedule.length - 1)]?.percent ?? 0;
}

const extraActive = (ctx: ContestCtx, createdAt: Date | string, now = Date.now()) =>
  ctx.config.prizes.couponHours > 0 && now - new Date(createdAt).getTime() < ctx.config.prizes.couponHours * 60 * 60 * 1000;

/** Cupón personal: congela el precio de la tanda en que participó (hasta X h
 * después del sorteo) y, las primeras horas, suma el % extra. Se calcula
 * sobre el precio general (`basedOnOriginalPrice`) y se recalcula cuando
 * cambia la tanda o vence el extra (refreshContestPriceLocks). */
async function ensureCoupon(db: Db, ctx: ContestCtx, p: ContestParticipant): Promise<ContestParticipant> {
  if (p.couponCode) return p;
  const locked = await currentPhasePercent(db, ctx.event.id);
  const lockUntil = priceLockUntil(ctx);
  const extraUntil = Date.now() + ctx.config.prizes.couponHours * 60 * 60 * 1000;
  const code = await createCode(db, {
    prefix: 'REGALO', type: 'percentage', value: priceLockCodePercent(locked, locked, ctx.config.prizes.couponPercent), maxUses: 2,
    basedOnOriginalPrice: true,
    validUntil: new Date(Math.max(lockUntil.getTime(), Math.min(extraUntil, new Date(ctx.event.eventDate).getTime()))), eventId: ctx.event.id,
    description: `Concurso «${ctx.contest.title}»: precio congelado de @${p.username ?? p.igUserId}`,
  });
  await db.update(contestParticipants).set({ couponCode: code, lockedPhasePercent: locked }).where(eq(contestParticipants.id, p.id));
  return { ...p, couponCode: code, lockedPhasePercent: locked };
}

/** Recalcula el % de los cupones del concurso activo del evento: si subió la
 * tanda, el cupón cubre la diferencia; si venció su % extra, se lo quita.
 * Corre en el cron y justo después de cambiar de tanda. Nunca lanza. */
export async function refreshContestPriceLocks(eventId?: number): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;
    let updated = 0;
    for (const ctx of await getActiveContestCtxs()) {
      if (eventId !== undefined && ctx.event.id !== eventId) continue;
      updated += await refreshPriceLocksFor(db, ctx);
    }
    return updated;
  } catch (err) {
    console.error('[Concurso] No se pudieron recalcular los precios congelados:', err);
    return 0;
  }
}

async function refreshPriceLocksFor(db: Db, ctx: ContestCtx): Promise<number> {
  {
    const current = await currentPhasePercent(db, ctx.event.id);
    const rows = await db.select({ couponCode: contestParticipants.couponCode, locked: contestParticipants.lockedPhasePercent, createdAt: contestParticipants.createdAt })
      .from(contestParticipants).where(and(eq(contestParticipants.contestId, ctx.contest.id), sql`${contestParticipants.couponCode} IS NOT NULL`, sql`${contestParticipants.lockedPhasePercent} IS NOT NULL`));
    const byValue = new Map<number, string[]>();
    for (const r of rows) {
      const value = priceLockCodePercent(r.locked!, current, extraActive(ctx, r.createdAt) ? ctx.config.prizes.couponPercent : 0);
      byValue.set(value, [...(byValue.get(value) ?? []), r.couponCode!]);
    }
    let updated = 0;
    for (const [value, codes] of Array.from(byValue.entries())) {
      const [res] = await db.update(discountCodes).set({ discountValue: String(value) })
        .where(and(inArray(discountCodes.code, codes), sql`${discountCodes.discountValue} <> ${String(value)}`));
      updated += Number((res as unknown as { affectedRows?: number }).affectedRows ?? 0);
    }
    return updated;
  }
}

async function ensureFriendCode(db: Db, ctx: ContestCtx, p: ContestParticipant): Promise<ContestParticipant> {
  if (p.friendCode || ctx.config.prizes.friendPercent <= 0) return p;
  const code = await createCode(db, {
    prefix: 'AMIGO', type: 'percentage', value: ctx.config.prizes.friendPercent, maxUses: 2,
    validUntil: new Date(new Date(ctx.event.eventDate).getTime() + 24 * 60 * 60 * 1000), eventId: ctx.event.id,
    description: `Concurso «${ctx.contest.title}»: para un amigo de @${p.username ?? p.igUserId}`,
  });
  await db.update(contestParticipants).set({ friendCode: code }).where(eq(contestParticipants.id, p.id));
  return { ...p, friendCode: code };
}

/** Carga un producto gratis en una orden ya pagada: su vale (displayCode)
 * aparece junto a la entrada, listo para canjear en caja como cualquier extra. */
export async function grantFreeItem(db: Db, orderId: number, ticketTypeId: number): Promise<boolean> {
  const [order] = await db.select({ id: orders.id, eventId: orders.eventId, buyerName: orders.buyerName, paymentStatus: orders.paymentStatus })
    .from(orders).where(eq(orders.id, orderId)).limit(1);
  const [product] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId)).limit(1);
  if (!order || order.paymentStatus !== 'approved' || !product) return false;
  const [inserted] = await db.insert(orderItems).values({
    orderId, ticketTypeId, quantity: 1, unitPrice: '0', totalPrice: '0', unitCost: product.costPrice ?? undefined,
  });
  const orderItemId = (inserted as unknown as { insertId: number }).insertId;
  const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
  const [eventRow] = await db.select({ title: events.title }).from(events).where(eq(events.id, order.eventId)).limit(1);
  const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, eventRow?.title ?? '');
  await db.insert(tickets).values({
    ticketCode, orderId, orderItemId, eventId: order.eventId, ticketTypeId,
    holderName: order.buyerName, qrData, qrImageUrl, status: 'valid',
    displayCode: generateDisplayCode(product.internalCode || fallbackInternalCode(product.name)),
  });
  // Cuenta como vendido para el inventario real, igual que el regalo de un código.
  await db.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, ticketTypeId));
  return true;
}

/** Regalos de asistente (una sola vez por persona): producto gratis en su
 * entrada, PlayCoins y código para un amigo. */
async function deliverHolderPrizes(db: Db, ctx: ContestCtx, p: ContestParticipant): Promise<ContestParticipant> {
  let current = await ensureFriendCode(db, ctx, p);
  if (current.holderPrizesAt) return current;
  const now = new Date();
  const [res] = await db.update(contestParticipants).set({ holderPrizesAt: now })
    .where(and(eq(contestParticipants.id, p.id), isNull(contestParticipants.holderPrizesAt)));
  if ((res as unknown as { affectedRows: number }).affectedRows !== 1) return current;
  current = { ...current, holderPrizesAt: now };
  if (ctx.config.prizes.holderGiftTicketTypeId && current.orderId) {
    await grantFreeItem(db, current.orderId, ctx.config.prizes.holderGiftTicketTypeId)
      .catch((err) => console.error('[Concurso] No se pudo cargar el regalo de asistente:', err));
  }
  if (ctx.config.prizes.holderPlaycoins > 0 && current.email) {
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, current.email)).limit(1);
    if (customer) await adjustPlaycoinsManually(customer.id, ctx.config.prizes.holderPlaycoins, `Concurso «${ctx.contest.title}»`);
  }
  return current;
}

/** ¿Esta persona ya tiene entrada aprobada para la fiesta? Busca por el
 * correo que dio y por su @ guardado en la ficha de cliente. */
export async function findHolderOrder(db: Db, eventId: number, input: { email?: string | null; username?: string | null }): Promise<{ email: string; orderId: number; createdAt: Date } | null> {
  const emails = new Set<string>();
  if (input.email) emails.add(input.email.trim().toLowerCase());
  const handle = normalizeIgHandle(input.username);
  if (handle) for (const c of await findCustomersByInstagram(handle)) emails.add(c.email.trim().toLowerCase());
  for (const email of Array.from(emails)) {
    const [order] = await db.select({ id: orders.id, createdAt: orders.createdAt }).from(orders).where(and(
      eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved'), sql`LOWER(${orders.buyerEmail}) = ${email}`,
    )).orderBy(desc(orders.id)).limit(1);
    if (order) return { email, orderId: order.id, createdAt: order.createdAt };
  }
  return null;
}

/** Cuándo arrancó el concurso: una compra desde ese momento cuenta como
 * "compró durante el concurso" (sigue en el sorteo de entradas dobles). */
function contestStart(ctx: ContestCtx): Date {
  return new Date(ctx.config.startsAt ?? ctx.contest.createdAt);
}

/** Marca que tiene entrada (y si la compró durante el concurso, antes del sorteo). */
export async function markHolder(db: Db, ctx: ContestCtx, participantId: number, holder: { email: string; orderId: number; createdAt: Date }) {
  // Compró entre el inicio del concurso y el sorteo (la revisión final del
  // sorteo corre con drawnAt ya puesto, por eso se compara con su fecha).
  const bought = new Date(holder.createdAt).getTime();
  const during = bought >= contestStart(ctx).getTime() && (!ctx.contest.drawnAt || bought < new Date(ctx.contest.drawnAt).getTime());
  await db.update(contestParticipants).set({
    hasTicket: 1, awaitingEmail: 0, email: holder.email, orderId: holder.orderId, ...(during ? { boughtDuringContest: 1 } : {}),
  }).where(eq(contestParticipants.id, participantId));
}

/* ── Participantes ───────────────────────────────────────────────────────── */

export async function getParticipant(db: Db, contestId: number, igUserId: string): Promise<ContestParticipant | null> {
  const [row] = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.igUserId, igUserId))).limit(1);
  return row ?? null;
}

export async function reload(db: Db, id: number): Promise<ContestParticipant> {
  const [row] = await db.select().from(contestParticipants).where(eq(contestParticipants.id, id)).limit(1);
  return row;
}

/** Registra un "pasó esto" una sola vez. `false` = ya estaba procesado. */
export async function claimLog(db: Db, contestId: number, kind: 'comment' | 'story' | 'order', refId: string, participantId: number | null): Promise<boolean> {
  try {
    await db.insert(contestLog).values({ contestId, kind, refId: refId.slice(0, 100), participantId });
    return true;
  } catch {
    return false;
  }
}

/** Quien mencionó la cuenta en su historia ANTES de inscribirse conserva el
 * bonus: la mención se guardó como pendiente y se aplica al entrar. */
async function applyPendingStory(db: Db, ctx: ContestCtx, p: ContestParticipant): Promise<ContestParticipant> {
  if (p.storyMentioned) return p;
  const [pending] = await db.select({ id: contestLog.id }).from(contestLog).where(and(
    eq(contestLog.contestId, ctx.contest.id), eq(contestLog.kind, 'story'), eq(contestLog.refId, pendingStoryKey(p.igUserId)),
  )).limit(1);
  if (!pending) return p;
  await db.update(contestParticipants).set({ storyMentioned: 1 }).where(eq(contestParticipants.id, p.id));
  return { ...p, storyMentioned: 1 };
}

const pendingStoryKey = (igUserId: string) => `pending:${igUserId}`.slice(0, 100);

export async function createParticipant(db: Db, ctx: ContestCtx, input: {
  igUserId: string; username: string | null; source: 'comment' | 'story' | 'dm' | 'purchase'; commentId?: string | null; mentions?: string[];
}): Promise<{ participant: ContestParticipant; created: boolean }> {
  const existing = await getParticipant(db, ctx.contest.id, input.igUserId);
  if (existing) return { participant: existing, created: false };
  // Se inscribió solo al comprar (con su @): ahora que comenta o escribe se le
  // pone su id real y recibe su bienvenida, sin duplicarlo.
  const handle = normalizeIgHandle(input.username);
  const placeholder = handle ? await getParticipant(db, ctx.contest.id, `ig:${handle}`) : null;
  if (placeholder) {
    await db.update(contestParticipants).set({
      igUserId: input.igUserId, source: input.source, firstCommentId: input.commentId ?? null,
      mentions: mergeMentions(placeholder.mentions ?? [], input.mentions ?? []),
      ...(input.source === 'story' ? { storyMentioned: 1 } : {}),
    }).where(eq(contestParticipants.id, placeholder.id));
    return { participant: await applyPendingStory(db, ctx, await reload(db, placeholder.id)), created: true };
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await db.insert(contestParticipants).values({
        contestId: ctx.contest.id,
        igUserId: input.igUserId,
        username: input.username,
        source: input.source,
        firstCommentId: input.commentId ?? null,
        mentions: input.mentions ?? [],
        storyMentioned: input.source === 'story' ? 1 : 0,
        inviteCode: randomInviteCode(),
      });
      break;
    } catch (err) {
      // Otro proceso lo creó primero (webhook y sincronización a la vez), o
      // chocó el código de invitación: se reintenta / se usa el existente.
      const again = await getParticipant(db, ctx.contest.id, input.igUserId);
      if (again) return { participant: again, created: false };
      if (attempt === 3) throw err;
    }
  }
  let participant = await applyPendingStory(db, ctx, (await getParticipant(db, ctx.contest.id, input.igUserId))!);
  const holder = await findHolderOrder(db, ctx.event.id, { username: input.username });
  if (holder) {
    await markHolder(db, ctx, participant.id, holder);
    participant = await deliverHolderPrizes(db, ctx, await reload(db, participant.id));
  } else {
    participant = await ensureCoupon(db, ctx, participant);
    await db.update(contestParticipants).set({ awaitingEmail: 1 }).where(eq(contestParticipants.id, participant.id));
    participant = { ...participant, awaitingEmail: 1 };
  }
  return { participant, created: true };
}

/** El mensaje de bienvenida que le toca (con o sin entrada, antes o después
 * del sorteo) y su botón. */
function welcomeMessage(ctx: ContestCtx, p: ContestParticipant): { text: string; button: { title: string; url: string } | null } {
  const vars = templateVars(ctx, p);
  const m = ctx.config.messages;
  // Antes del sorteo, todos reciben el link a su posición en el ranking.
  const ranked = !ctx.contest.drawnAt && ctx.contest.template === 'ranking';
  const positionLine = ranked ? `\n\n📊 Mira tu posición y cómo subir: ${positionLink(p.inviteCode)}` : '';
  // Cuentas privadas: su mención en historia no llega, piden captura. Solo si cabe en un DM.
  const proofLine = ranked && !p.storyMentioned ? `\n\n${renderContestTemplate(m.privateProofAsk, vars)}` : '';
  const withProof = (text: string) => (utf8Bytes(`${text}${proofLine}`) <= 960 ? `${text}${proofLine}` : text);
  if (p.hasTicket) {
    // Compró durante el concurso: sigue por la entrada doble con su ×.
    const template = p.boughtDuringContest && !ctx.contest.drawnAt ? m.boughtUpgrade : m.holder;
    return { text: withProof(`${renderContestTemplate(template, vars)}${positionLine}`), button: null };
  }
  const drawn = !!ctx.contest.drawnAt;
  const text = drawn
    ? renderContestTemplate(m.afterDraw, vars)
    : withProof(`${renderContestTemplate(m.noTicket, vars)}\n\n${renderContestTemplate(m.holderAsk, vars)}${positionLine}`);
  return {
    text,
    // Link corto (/p/<código>): lleva al checkout con su código ya puesto.
    button: { title: 'Comprar a mi precio', url: `${APP_URL}/p/${p.inviteCode}` },
  };
}

/** ¿Este concurso recibe participantes ahora? */
export function accepting(ctx: ContestCtx): boolean {
  const phase = contestPhase(ctx.contest, ctx.config);
  return phase === 'live' || (phase === 'drawn' && ctx.config.couponsAfterDraw);
}

/* ── Entradas desde Instagram ────────────────────────────────────────────── */

/** Comentario en un post. Devuelve `true` si era del post del concurso (y
 * entonces el webhook no lo manda al borrador de la IA). */
export async function handleContestComment(input: {
  commentId: string; mediaId: string | null; igUserId: string; username: string | null; text: string;
}, preloaded?: ContestCtx | null): Promise<boolean> {
  try {
    // Cada concurso tiene su publicación: el comentario va al que la tiene.
    const ctx = preloaded ?? (input.mediaId ? (await getActiveContestCtxs()).find((c) => c.contest.mediaId === input.mediaId) ?? null : null);
    if (!ctx || !ctx.contest.mediaId || input.mediaId !== ctx.contest.mediaId) return false;
    const own = await ownUsername();
    // Comentarios de la propia cuenta (incluidas nuestras respuestas) no participan.
    if (input.igUserId === ENV.igUserId || (own && input.username?.toLowerCase() === own)) return true;
    if (!accepting(ctx)) return false;
    const db = await getDb();
    if (!db) return false;
    if (!(await claimLog(db, ctx.contest.id, 'comment', input.commentId, null))) return true;
    // Reto relámpago: el comentario es un intento de respuesta.
    if (ctx.contest.template === 'flash') {
      return (await import('./contestFlash')).handleFlashAnswer(db, ctx, {
        igUserId: input.igUserId, username: input.username, text: input.text, channel: { kind: 'comment', commentId: input.commentId }, commentId: input.commentId,
      });
    }
    // Quiz: el comentario es una respuesta (si no acierta, sigue su camino normal).
    if (ctx.contest.template === 'quiz') {
      return (await import('./contestQuiz')).handleQuizAnswer(db, ctx, {
        igUserId: input.igUserId, username: input.username, text: input.text, channel: { kind: 'comment', commentId: input.commentId }, commentId: input.commentId,
      });
    }

    // Solo inscribe quien comenta la palabra clave. Quien ya participa (o se
    // inscribió al comprar con su @) suma etiquetas con cualquier comentario.
    // Los demás comentarios siguen su camino normal (borrador de respuesta).
    const handle = normalizeIgHandle(input.username);
    const known = !!(await getParticipant(db, ctx.contest.id, input.igUserId))
      || !!(handle && await getParticipant(db, ctx.contest.id, `ig:${handle}`));
    if (!commentEnrolls(input.text, ctx.config.keyword, known)) return false;

    const mentions = parseMentions(input.text, [own, input.username ?? ''].filter(Boolean));
    const { participant, created } = await createParticipant(db, ctx, {
      igUserId: input.igUserId, username: input.username, source: 'comment', commentId: input.commentId, mentions,
    });
    await db.update(contestLog).set({ participantId: participant.id })
      .where(and(eq(contestLog.contestId, ctx.contest.id), eq(contestLog.kind, 'comment'), eq(contestLog.refId, input.commentId)));

    if (!created) {
      // Otro comentario de alguien que ya participa: suma etiquetas nuevas y
      // queda guardado para poder avisarle por DM si gana.
      await db.update(contestParticipants).set({
        mentions: mergeMentions(participant.mentions ?? [], mentions),
        spareCommentId: input.commentId,
        spareCommentAt: new Date(),
        ...(participant.username ? {} : { username: input.username }),
      }).where(eq(contestParticipants.id, participant.id));
      return true;
    }
    if (participant.disqualified) return true;

    const { text, button } = welcomeMessage(ctx, participant);
    const dmSent = await send({ kind: 'comment', commentId: input.commentId }, text, button)
      .then(() => true)
      .catch((err) => { console.error('[Concurso] No se pudo mandar el DM de bienvenida:', err); return false; });
    // Si el DM no salió, la respuesta pública lo invita a escribir la palabra
    // clave: así abre el chat y recibe todo por ahí (sin quedar sin nada).
    const replies = ctx.config.messages.publicReplies;
    const publicText = !dmSent ? dmFallbackReply(ctx.config.keyword, ctx.config.keywordPhrase)
      : ctx.config.publicReply && replies.length > 0 ? replies[Math.floor(Math.random() * replies.length)] : null;
    if (publicText) {
      await replyToComment(input.commentId, publicText)
        .catch((err) => console.error('[Concurso] No se pudo responder el comentario:', err));
    }
    return true;
  } catch (err) {
    console.error('[Concurso] Error procesando el comentario:', err);
    return false;
  }
}

/** Con varios concursos activos, ¿a cuál va este mensaje? 1º el que tiene un
 * premio esperando a esta persona; 2º el que usa estas palabras clave; 3º en
 * el que ya participa; si nada calza, el principal. */
async function pickCtxForMessage(db: Db, igUserId: string, text: string, hasPhotos = false): Promise<ContestCtx | null> {
  const all = await getActiveContestCtxs();
  if (all.length <= 1) return all[0] ?? null;
  const participants = new Map<number, ContestParticipant | null>();
  for (const c of all) participants.set(c.contest.id, await getParticipant(db, c.contest.id, igUserId));
  for (const c of all) {
    const p = participants.get(c.contest.id);
    if (!p) continue;
    const [pending] = await db.select({ id: contestWinners.id }).from(contestWinners).where(and(
      eq(contestWinners.contestId, c.contest.id), eq(contestWinners.participantId, p.id),
      inArray(contestWinners.status, ['notified', 'verifying', 'review', 'choosing']),
    )).limit(1);
    if (pending) return c;
  }
  if (hasPhotos) {
    const photoCtx = all.find((c) => c.contest.template === 'photo');
    if (photoCtx) return photoCtx;
  }
  const keywordMatch = all.find((c) => {
    const keywords = parseKeywords(c.config.keyword);
    return keywords.length > 0 && matchesAllKeywords(text, keywords);
  });
  if (keywordMatch) return keywordMatch;
  const flashMatch = all.find((c) => c.contest.template === 'flash' && c.config.flash.answers.some((a) => answerMatches(text, a)));
  if (flashMatch) return flashMatch;
  const quizMatch = all.find((c) => c.contest.template === 'quiz' && c.config.quiz.questions.some((q) => q.answers.some((a) => answerMatches(text, a))));
  if (quizMatch) return quizMatch;
  return all.find((c) => participants.get(c.contest.id)) ?? (await getActiveContestCtx());
}

/** Mensaje directo (o respuesta a historia, o mención en historia). Devuelve
 * `true` si lo manejó el concurso (y el agente de IA no debe contestar). */
export async function handleContestMessage(input: {
  igUserId: string; username: string | null; threadId: number | null; text: string; mid: string | null; storyMention: boolean;
  /** Es la respuesta a una historia (no un DM suelto). */
  storyReply?: boolean;
  /** El mensaje trae una imagen (captura de su historia, cuentas privadas). */
  hasImage?: boolean;
  /** Fotos del mensaje (mención en historia o imagen por DM). */
  photos?: PhotoAttachment[];
}): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const ctx = await pickCtxForMessage(db, input.igUserId, input.text, (input.photos?.length ?? 0) > 0);
    if (!ctx) return false;
    const channel: Channel = { kind: 'dm', igUserId: input.igUserId, threadId: input.threadId };
    let participant = await getParticipant(db, ctx.contest.id, input.igUserId);

    // 1. Ganador que no pudimos contactar: cualquier mensaje suyo lo reclama.
    if (participant) {
      const pending = await db.select().from(contestWinners).where(and(
        eq(contestWinners.contestId, ctx.contest.id), eq(contestWinners.participantId, participant.id), eq(contestWinners.status, 'notified'),
      )).limit(1);
      if (pending[0]) {
        await deliverWinnerPrize(db, ctx, pending[0], participant, channel, input.text);
        return true;
      }
      // Ganador en verificación: lo que escriba son sus datos.
      if (!input.storyMention && input.text.trim()) {
        const [verifying] = await db.select().from(contestWinners).where(and(
          eq(contestWinners.contestId, ctx.contest.id), eq(contestWinners.participantId, participant.id), inArray(contestWinners.status, ['verifying', 'review']),
        )).limit(1);
        if (verifying) {
          await handleVerifyReply(db, ctx, verifying, participant, channel, input.text.trim());
          return true;
        }
      }
      // Ganador que había comprado y todavía no elige: se le reenvía el link.
      const [choosing] = await db.select().from(contestWinners).where(and(
        eq(contestWinners.contestId, ctx.contest.id), eq(contestWinners.participantId, participant.id), eq(contestWinners.status, 'choosing'),
      )).limit(1);
      if (choosing) {
        await sendBuyerWinnerMessage(ctx, choosing, participant, channel);
        return true;
      }
    }

    // Concurso de fotos: las fotos (mención en historia o imagen por DM) son la inscripción.
    if (ctx.contest.template === 'photo') {
      if (!accepting(ctx) || ctx.contest.drawnAt) return false;
      if (ctx.config.drawAt && Date.now() > new Date(ctx.config.drawAt).getTime()) return false;
      return (await import('./contestPhoto')).handlePhotoEntry(db, ctx, {
        igUserId: input.igUserId, username: input.username, photos: input.photos ?? [], mid: input.mid, channel,
      });
    }

    // 1b. Captura de su historia (cuenta privada): queda por revisar en el panel.
    if (input.hasImage && !input.storyMention && participant && !participant.disqualified && !ctx.contest.drawnAt) {
      const [earlier] = await db.select({ id: contestLog.id }).from(contestLog).where(and(
        eq(contestLog.contestId, ctx.contest.id), eq(contestLog.kind, 'story'), eq(contestLog.participantId, participant.id), sql`${contestLog.refId} LIKE 'proof:%'`,
      )).limit(1);
      if (await claimLog(db, ctx.contest.id, 'story', `proof:${participant.id}:${input.mid ?? Date.now()}`, participant.id) && !earlier) {
        await send(channel, renderContestTemplate(ctx.config.messages.proofReceived, templateVars(ctx, participant)));
      }
      return true;
    }

    // 2. Mención en historia: solo suma el bonus a quien YA participa (una
    // mención suelta de la cuenta no inscribe ni manda nada).
    if (input.storyMention && (ctx.contest.template === 'quiz' || ctx.contest.template === 'flash')) return false;
    if (input.storyMention) {
      if (!participant) {
        // Aún no participa: la mención queda guardada y suma cuando comente.
        if (accepting(ctx)) await claimLog(db, ctx.contest.id, 'story', pendingStoryKey(input.igUserId), null);
        return false;
      }
      if (!accepting(ctx) || !(await claimLog(db, ctx.contest.id, 'story', input.mid ?? `${input.igUserId}-${Date.now()}`, participant.id))) return true;
      if (participant.storyMentioned) return true;
      await db.update(contestParticipants).set({ storyMentioned: 1 }).where(eq(contestParticipants.id, participant.id));
      participant = await reload(db, participant.id);
      if (!participant.disqualified && !ctx.contest.drawnAt) {
        await send(channel, renderContestTemplate(ctx.config.messages.extraChances, templateVars(ctx, participant)));
      }
      return true;
    }

    const text = input.text.trim();
    if (!text) return false;

    // Reto relámpago: respuesta por DM o a la historia del reto.
    if (ctx.contest.template === 'flash') {
      if (!accepting(ctx) || ctx.contest.drawnAt) return false;
      return (await import('./contestFlash')).handleFlashAnswer(db, ctx, { igUserId: input.igUserId, username: input.username, text, channel, commentId: null, storyReply: !!input.storyReply });
    }

    // Retos por hitos: "hito" / "código" por DM devuelve el código vigente (el reel no lo publica).
    if (ctx.contest.template === 'milestones' && participant && !participant.disqualified && asksForMilestoneCode(text)) {
      await (await import('./contestMilestones')).replyMilestoneCode(ctx, participant, channel);
      return true;
    }

    // Quiz: el DM (o la respuesta a la historia) es una respuesta; si no
    // acierta, no se hace nada automático (la historia puede ser de otra cosa).
    if (ctx.contest.template === 'quiz') {
      if (!accepting(ctx) || ctx.contest.drawnAt) return false;
      return (await import('./contestQuiz')).handleQuizAnswer(db, ctx, { igUserId: input.igUserId, username: input.username, text, channel, commentId: null });
    }

    // 3. Responde con el correo de su compra.
    const email = extractEmail(text);
    if (participant && email && !participant.hasTicket) {
      const holder = await findHolderOrder(db, ctx.event.id, { email });
      if (!holder) {
        await send(channel, renderContestTemplate(ctx.config.messages.emailNotFound, templateVars(ctx, participant)));
        return true;
      }
      await markHolder(db, ctx, participant.id, holder);
      await linkInstagramToCustomer(db, holder.email, participant.username);
      participant = await deliverHolderPrizes(db, ctx, await reload(db, participant.id));
      const { text: holderText } = welcomeMessage(ctx, participant);
      await send(channel, holderText);
      return true;
    }

    // 3b. Respuesta a una historia con la palabra clave: entra con los puntos
    // base y se le invita a comentar el reel para sumar más (etiquetas).
    if (input.storyReply && !participant && accepting(ctx) && matchesAllKeywords(text, parseKeywords(ctx.config.keyword))) {
      const { participant: created } = await createParticipant(db, ctx, { igUserId: input.igUserId, username: input.username, source: 'dm' });
      const vars = templateVars(ctx, created, {
        frase: ctx.config.keywordPhrase.trim() || parseKeywords(ctx.config.keyword).join(' '),
        link_reel: ctx.contest.mediaPermalink ?? '',
        puntos_texto: chancesOf(created, ctx.config) === 1 ? '1 solo punto' : `${chancesOf(created, ctx.config)} puntos`,
      });
      const positionLine = ctx.contest.drawnAt || ctx.contest.template !== 'ranking' ? '' : `\n\n📊 Mira quién va arriba y cómo subir: ${positionLink(created.inviteCode)}`;
      await send(channel, `${renderContestTemplate(ctx.config.messages.storyToReel, vars)}${positionLine}`, { title: 'Comprar a mi precio', url: `${APP_URL}/p/${created.inviteCode}` });
      return true;
    }

    // 4. Palabra clave por DM: participa. Solo si el mensaje ES la palabra
    // (una pregunta que la nombra la contesta el agente, no inscribe).
    if (dmEnrolls(text, ctx.config.keyword) && accepting(ctx)) {
      if (participant) {
        const { text: again, button } = welcomeMessage(ctx, participant);
        await send(channel, again, button);
        return true;
      }
      const { participant: created } = await createParticipant(db, ctx, { igUserId: input.igUserId, username: input.username, source: 'dm' });
      const { text: welcome, button } = welcomeMessage(ctx, created);
      await send(channel, welcome, button);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Concurso] Error procesando el mensaje:', err);
    return false;
  }
}

/** Deja el @ en la ficha del cliente si no tenía (sirve para reconocerlo la
 * próxima vez sin preguntarle el correo). */
async function linkInstagramToCustomer(db: Db, email: string, username: string | null) {
  if (!username) return;
  await db.update(customers).set({ instagram: `@${username}` })
    .where(and(eq(customers.email, email), sql`(${customers.instagram} IS NULL OR ${customers.instagram} = '')`))
    .catch(() => {});
}

/* ── Compras ─────────────────────────────────────────────────────────────── */

/** Compra aprobada (webhooks.ts → processApprovedOrder). Nunca lanza. */
export async function contestOnOrderApproved(order: {
  id: number; eventId: number; buyerEmail: string; discountCodeId: number | null;
  utmMedium?: string | null; utmCampaign?: string | null; utmContent?: string | null;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(contests)
      .where(and(eq(contests.eventId, order.eventId), eq(contests.status, 'active'))).orderBy(desc(contests.id));
    for (const contest of rows) {
      try {
        const ctx = await loadCtx(db, contest);
        if (ctx) await orderApprovedFor(db, ctx, order);
      } catch (err) {
        console.error(`[Concurso] Error procesando la compra en el concurso ${contest.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[Concurso] Error procesando la compra:', err);
  }
}

async function orderApprovedFor(db: Db, ctx: ContestCtx, order: {
  id: number; eventId: number; buyerEmail: string; discountCodeId: number | null;
  utmMedium?: string | null; utmCampaign?: string | null; utmContent?: string | null;
}): Promise<void> {
  const contest = ctx.contest;
  {
    const buyerEmail = order.buyerEmail.trim().toLowerCase();

    let code: string | null = null;
    if (order.discountCodeId) {
      const [d] = await db.select({ code: discountCodes.code }).from(discountCodes).where(eq(discountCodes.id, order.discountCodeId)).limit(1);
      code = d?.code ?? null;
    }
    const byField = async (field: 'couponCode' | 'friendCode' | 'inviteCode', value: string | null) => {
      if (!value) return null;
      const [row] = await db.select().from(contestParticipants)
        .where(and(eq(contestParticipants.contestId, contest.id), eq(contestParticipants[field], value))).limit(1);
      return row ?? null;
    };

    let buyer = await byField('couponCode', code);
    const [customer] = await db.select({ instagram: customers.instagram }).from(customers).where(eq(customers.email, buyerEmail)).limit(1);
    const handle = normalizeIgHandle(customer?.instagram);
    if (!buyer) {
      if (handle) {
        const [row] = await db.select().from(contestParticipants)
          .where(and(eq(contestParticipants.contestId, contest.id), sql`LOWER(${contestParticipants.username}) = ${handle}`)).limit(1);
        buyer = row ?? null;
      }
    }
    if (!buyer) {
      const [row] = await db.select().from(contestParticipants)
        .where(and(eq(contestParticipants.contestId, contest.id), eq(contestParticipants.email, buyerEmail))).limit(1);
      buyer = row ?? null;
    }

    let referrer = await byField('friendCode', code);
    if (!referrer && order.utmMedium === 'concurso' && order.utmCampaign === `concurso-${contest.id}`) {
      referrer = await byField('inviteCode', order.utmContent ?? null);
    }
    if (referrer && (referrer.id === buyer?.id || (referrer.email && referrer.email === buyerEmail))) referrer = null;

    const prizeWinner = code
      ? (await db.select({ id: contestWinners.id }).from(contestWinners).where(and(eq(contestWinners.contestId, contest.id), eq(contestWinners.prizeCode, code))).limit(1))[0]
      : undefined;
    const fromContestLink = order.utmMedium === 'concurso' && order.utmCampaign === `concurso-${contest.id}`;
    // Compró sin haber participado: ya no se inscribe solo, tiene que comentar
    // el reel (ahí se le reconoce su entrada y su x3 si compró en el concurso).
    // Si traía el código de un amigo, igual le cuenta la compra a quien lo invitó.
    if (!buyer && handle && !contest.drawnAt && !prizeWinner && contestPhase(contest, ctx.config) === 'live') {
      if (!(await claimLog(db, contest.id, 'order', String(order.id), null))) return;
      if (referrer) await db.update(contestParticipants).set({ invitedPurchases: sql`invitedPurchases + 1` }).where(eq(contestParticipants.id, referrer.id));
      return;
    }
    if (!buyer && !referrer && !prizeWinner && !fromContestLink) return;
    if (!(await claimLog(db, contest.id, 'order', String(order.id), buyer?.id ?? referrer?.id ?? null))) return;

    if (referrer) {
      await db.update(contestParticipants).set({ invitedPurchases: sql`invitedPurchases + 1` }).where(eq(contestParticipants.id, referrer.id));
    }
    if (buyer && !buyer.hasTicket) {
      const beforeDraw = !contest.drawnAt;
      await db.update(contestParticipants).set({
        hasTicket: 1, awaitingEmail: 0, email: buyerEmail, orderId: order.id, boughtDuringContest: beforeDraw ? 1 : 0,
      }).where(eq(contestParticipants.id, buyer.id));
      const updated = await deliverHolderPrizes(db, ctx, await reload(db, buyer.id));
      if (!updated.disqualified && !prizeWinner) {
        const channel = await reachableChannel(db, updated);
        if (channel) {
          await send(channel, renderContestTemplate(beforeDraw ? ctx.config.messages.boughtUpgrade : ctx.config.messages.holder, templateVars(ctx, updated)))
            .catch((err) => console.error('[Concurso] No se pudo avisar la compra:', err));
        }
      }
    }
  }
}

/* ── Sorteo ──────────────────────────────────────────────────────────────── */

function secureRandom(): number {
  return crypto.randomInt(0, 2 ** 32) / 2 ** 32;
}

/** Sortea los dos premios. Idempotente: si ya se sorteó, no hace nada. */
export async function runContestDraw(contestId: number): Promise<{ double: number; vip: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const ctx = await getCtxById(contestId);
  if (!ctx || ctx.contest.drawnAt || ctx.contest.status !== 'active') return null;
  // Concurso de fotos: lo cierra el jurado desde la galería, no la hora.
  if (ctx.contest.template === 'photo') return null;
  // Se marca primero (condicional) para que dos crons no sorteen dos veces.
  const [res] = await db.update(contests).set({ drawnAt: new Date() }).where(and(eq(contests.id, contestId), isNull(contests.drawnAt)));
  if ((res as unknown as { affectedRows: number }).affectedRows !== 1) return null;
  ctx.contest = { ...ctx.contest, drawnAt: new Date() };

  try {
    if (ctx.contest.template === 'quiz') {
      return await (await import('./contestQuiz')).drawQuiz(db, ctx);
    }
    if (ctx.contest.template === 'flash') {
      return await (await import('./contestFlash')).drawFlash(db, ctx);
    }
    if (ctx.contest.template === 'countdown') {
      return await (await import('./contestCountdown')).drawCountdown(db, ctx);
    }
    if (ctx.contest.template === 'milestones') {
      return await (await import('./contestMilestones')).drawMilestones(db, ctx);
    }
    if (ctx.contest.template === 'likes' || ctx.contest.template === 'referrals') {
      const races = await import('./contestRaces');
      return await (ctx.contest.template === 'likes' ? races.drawLikes(db, ctx) : races.drawReferrals(db, ctx));
    }
    return await drawPools(db, ctx);
  } catch (err) {
    // Si falló antes de elegir a nadie, se libera para que el próximo cron
    // (o el botón del panel) lo vuelva a intentar.
    const [picked] = await db.select({ id: contestWinners.id }).from(contestWinners).where(eq(contestWinners.contestId, contestId)).limit(1);
    if (!picked) await db.update(contests).set({ drawnAt: null }).where(eq(contests.id, contestId));
    throw err;
  }
}

async function drawPools(db: Db, ctx: ContestCtx): Promise<{ double: number; vip: number }> {
  const contestId = ctx.contest.id;
  let all = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.disqualified, 0)));
  // Última revisión: alguien sin entrada pudo haber comprado por fuera.
  for (const p of all.filter((x) => !x.hasTicket)) {
    const holder = await findHolderOrder(db, ctx.event.id, { email: p.email, username: p.username });
    if (holder) {
      await markHolder(db, ctx, p.id, holder);
      await deliverHolderPrizes(db, ctx, await reload(db, p.id)).catch(() => {});
    }
  }
  all = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.disqualified, 0)));

  const { prizes } = ctx.config;
  const pools = [
    // Quien compró durante el concurso sigue por la entrada doble (si gana,
    // elige devolución o regalo); el VIP es para quienes ya tenían entrada.
    { pool: 'double' as const, people: all.filter((p) => drawPoolFor({ hasTicket: !!p.hasTicket, boughtDuringContest: !!p.boughtDuringContest }) === 'double'), winners: prizes.doubleWinners, alternates: prizes.doubleAlternates },
    { pool: 'vip' as const, people: all.filter((p) => drawPoolFor({ hasTicket: !!p.hasTicket, boughtDuringContest: !!p.boughtDuringContest }) === 'vip'), winners: prizes.vipWinners, alternates: prizes.vipAlternates },
  ];
  const log: Record<string, { participants: number; tickets: number; guaranteed: number | null }> = {};
  for (const { pool, people, winners, alternates } of pools) {
    const weights = people.map((p) => ({ id: p.id, weight: chancesOf(p, ctx.config) }));
    // El 1º del ranking gana seguro uno de los premios (empate arriba: se
    // sortea entre los empatados); el resto se sortea sin él.
    const leaderId = winners > 0 && prizes.guaranteedLeader ? pickGuaranteedLeader(weights, secureRandom) : null;
    log[pool] = { participants: people.length, tickets: weights.reduce((s, w) => s + w.weight, 0), guaranteed: leaderId };
    if (winners <= 0) continue;
    const picked = [
      ...(leaderId !== null ? [leaderId] : []),
      ...weightedDraw(weights.filter((w) => w.id !== leaderId), winners - (leaderId !== null ? 1 : 0) + alternates, secureRandom),
    ];
    for (let i = 0; i < picked.length; i++) {
      await db.insert(contestWinners).values({
        contestId, participantId: picked[i], pool, position: i + 1,
        chances: weights.find((w) => w.id === picked[i])?.weight ?? 0,
        status: 'alternate',
      });
    }
    // Los primeros N ganan: se "activan" y se avisa.
    const rows = await db.select().from(contestWinners)
      .where(and(eq(contestWinners.contestId, contestId), eq(contestWinners.pool, pool))).orderBy(asc(contestWinners.position));
    for (const row of rows.slice(0, winners)) await safeActivateWinner(db, ctx, row);
  }
  await db.update(contests).set({ drawLog: log }).where(eq(contests.id, contestId));
  return { double: pools[0].people.length, vip: pools[1].people.length };
}

/** Como `activateWinner`, pero un error de Meta o del correo no corta el
 * sorteo: el ganador queda "esperando que escriba" con su plazo, y si no
 * reclama, pasa el suplente como siempre. */
export async function safeActivateWinner(db: Db, ctx: ContestCtx, row: ContestWinner, via?: Channel | null): Promise<void> {
  try {
    await activateWinner(db, ctx, row, via);
  } catch (err) {
    console.error(`[Concurso] No se pudo avisar al ganador ${row.id}:`, err);
    // Sin premio hasta verificar: el ganador de entrada doble sin compra queda
    // "verificando"; los demás, esperando que escriban.
    const needsVerify = row.pool === 'double' && ctx.config.verify.enabled && isTicketPrize(ctx, row);
    await db.update(contestWinners).set({
      status: needsVerify ? 'verifying' : 'notified', notifiedAt: new Date(), claimDeadline: new Date(Date.now() + ctx.config.claimHours * 60 * 60 * 1000),
    }).where(and(eq(contestWinners.id, row.id), eq(contestWinners.status, 'alternate')));
  }
}

/** Un ganador (o el suplente que sube): crea su premio, intenta entregarlo por
 * DM y si no se puede, lo deja "esperando que escriba" con plazo. */
/** Reto relámpago: cada puesto tiene su premio (config.flash.prizes). */
function flashPrizeOf(ctx: ContestCtx, row: ContestWinner) {
  return ctx.contest.template === 'flash' ? ctx.config.flash.prizes[row.position - 1] ?? null : null;
}
/** ¿El premio de este ganador es una entrada? (En los demás concursos, siempre.) */
export function isTicketPrize(ctx: ContestCtx, row: ContestWinner): boolean {
  if (ctx.contest.template !== 'flash') return true;
  const prize = flashPrizeOf(ctx, row);
  return !prize || prize.kind === 'ticket';
}
/** En el reto relámpago, la entrada que se regala depende del puesto. */
async function ctxForPlace(db: Db, ctx: ContestCtx, row: ContestWinner): Promise<ContestCtx> {
  const prize = flashPrizeOf(ctx, row);
  if (!prize || prize.kind !== 'ticket' || !prize.ticketTypeId) return ctx;
  const [type] = await db.select({ name: ticketTypes.name }).from(ticketTypes).where(eq(ticketTypes.id, prize.ticketTypeId)).limit(1);
  return { ...ctx, config: { ...ctx.config, prizes: { ...ctx.config.prizes, prizeTicketTypeId: prize.ticketTypeId } }, prizeName: type?.name ?? ctx.prizeName };
}

export async function activateWinner(db: Db, ctxIn: ContestCtx, row: ContestWinner, via?: Channel | null): Promise<void> {
  const ctx = await ctxForPlace(db, ctxIn, row);
  const participant = await reload(db, row.participantId);
  if (row.pool === 'double' && participant.hasTicket && participant.orderId && isTicketPrize(ctx, row)) {
    await activateBuyerWinner(db, ctx, row, participant);
    return;
  }
  // Entrada doble sin compra: antes del premio se verifica que pueda asistir.
  if (row.pool === 'double' && ctx.config.verify.enabled && isTicketPrize(ctx, row)) {
    await startVerification(db, ctx, row, participant, via);
    return;
  }
  const channel = via ?? await reachableChannel(db, participant);
  if (channel) {
    await deliverWinnerPrize(db, ctx, row, participant, channel);
    await announcePublicly(ctx, participant, true);
    return;
  }
  const deadline = new Date(Date.now() + ctx.config.claimHours * 60 * 60 * 1000);
  await db.update(contestWinners).set({ status: 'notified', notifiedAt: new Date(), claimDeadline: deadline }).where(eq(contestWinners.id, row.id));
  await announcePublicly(ctx, participant, false, deadline);
  // Si conocemos su correo, el premio va igual por email (no espera el DM).
  if (participant.email) await deliverWinnerPrize(db, ctx, { ...row, status: 'notified' }, participant, null);
}

/* ── Verificación del ganador (aprobación manual en el panel) ───────────── */

/** Avisa que ganó y pide RUT, fecha de nacimiento y ACEPTO. El premio no se
 * crea hasta que el admin aprueba. */
async function startVerification(db: Db, ctx: ContestCtx, row: ContestWinner, p: ContestParticipant, via?: Channel | null): Promise<void> {
  const deadline = new Date(Date.now() + ctx.config.claimHours * 60 * 60 * 1000);
  await db.update(contestWinners).set({ status: 'verifying', notifiedAt: new Date(), claimDeadline: deadline }).where(eq(contestWinners.id, row.id));
  const channel = via ?? await reachableChannel(db, p);
  if (channel) {
    await send(channel, renderContestTemplate(ctx.config.messages.winnerVerify, templateVars(ctx, p, { plazo: dateTimeText(deadline) })))
      .catch((err) => console.error('[Concurso] No se pudo pedir la verificación al ganador:', err));
  }
  await announcePublicly(ctx, p, !!channel, deadline);
}

/** Registra lo que respondió el ganador y, si ya mandó todo, lo deja por aprobar. */
async function handleVerifyReply(db: Db, ctx: ContestCtx, row: ContestWinner, p: ContestParticipant, channel: Channel, text: string): Promise<void> {
  const parsed = parseVerifyReply(text);
  const merged = {
    rut: parsed.rut ?? row.verifyRut,
    birthDate: parsed.birthDate ?? row.verifyBirthDate,
    accepted: parsed.accepted || !!row.verifyAcceptedAt,
  };
  const anything = !!(merged.rut || merged.birthDate || merged.accepted);
  const complete = isVerifyComplete(merged);
  await db.update(contestWinners).set({
    verifyRut: merged.rut, verifyBirthDate: merged.birthDate,
    verifyAcceptedAt: merged.accepted ? (row.verifyAcceptedAt ?? new Date()) : null,
    ...(complete ? { status: 'review' as const } : {}),
  }).where(eq(contestWinners.id, row.id));
  const plazo = row.claimDeadline ? dateTimeText(row.claimDeadline) : '';
  if (complete) {
    await send(channel, renderContestTemplate(ctx.config.messages.verifyReceived, templateVars(ctx, p)));
  } else if (!anything) {
    await send(channel, renderContestTemplate(ctx.config.messages.winnerVerify, templateVars(ctx, p, { plazo })));
  } else {
    await send(channel, renderContestTemplate(ctx.config.messages.verifyMissing, templateVars(ctx, p, { faltante: missingVerifyFields(merged).join(', ') })));
  }
}

/** Lo que el panel muestra para decidir: edad, bloqueo por RUT, aceptación. */
async function verifySummary(db: Db, ctx: ContestCtx, w: ContestWinner) {
  const age = w.verifyBirthDate ? ageOn(w.verifyBirthDate, new Date(ctx.event.eventDate)) : null;
  let blocked: { reason: string | null } | null = null;
  if (w.verifyRut) {
    const [hit] = await db.select().from(blockedCustomers)
      .where(and(eq(blockedCustomers.rut, w.verifyRut), eq(blockedCustomers.isActive, 1))).limit(1);
    if (hit) blocked = { reason: hit.reason ?? null };
  }
  return { rut: w.verifyRut, birthDate: w.verifyBirthDate, age, adult: age == null ? null : age >= 18, blocked, acceptedAt: w.verifyAcceptedAt };
}

/** El admin aprobó: ahora sí se crea y entrega el premio. */
export async function approveWinner(winnerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const [row] = await db.select().from(contestWinners).where(eq(contestWinners.id, winnerId)).limit(1);
  if (!row || (row.status !== 'review' && row.status !== 'verifying')) throw new Error('Este ganador no está esperando aprobación.');
  const ctx = await getCtxById(row.contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  const p = await reload(db, row.participantId);
  const channel = await reachableChannel(db, p);
  const verifiedAt = new Date();
  // "notified" = premio por entregar: si no hay DM ni correo, sale cuando escriba.
  await db.update(contestWinners).set({
    status: 'notified', verifiedAt,
    claimDeadline: new Date(Date.now() + ctx.config.claimHours * 60 * 60 * 1000),
  }).where(eq(contestWinners.id, row.id));
  await deliverWinnerPrize(db, ctx, { ...row, status: 'notified', verifiedAt }, p, channel);
  const [after] = await db.select().from(contestWinners).where(eq(contestWinners.id, row.id)).limit(1);
  return { status: after?.status ?? 'notified' };
}

/** El admin rechazó: no cumple los requisitos. Pasa el suplente. */
export async function rejectWinner(winnerId: number, note?: string | null) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const [row] = await db.select().from(contestWinners).where(eq(contestWinners.id, winnerId)).limit(1);
  if (!row || (row.status !== 'review' && row.status !== 'verifying')) throw new Error('Este ganador no está esperando aprobación.');
  const ctx = await getCtxById(row.contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  await db.update(contestWinners).set({ status: 'rejected', verifyNote: (note ?? '').trim().slice(0, 500) || null }).where(eq(contestWinners.id, row.id));
  const p = await reload(db, row.participantId);
  const channel = await reachableChannel(db, p);
  if (channel) {
    await send(channel, renderContestTemplate(ctx.config.messages.verifyRejected, templateVars(ctx, p)))
      .catch((err) => console.error('[Concurso] No se pudo avisar el rechazo:', err));
  }
  return { promoted: await promoteAlternate(db, ctx, row.pool, row.position) };
}

/** ¿Sigue la cuenta? Lo consulta el admin a mano (Meta puede no entregarlo). */
export async function checkWinnerFollows(winnerId: number): Promise<{ follows: boolean | null }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const [row] = await db.select().from(contestWinners).where(eq(contestWinners.id, winnerId)).limit(1);
  if (!row) throw new Error('Ganador no encontrado.');
  const p = await reload(db, row.participantId);
  if (p.igUserId.startsWith('ig:')) return { follows: null };
  const profile = await fetchInstagramProfile(p.igUserId);
  return { follows: typeof profile.isFollower === 'boolean' ? profile.isFollower : null };
}

async function announcePublicly(ctx: ContestCtx, p: ContestParticipant, reachedByDm: boolean, deadline?: Date) {
  const commentId = p.firstCommentId ?? p.spareCommentId;
  if (!commentId) return;
  const template = reachedByDm ? ctx.config.messages.winnerPublic : ctx.config.messages.winnerPublicNoDm;
  const plazo = deadline ? `${formatChileDate(deadline, { withWeekday: true })} a las ${formatChileTime(deadline)}` : '';
  await replyToComment(commentId, renderContestTemplate(template, templateVars(ctx, p, { plazo })))
    .catch((err) => console.error('[Concurso] No se pudo anunciar al ganador en el comentario:', err));
}

/** Filas del acceso del premio (todas las tandas: cada cambio de tanda crea
 * una fila nueva con otro id, ver advanceTanda en db.ts) y la vigente. */
async function prizeTicketRows(db: Db, ctx: ContestCtx) {
  const typeId = ctx.config.prizes.prizeTicketTypeId;
  if (!typeId) return null;
  const [base] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, typeId)).limit(1);
  if (!base) return null;
  const rows = base.accesoSlug
    ? await db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, ctx.event.id), eq(ticketTypes.accesoSlug, base.accesoSlug)))
    : [base];
  const current = rows.find((r) => r.status === 'active') ?? rows.sort((a, b) => b.id - a.id)[0] ?? base;
  return { ids: rows.map((r) => r.id), current };
}

/** Código que deja gratis UNA entrada del premio, en cualquier tanda: monto
 * fijo = precio general (no regala una segunda si compran dos). */
async function createPrizeCode(db: Db, ctx: ContestCtx, who: string): Promise<string | null> {
  const prize = await prizeTicketRows(db, ctx);
  const value = Number(prize?.current.originalPrice ?? prize?.current.price ?? 0);
  if (!prize || value <= 0) return null;
  return createCode(db, {
    prefix: 'PREMIO', type: 'fixed', value, maxUses: 1, applicableTicketTypeIds: prize.ids,
    validUntil: new Date(new Date(ctx.event.eventDate).getTime() + 24 * 60 * 60 * 1000), eventId: ctx.event.id,
    description: `Concurso «${ctx.contest.title}»: ${who}`,
  });
}

/* ── Ganador que ya había comprado: elige devolución o regalo ───────────── */

const choiceUrl = (token: string) => `${APP_URL}/concurso/premio/${token}`;

/** Lo que pagó por sus accesos (sin extras ni cargo), menos el descuento. */
async function paidForAccesos(db: Db, orderId: number): Promise<number> {
  const [order] = await db.select({ discount: orders.discount }).from(orders).where(eq(orders.id, orderId)).limit(1);
  const items = await db.select({ total: orderItems.totalPrice, category: ticketTypes.category })
    .from(orderItems).innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId)).where(eq(orderItems.orderId, orderId));
  const accesos = items.filter((i) => i.category === 'acceso').reduce((s, i) => s + Number(i.total), 0);
  return Math.max(0, accesos - Number(order?.discount ?? 0));
}

async function activateBuyerWinner(db: Db, ctx: ContestCtx, row: ContestWinner, p: ContestParticipant): Promise<void> {
  const prize = await prizeTicketRows(db, ctx);
  const refundAmount = refundAmountFor(await paidForAccesos(db, p.orderId!), Number(prize?.current.price ?? 0));
  const token = crypto.randomBytes(16).toString('hex');
  const deadline = new Date(Date.now() + ctx.config.prizes.choiceHours * 60 * 60 * 1000);
  await db.update(contestWinners).set({
    status: 'choosing', orderId: p.orderId, refundAmount, choiceToken: token, choiceDeadline: deadline, notifiedAt: new Date(),
  }).where(eq(contestWinners.id, row.id));
  const updated = { ...row, status: 'choosing' as const, orderId: p.orderId, refundAmount, choiceToken: token, choiceDeadline: deadline };
  const channel = await reachableChannel(db, p);
  await sendBuyerWinnerMessage(ctx, updated, p, channel);
  await announcePublicly(ctx, p, !!channel, channel ? undefined : deadline);
}

const clpText = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

async function sendBuyerWinnerMessage(ctx: ContestCtx, row: ContestWinner, p: ContestParticipant, channel: Channel | null) {
  if (!row.choiceToken) return;
  const plazo = row.choiceDeadline ? dateTimeText(row.choiceDeadline) : '';
  const vars = templateVars(ctx, p, { monto_devolucion: clpText(row.refundAmount ?? 0), link_elegir: choiceUrl(row.choiceToken), plazo });
  if (channel) {
    await send(channel, renderContestTemplate(ctx.config.messages.winnerBuyer, vars), { title: 'Elegir mi premio', url: choiceUrl(row.choiceToken) })
      .catch((err) => console.error('[Concurso] No se pudo mandar el DM al ganador:', err));
  }
  if (p.email) {
    await sendEmail({
      to: p.email,
      subject: `🎉 ¡Ganaste el concurso de ${ctx.event.title}! Elige tu premio`,
      html: buildContestWinnerEmail({
        name: p.username ? `@${p.username}` : 'ganador/a', prize: 'tu premio', eventTitle: ctx.event.title, ctaUrl: choiceUrl(row.choiceToken),
        note: `Como ya tienes tu entrada, eliges: te devolvemos ${clpText(row.refundAmount ?? 0)} de tu entrada, o te llevas ${prizeLabels(ctx.prizeName, 1).singular} extra para regalar. Elige antes del ${plazo}.`,
      }),
    }).catch((err) => console.error('[Concurso] No se pudo mandar el correo al ganador:', err));
  }
}

/** Para la página /concurso/premio/:token. */
export async function getWinnerChoice(token: string) {
  const db = await getDb();
  if (!db || !/^[a-f0-9]{32}$/.test(token)) return null;
  const [row] = await db.select().from(contestWinners).where(eq(contestWinners.choiceToken, token)).limit(1);
  if (!row) return null;
  const ctx = await getCtxById(row.contestId);
  if (!ctx) return null;
  const p = await reload(db, row.participantId);
  return {
    username: p?.username ?? null,
    eventTitle: ctx.event.title,
    status: row.status,
    choice: row.choice,
    refundAmount: row.refundAmount ?? 0,
    refundStatus: row.refundStatus,
    prizeLabel: prizeLabels(ctx.prizeName, 1).singular,
    prizeCode: row.choice === 'gift' ? row.prizeCode : null,
    deadline: row.choiceDeadline,
    checkoutUrl: row.choice === 'gift' && row.prizeCode ? checkoutUrl(ctx, { code: row.prizeCode, content: 'concurso-regalo' }) : null,
  };
}

/** El ganador eligió. Solo vale una vez y mientras está eligiendo. */
export async function submitWinnerChoice(token: string, choice: 'refund' | 'gift') {
  const db = await getDb();
  if (!db) throw new Error('Servicio no disponible.');
  const [row] = await db.select().from(contestWinners).where(eq(contestWinners.choiceToken, token)).limit(1);
  if (!row) throw new Error('Este link no es válido.');
  if (row.status !== 'choosing') return getWinnerChoice(token);
  const ctxBase = await getCtxById(row.contestId);
  if (!ctxBase) throw new Error('Concurso no encontrado.');
  const ctx = await ctxForPlace(db, ctxBase, row);
  const [res] = await db.update(contestWinners).set({ choice, status: 'delivered', deliveredAt: new Date(), ...(choice === 'refund' ? { refundStatus: 'pending' as const } : {}) })
    .where(and(eq(contestWinners.id, row.id), eq(contestWinners.status, 'choosing')));
  if ((res as unknown as { affectedRows: number }).affectedRows !== 1) return getWinnerChoice(token);
  const p = await reload(db, row.participantId);
  if (choice === 'gift') {
    const prizeCode = await createPrizeCode(db, ctx, `regalo de @${p.username ?? p.igUserId}`);
    await db.update(contestWinners).set({ prizeCode }).where(eq(contestWinners.id, row.id));
    const channel = await reachableChannel(db, p);
    const text = renderContestTemplate(ctx.config.messages.choiceGift, templateVars(ctx, p, { codigo_premio: prizeCode }));
    if (channel) await send(channel, text).catch(() => {});
    if (p.email && prizeCode) {
      await sendEmail({
        to: p.email, subject: `🎁 Tu entrada para regalar · ${ctx.event.title}`,
        html: buildContestWinnerEmail({
          name: p.username ? `@${p.username}` : 'ganador/a', prize: prizeLabels(ctx.prizeName, 1).singular, eventTitle: ctx.event.title,
          code: prizeCode, ctaUrl: checkoutUrl(ctx, { code: prizeCode, content: 'concurso-regalo' }),
          note: 'Comparte este código con quien quieras: al comprar con él, esa entrada sale gratis.',
        }),
      }).catch(() => {});
    }
  }
  return getWinnerChoice(token);
}

/** El dueño ya hizo la devolución en Mercado Pago: queda registrada en la
 * orden (Finanzas descuenta `refundAmount`) SIN anular la entrada. */
export async function markRefundDone(winnerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const [row] = await db.select().from(contestWinners).where(eq(contestWinners.id, winnerId)).limit(1);
  if (!row || row.refundStatus !== 'pending' || !row.orderId) throw new Error('No hay una devolución pendiente para este ganador.');
  const ctx = await getCtxById(row.contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  const amount = row.refundAmount ?? 0;
  await db.update(contestWinners).set({ refundStatus: 'done', refundedAt: new Date() }).where(eq(contestWinners.id, row.id));
  await db.update(orders).set({
    refundAmount: sql`COALESCE(${orders.refundAmount}, 0) + ${amount}`,
    refundReason: `Premio del concurso «${ctx.contest.title}» (la entrada sigue válida)`,
    refundedAt: new Date(),
  }).where(eq(orders.id, row.orderId));
  const p = await reload(db, row.participantId);
  const text = renderContestTemplate(ctx.config.messages.refundDone, templateVars(ctx, p, { monto_devolucion: clpText(amount) }));
  const channel = await reachableChannel(db, p);
  if (channel) await send(channel, text).catch(() => {});
  if (p.email) {
    await sendEmail({
      to: p.email, subject: `💸 Te devolvimos ${clpText(amount)} · ${ctx.event.title}`,
      html: buildContestWinnerEmail({ name: p.username ? `@${p.username}` : 'ganador/a', prize: 'tu devolución', eventTitle: ctx.event.title, ctaUrl: `${APP_URL}/mis-puntos`, note: text }),
    }).catch(() => {});
  }
}

/** Ganadores que no eligieron a tiempo: queda la devolución pendiente. */
async function closeExpiredChoices(db: Db, ctx: ContestCtx): Promise<number> {
  const [res] = await db.update(contestWinners).set({ choice: 'refund', refundStatus: 'pending', status: 'delivered', deliveredAt: new Date() })
    .where(and(eq(contestWinners.contestId, ctx.contest.id), eq(contestWinners.status, 'choosing'), sql`${contestWinners.choiceDeadline} < ${new Date()}`));
  return Number((res as unknown as { affectedRows?: number }).affectedRows ?? 0);
}

/** Crea y entrega el premio. `channel` null = solo por email (si lo hay);
 * el estado queda "notified" hasta que escriba por DM. */
export async function deliverWinnerPrize(db: Db, ctxIn: ContestCtx, row: ContestWinner, p: ContestParticipant, channel: Channel | null, text?: string): Promise<void> {
  if (!isTicketPrize(ctxIn, row)) {
    await (await import('./contestFlash')).deliverFlashPrize(db, ctxIn, row, p, channel, text);
    return;
  }
  const ctx = await ctxForPlace(db, ctxIn, row);
  let prizeCode = row.prizeCode;
  let ok = true;
  if (row.pool === 'double') {
    if (!prizeCode) {
      prizeCode = await createPrizeCode(db, ctx, `premio de @${p.username ?? p.igUserId}`);
      if (prizeCode) await db.update(contestWinners).set({ prizeCode }).where(eq(contestWinners.id, row.id));
    }
    ok = !!prizeCode;
  } else if (row.status !== 'delivered' && !row.deliveredAt) {
    const typeId = ctx.config.prizes.vipPrizeTicketTypeId;
    ok = typeId && p.orderId ? await grantFreeItem(db, p.orderId, typeId) : false;
    // Sin producto configurado: queda como ganador para entregarlo a mano.
    if (!typeId) ok = true;
  }
  if (!ok) {
    console.error(`[Concurso] No se pudo preparar el premio del ganador ${row.id}.`);
    return;
  }

  const vars = templateVars(ctx, p, { codigo_premio: prizeCode });
  const message = renderContestTemplate(row.pool === 'double' ? ctx.config.messages.winnerDouble : ctx.config.messages.winnerVip, vars);
  const prizeUrl = row.pool === 'double' ? checkoutUrl(ctx, { code: prizeCode, content: 'concurso-premio' }) : `${APP_URL}/mis-puntos`;
  if (channel) {
    await send(channel, message, row.pool === 'double' ? { title: 'Canjear mi premio', url: prizeUrl } : null);
    await db.update(contestWinners).set({ status: 'delivered', deliveredAt: new Date(), notifiedAt: row.notifiedAt ?? new Date() }).where(eq(contestWinners.id, row.id));
  }
  if (p.email && (!channel || row.status === 'notified')) {
    const labels = prizeLabels(ctx.prizeName, 1);
    const html = buildContestWinnerEmail({
      name: p.username ? `@${p.username}` : 'ganador/a',
      prize: row.pool === 'double' ? labels.singular : ctx.config.prizes.vipPrizeLabel,
      eventTitle: ctx.event.title,
      code: row.pool === 'double' ? prizeCode : null,
      ctaUrl: prizeUrl,
      note: row.pool === 'double'
        ? 'Usa este código al comprar: cubre la entrada completa. Completa los datos de las personas y listo.'
        : 'Tu premio ya quedó cargado en tu entrada. Muéstralo en caja la noche de la fiesta.',
    });
    await sendEmail({ to: p.email, subject: `🎉 ¡Ganaste el concurso de ${ctx.event.title}!`, html })
      .catch((err) => console.error('[Concurso] No se pudo mandar el correo al ganador:', err));
    // Con el código ya en su correo, el premio cuenta como entregado.
    if (!channel) await db.update(contestWinners).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(contestWinners.id, row.id));
  }
}

/** Ganadores que no reclamaron a tiempo: pierden el premio y sube el
 * siguiente suplente de ese sorteo. */
async function expireUnclaimed(db: Db, ctx: ContestCtx): Promise<number> {
  const now = new Date();
  const overdue = await db.select().from(contestWinners).where(and(
    eq(contestWinners.contestId, ctx.contest.id), inArray(contestWinners.status, ['notified', 'verifying']), sql`${contestWinners.claimDeadline} < ${now}`,
  ));
  for (const row of overdue) {
    await db.update(contestWinners).set({ status: 'expired' }).where(eq(contestWinners.id, row.id));
    await promoteAlternate(db, ctx, row.pool, row.position);
  }
  return overdue.length;
}

async function promoteAlternate(db: Db, ctx: ContestCtx, pool: 'double' | 'vip', vacatedPlace?: number): Promise<boolean> {
  const [next] = await db.select().from(contestWinners).where(and(
    eq(contestWinners.contestId, ctx.contest.id), eq(contestWinners.pool, pool), eq(contestWinners.status, 'alternate'),
  )).orderBy(asc(contestWinners.position)).limit(1);
  if (!next) return false;
  const participant = await reload(db, next.participantId);
  if (participant.disqualified) {
    await db.update(contestWinners).set({ status: 'skipped' }).where(eq(contestWinners.id, next.id));
    return promoteAlternate(db, ctx, pool, vacatedPlace);
  }
  // Reto relámpago: el suplente que sube hereda el premio del puesto que quedó libre.
  if (ctx.contest.template === 'flash' && vacatedPlace && vacatedPlace <= ctx.config.flash.prizes.length) {
    await db.update(contestWinners).set({ position: vacatedPlace }).where(eq(contestWinners.id, next.id));
    next.position = vacatedPlace;
  }
  await safeActivateWinner(db, ctx, next);
  return true;
}

/* ── Cron ────────────────────────────────────────────────────────────────── */

/** Recoge comentarios del post que el webhook no haya avisado (y los que
 * había antes de lanzar el concurso). */
export async function syncContestComments(contestId: number): Promise<{ processed: number; total: number }> {
  const db = await getDb();
  if (!db) return { processed: 0, total: 0 };
  const ctx = await getCtxById(contestId);
  if (!ctx || !ctx.contest.mediaId || ctx.contest.status !== 'active') return { processed: 0, total: 0 };
  const comments = await fetchMediaComments(ctx.contest.mediaId);
  const seen = new Set((await db.select({ refId: contestLog.refId }).from(contestLog)
    .where(and(eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment')))).map((r) => r.refId));
  let processed = 0;
  // Del más viejo al más nuevo, para que el primero de cada persona sea el
  // que recibe el DM.
  const fresh = comments.filter((c) => !seen.has(c.id) && c.igUserId)
    .sort((a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime());
  for (const c of fresh) {
    // Más viejo que 7 días: Meta ya no deja mandarle el DM privado.
    if (c.timestamp && Date.now() - new Date(c.timestamp).getTime() > PRIVATE_REPLY_WINDOW_MS) continue;
    if (await handleContestComment({ commentId: c.id, mediaId: ctx.contest.mediaId, igUserId: c.igUserId!, username: c.username, text: c.text }, ctx)) processed++;
  }
  await db.update(contests).set({ lastSyncAt: new Date() }).where(eq(contests.id, contestId));
  return { processed, total: comments.length };
}

/** Todo lo que el concurso hace solo (cada 15 min). */
export async function runContestCron(now: Date = new Date()): Promise<Record<string, unknown>> {
  const all = await getActiveContestCtxs();
  if (all.length === 0) return { active: false };
  const db = await getDb();
  if (!db) return { active: false };
  const results: Record<string, unknown>[] = [];
  for (const ctx of all) {
    results.push(await runContestCronFor(db, ctx, now).catch((err) => ({
      contestId: ctx.contest.id, error: err instanceof Error ? err.message : 'Error',
    })));
  }
  // Los precios congelados se recalculan una vez por evento, no por concurso.
  const priceLocks = await refreshContestPriceLocks();
  return { active: true, contests: results, priceLocks };
}

async function runContestCronFor(db: Db, ctx: ContestCtx, now: Date): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { contestId: ctx.contest.id, template: ctx.contest.template };
  // Pasó la fiesta: se cierra solo.
  if (now.getTime() > new Date(ctx.event.eventDate).getTime() + 24 * 60 * 60 * 1000) {
    await db.update(contests).set({ status: 'finished' }).where(eq(contests.id, ctx.contest.id));
    return { ...result, finished: true };
  }
  if (accepting(ctx)) {
    try {
      result.sync = await syncContestComments(ctx.contest.id);
    } catch (err) {
      result.sync = { error: err instanceof Error ? err.message : 'Error' };
    }
  }
  if (ctx.contest.template === 'countdown' && !ctx.contest.drawnAt && contestPhase(ctx.contest, ctx.config, now) === 'live') {
    result.countdown = await (await import('./contestCountdown')).runCountdown(db, ctx, now).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
  }
  if (ctx.contest.template === 'flash' && !ctx.contest.drawnAt && contestPhase(ctx.contest, ctx.config, now) === 'live') {
    result.flash = await (await import('./contestFlash')).runFlashCron(db, ctx, now).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
  }
  if (ctx.contest.template === 'milestones' && !ctx.contest.drawnAt && contestPhase(ctx.contest, ctx.config, now) === 'live') {
    result.milestones = await (await import('./contestMilestones')).runMilestones(db, ctx).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
  }
  if ((ctx.contest.template === 'likes' || ctx.contest.template === 'referrals') && !ctx.contest.drawnAt && contestPhase(ctx.contest, ctx.config, now) === 'live') {
    const races = await import('./contestRaces');
    result.race = await races.runRaceDaily(db, ctx, now).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
  }
  // Red de seguridad: cada hora se vuelven a leer los comentarios (con respuestas)
  // por si el aviso de alguno no llegó. Solo suma, nunca resta.
  if (ctx.contest.template === 'ranking' && !ctx.contest.drawnAt && contestPhase(ctx.contest, ctx.config, now) === 'live') {
    const hourKey = `recalc:${now.toISOString().slice(0, 13)}`;
    if (await claimLog(db, ctx.contest.id, 'comment', hourKey, null)) {
      result.recalc = await recalcMentions(ctx.contest.id).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!ctx.contest.drawnAt && ctx.config.drawAt && new Date(ctx.config.drawAt).getTime() <= now.getTime()) {
    result.draw = await runContestDraw(ctx.contest.id);
  } else if (ctx.contest.drawnAt) {
    result.expired = await expireUnclaimed(db, ctx);
    result.choicesClosed = await closeExpiredChoices(db, ctx);
  }
  return result;
}

/* ── Link personal para invitar (/c/:código) ─────────────────────────────── */

export function registerContestRoutes(app: Express) {
  // Link corto a «mi posición» (va en el DM de bienvenida).
  app.get('/r/:code', (req: Request, res: Response) => {
    const code = String(req.params.code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    res.redirect(302, code ? `/concurso/mi-posicion/${code}` : '/concurso');
  });
  // Link corto de quien participa: lleva al checkout con SU código (precio congelado).
  app.get('/p/:code', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const code = String(req.params.code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
      if (!db || !code) return res.redirect(302, '/');
      const [p] = await db.select().from(contestParticipants).where(eq(contestParticipants.inviteCode, code)).limit(1);
      const ctx = p ? await getCtxById(p.contestId) : null;
      if (!p || !ctx) return res.redirect(302, '/');
      res.redirect(302, checkoutUrl(ctx, { code: p.hasTicket ? null : p.couponCode, content: 'concurso-cupon' }));
    } catch {
      res.redirect(302, '/');
    }
  });
  app.get('/c/:code', async (req: Request, res: Response) => {
    try {
      const db = await getDb();
      const code = String(req.params.code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
      if (!db || !code) return res.redirect(302, '/');
      const [p] = await db.select().from(contestParticipants).where(eq(contestParticipants.inviteCode, code)).limit(1);
      const ctx = p ? await getCtxById(p.contestId) : null;
      if (!p || !ctx) return res.redirect(302, '/');
      res.redirect(302, checkoutUrl(ctx, { code: p.hasTicket ? p.friendCode : null, content: code }));
    } catch {
      res.redirect(302, '/');
    }
  });
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

export async function listContests() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(contests).orderBy(desc(contests.id));
  const counts = rows.length
    ? await db.select({ contestId: contestParticipants.contestId, n: sql<number>`COUNT(*)` }).from(contestParticipants)
      .where(inArray(contestParticipants.contestId, rows.map((r) => r.id))).groupBy(contestParticipants.contestId)
    : [];
  return rows.map((r) => ({
    id: r.id, title: r.title, template: r.template, eventId: r.eventId, status: r.status, drawnAt: r.drawnAt, createdAt: r.createdAt,
    participants: Number(counts.find((c) => c.contestId === r.id)?.n ?? 0),
  }));
}

export interface CreateContestOptions {
  template?: ContestTemplateKey;
  prizeTicketTypeId?: number | null;
  mediaId?: string | null; mediaPermalink?: string | null; mediaImage?: string | null;
  startsAt?: string; drawAt?: string;
  keyword?: string; keywordPhrase?: string;
}

export async function createContest(eventId: number, title?: string, opts: CreateContestOptions = {}) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new Error('Evento no encontrado.');
  const types = await db.select({ id: ticketTypes.id, name: ticketTypes.name, accesoSlug: ticketTypes.accesoSlug, category: ticketTypes.category })
    .from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  // Propuesta: el Dúo del evento como "entrada doble".
  const duo = types.find((t) => t.category === 'acceso' && /duo|dúo|pareja/i.test(`${t.accesoSlug ?? ''} ${t.name}`));
  const template = getContestTemplate(opts.template);
  const config = buildTemplateConfig(template.key, {
    startsAt: opts.startsAt ?? new Date().toISOString(),
    // Sin fecha elegida: 3 días antes de la fiesta; si ya no alcanza, mañana a esta hora.
    drawAt: opts.drawAt ?? (new Date(defaultDrawAt(event.eventDate)).getTime() > Date.now()
      ? defaultDrawAt(event.eventDate)
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
    prizeTicketTypeId: opts.prizeTicketTypeId !== undefined ? opts.prizeTicketTypeId : duo?.id ?? null,
    keyword: opts.keyword,
    keywordPhrase: opts.keywordPhrase,
  });
  const [inserted] = await db.insert(contests).values({
    title: (title?.trim() || `${template.name} · ${event.title}`).slice(0, 160), eventId, status: 'draft', config, template: template.key,
    mediaId: opts.mediaId ?? null, mediaPermalink: opts.mediaPermalink ?? null, mediaImage: opts.mediaImage ?? null,
  });
  return { id: (inserted as unknown as { insertId: number }).insertId };
}

export async function updateContest(id: number, patch: {
  title?: string; config?: unknown; mediaId?: string | null; mediaPermalink?: string | null; mediaImage?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const set: Partial<typeof contests.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title.trim().slice(0, 160) || 'Concurso';
  if (patch.config !== undefined) set.config = normalizeContestConfig(patch.config);
  if (patch.mediaId !== undefined) set.mediaId = patch.mediaId;
  if (patch.mediaPermalink !== undefined) set.mediaPermalink = patch.mediaPermalink;
  if (patch.mediaImage !== undefined) set.mediaImage = patch.mediaImage;
  if (Object.keys(set).length) await db.update(contests).set(set).where(eq(contests.id, id));
  return getContestAdmin(id);
}

/** Lo que falta para poder lanzar (vacío = listo). */
export function launchBlockers(ctx: ContestCtx): string[] {
  const out: string[] = [];
  if (ctx.contest.template === 'flash') out.push(...flashBlockers(ctx.config.flash));
  if (!ctx.contest.mediaId && ctx.contest.template !== 'quiz' && ctx.contest.template !== 'flash' && ctx.contest.template !== 'photo') out.push('Elige la publicación de Instagram del concurso.');
  if (ctx.contest.template === 'quiz' && !ctx.config.quiz.questions.some((q) => q.text && q.answers.length > 0)) out.push('Agrega al menos una pregunta con sus respuestas aceptadas.');
  if (ctx.contest.template !== 'flash' && ctx.config.prizes.doubleWinners > 0 && !ctx.config.prizes.prizeTicketTypeId) out.push('Elige qué entrada se regala como premio.');
  if (!ctx.config.drawAt) out.push('Pon la fecha del sorteo.');
  else if (new Date(ctx.config.drawAt).getTime() > new Date(ctx.event.eventDate).getTime()) out.push('El sorteo tiene que ser antes de la fiesta.');
  return out;
}

export async function setContestStatus(id: number, status: 'active' | 'paused' | 'finished' | 'draft') {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const ctx = await getCtxById(id);
  if (!ctx) throw new Error('Concurso no encontrado.');
  if (status === 'active') {
    const blockers = launchBlockers(ctx);
    if (blockers.length) throw new Error(blockers.join(' '));
    // Pueden correr varios a la vez, pero cada uno con su propia publicación.
    if (ctx.contest.mediaId) {
      const [other] = await db.select({ id: contests.id, title: contests.title }).from(contests)
        .where(and(eq(contests.status, 'active'), eq(contests.mediaId, ctx.contest.mediaId), sql`${contests.id} <> ${id}`)).limit(1);
      if (other) throw new Error(`«${other.title}» ya está activo con esta misma publicación. Cada concurso necesita su propio reel.`);
    }
  }
  await db.update(contests).set({ status }).where(eq(contests.id, id));
  // Al lanzar: recoge de una los comentarios que ya había en el post.
  let sync: { processed: number; total: number } | { error: string } | null = null;
  if (status === 'active' && contestPhase({ ...ctx.contest, status }, ctx.config) === 'live') {
    sync = await syncContestComments(id).catch((err) => ({ error: err instanceof Error ? err.message : 'Error' }));
  }
  return { sync };
}

export async function getContestAdmin(id: number) {
  const db = await getDb();
  if (!db) return null;
  const ctx = await getCtxById(id);
  if (!ctx) return null;
  const participants = await db.select().from(contestParticipants).where(eq(contestParticipants.contestId, id)).orderBy(desc(contestParticipants.id));
  const winners = await db.select().from(contestWinners).where(eq(contestWinners.contestId, id)).orderBy(asc(contestWinners.pool), asc(contestWinners.position));
  const codes = participants.flatMap((p) => [p.couponCode, p.friendCode]).concat(winners.map((w) => w.prizeCode)).filter((c): c is string => !!c);
  const codeUses = codes.length
    ? await db.select({ code: discountCodes.code, usedCount: discountCodes.usedCount }).from(discountCodes).where(inArray(discountCodes.code, codes))
    : [];
  const usedOf = (code: string | null) => (code ? Number(codeUses.find((c) => c.code === code)?.usedCount ?? 0) : 0);
  const orderRows = await db.select({ total: orders.total, paymentStatus: orders.paymentStatus })
    .from(contestLog).innerJoin(orders, sql`${orders.id} = CAST(${contestLog.refId} AS UNSIGNED)`)
    .where(and(eq(contestLog.contestId, id), eq(contestLog.kind, 'order')));
  const approved = orderRows.filter((o) => o.paymentStatus === 'approved');
  const proofRows = await db.select({ participantId: contestLog.participantId }).from(contestLog)
    .where(and(eq(contestLog.contestId, id), eq(contestLog.kind, 'story'), sql`${contestLog.refId} LIKE 'proof:%'`));
  const proofPending = new Set(proofRows.map((r) => r.participantId).filter((x): x is number => x !== null));
  const byId = new Map(participants.map((p) => [p.id, p]));
  const winnerOrderIds = winners.map((w) => w.orderId).filter((x): x is number => !!x);
  const paymentByOrder = new Map((winnerOrderIds.length
    ? await db.select({ id: orders.id, paymentId: orders.paymentId }).from(orders).where(inArray(orders.id, winnerOrderIds))
    : []).map((o) => [o.id, o.paymentId]));
  return {
    contest: ctx.contest,
    config: ctx.config,
    event: ctx.event,
    phase: contestPhase(ctx.contest, ctx.config),
    blockers: launchBlockers(ctx),
    stats: {
      participants: participants.length,
      withTicket: participants.filter((p) => p.hasTicket).length,
      boughtDuringContest: participants.filter((p) => p.boughtDuringContest).length,
      mentions: participants.reduce((s, p) => s + (p.mentions ?? []).length, 0),
      storyShares: participants.filter((p) => p.storyMentioned).length,
      invitedPurchases: participants.reduce((s, p) => s + p.invitedPurchases, 0),
      couponsSent: participants.filter((p) => p.couponCode).length,
      couponsUsed: participants.filter((p) => usedOf(p.couponCode) > 0).length,
      friendCodesUsed: participants.filter((p) => usedOf(p.friendCode) > 0).length,
      orders: approved.length,
      revenue: approved.reduce((s, o) => s + Number(o.total), 0),
      tickets: {
        double: participants.filter((p) => !p.disqualified && drawPoolFor({ hasTicket: !!p.hasTicket, boughtDuringContest: !!p.boughtDuringContest }) === 'double').reduce((s, p) => s + chancesOf(p, ctx.config), 0),
        vip: participants.filter((p) => !p.disqualified && drawPoolFor({ hasTicket: !!p.hasTicket, boughtDuringContest: !!p.boughtDuringContest }) === 'vip').reduce((s, p) => s + chancesOf(p, ctx.config), 0),
      },
      refundsPending: winners.filter((w) => w.refundStatus === 'pending').reduce((s, w) => s + (w.refundAmount ?? 0), 0),
    },
    participants: participants.map((p) => ({
      proofPending: proofPending.has(p.id),
      id: p.id, username: p.username, igUserId: p.igUserId, source: p.source, mentions: p.mentions ?? [],
      storyMentioned: p.storyMentioned === 1, invitedPurchases: p.invitedPurchases, hasTicket: p.hasTicket === 1,
      boughtDuringContest: p.boughtDuringContest === 1, email: p.email, pool: drawPoolFor({ hasTicket: !!p.hasTicket, boughtDuringContest: !!p.boughtDuringContest }), couponCode: p.couponCode, couponUsed: usedOf(p.couponCode) > 0,
      friendCode: p.friendCode, inviteCode: p.inviteCode, disqualified: p.disqualified === 1, disqualifyReason: p.disqualifyReason,
      chances: chancesOf(p, ctx.config), createdAt: p.createdAt,
    })),
    winners: await Promise.all(winners.map(async (w) => ({
      ...w, username: byId.get(w.participantId)?.username ?? null, prizeUsed: usedOf(w.prizeCode) > 0,
      verify: w.verifyRut || w.verifyBirthDate || w.verifyAcceptedAt ? await verifySummary(db, ctx, w) : null,
      paymentId: w.orderId ? paymentByOrder.get(w.orderId) ?? null : null,
    }))),
  };
}

/* ── Invitar por correo a quienes ya tienen entrada ─────────────────────── */

/** Tope de correos del día para estos envíos (el resto queda para las entradas). */
const HOLDER_INVITE_DAILY_LIMIT = CONTEST_EMAIL_DAILY_LIMIT;
const HOLDER_INVITES_PER_CLICK = 120;
const holderInviteKey = (email: string) => `holder-mail:${crypto.createHash('sha1').update(email).digest('hex').slice(0, 20)}`;

/** Compradores aprobados del evento que todavía no comentaron (no son
 * participantes) y a los que aún no se les mandó la invitación. */
async function pendingHolderInvites(db: Db, ctx: ContestCtx): Promise<{ email: string; name: string }[]> {
  const buyers = await db.select({ email: orders.buyerEmail, name: orders.buyerName }).from(orders)
    .where(and(eq(orders.eventId, ctx.event.id), eq(orders.paymentStatus, 'approved')));
  const participants = await db.select({ email: contestParticipants.email, orderId: contestParticipants.orderId, username: contestParticipants.username })
    .from(contestParticipants).where(eq(contestParticipants.contestId, ctx.contest.id));
  const joined = new Set(participants.map((p) => p.email?.toLowerCase()).filter((e): e is string => !!e));
  const sent = new Set((await db.select({ refId: contestLog.refId }).from(contestLog)
    .where(and(eq(contestLog.contestId, ctx.contest.id), eq(contestLog.kind, 'comment'), sql`${contestLog.refId} LIKE 'holder-mail:%'`))).map((r) => r.refId));
  const seen = new Set<string>();
  const out: { email: string; name: string }[] = [];
  for (const b of buyers) {
    const email = b.email.trim().toLowerCase();
    if (!email || seen.has(email) || joined.has(email) || sent.has(holderInviteKey(email))) continue;
    seen.add(email);
    out.push({ email, name: (b.name ?? '').trim().split(/\s+/)[0] || 'hola' });
  }
  return out;
}

export async function getHolderInviteStatus(contestId: number) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const ctx = await getCtxById(contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  const pending = await pendingHolderInvites(db, ctx);
  const sentToday = await countEmailsSentToday();
  return { pending: pending.length, budgetLeft: Math.max(0, HOLDER_INVITE_DAILY_LIMIT - sentToday), perClick: HOLDER_INVITES_PER_CLICK };
}

/** Manda la invitación a comentar a quienes ya compraron y no participan.
 * Respeta el tope diario de correos; se puede repetir hasta cubrir a todos. */
export async function sendHolderInvites(contestId: number): Promise<{ sent: number; pending: number; stoppedByBudget: boolean }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const ctx = await getCtxById(contestId);
  if (!ctx || ctx.contest.status !== 'active' || contestPhase(ctx.contest, ctx.config) !== 'live') throw new Error('El concurso tiene que estar en vivo.');
  if (!ctx.contest.mediaPermalink) throw new Error('Falta el link del reel del concurso (Configuración).');
  const pending = await pendingHolderInvites(db, ctx);
  const perks = [
    `Entras al sorteo de ${ctx.config.prizes.vipPrizeLabel}`,
    ...(ctx.config.prizes.holderPlaycoins > 0 ? [`Recibes ${ctx.config.prizes.holderPlaycoins.toLocaleString('es-CL')} PlayCoins`] : []),
    ...(ctx.giftName ? [`Te regalamos ${ctx.giftName} para canjear en caja`] : []),
    ...(ctx.config.prizes.friendPercent > 0 ? [`Un código de ${ctx.config.prizes.friendPercent}% para un amigo`] : []),
    `Cada amigo etiquetado suma +${ctx.config.chances.perMention} punto`,
  ];
  let sent = 0;
  let stoppedByBudget = false;
  for (const person of pending) {
    if (sent >= HOLDER_INVITES_PER_CLICK) break;
    if ((await countEmailsSentToday()) >= HOLDER_INVITE_DAILY_LIMIT) { stoppedByBudget = true; break; }
    if (!(await claimLog(db, contestId, 'comment', holderInviteKey(person.email), null))) continue;
    const result = await sendEmail({
      marketing: true,
      to: person.email,
      subject: `🎁 ${person.name}, tu entrada también participa: comenta el reel`,
      html: buildContestHolderInviteEmail({
        name: person.name, eventTitle: ctx.event.title, vipLabel: ctx.config.prizes.vipPrizeLabel, perks,
        drawText: drawDateText(ctx.config), link: ctx.contest.mediaPermalink,
      }),
    }).catch(() => ({ success: false }));
    if (result.success) sent++;
    else await db.delete(contestLog).where(and(eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment'), eq(contestLog.refId, holderInviteKey(person.email)))).catch(() => {});
    // Resend deja 2 envíos por segundo.
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return { sent, pending: Math.max(0, pending.length - sent), stoppedByBudget };
}

/** Ajuste a mano de los puntos de un participante (cuentas privadas, capturas
 * revisadas): marca/desmarca el bonus de historia y suma/resta etiquetas. */
export async function adjustParticipant(participantId: number, input: { story?: boolean; mentionsDelta?: number }) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const p = await reload(db, participantId);
  if (!p) throw new Error('Participante no encontrado.');
  const ctx = await getCtxById(p.contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  let mentions = [...(p.mentions ?? [])];
  const delta = Math.max(-50, Math.min(50, Math.trunc(input.mentionsDelta ?? 0)));
  if (delta > 0) {
    for (let i = 0, n = 1; i < delta; n++) {
      const handle = `manual${n}`;
      if (!mentions.includes(handle)) { mentions.push(handle); i++; }
    }
  } else if (delta < 0) {
    for (let i = 0; i < -delta && mentions.length > 0; i++) {
      // Primero se quitan las sumadas a mano; después, las últimas registradas.
      const manual = mentions.map((m, k) => (m.startsWith('manual') ? k : -1)).filter((k) => k >= 0).pop();
      mentions.splice(manual !== undefined ? manual : mentions.length - 1, 1);
    }
  }
  const storyChanged = input.story !== undefined && (input.story ? 1 : 0) !== p.storyMentioned;
  await db.update(contestParticipants).set({
    mentions, ...(input.story !== undefined ? { storyMentioned: input.story ? 1 : 0 } : {}),
  }).where(eq(contestParticipants.id, p.id));
  await db.delete(contestLog).where(and(
    eq(contestLog.contestId, p.contestId), eq(contestLog.kind, 'story'), eq(contestLog.participantId, p.id), sql`${contestLog.refId} LIKE 'proof:%'`,
  ));
  const updated = await reload(db, p.id);
  // Si sumó y tiene el chat abierto, se le avisa (sin gastar su comentario de reserva).
  if ((storyChanged && input.story) || delta > 0) {
    const [thread] = await db.select({ id: igThreads.id, lastInboundAt: igThreads.lastInboundAt }).from(igThreads).where(eq(igThreads.igUserId, p.igUserId)).limit(1);
    if (thread && canReplyWithinWindow(thread.lastInboundAt) && !ctx.contest.drawnAt && !updated.disqualified) {
      await send({ kind: 'dm', igUserId: p.igUserId, threadId: thread.id }, renderContestTemplate(ctx.config.messages.proofApproved, templateVars(ctx, updated)))
        .catch((err) => console.error('[Concurso] No se pudo avisar los puntos sumados:', err));
    }
  }
  return { chances: chancesOf(updated, ctx.config), mentions: mentions.length, story: updated.storyMentioned === 1 };
}

/** Vuelve a leer todos los comentarios del reel (con sus respuestas) y suma a
 * cada participante las etiquetas que no tuviera registradas. Nunca resta. */
export async function recalcMentions(contestId: number): Promise<{ participants: number; updated: number; added: number; comments: number }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const ctx = await getCtxById(contestId);
  if (!ctx || !ctx.contest.mediaId) throw new Error('El concurso no tiene publicación.');
  const comments = await fetchMediaComments(ctx.contest.mediaId, 20, { withReplies: true });
  const own = await ownUsername();
  const byUser = new Map<string, string[]>();
  for (const c of comments) {
    if (!c.igUserId) continue;
    byUser.set(c.igUserId, mergeMentions(byUser.get(c.igUserId) ?? [], parseMentions(c.text, [own, c.username ?? ''].filter(Boolean))));
  }
  const people = await db.select().from(contestParticipants).where(eq(contestParticipants.contestId, contestId));
  let updated = 0;
  let added = 0;
  for (const p of people) {
    const found = byUser.get(p.igUserId);
    if (!found) continue;
    const current = p.mentions ?? [];
    const merged = mergeMentions(current, found);
    const gained = merged.length - current.length;
    if (gained <= 0) continue;
    // Las etiquetas sumadas a mano suplían las que no se habían leído: al
    // aparecer las reales se descuentan, para no contarlas dos veces.
    let toDrop = gained;
    const finalList = merged.filter((m) => !(toDrop > 0 && m.startsWith('manual') && (toDrop--, true)));
    await db.update(contestParticipants).set({ mentions: finalList }).where(eq(contestParticipants.id, p.id));
    updated++;
    added += gained;
  }
  return { participants: people.length, updated, added, comments: comments.length };
}

export async function setParticipantDisqualified(participantId: number, disqualified: boolean, reason?: string | null) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  await db.update(contestParticipants).set({ disqualified: disqualified ? 1 : 0, disqualifyReason: disqualified ? (reason ?? '').slice(0, 200) || null : null })
    .where(eq(contestParticipants.id, participantId));
}

/** Marca a mano que alguien ya tiene entrada (por su correo de compra) y le
 * entrega los regalos de asistente. */
export async function markParticipantHolder(participantId: number, email: string) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const p = await reload(db, participantId);
  if (!p) throw new Error('Participante no encontrado.');
  const ctx = await getCtxById(p.contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  const holder = await findHolderOrder(db, ctx.event.id, { email });
  if (!holder) throw new Error('No hay una compra aprobada para esta fiesta con ese correo.');
  await markHolder(db, ctx, p.id, holder);
  await linkInstagramToCustomer(db, holder.email, p.username);
  await deliverHolderPrizes(db, ctx, await reload(db, p.id));
}

/** Pasa el siguiente suplente a mano (por ejemplo, si el ganador avisó que no puede ir). */
export async function skipWinner(winnerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const [row] = await db.select().from(contestWinners).where(eq(contestWinners.id, winnerId)).limit(1);
  if (!row) throw new Error('Ganador no encontrado.');
  const ctx = await getCtxById(row.contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  await db.update(contestWinners).set({ status: 'expired', ...(row.refundStatus === 'pending' ? { refundStatus: null } : {}) }).where(eq(contestWinners.id, winnerId));
  if (row.prizeCode) await db.update(discountCodes).set({ isActive: 0 }).where(eq(discountCodes.code, row.prizeCode));
  return { promoted: await promoteAlternate(db, ctx, row.pool, row.position) };
}

/** Reenvía la bienvenida a quienes participaron por comentario (máx. 7 días,
 * lo que deja Meta). Instagram acepta UN mensaje por comentario: a quien ya
 * lo recibió lo rechaza y no pasa nada; a quien no, le llega. */
export async function resendWelcomeDms(contestId: number): Promise<{ sent: number; failed: number; lastError: string | null }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const ctx = await getCtxById(contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  const since = new Date(Date.now() - PRIVATE_REPLY_WINDOW_MS);
  const rows = (await db.select().from(contestParticipants).where(and(
    eq(contestParticipants.contestId, contestId), eq(contestParticipants.disqualified, 0), sql`${contestParticipants.firstCommentId} IS NOT NULL`,
  )).orderBy(asc(contestParticipants.id))).filter((p) => new Date(p.createdAt) >= since).slice(0, 150);
  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const p of rows) {
    const { text, button } = welcomeMessage(ctx, p);
    try {
      await send({ kind: 'comment', commentId: p.firstCommentId! }, text, button);
      sent++;
    } catch (err) {
      failed++;
      lastError = err instanceof Error ? err.message : 'Error';
    }
  }
  return { sent, failed, lastError };
}

/** Participantes y ranking de un concurso (dos tablas, ver shared/contestRanking.ts). */
export async function loadRankingFor(db: Db, ctx: ContestCtx) {
  const participants = await db.select().from(contestParticipants).where(eq(contestParticipants.contestId, ctx.contest.id));
  const ranking = buildRanking(participants.map((p) => ({
    id: p.id, username: p.username, createdAt: p.createdAt, mentions: p.mentions, storyMentioned: p.storyMentioned,
    invitedPurchases: p.invitedPurchases, hasTicket: p.hasTicket, boughtDuringContest: p.boughtDuringContest, disqualified: p.disqualified,
  })), ctx.config.chances);
  return { participants, ranking };
}

/** Datos públicos para la página de bases (/concurso). */
let publicCache: { at: number; value: Awaited<ReturnType<typeof getPublicContest>> } | null = null;

/** El checkout, la compra y la entrada piden esto en cada visita: se guarda 30 s
 * para no recalcular el ranking completo por cada persona que mira. */
export async function getPublicContestCached() {
  if (publicCache && Date.now() - publicCache.at < 30_000) return publicCache.value;
  const value = await getPublicContest();
  publicCache = { at: Date.now(), value };
  return value;
}

export async function getPublicContest() {
  const ctx = await getActiveContestCtx();
  if (!ctx) return null;
  const db = await getDb();
  if (!db) return null;
  const [count] = await db.select({ n: sql<number>`COUNT(*)` }).from(contestParticipants).where(eq(contestParticipants.contestId, ctx.contest.id));
  const winners = ctx.contest.drawnAt
    ? await db.select({ pool: contestWinners.pool, username: contestParticipants.username, status: contestWinners.status })
      .from(contestWinners).innerJoin(contestParticipants, eq(contestParticipants.id, contestWinners.participantId))
      .where(and(eq(contestWinners.contestId, ctx.contest.id), inArray(contestWinners.status, ['notified', 'choosing', 'delivered'])))
    : [];
  const labels = prizeLabels(ctx.prizeName, ctx.config.prizes.doubleWinners);
  const { ranking } = await loadRankingFor(db, ctx);
  const top = (rows: typeof ranking.double) => rows.slice(0, 10).map((r) => ({ position: r.position, username: r.username, points: r.points }));
  return {
    title: ctx.contest.title,
    template: ctx.contest.template,
    ranking: { double: top(ranking.double), vip: top(ranking.vip), totals: ranking.totals, doubleCount: ranking.double.length, vipCount: ranking.vip.length },
    eventTitle: ctx.event.title,
    eventSlug: ctx.event.slug,
    eventDate: ctx.event.eventDate,
    mediaPermalink: ctx.contest.mediaPermalink,
    phase: contestPhase(ctx.contest, ctx.config),
    startsAt: ctx.config.startsAt,
    drawAt: ctx.config.drawAt,
    keyword: ctx.config.keywordPhrase.trim() || parseKeywords(ctx.config.keyword).join(' '),
    claimHours: ctx.config.claimHours,
    chances: ctx.config.chances,
    prizes: {
      doubleWinners: ctx.config.prizes.doubleWinners,
      doubleLabel: labels.plural,
      vipWinners: ctx.config.prizes.vipWinners,
      vipLabel: ctx.config.prizes.vipPrizeLabel,
      couponPercent: ctx.config.prizes.couponPercent,
      couponHours: ctx.config.prizes.couponHours,
      priceLockUntil: priceLockUntil(ctx).toISOString(),
      choiceHours: ctx.config.prizes.choiceHours,
      friendPercent: ctx.config.prizes.friendPercent,
      giftName: ctx.giftName,
      playcoins: ctx.config.prizes.holderPlaycoins,
    },
    participants: Number(count?.n ?? 0),
    winners: winners.map((w) => ({ pool: w.pool, username: w.username })),
  };
}

/** Participantes del sorteo con sus chances, para la ruleta del panel. */
export async function getDrawWheel(id: number) {
  const data = await getContestAdmin(id);
  if (!data) return null;
  return {
    double: data.participants.filter((p) => p.pool === 'double' && !p.disqualified).map((p) => ({ username: p.username, chances: p.chances })),
    vip: data.participants.filter((p) => p.pool === 'vip' && !p.disqualified).map((p) => ({ username: p.username, chances: p.chances })),
  };
}

/** Accesos y productos de la Carta del evento, para elegir los premios. */
export async function listContestTicketTypes(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: ticketTypes.id, name: ticketTypes.name, category: ticketTypes.category, price: ticketTypes.price, status: ticketTypes.status })
    .from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(asc(ticketTypes.category), asc(ticketTypes.name));
}

/** Llamado a participar para el correo de la entrada y la pantalla de compra
 * exitosa: solo con un concurso activo, en vivo y antes del sorteo. */
export async function getContestInviteForEvent(eventId: number): Promise<{ permalink: string; drawText: string; multiplier: number } | null> {
  const all = (await getActiveContestCtxs()).filter((c) => c.event.id === eventId && c.contest.mediaPermalink && contestPhase(c.contest, c.config) === 'live');
  const ctx = all.find((c) => c.contest.template === 'ranking') ?? all[0];
  if (!ctx) return null;
  return { permalink: ctx.contest.mediaPermalink!, drawText: drawDateText(ctx.config), multiplier: ctx.config.chances.buyerMultiplier };
}
