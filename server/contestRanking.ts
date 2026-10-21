/* Ranking del concurso de Instagram: lo que la gente ve (página pública y
 * «mi posición») y los empujes automáticos para que sigan sumando puntos.
 * Reglas puras en shared/contestRanking.ts; el concurso en server/contests.ts.
 *
 * Instagram no deja mandar DMs por iniciativa propia, así que los empujes son:
 * - comentario diario del top en el reel (con @, les llega una notificación),
 * - respuestas públicas a quienes están cerca de pasar a alguien (con tope),
 * - correo a quienes ya compraron, el día antes del sorteo (con tope y sin
 *   tocar la reserva de correos para las confirmaciones),
 * - tips por DM cuando ellos escriben (una vez al día), o la respuesta directa
 *   si preguntan por sus puntos.
 * Los controles de "una sola vez" viven en `contestLog` (sin migración).
 * Nada de esto puede romper el webhook ni el cron: todo atrapa sus errores. */
import { and, eq, sql } from 'drizzle-orm';
import { contestLog, contestParticipants, type ContestParticipant } from '../drizzle/schema';
import { countEmailsSentToday, getDb } from './db';
import { buildContestRankingEmail, sendEmail } from './email';
import { commentOnOwnMedia, replyToComment } from './instagramSend';
import {
  CONTEST_APP_URL, drawDateText, getActiveContestCtxs, getCtxById, loadRankingFor, positionLink, reachableChannel, send, BASES_URL,
  type ContestCtx,
} from './contests';
import { contestPhase, parseKeywords } from '../shared/contest';
import { CONTEST_EMAIL_DAILY_LIMIT } from '../shared/emailQuota';
import { chileDateKey, chileHourOf } from '../shared/chileDate';
import {
  approxWinProbabilityWithLeader, asksAboutRanking, dmTipsText, personalTips, rankDmKey, rankMailKey, rankPostKey, rankReplyCandidates,
  rankReplyKey, rankReplyText, rankingCommentText, takeReplyTargets, type RankRow, type Ranking,
} from '../shared/contestRanking';

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Correos del día a partir de los cuales no se manda el aviso de ranking:
 * quedan los últimos 30 de los 100 para las confirmaciones de compra. */
const RANKING_EMAIL_DAILY_LIMIT = CONTEST_EMAIL_DAILY_LIMIT;

async function claim(db: Db, contestId: number, refId: string, participantId: number | null = null): Promise<boolean> {
  try {
    await db.insert(contestLog).values({ contestId, kind: 'comment', refId, participantId });
    return true;
  } catch {
    return false;
  }
}

