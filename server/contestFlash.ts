/* Reto relámpago: pocas horas, los primeros en acertar ganan y cada puesto
 * tiene su premio (entrada, producto de la Carta, PlayCoins, descuento o
 * manual). La respuesta llega por DM (respondiendo la historia del reto) o
 * comentando el reel; los intentos son limitados, hay pista automática a la
 * mitad del tiempo y, cuando se llena el último puesto, el reto cierra solo.
 * Reglas puras en shared/contestFlash.ts. */
import { and, asc, eq, sql } from 'drizzle-orm';
import { contestLog, contestParticipants, contestWinners, contests, customers, ticketTypes } from '../drizzle/schema';
import { adjustPlaycoinsManually, findCustomersByInstagram } from './db';
import { commentOnOwnMedia } from './instagramSend';
import {
  checkoutUrl, claimLog, createCode, createParticipant, drawDateText, grantFreeItem, isTicketPrize, reload, runContestDraw,
  safeActivateWinner, send, templateVars, type Channel, type ContestCtx, type Db,
} from './contests';
import { extractEmail, renderContestTemplate } from '../shared/contest';
import { answerMatches } from '../shared/contestQuiz';
import { normalizeIgHandle } from '../shared/igCustomerLink';
import {
  attemptsLeft, describePrize, flashFinalText, flashLateKey, flashPlaces, flashSlotCount, flashSlotKey, flashTryKey,
} from '../shared/contestFlash';

const eventEnd = (ctx: ContestCtx) => new Date(new Date(ctx.event.eventDate).getTime() + 24 * 60 * 60 * 1000);

async function countLogs(db: Db, contestId: number, like: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`COUNT(*)` }).from(contestLog)
    .where(and(eq(contestLog.contestId, contestId), eq(contestLog.kind, 'comment'), sql`${contestLog.refId} LIKE ${like}`));
  return Number(row?.n ?? 0);
}

/** Un intento (comentario o respuesta a la historia) o una respuesta por DM.
 * Devuelve `true` si lo manejó el reto (así no pasa al agente de IA). */
export async function handleFlashAnswer(db: Db, ctx: ContestCtx, input: {
  igUserId: string; username: string | null; text: string; channel: Channel; commentId: string | null; storyReply?: boolean;
}): Promise<boolean> {
  const flash = ctx.config.flash;
  if (flash.answers.length === 0 || ctx.contest.drawnAt) return false;
  // El cron corre cada 15 min: pasada la hora de cierre ya no se aceptan respuestas.
  if (ctx.config.drawAt && Date.now() > new Date(ctx.config.drawAt).getTime()) return false;
  const correct = flash.answers.some((a) => answerMatches(input.text, a));
  const isAttempt = !!input.commentId || !!input.storyReply;
  if (!correct && !isAttempt) return false;
  const [existing] = await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, ctx.contest.id), eq(contestParticipants.igUserId, input.igUserId))).limit(1);
  if (existing?.disqualified) return false;
  const reply = (text: string) => send(input.channel, text).catch((err) => console.error('[Concurso] No se pudo responder el reto relámpago:', err));
  const nameVars = { nombre: input.username ? `@${input.username}` : '' };

  if (!correct) {
    // Sin límite no hay aviso por cada error (la historia puede ser de otra cosa).
    if (flash.maxAttempts <= 0) return false;
    const used = await countLogs(db, ctx.contest.id, `flash-try:${input.igUserId}:%`);
    if (attemptsLeft(flash.maxAttempts, used) === 0) {
      if (await claimLog(db, ctx.contest.id, 'comment', `flash-noleft:${input.igUserId}`.slice(0, 100), null)) {
        await reply(renderContestTemplate(ctx.config.messages.flashNoAttempts, { ...nameVars, max_intentos: flash.maxAttempts }));
      }
      return true;
    }
    if (!(await claimLog(db, ctx.contest.id, 'comment', flashTryKey(input.igUserId, used + 1), null))) return true;
    const left = flash.maxAttempts - (used + 1);
    await reply(renderContestTemplate(ctx.config.messages.flashWrong, { ...nameVars, intentos: left, s: left === 1 ? '' : 's' }));
    return true;
  }

  const { participant } = existing ? { participant: existing } : await createParticipant(db, ctx, { igUserId: input.igUserId, username: input.username, source: input.commentId ? 'comment' : 'dm', commentId: input.commentId });
  // Ya ganó o ya recibió su consuelo: no se repite.
  const [already] = await db.select({ id: contestWinners.id }).from(contestWinners)
    .where(and(eq(contestWinners.contestId, ctx.contest.id), eq(contestWinners.participantId, participant.id))).limit(1);
  if (already) return true;

  let slot: number | null = null;
  for (let n = 1; n <= flashSlotCount(flash); n++) {
    if (await claimLog(db, ctx.contest.id, 'comment', flashSlotKey(n), participant.id)) { slot = n; break; }
  }
  if (slot !== null) {
    const [res] = await db.insert(contestWinners).values({
      contestId: ctx.contest.id, participantId: participant.id, pool: 'double', position: slot, chances: 1, status: 'alternate',
    });
    const winnerId = (res as unknown as { insertId: number }).insertId;
    if (slot <= flashPlaces(flash)) {
      const [row] = await db.select().from(contestWinners).where(eq(contestWinners.id, winnerId)).limit(1);
      await activateFlashWinner(db, ctx, row, await reload(db, participant.id), input.channel);
      // Último puesto lleno: el reto termina antes de tiempo.
      if (slot === flashPlaces(flash)) await runContestDraw(ctx.contest.id).catch((err) => console.error('[Concurso] No se pudo cerrar el reto:', err));
      return true;
    }
  }
  // Acertó pero ya estaban los ganadores (o quedó de suplente): código flash de consuelo.
  await sendConsolation(db, ctx, participant, reply);
  return true;
}

