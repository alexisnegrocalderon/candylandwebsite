/* Concursos de carrera (sin puntos): comentario con más "me gusta" y carrera
 * de referidos. Se sortean/cierran solos a la hora del concurso: se eligen los
 * ganadores por resultado (no por azar), se activan con la misma verificación
 * y entrega de premio de los demás concursos y se publica el resultado en el
 * reel. Lo puro (ordenar, textos) vive en shared/contestRaces.ts. */
import { and, asc, eq } from 'drizzle-orm';
import { contestLog, contestParticipants, contestWinners, contests } from '../drizzle/schema';
import { fetchMediaComments, commentOnOwnMedia } from './instagramSend';
import {
  claimLog, drawDateText, getParticipant, ownUsername, safeActivateWinner, CONTEST_APP_URL, type ContestCtx, type Db,
} from './contests';
import { ENV } from './_core/env';
import { parseKeywords } from '../shared/contest';
import { chileDateKey, chileHourOf } from '../shared/chileDate';
import { likesCommentText, rankLikes, referralStandings, referralsCommentText } from '../shared/contestRaces';

async function loadRanked(ctx: ContestCtx) {
  if (!ctx.contest.mediaId) throw new Error('El concurso no tiene publicación.');
  const comments = await fetchMediaComments(ctx.contest.mediaId);
  return rankLikes(comments, { keywords: parseKeywords(ctx.config.keyword), ownerUsername: await ownUsername(), ownerId: ENV.igUserId });
}

async function loadReferrals(db: Db, ctx: ContestCtx) {
  const rows = await db.select().from(contestParticipants).where(eq(contestParticipants.contestId, ctx.contest.id));
  return referralStandings(rows.map((r) => ({
    id: r.id, username: r.username, invitedPurchases: r.invitedPurchases, createdAt: r.createdAt, disqualified: !!r.disqualified,
  })));
}

/** Guarda a los elegidos (ganadores + suplentes) y activa a los primeros N. */
async function saveAndActivate(db: Db, ctx: ContestCtx, picked: { participantId: number; score: number }[]) {
  const { doubleWinners, doubleAlternates } = ctx.config.prizes;
  const chosen = picked.slice(0, doubleWinners + doubleAlternates);
  for (let i = 0; i < chosen.length; i++) {
    await db.insert(contestWinners).values({
      contestId: ctx.contest.id, participantId: chosen[i].participantId, pool: 'double', position: i + 1, chances: chosen[i].score, status: 'alternate',
    });
  }
  const rows = await db.select().from(contestWinners)
    .where(and(eq(contestWinners.contestId, ctx.contest.id), eq(contestWinners.pool, 'double'))).orderBy(asc(contestWinners.position));
  for (const row of rows.slice(0, doubleWinners)) await safeActivateWinner(db, ctx, row);
}

async function postResult(db: Db, ctx: ContestCtx, text: string, key: string) {
  if (!ctx.contest.mediaId) return;
  if (!(await claimLog(db, ctx.contest.id, 'comment', key, null))) return;
  await commentOnOwnMedia(ctx.contest.mediaId, text).catch((err) => console.error('[Concurso] No se pudo publicar el resultado:', err));
}

/** Cierre del concurso de "me gusta": se congelan los likes, ganan los más votados. */
export async function drawLikes(db: Db, ctx: ContestCtx): Promise<{ double: number; vip: number }> {
  const ranked = await loadRanked(ctx);
  const picked: { participantId: number; score: number; position: number }[] = [];
  for (const e of ranked) {
    if (!e.igUserId) continue;
    const p = await getParticipant(db, ctx.contest.id, e.igUserId);
    if (!p || p.disqualified) continue;
    picked.push({ participantId: p.id, score: e.likes, position: e.position });
  }
  await saveAndActivate(db, ctx, picked);
  await db.update(contests).set({
    drawLog: { template: 'likes', participants: ranked.length, top: ranked.slice(0, 10).map((e) => ({ username: e.username, likes: e.likes, commentId: e.commentId })) },
  }).where(eq(contests.id, ctx.contest.id));
  await postResult(db, ctx, likesCommentText({ top: ranked, final: true, drawText: drawDateText(ctx.config) }), 'race-final');
  return { double: ranked.length, vip: 0 };
}

/** Cierre de la carrera de referidos: ganan quienes más compras lograron. */
export async function drawReferrals(db: Db, ctx: ContestCtx): Promise<{ double: number; vip: number }> {
  const standings = await loadReferrals(db, ctx);
  await saveAndActivate(db, ctx, standings.map((s) => ({ participantId: s.participantId, score: s.purchases })));
  await db.update(contests).set({
    drawLog: { template: 'referrals', participants: standings.length, top: standings.slice(0, 10).map((s) => ({ username: s.username, purchases: s.purchases })) },
  }).where(eq(contests.id, ctx.contest.id));
  await postResult(db, ctx, referralsCommentText({ top: standings, final: true, drawText: drawDateText(ctx.config), link: `${CONTEST_APP_URL}/concurso` }), 'race-final');
  return { double: standings.length, vip: 0 };
}

/** Parcial diario en el reel (a la hora del ranking). Una vez por día. */
export async function runRaceDaily(db: Db, ctx: ContestCtx, now: Date): Promise<string | null> {
  const cfg = ctx.config.ranking;
  if (!cfg.dailyComment || !ctx.contest.mediaId || chileHourOf(now) < cfg.dailyHour) return null;
  const key = `race-post:${chileDateKey(now)}`;
  if (!(await claimLog(db, ctx.contest.id, 'comment', key, null))) return null;
  const release = () => db.delete(contestLog).where(and(eq(contestLog.contestId, ctx.contest.id), eq(contestLog.kind, 'comment'), eq(contestLog.refId, key))).catch(() => {});
  try {
    let text: string;
    if (ctx.contest.template === 'likes') {
      const ranked = await loadRanked(ctx);
      if (ranked.length === 0) { await release(); return null; }
      text = likesCommentText({ top: ranked, final: false, drawText: drawDateText(ctx.config) });
    } else {
      const standings = await loadReferrals(db, ctx);
      if (standings.length === 0) { await release(); return null; }
      text = referralsCommentText({ top: standings, final: false, drawText: drawDateText(ctx.config), link: `${CONTEST_APP_URL}/concurso` });
    }
    await commentOnOwnMedia(ctx.contest.mediaId, text);
    return 'posted';
  } catch (err) {
    console.error('[Concurso] No se pudo publicar el parcial:', err);
    await release();
    return null;
  }
}
