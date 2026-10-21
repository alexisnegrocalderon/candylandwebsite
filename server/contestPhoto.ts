/* Concurso de fotos / disfraz: la gente manda su foto mencionando la cuenta en
 * una historia o por DM (sirve con cuentas privadas). Las fotos se guardan en
 * Vercel Blob (las del CDN de Instagram vencen) y quedan en una galería del
 * panel: el jurado (el admin) elige a los ganadores y suplentes, y el sistema
 * les avisa y los verifica como en los demás concursos. Reglas puras en
 * shared/contestPhoto.ts. */
import { put } from '@vercel/blob';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { contestEntries, contestParticipants, contestWinners, contests } from '../drizzle/schema';
import { getDb } from './db';
import { createParticipant, getCtxById, reload, safeActivateWinner, send, templateVars, type Channel, type ContestCtx, type Db } from './contests';
import { renderContestTemplate } from '../shared/contest';
import { photosLeft, splitJuryPicks, type PhotoAttachment } from '../shared/contestPhoto';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN || process.env.NEW_BLOB_READ_WRITE_TOKEN;

/** Copia la foto a nuestro almacenamiento; si algo falla se queda con la URL original (vence en horas). */
async function rehost(url: string, contestId: number, key: string): Promise<string> {
  try {
    const token = blobToken();
    if (!token) return url;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return url;
    const type = response.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) return url;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) return url;
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const blob = await put(`contest-photos/${contestId}/${key}.${ext}`, buffer, { access: 'public', token, contentType: type, addRandomSuffix: true });
    return blob.url;
  } catch (err) {
    console.error('[Concurso] No se pudo guardar la foto:', err);
    return url;
  }
}

/** Mensaje con fotos de alguien: las suma a la galería. `true` = lo manejó el concurso. */
export async function handlePhotoEntry(db: Db, ctx: ContestCtx, input: {
  igUserId: string; username: string | null; photos: PhotoAttachment[]; mid: string | null; channel: Channel;
}): Promise<boolean> {
  if (input.photos.length === 0) return false;
  const existing = (await db.select().from(contestParticipants)
    .where(and(eq(contestParticipants.contestId, ctx.contest.id), eq(contestParticipants.igUserId, input.igUserId))).limit(1))[0];
  if (existing?.disqualified) return false;
  const { participant, created } = existing
    ? { participant: existing, created: false }
    : await createParticipant(db, ctx, { igUserId: input.igUserId, username: input.username, source: input.photos[0].kind === 'story' ? 'story' : 'dm' });
  const used = (await db.select({ id: contestEntries.id }).from(contestEntries)
    .where(and(eq(contestEntries.contestId, ctx.contest.id), eq(contestEntries.participantId, participant.id)))).length;
  let left = photosLeft(ctx.config.photo.maxPerPerson, used);
  let added = 0;
  for (let i = 0; i < input.photos.length && left > 0; i++) {
    const photo = input.photos[i];
    const mid = `${input.mid ?? `t${Date.now()}`}:${i}`.slice(0, 100);
    const imageUrl = await rehost(photo.url, ctx.contest.id, `${participant.id}-${Date.now()}-${i}`);
    try {
      await db.insert(contestEntries).values({ contestId: ctx.contest.id, participantId: participant.id, kind: photo.kind, imageUrl, mid });
      added++;
      left--;
    } catch {
      // Mismo mensaje procesado dos veces: ya estaba.
    }
  }
  const fresh = await reload(db, participant.id);
  const vars = templateVars(ctx, fresh, { max_fotos: ctx.config.photo.maxPerPerson, s: ctx.config.photo.maxPerPerson === 1 ? '' : 's' });
  if (added > 0 && (created || used === 0)) {
    await send(input.channel, renderContestTemplate(ctx.config.messages.photoReceived, vars)).catch((err) => console.error('[Concurso] No se pudo confirmar la foto:', err));
  } else if (added === 0 && used > 0) {
    await send(input.channel, renderContestTemplate(ctx.config.messages.photoLimit, vars)).catch((err) => console.error('[Concurso] No se pudo avisar el tope de fotos:', err));
  }
  return true;
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

export async function listPhotoEntries(contestId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: contestEntries.id, participantId: contestEntries.participantId, kind: contestEntries.kind, imageUrl: contestEntries.imageUrl,
    hidden: contestEntries.hidden, createdAt: contestEntries.createdAt, username: contestParticipants.username, igUserId: contestParticipants.igUserId,
    disqualified: contestParticipants.disqualified,
  }).from(contestEntries).innerJoin(contestParticipants, eq(contestParticipants.id, contestEntries.participantId))
    .where(eq(contestEntries.contestId, contestId)).orderBy(desc(contestEntries.id));
  const winners = await db.select({ participantId: contestWinners.participantId, position: contestWinners.position, status: contestWinners.status })
    .from(contestWinners).where(eq(contestWinners.contestId, contestId));
  return rows.map((r) => ({
    ...r, hidden: r.hidden === 1, disqualified: r.disqualified === 1,
    winnerPosition: winners.find((w) => w.participantId === r.participantId)?.position ?? null,
  }));
}

