/* Retos por hitos: cuando el reel llega a N comentarios se desbloquea un % de
 * descuento para TODOS con un código compartido. El código es uno solo: cada
 * hito sube su % y alarga su vigencia (el más alto reemplaza al anterior), así
 * quien ya lo tiene no necesita uno nuevo. Se avisa con un comentario en el
 * reel y por DM a quien tenga abierta la ventana de 24 h. Lo puro vive en
 * shared/contestMilestones.ts. */
import { and, eq } from 'drizzle-orm';
import { contestLog, contestParticipants, contests, discountCodes, igThreads, ticketTypes } from '../drizzle/schema';
import { fetchMediaComments, commentOnOwnMedia, canReplyWithinWindow } from './instagramSend';
import { claimLog, createCode, ownUsername, send, CONTEST_APP_URL, type ContestCtx, type Db } from './contests';
import { ENV } from './_core/env';
import { parseKeywords, matchesAllKeywords } from '../shared/contest';
import { formatChileDate, formatChileTime } from '../shared/chileDate';
import { milestoneCommentText, milestoneDmText, milestoneState } from '../shared/contestMilestones';

/** Máximo de DM por corrida (cada 15 min): reparte el envío sin ráfagas. */
const DMS_PER_RUN = 40;

interface Progress {
  template: 'milestones';
  count: number;
  reached: number;
  percent: number;
  code: string | null;
  validUntil: string | null;
}

const readProgress = (ctx: ContestCtx): Progress => {
  const log = (ctx.contest.drawLog ?? {}) as Partial<Progress>;
  return { template: 'milestones', count: log.count ?? 0, reached: log.reached ?? -1, percent: log.percent ?? 0, code: log.code ?? null, validUntil: log.validUntil ?? null };
};

const untilText = (iso: string) => `${formatChileDate(iso, { withWeekday: true })} a las ${formatChileTime(iso)}`;

async function countComments(ctx: ContestCtx): Promise<number> {
  if (!ctx.contest.mediaId) return 0;
  const keywords = parseKeywords(ctx.config.keyword);
  const own = await ownUsername();
  const comments = await fetchMediaComments(ctx.contest.mediaId);
  return comments.filter((c) => {
    if (c.igUserId && c.igUserId === ENV.igUserId) return false;
    if (own && c.username?.toLowerCase() === own) return false;
    return keywords.length === 0 || matchesAllKeywords(c.text, keywords);
  }).length;
}

async function saveProgress(db: Db, ctx: ContestCtx, p: Progress) {
  await db.update(contests).set({ drawLog: p }).where(eq(contests.id, ctx.contest.id));
  ctx.contest = { ...ctx.contest, drawLog: p };
}

/** Código compartido del hito: lo crea la primera vez y después solo sube su %/vigencia. */
async function upsertCode(db: Db, ctx: ContestCtx, p: Progress, percent: number, validUntil: Date): Promise<string> {
  if (p.code) {
    await db.update(discountCodes).set({ discountValue: String(percent), validUntil, isActive: 1 }).where(eq(discountCodes.code, p.code));
    return p.code;
  }
  const types = await db.select({ id: ticketTypes.id }).from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, ctx.event.id), eq(ticketTypes.category, 'acceso')));
  return createCode(db, {
    prefix: 'HITO', type: 'percentage', value: percent, maxUses: 100_000, validUntil, eventId: ctx.event.id,
    applicableTicketTypeIds: types.map((t) => t.id), description: `Concurso «${ctx.contest.title}»: descuento desbloqueado para todos`,
  });
}

