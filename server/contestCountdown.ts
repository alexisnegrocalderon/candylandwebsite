/* Cuenta regresiva de ventas: cada meta de entradas vendidas durante el
 * concurso desbloquea más ganadores del sorteo. Cuenta las entradas (accesos)
 * de órdenes aprobadas desde que arrancó el concurso, sin las gratis (premios).
 * Se anuncia cada meta en el reel, hay un parcial diario y al cierre se sortea
 * con los ganadores desbloqueados. Reglas puras en shared/contestCountdown.ts. */
import crypto from 'crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import { contestParticipants, contests, orderItems, orders, ticketTypes } from '../drizzle/schema';
import { commentOnOwnMedia } from './instagramSend';
import { chancesOf, checkoutUrl, claimLog, drawDateText, type ContestCtx, type Db } from './contests';
import { saveAndActivate } from './contestRaces';
import { parseKeywords, prizeLabels, renderContestTemplate, weightedDraw } from '../shared/contest';
import { chileDateKey, chileHourOf } from '../shared/chileDate';
import { countdownLogKey, countdownMetaText, countdownState } from '../shared/contestCountdown';

/** Entradas (accesos) vendidas durante el concurso: órdenes aprobadas del
 * evento, sin contar las de $0 (premios y regalos). */
export async function countSoldTickets(db: Db, ctx: ContestCtx): Promise<number> {
  const start = new Date(ctx.config.startsAt ?? ctx.contest.createdAt);
  const [row] = await db.select({ n: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)` }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
    .where(and(
      eq(orders.eventId, ctx.event.id), eq(orders.paymentStatus, 'approved'), gte(orders.createdAt, start),
      eq(ticketTypes.category, 'acceso'), sql`${orderItems.totalPrice} > 0`,
    ));
  return Number(row?.n ?? 0);
}

interface Progress { template: 'countdown'; sold: number; reached: number; winners: number }
const readProgress = (ctx: ContestCtx): Progress => {
  const log = (ctx.contest.drawLog ?? {}) as Partial<Progress>;
  return { template: 'countdown', sold: log.sold ?? 0, reached: log.reached ?? -1, winners: log.winners ?? 0 };
};

/** Variables de los avisos a partir de las ventas actuales. */
export function countdownTextVars(ctx: ContestCtx, sold: number): Record<string, string | number> {
  const state = countdownState(sold, ctx.config.countdown.steps);
  return {
    vendidas: sold,
    ganadores_actuales: state.winners,
    s: state.winners === 1 ? '' : 'es',
    proxima_meta: state.next?.tickets ?? '',
    proximos_ganadores: state.next?.winners ?? '',
    faltan_meta: state.remaining,
    meta_texto: countdownMetaText(state),
    link_compra: checkoutUrl(ctx, { content: 'cuenta-regresiva' }),
  };
}

async function post(ctx: ContestCtx, template: string, sold: number) {
  if (!ctx.contest.mediaId) return;
  const labels = prizeLabels(ctx.prizeName, 1);
  const vars = {
    ...countdownTextVars(ctx, sold),
    evento: ctx.event.title, premio_singular: labels.singular, fecha_sorteo: drawDateText(ctx.config),
    frase: ctx.config.keywordPhrase.trim() || parseKeywords(ctx.config.keyword).join(' '),
  };
  await commentOnOwnMedia(ctx.contest.mediaId, renderContestTemplate(template, vars).slice(0, 2200))
    .catch((err) => console.error('[Concurso] No se pudo publicar la cuenta regresiva:', err));
}

/** Ciclo (cron cada 15 min): cuenta ventas, anuncia metas y el parcial diario. */
export async function runCountdown(db: Db, ctx: ContestCtx, now: Date): Promise<Record<string, unknown>> {
  const sold = await countSoldTickets(db, ctx);
  const progress = readProgress(ctx);
  const state = countdownState(sold, ctx.config.countdown.steps);
  const result: Record<string, unknown> = { sold, reached: state.reachedIndex };
  if (state.reachedIndex > progress.reached && await claimLog(db, ctx.contest.id, 'comment', countdownLogKey(state.reachedIndex), null)) {
    await post(ctx, ctx.config.messages.countdownUnlock, sold);
    result.unlocked = state.winners;
  }
  if (sold !== progress.sold || state.reachedIndex > progress.reached) {
    const next: Progress = { template: 'countdown', sold, reached: Math.max(progress.reached, state.reachedIndex), winners: state.winners };
    await db.update(contests).set({ drawLog: next }).where(eq(contests.id, ctx.contest.id));
    ctx.contest = { ...ctx.contest, drawLog: next };
  }
  // Parcial diario a la hora configurada.
  if (ctx.config.ranking.dailyComment && chileHourOf(now) >= ctx.config.ranking.dailyHour
    && await claimLog(db, ctx.contest.id, 'comment', `countdown-post:${chileDateKey(now)}`, null)) {
    await post(ctx, ctx.config.messages.countdownDaily, sold);
    result.daily = true;
  }
  return result;
}

/** Cierre: se sortea entre quienes comentaron con los ganadores desbloqueados. */
export async function drawCountdown(db: Db, ctx: ContestCtx): Promise<{ double: number; vip: number }> {
  const sold = await countSoldTickets(db, ctx);
  const state = countdownState(sold, ctx.config.countdown.steps);
  const people = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, ctx.contest.id), eq(contestParticipants.disqualified, 0)));
  const weights = people.map((p) => ({ id: p.id, weight: chancesOf(p, ctx.config) }));
  if (state.winners > 0) {
    const picked = weightedDraw(weights, state.winners + ctx.config.prizes.doubleAlternates, () => crypto.randomInt(0, 2 ** 32) / 2 ** 32);
    await saveAndActivate(db, { ...ctx, config: { ...ctx.config, prizes: { ...ctx.config.prizes, doubleWinners: state.winners } } },
      picked.map((id) => ({ participantId: id, score: weights.find((w) => w.id === id)?.weight ?? 0 })));
  }
  await db.update(contests).set({
    drawLog: { template: 'countdown', sold, reached: state.reachedIndex, winners: state.winners, participants: people.length },
  }).where(eq(contests.id, ctx.contest.id));
  if (await claimLog(db, ctx.contest.id, 'comment', 'countdown-final', null)) {
    await post(ctx, state.winners > 0 ? ctx.config.messages.countdownFinal : ctx.config.messages.countdownNone, sold);
  }
  return { double: people.length, vip: 0 };
}