export async function setPhotoHidden(entryId: number, hidden: boolean) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  await db.update(contestEntries).set({ hidden: hidden ? 1 : 0 }).where(eq(contestEntries.id, entryId));
}

/** El jurado eligió (en orden): los primeros ganan, los siguientes son suplentes. Cierra el concurso. */
export async function pickPhotoWinners(contestId: number, entryIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible.');
  const ctx = await getCtxById(contestId);
  if (!ctx || ctx.contest.template !== 'photo') throw new Error('Este concurso no es de fotos.');
  if (ctx.contest.status !== 'active' || ctx.contest.drawnAt) throw new Error('El concurso no está activo o ya tiene ganadores.');
  if (entryIds.length === 0) throw new Error('Elige al menos una foto.');
  const rows = await db.select().from(contestEntries).where(and(eq(contestEntries.contestId, contestId), inArray(contestEntries.id, entryIds)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Una persona gana una sola vez, aunque el jurado haya marcado dos fotos suyas.
  const seen = new Set<number>();
  const participantIds: number[] = [];
  for (const id of entryIds) {
    const e = byId.get(id);
    if (!e || seen.has(e.participantId)) continue;
    seen.add(e.participantId);
    participantIds.push(e.participantId);
  }
  const people = participantIds.length
    ? await db.select().from(contestParticipants).where(inArray(contestParticipants.id, participantIds))
    : [];
  const valid = participantIds.filter((id) => people.find((p) => p.id === id && !p.disqualified));
  if (valid.length === 0) throw new Error('Las fotos elegidas no son válidas.');
  const { winners, alternates } = splitJuryPicks(valid, ctx.config.prizes.doubleWinners, ctx.config.prizes.doubleAlternates);
  const [res] = await db.update(contests).set({ drawnAt: new Date() }).where(and(eq(contests.id, contestId), eq(contests.status, 'active')));
  if ((res as unknown as { affectedRows: number }).affectedRows !== 1) throw new Error('No se pudo cerrar el concurso.');
  const all = [...winners, ...alternates];
  for (let i = 0; i < all.length; i++) {
    await db.insert(contestWinners).values({ contestId, participantId: all[i], pool: 'double', position: i + 1, chances: 1, status: 'alternate' });
  }
  const winnerRows = await db.select().from(contestWinners)
    .where(and(eq(contestWinners.contestId, contestId), eq(contestWinners.pool, 'double'))).orderBy(asc(contestWinners.position));
  const fresh = (await getCtxById(contestId)) ?? ctx;
  for (const row of winnerRows.slice(0, winners.length)) await safeActivateWinner(db, fresh, row);
  await db.update(contests).set({ drawLog: { template: 'photo', entries: rows.length, winners: winners.length, alternates: alternates.length } }).where(eq(contests.id, contestId));
  return { winners: winners.length, alternates: alternates.length };
}