/** Un ciclo del reto (cron cada 15 min): cuenta, desbloquea hitos y avisa. */
export async function runMilestones(db: Db, ctx: ContestCtx): Promise<Record<string, unknown>> {
  if (!ctx.contest.mediaId) return { skipped: 'sin publicación' };
  const progress = readProgress(ctx);
  const count = await countComments(ctx);
  const state = milestoneState(count, ctx.config.milestones.steps);
  const result: Record<string, unknown> = { count, reached: state.reachedIndex };

  if (state.reachedIndex > progress.reached && await claimLog(db, ctx.contest.id, 'comment', `milestone:${state.reachedIndex}`, null)) {
    const validUntil = new Date(Date.now() + ctx.config.milestones.hours * 60 * 60 * 1000);
    let code: string;
    try {
      code = await upsertCode(db, ctx, progress, state.percent, validUntil);
    } catch (err) {
      // Se libera para que la próxima corrida lo reintente.
      await db.delete(contestLog).where(and(eq(contestLog.contestId, ctx.contest.id), eq(contestLog.kind, 'comment'), eq(contestLog.refId, `milestone:${state.reachedIndex}`))).catch(() => {});
      throw err;
    }
    Object.assign(progress, { count, reached: state.reachedIndex, percent: state.percent, code, validUntil: validUntil.toISOString() });
    await saveProgress(db, ctx, progress);
    result.unlocked = state.percent;
    if (await claimLog(db, ctx.contest.id, 'comment', `milestone-post:${state.reachedIndex}`, null)) {
      await commentOnOwnMedia(ctx.contest.mediaId, milestoneCommentText({
        count: state.reachedIndex >= 0 ? ctx.config.milestones.steps[state.reachedIndex].comments : count,
        percent: state.percent, code, until: untilText(progress.validUntil!), next: state.next, remaining: state.remaining, link: `${CONTEST_APP_URL}/concurso`,
      })).catch((err) => console.error('[Concurso] No se pudo anunciar el hito:', err));
    }
  } else if (count !== progress.count) {
    progress.count = count;
    await saveProgress(db, ctx, progress);
  }

  if (progress.reached >= 0 && progress.code && progress.validUntil && new Date(progress.validUntil).getTime() > Date.now()) {
    result.dms = await sendPendingDms(db, ctx, progress, state);
  }
  return result;
}

/** DM del hito a quienes tienen la ventana de 24 h abierta (una vez por hito y persona). */
async function sendPendingDms(db: Db, ctx: ContestCtx, progress: Progress, state: ReturnType<typeof milestoneState>): Promise<number> {
  const people = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, ctx.contest.id), eq(contestParticipants.disqualified, 0)));
  let sent = 0;
  for (const p of people) {
    if (sent >= DMS_PER_RUN) break;
    if (p.igUserId.startsWith('ig:')) continue;
    const [thread] = await db.select({ id: igThreads.id, lastInboundAt: igThreads.lastInboundAt }).from(igThreads).where(eq(igThreads.igUserId, p.igUserId)).limit(1);
    if (!thread || !canReplyWithinWindow(thread.lastInboundAt)) continue;
    if (!(await claimLog(db, ctx.contest.id, 'comment', `milestone-dm:${progress.reached}:${p.id}`, p.id))) continue;
    try {
      await send({ kind: 'dm', igUserId: p.igUserId, threadId: thread.id }, milestoneDmText({
        name: p.username ? `@${p.username}` : '', count: ctx.config.milestones.steps[progress.reached].comments, percent: progress.percent,
        code: progress.code!, until: untilText(progress.validUntil!), next: state.next, remaining: state.remaining, link: `${CONTEST_APP_URL}/concurso`,
      }));
      sent++;
    } catch (err) {
      console.error('[Concurso] No se pudo mandar el DM del hito:', err);
    }
  }
  return sent;
}

/** Cierre: sin ganadores; se publica el resultado final del reto. */
export async function drawMilestones(db: Db, ctx: ContestCtx): Promise<{ double: number; vip: number }> {
  const progress = readProgress(ctx);
  const count = ctx.contest.mediaId ? await countComments(ctx).catch(() => progress.count) : progress.count;
  progress.count = count;
  await saveProgress(db, ctx, progress);
  if (ctx.contest.mediaId && await claimLog(db, ctx.contest.id, 'comment', 'milestone-final', null)) {
    const lines = progress.reached >= 0 && progress.code
      ? [`🎯 ¡Terminó el reto! Llegamos a ${count} comentarios y desbloqueamos ${progress.percent}% para todos 🎉`, `Código ${progress.code} válido hasta ${untilText(progress.validUntil!)}. ¡Gracias por comentar! 🍬`]
      : [`🎯 Terminó el reto con ${count} comentarios. ¡Gracias por participar! 🍬 Para la próxima vamos por más 🚀`];
    await commentOnOwnMedia(ctx.contest.mediaId, lines.join('\n')).catch((err) => console.error('[Concurso] No se pudo publicar el cierre del reto:', err));
  }
  return { double: count, vip: 0 };
}