async function sendConsolation(db: Db, ctx: ContestCtx, p: { id: number; username: string | null; igUserId: string }, reply: (text: string) => Promise<unknown>) {
  const percent = ctx.config.flash.consolationPercent;
  if (percent <= 0) return;
  if (!(await claimLog(db, ctx.contest.id, 'comment', flashLateKey(p.id), p.id))) return;
  const until = ctx.config.drawAt ? new Date(ctx.config.drawAt) : eventEnd(ctx);
  const code = await createCode(db, {
    prefix: 'FLASH', type: 'percentage', value: percent, maxUses: 1, validUntil: until, eventId: ctx.event.id,
    description: `Reto relámpago «${ctx.contest.title}»: consuelo para @${p.username ?? p.igUserId}`,
  });
  await reply(renderContestTemplate(ctx.config.messages.flashLate, { nombre: p.username ? `@${p.username}` : '', porcentaje_flash: percent, codigo_flash: code }));
}

/** Ganador de uno de los puestos: su premio según el puesto. */
async function activateFlashWinner(db: Db, ctx: ContestCtx, row: typeof contestWinners.$inferSelect, p: Awaited<ReturnType<typeof reload>>, channel: Channel) {
  if (isTicketPrize(ctx, row)) {
    // Entrada: verificación (+18, RUT, ACEPTO) y entrega con aprobación, o regalo/devolución si ya compró.
    await safeActivateWinner(db, ctx, row, channel);
    return;
  }
  await deliverFlashPrize(db, ctx, row, p, channel);
}

/** Entrega de los premios que no son entrada. `channel` null = no hay cómo
 * escribirle: queda esperando que escriba. `text` = lo que acaba de escribir
 * (puede traer su correo para abonar PlayCoins). */