async function release(db: Db, contestId: number, refId: string): Promise<void> {
  await db.delete(contestLog).where(and(eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment'), eq(contestLog.refId, refId))).catch(() => {});
}

/** Dónde está una persona: su tabla, posición, puntos y lo que le falta. */
function locate(ranking: Ranking, participantId: number): { pool: 'double' | 'vip'; row: RankRow; rows: RankRow[]; total: number } | null {
  for (const pool of ['double', 'vip'] as const) {
    const rows = ranking[pool];
    const row = rows.find((r) => r.participantId === participantId);
    if (row) return { pool, row, rows, total: ranking.totals[pool] };
  }
  return null;
}

const leaderOf = (rows: RankRow[]) => ({ count: rows.filter((r) => r.position === 1).length, points: rows[0]?.points ?? 0 });

const poolLabel = (ctx: ContestCtx, pool: 'double' | 'vip') => (pool === 'double' ? 'la entrada doble' : ctx.config.prizes.vipPrizeLabel);

function personalView(ctx: ContestCtx, ranking: Ranking, p: ContestParticipant) {
  const found = locate(ranking, p.id);
  if (!found) return null;
  const { pool, row, rows, total } = found;
  const winners = pool === 'double' ? ctx.config.prizes.doubleWinners : ctx.config.prizes.vipWinners;
  const above = [...rows].reverse().find((r) => r.points > row.points) ?? null;
  const tenth = rows[9] ?? null;
  const tips = personalTips({
    points: row.points,
    mentionsUsed: (p.mentions ?? []).length,
    storyMentioned: !!p.storyMentioned,
    invitedPurchases: p.invitedPurchases,
    hasTicket: !!p.hasTicket,
    boughtDuringContest: !!p.boughtDuringContest,
    chances: ctx.config.chances,
  });
  return {
    pool,
    poolLabel: poolLabel(ctx, pool),
    position: row.position,
    ofTotal: rows.length,
    points: row.points,
    probability: approxWinProbabilityWithLeader(row.points, total, winners, leaderOf(rows)),
    isLeader: row.position === 1,
    tiedLeaders: rows.filter((r) => r.position === 1).length,
    gapToNext: above ? above.points - row.points : null,
    nextUsername: above?.username ?? null,
    // Un empate con el 10º comparte su posición, así que alcanza con igualarlo.
    gapToTop10: row.position > 10 && tenth ? Math.max(1, tenth.points - row.points) : null,
    tips,
  };
}

/** Para la página /concurso/mi-posicion/:code. El código es el de su link de invitación. */
export async function getPersonalPosition(rawCode: string) {
  const db = await getDb();
  const code = rawCode.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  if (!db || !code) return null;
  const [p] = await db.select().from(contestParticipants).where(eq(contestParticipants.inviteCode, code)).limit(1);
  if (!p) return null;
  const ctx = await getCtxById(p.contestId);
  if (!ctx) return null;
  // Retos por hitos: su página muestra el descuento desbloqueado (el código no se publica en el reel).
  const log = (ctx.contest.drawLog ?? {}) as { code?: string | null; percent?: number; validUntil?: string | null; count?: number };
  const milestone = ctx.contest.template === 'milestones' && !p.disqualified
    ? {
      count: Number(log.count ?? 0), percent: Number(log.percent ?? 0), code: log.code ?? null, validUntil: log.validUntil ?? null,
      live: !!log.code && !!log.validUntil && new Date(log.validUntil).getTime() > Date.now(),
      steps: ctx.config.milestones.steps,
    }
    : null;
  const { ranking } = await loadRankingFor(db, ctx);
  const view = milestone ? null : personalView(ctx, ranking, p);
  return {
    milestone,
    username: p.username,
    disqualified: !!p.disqualified,
    eventTitle: ctx.event.title,
    drawAt: ctx.config.drawAt,
    drawn: !!ctx.contest.drawnAt,
    phase: contestPhase(ctx.contest, ctx.config),
    hasTicket: !!p.hasTicket,
    view,
    links: {
      buy: p.hasTicket ? null : `${CONTEST_APP_URL}/p/${p.inviteCode}`,
      invite: `${CONTEST_APP_URL}/c/${p.inviteCode}`,
      reel: ctx.contest.mediaPermalink,
      ranking: BASES_URL,
    },
    pointsPerAction: ctx.config.chances,
  };
}

/* ── Comentario diario en el reel ────────────────────────────────────────── */

async function postRanking(ctx: ContestCtx, ranking: Ranking, opts: { lastDay: boolean }): Promise<string> {
  const mediaId = ctx.contest.mediaId;
  if (!mediaId) throw new Error('El concurso no tiene publicación.');
  const base = {
    vipLabel: ctx.config.prizes.vipPrizeLabel,
    drawText: drawDateText(ctx.config),
    link: BASES_URL,
    headline: opts.lastDay ? '⏳ ÚLTIMAS HORAS: ¡sorteo hoy! Esta es la tabla que cuenta' : undefined,
  };
  try {
    await commentOnOwnMedia(mediaId, rankingCommentText({ ...base, ranking }));
    return 'un comentario';
  } catch (err) {
    // Instagram puede rechazar tantas menciones juntas: se parte en dos comentarios.
    console.error('[Concurso] El comentario del ranking no salió, se intenta en dos:', err);
  }
  await commentOnOwnMedia(mediaId, rankingCommentText({ ...base, ranking: { ...ranking, vip: [] } }));
  if (ranking.vip.length > 0) await commentOnOwnMedia(mediaId, rankingCommentText({ ...base, ranking: { ...ranking, double: [] }, headline: base.headline }));
  return 'dos comentarios';
}

const isDrawDay = (ctx: ContestCtx, day: string) => !!ctx.config.drawAt && chileDateKey(ctx.config.drawAt) === day;

async function dailyComment(db: Db, ctx: ContestCtx, ranking: Ranking, now: Date, day: string): Promise<string | null> {
  const cfg = ctx.config.ranking;
  if (!cfg.dailyComment || !ctx.contest.mediaId) return null;
  const lastDay = isDrawDay(ctx, day);
  // El día del sorteo se publica 2 h antes (para que alcancen a subir).
  const hour = lastDay && ctx.config.drawAt ? Math.max(0, Math.min(cfg.dailyHour, chileHourOf(ctx.config.drawAt) - 2)) : cfg.dailyHour;
  if (chileHourOf(now) < hour) return null;
  const key = rankPostKey(day);
  if (!(await claim(db, ctx.contest.id, key))) return null;
  if (ranking.double.length + ranking.vip.length === 0) { await release(db, ctx.contest.id, key); return null; }
  try {
    return await postRanking(ctx, ranking, { lastDay });
  } catch (err) {
    console.error('[Concurso] No se pudo publicar el ranking diario:', err);
    await release(db, ctx.contest.id, key); // se reintenta en la próxima corrida
    return null;
  }
}

/** Botón del panel: publica el ranking ahora (no cuenta como el del día). */
export async function publishRankingNow(contestId: number): Promise<{ posted: string }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const ctx = await getCtxById(contestId);
  if (!ctx) throw new Error('Concurso no encontrado.');
  const { ranking } = await loadRankingFor(db, ctx);
  if (ranking.double.length + ranking.vip.length === 0) throw new Error('Todavía no hay participantes.');
  return { posted: await postRanking(ctx, ranking, { lastDay: isDrawDay(ctx, chileDateKey(new Date())) }) };
}

/* ── Respuestas públicas a quienes están cerca de subir ──────────────────── */

async function repliedToday(db: Db, contestId: number, day: string): Promise<Set<number>> {
  const rows = await db.select({ refId: contestLog.refId }).from(contestLog)
    .where(and(eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment'), sql`${contestLog.refId} LIKE ${`rank-reply:%:${day}`}`));
  return new Set(rows.map((r) => Number(r.refId.split(':')[1])).filter(Number.isFinite));
}

async function publicReplies(db: Db, ctx: ContestCtx, ranking: Ranking, participants: ContestParticipant[], now: Date, day: string): Promise<number> {
  const cfg = ctx.config.ranking;
  const hour = chileHourOf(now);
  if (!cfg.publicReplies || cfg.maxRepliesPerDay <= 0 || hour < 10 || hour >= 22) return 0;
  const done = await repliedToday(db, ctx.contest.id, day);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const candidates = [...rankReplyCandidates(ranking.double), ...rankReplyCandidates(ranking.vip)]
    .sort((a, b) => a.gap - b.gap || a.position - b.position)
    .filter((c) => !!(byId.get(c.participantId)?.spareCommentId ?? byId.get(c.participantId)?.firstCommentId));
  const targets = takeReplyTargets(candidates, done, cfg.maxRepliesPerDay - done.size, 5);
  let sent = 0;
  for (const t of targets) {
    const p = byId.get(t.participantId)!;
    const key = rankReplyKey(t.participantId, day);
    if (!(await claim(db, ctx.contest.id, key, t.participantId))) continue;
    // Primero el comentario más nuevo; si ya no existe, el primero.
    const commentIds = Array.from(new Set([p.spareCommentId, p.firstCommentId].filter((x): x is string => !!x)));
    let delivered = false;
    let permanent = true;
    const dead: string[] = [];
    for (const commentId of commentIds) {
      try {
        await replyToComment(commentId, rankReplyText(t, positionLink(p.inviteCode)));
        delivered = true;
        break;
      } catch (err) {
        console.error('[Concurso] No se pudo responder con la posición:', err);
        // Código 100 = el comentario ya no existe o no se puede responder: no
        // sirve reintentar. Cualquier otro error puede ser pasajero.
        if ((err as { code?: number })?.code !== 100) permanent = false;
        else dead.push(commentId);
      }
    }
    // Comentarios que Meta dice que ya no existen: se descartan para no volver a intentarlos.
    for (const id of dead) {
      if (p.spareCommentId === id) await db.update(contestParticipants).set({ spareCommentId: null, spareCommentAt: null }).where(eq(contestParticipants.id, p.id));
      if (p.firstCommentId === id) await db.update(contestParticipants).set({ firstCommentId: null }).where(eq(contestParticipants.id, p.id));
    }
    if (delivered) sent++;
    // Un comentario borrado no se reintenta cada 15 minutos (ocuparía el cupo de respuestas).
    else if (!permanent) await release(db, ctx.contest.id, key);
  }
  return sent;
}

/* ── Correo a quienes ya compraron ───────────────────────────────────────── */

async function emailBuyers(db: Db, ctx: ContestCtx, ranking: Ranking, participants: ContestParticipant[], now: Date, day: string): Promise<number> {
  const cfg = ctx.config.ranking;
  if (!cfg.emailBuyers || !ctx.config.drawAt || chileHourOf(now) < 12) return 0;
  // Un día antes del sorteo.
  const eve = chileDateKey(new Date(new Date(ctx.config.drawAt).getTime() - 24 * 60 * 60 * 1000));
  if (day !== eve) return 0;
  let sent = 0;
  for (const p of participants) {
    if (sent >= 100 || p.disqualified || !p.hasTicket || !p.email) continue;
    if ((await countEmailsSentToday(now)) >= RANKING_EMAIL_DAILY_LIMIT) break;
    const view = personalView(ctx, ranking, p);
    if (!view) continue;
    const key = rankMailKey(p.id);
    if (!(await claim(db, ctx.contest.id, key, p.id))) continue;
    const result = await sendEmail({
      to: p.email,
      subject: `🏆 Vas ${view.position}º en el concurso · ${ctx.event.title}`,
      html: buildContestRankingEmail({
        name: p.username ? `@${p.username}` : 'participante',
        eventTitle: ctx.event.title,
        position: view.position,
        poolLabel: view.poolLabel,
        points: view.points,
        tips: view.tips.filter((t) => !t.done).map((t) => t.text),
        drawText: drawDateText(ctx.config),
        link: positionLink(p.inviteCode),
      }),
    }).catch(() => ({ success: false }));
    if (result.success) sent++;
    else await release(db, ctx.contest.id, key);
    await new Promise((resolve) => setTimeout(resolve, 550)); // Resend: 2 envíos por segundo
  }
  return sent;
}

/* ── Cron ────────────────────────────────────────────────────────────────── */

/** Todo el empuje automático del ranking (se enchufa en el cron cada 15 min).
 * Va ANTES de runContestCron para que el último aviso salga antes del sorteo. */
export async function runContestRankingCron(now: Date = new Date()): Promise<Record<string, unknown>> {
  const ctxs = (await getActiveContestCtxs()).filter((c) => c.contest.template === 'ranking');
  if (ctxs.length === 0) return { active: false };
  const db = await getDb();
  if (!db) return { active: false };
  const results: Record<string, unknown>[] = [];
  for (const ctx of ctxs) results.push(await rankingCronFor(db, ctx, now));
  return { active: true, contests: results };
}

async function rankingCronFor(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, ctx: ContestCtx, now: Date): Promise<Record<string, unknown>> {
  if (contestPhase(ctx.contest, ctx.config, now) !== 'live') return { contestId: ctx.contest.id, phase: contestPhase(ctx.contest, ctx.config, now) };
  const day = chileDateKey(now);
  const { participants, ranking } = await loadRankingFor(db, ctx);
  const result: Record<string, unknown> = { contestId: ctx.contest.id };
  result.dailyComment = await dailyComment(db, ctx, ranking, now, day).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
  result.replies = await publicReplies(db, ctx, ranking, participants, now, day).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
  result.emails = await emailBuyers(db, ctx, ranking, participants, now, day).catch((err) => `error: ${err instanceof Error ? err.message : err}`);
  return result;
}

/* ── DM: tips y respuesta a «¿cuántos puntos llevo?» ─────────────────────── */

/** Un participante escribe por DM. Si pregunta por sus puntos/posición, se le
 * contesta aquí y devuelve `true` (el agente no contesta encima). Si no, se le
 * manda su posición y tips UNA vez al día y devuelve `false` (el agente sigue
 * con su respuesta normal). Nunca lanza. */
export async function handleRankingDm(input: { igUserId: string; text: string; threadId: number | null }): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    let ctx: ContestCtx | null = null;
    let p: ContestParticipant | undefined;
    for (const c of (await getActiveContestCtxs()).filter((x) => x.contest.template === 'ranking' && contestPhase(x.contest, x.config) === 'live')) {
      [p] = await db.select().from(contestParticipants)
        .where(and(eq(contestParticipants.contestId, c.contest.id), eq(contestParticipants.igUserId, input.igUserId))).limit(1);
      if (p) { ctx = c; break; }
    }
    if (!ctx || !p || p.disqualified) return false;
    const asks = asksAboutRanking(input.text);
    if (!asks) {
      if (!ctx.config.ranking.dmTips) return false;
      if (!(await claim(db, ctx.contest.id, rankDmKey(p.id, chileDateKey(new Date())), p.id))) return false;
    }
    const { ranking } = await loadRankingFor(db, ctx);
    const view = personalView(ctx, ranking, p);
    if (!view) return false;
    await send({ kind: 'dm', igUserId: input.igUserId, threadId: input.threadId }, dmTipsText({
      position: view.position, poolLabel: view.poolLabel, points: view.points, probability: view.probability, tips: view.tips, link: positionLink(p.inviteCode),
    }));
    return asks;
  } catch (err) {
    console.error('[Concurso] No se pudieron mandar los tips del ranking:', err);
    return false;
  }
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

export async function getRankingAdmin(contestId: number) {
  const db = await getDb();
  if (!db) return null;
  const ctx = await getCtxById(contestId);
  if (!ctx) return null;
  const { ranking } = await loadRankingFor(db, ctx);
  const day = chileDateKey(new Date());
  const posted = (await db.select({ id: contestLog.id }).from(contestLog)
    .where(and(eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment'), eq(contestLog.refId, rankPostKey(day)))).limit(1)).length > 0;
  const [mails] = await db.select({ n: sql<number>`COUNT(*)` }).from(contestLog)
    .where(and(eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment'), sql`${contestLog.refId} LIKE 'rank-mail:%'`));
  const top = (rows: RankRow[]) => rows.slice(0, 20).map((r) => ({ participantId: r.participantId, position: r.position, username: r.username, points: r.points, probability: 0 }));
  return {
    title: ctx.contest.title,
    // Para las imágenes de historias del panel (números reales del concurso).
    story: {
      chances: ctx.config.chances,
      phrase: ctx.config.keywordPhrase.trim() || parseKeywords(ctx.config.keyword).join(' ') || ctx.config.keyword,
      drawAt: ctx.config.drawAt,
      participants: ranking.double.length + ranking.vip.length,
      doubleWinners: ctx.config.prizes.doubleWinners,
      couponPercent: ctx.config.prizes.couponPercent,
      couponHours: ctx.config.prizes.couponHours,
    },
    vipLabel: ctx.config.prizes.vipPrizeLabel,
    drawText: drawDateText(ctx.config),
    double: top(ranking.double).map((r) => ({ ...r, probability: approxWinProbabilityWithLeader(r.points, ranking.totals.double, ctx.config.prizes.doubleWinners, leaderOf(ranking.double)) })),
    vip: top(ranking.vip).map((r) => ({ ...r, probability: approxWinProbabilityWithLeader(r.points, ranking.totals.vip, ctx.config.prizes.vipWinners, leaderOf(ranking.vip)) })),
    counts: { double: ranking.double.length, vip: ranking.vip.length },
    today: { posted, replies: (await repliedToday(db, contestId, day)).size, mails: Number(mails?.n ?? 0) },
  };
}

