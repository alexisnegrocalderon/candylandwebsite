/* Quiz: la gente responde por DM (respondiendo una historia) o comentando el
 * reel. Cada pregunta acertada suma sus puntos (se puede reintentar) y al
 * cierre se sortea entre quienes acertaron, con tantos boletos como puntos.
 * Una respuesta que no acierta no recibe nada automático: la historia o el
 * comentario pueden ser de otra cosa. Reglas puras en shared/contestQuiz.ts. */
import crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { contestLog, contestParticipants, contests } from '../drizzle/schema';
import { claimLog, createParticipant, reload, send, templateVars, type Channel, type ContestCtx, type Db } from './contests';
import { saveAndActivate } from './contestRaces';
import { weightedDraw } from '../shared/contest';
import { renderContestTemplate } from '../shared/contest';
import { answeredFromKeys, matchQuizAnswer, quizLogKey, quizPoints, quizTotalPoints } from '../shared/contestQuiz';

async function answeredKeys(db: Db, contestId: number, participantId?: number): Promise<string[]> {
  const rows = await db.select({ refId: contestLog.refId }).from(contestLog).where(and(
    eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment'),
    participantId ? sql`${contestLog.refId} LIKE ${`quiz:${participantId}:%`}` : sql`${contestLog.refId} LIKE 'quiz:%'`,
  ));
  return rows.map((r) => r.refId);
}

/** Un mensaje o comentario: si acierta una pregunta, suma y avisa. Devuelve
 * `true` si lo manejó el quiz (así no pasa al agente de IA). */
export async function handleQuizAnswer(db: Db, ctx: ContestCtx, input: {
  igUserId: string; username: string | null; text: string; channel: Channel; commentId: string | null;
}): Promise<boolean> {
  const questions = ctx.config.quiz.questions;
  if (questions.length === 0) return false;
  const [existing] = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, ctx.contest.id), eq(contestParticipants.igUserId, input.igUserId))).limit(1);
  if (existing?.disqualified) return false;
  const answered = existing ? answeredFromKeys(await answeredKeys(db, ctx.contest.id, existing.id), existing.id) : new Set<number>();
  const { index, repeated } = matchQuizAnswer(input.text, questions, answered);
  if (index === null && !repeated) return false;

  const { participant } = existing
    ? { participant: existing }
    : await createParticipant(db, ctx, { igUserId: input.igUserId, username: input.username, source: input.commentId ? 'comment' : 'dm', commentId: input.commentId });
  let message = ctx.config.messages.quizRepeat;
  if (index !== null) {
    // Una sola vez por persona y pregunta, aunque lleguen el webhook y la sincronización.
    if (!(await claimLog(db, ctx.contest.id, 'comment', quizLogKey(participant.id, index), participant.id))) return true;
    answered.add(index);
    message = ctx.config.messages.quizCorrect;
  }
  const vars = templateVars(ctx, await reload(db, participant.id), {
    puntos_quiz: quizPoints(answered, questions),
    puntos_total: quizTotalPoints(questions),
    aciertos: answered.size,
    total_preguntas: questions.length,
  });
  await send(input.channel, renderContestTemplate(message, vars))
    .catch((err) => console.error('[Concurso] No se pudo avisar la respuesta del quiz:', err));
  return true;
}

/** Cierre: se sortea entre quienes acertaron, con boletos = puntos. */
export async function drawQuiz(db: Db, ctx: ContestCtx): Promise<{ double: number; vip: number }> {
  const questions = ctx.config.quiz.questions;
  const keys = await answeredKeys(db, ctx.contest.id);
  const people = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, ctx.contest.id), eq(contestParticipants.disqualified, 0)));
  const weights = people
    .map((p) => ({ id: p.id, weight: quizPoints(answeredFromKeys(keys, p.id), questions) }))
    .filter((w) => w.weight > 0);
  const { doubleWinners, doubleAlternates } = ctx.config.prizes;
  const picked = weightedDraw(weights, doubleWinners + doubleAlternates, () => crypto.randomInt(0, 2 ** 32) / 2 ** 32);
  await saveAndActivate(db, ctx, picked.map((id) => ({ participantId: id, score: weights.find((w) => w.id === id)?.weight ?? 0 })));
  await db.update(contests).set({
    drawLog: { template: 'quiz', participants: weights.length, tickets: weights.reduce((s, w) => s + w.weight, 0), perQuestion: questions.map((_, i) => keys.filter((k) => k.endsWith(`:${i}`)).length) },
  }).where(eq(contests.id, ctx.contest.id));
  return { double: weights.length, vip: 0 };
}