export async function deliverFlashPrize(
  db: Db, ctx: ContestCtx, row: typeof contestWinners.$inferSelect, p: Awaited<ReturnType<typeof reload>>, channel: Channel | null, text?: string,
): Promise<void> {
  const prize = ctx.config.flash.prizes[row.position - 1];
  if (!prize) return;
  const deadline = new Date(Date.now() + ctx.config.claimHours * 60 * 60 * 1000);
  if (!channel) {
    await db.update(contestWinners).set({ status: 'notified', notifiedAt: row.notifiedAt ?? new Date(), claimDeadline: deadline }).where(eq(contestWinners.id, row.id));
    return;
  }
  const win = (detail: string) => renderContestTemplate(ctx.config.messages.flashWin, templateVars(ctx, p, { puesto: row.position, premio_flash: detail }));
  let prizeCode: string | null = row.prizeCode;
  let detail: string;
  const finish = async () => {
    await db.update(contestWinners).set({ status: 'delivered', deliveredAt: new Date(), notifiedAt: row.notifiedAt ?? new Date(), ...(prizeCode ? { prizeCode } : {}) }).where(eq(contestWinners.id, row.id));
    await send(channel, win(detail)).catch((err) => console.error('[Concurso] No se pudo avisar al ganador del reto:', err));
  };
  const names = async () => {
    if (!prize.ticketTypeId) return null;
    const [t] = await db.select({ name: ticketTypes.name }).from(ticketTypes).where(eq(ticketTypes.id, prize.ticketTypeId)).limit(1);
    return t?.name ?? null;
  };

  if (prize.kind === 'playcoins') {
    const email = (text && extractEmail(text)) || p.email;
    let customerId: number | null = null;
    const lookup = async (e: string) => (await db.select({ id: customers.id }).from(customers).where(eq(customers.email, e.toLowerCase())).limit(1))[0]?.id ?? null;
    if (email) customerId = await lookup(email);
    if (!customerId) {
      const handle = normalizeIgHandle(p.username);
      if (handle) for (const c of await findCustomersByInstagram(handle)) { customerId = await lookup(c.email); if (customerId) break; }
    }
    if (!customerId) {
      await db.update(contestWinners).set({ status: 'notified', notifiedAt: row.notifiedAt ?? new Date(), claimDeadline: deadline }).where(eq(contestWinners.id, row.id));
      await send(channel, `${win(describePrize(prize, {}))}\n\nPara abonarte los PlayCoins respóndenos con el correo de tu cuenta de Playroom 💌`).catch(() => {});
      return;
    }
    await adjustPlaycoinsManually(customerId, prize.playcoins, `Reto relámpago «${ctx.contest.title}» (${row.position}º)`);
    detail = `${describePrize(prize, {})}. Ya quedaron abonados en tu cuenta.`;
    await finish();
    return;
  }
  if (prize.kind === 'product' && prize.ticketTypeId) {
    const name = await names();
    if (p.orderId && await grantFreeItem(db, p.orderId, prize.ticketTypeId).catch(() => false)) {
      detail = `${describePrize(prize, { product: name })}. Ya quedó cargado en tu entrada: muéstralo en caja.`;
    } else {
      prizeCode = await createCode(db, {
        prefix: 'PREMIO', type: 'percentage', value: 100, maxUses: 1, validUntil: eventEnd(ctx), eventId: ctx.event.id,
        applicableTicketTypeIds: [prize.ticketTypeId], description: `Reto relámpago «${ctx.contest.title}»: ${row.position}º (@${p.username ?? p.igUserId})`,
      });
      detail = `${describePrize(prize, { product: name })}. Canjéalo con el código ${prizeCode}: ${checkoutUrl(ctx, { code: prizeCode, content: 'flash-premio' })}`;
    }
    await finish();
    return;
  }
  if (prize.kind === 'code') {
    prizeCode = await createCode(db, {
      prefix: 'FLASH', type: 'percentage', value: prize.percent, maxUses: 1, validUntil: eventEnd(ctx), eventId: ctx.event.id,
      description: `Reto relámpago «${ctx.contest.title}»: ${row.position}º (@${p.username ?? p.igUserId})`,
    });
    detail = `${describePrize(prize, {})}: código ${prizeCode}. ${checkoutUrl(ctx, { code: prizeCode, content: 'flash-premio' })}`;
    await finish();
    return;
  }
  // Manual: el sistema solo avisa; lo entrega el equipo.
  detail = `${describePrize(prize, {})}. Te contactamos para entregártelo.`;
  await finish();
}

/** Cierre (por hora o porque se llenaron los puestos): se anuncian los ganadores en el reel. */
export async function drawFlash(db: Db, ctx: ContestCtx): Promise<{ double: number; vip: number }> {
  const places = flashPlaces(ctx.config.flash);
  const rows = await db.select({ position: contestWinners.position, status: contestWinners.status, username: contestParticipants.username })
    .from(contestWinners).innerJoin(contestParticipants, eq(contestParticipants.id, contestWinners.participantId))
    .where(eq(contestWinners.contestId, ctx.contest.id)).orderBy(asc(contestWinners.position));
  const winners = rows.filter((r) => r.position <= places && r.status !== 'alternate' && r.status !== 'expired' && r.status !== 'skipped' && r.status !== 'rejected');
  // Los suplentes que no se usaron quedan como suplentes del panel.
  await db.update(contests).set({ drawLog: { template: 'flash', winners: winners.length, attempts: await countLogs(db, ctx.contest.id, 'flash-try:%') } }).where(eq(contests.id, ctx.contest.id));
  if (ctx.config.flash.announce && ctx.contest.mediaId && await claimLog(db, ctx.contest.id, 'comment', 'flash-final', null)) {
    await commentOnOwnMedia(ctx.contest.mediaId, flashFinalText(ctx.config.messages.flashFinal, winners.map((w) => ({ place: w.position, username: w.username }))))
      .catch((err) => console.error('[Concurso] No se pudo anunciar los ganadores del reto:', err));
  }
  return { double: winners.length, vip: 0 };
}

/** Cron: pista automática a la mitad del tiempo si todavía no hay ganador. */
export async function runFlashCron(db: Db, ctx: ContestCtx, now: Date): Promise<string | null> {
  const flash = ctx.config.flash;
  if (!flash.hintEnabled || !flash.hintText.trim() || !ctx.contest.mediaId || !ctx.config.drawAt) return null;
  const start = new Date(ctx.config.startsAt ?? ctx.contest.createdAt).getTime();
  const half = start + (new Date(ctx.config.drawAt).getTime() - start) / 2;
  if (now.getTime() < half) return null;
  if (await countLogs(db, ctx.contest.id, flashSlotKey(1)) > 0) return null;
  if (!(await claimLog(db, ctx.contest.id, 'comment', 'flash-hint', null))) return null;
  await commentOnOwnMedia(ctx.contest.mediaId, `💡 Pista: ${flash.hintText.trim()}\n\nCierra ${drawDateText(ctx.config)} ⚡`)
    .catch((err) => console.error('[Concurso] No se pudo publicar la pista:', err));
  return 'hint';
}
