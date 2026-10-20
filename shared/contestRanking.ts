/* Ranking del concurso de Instagram: la gente ve cuántos puntos lleva y qué
 * hacer para subir. Reglas puras, sin base de datos ni red (las usa
 * server/contestRanking.ts y también las páginas).
 *
 * 1 punto = 1 chance del sorteo. El sorteo es ponderado, no gana el primero:
 * por eso el ranking es informativo y se muestra una probabilidad aproximada.
 * Dos tablas, una por sorteo (shared/contest.ts → drawPoolFor). */
import { computeChances, drawPoolFor, type ContestChances } from './contest';

export interface RankingInput {
  id: number;
  username: string | null;
  createdAt: Date | string;
  mentions: string[] | null;
  storyMentioned: boolean | number;
  invitedPurchases: number;
  hasTicket: boolean | number;
  boughtDuringContest: boolean | number;
  disqualified: boolean | number;
}

export interface RankRow {
  participantId: number;
  username: string | null;
  points: number;
  position: number;
}

export interface Ranking {
  double: RankRow[];
  vip: RankRow[];
  totals: { double: number; vip: number };
}

export function pointsOf(p: RankingInput, chances: ContestChances): number {
  return computeChances({
    mentionCount: (p.mentions ?? []).length,
    storyMentioned: !!p.storyMentioned,
    invitedPurchases: p.invitedPurchases,
    boughtDuringContest: !!p.boughtDuringContest,
  }, chances);
}

/** Posiciones por puntos; los empates comparten posición (1, 2, 2, 4) y el
 * desempate de orden es quién se inscribió primero. Sin descalificados. */
export function rankRows(rows: { id: number; username: string | null; points: number; createdAt: Date | string }[]): RankRow[] {
  const sorted = [...rows].sort((a, b) =>
    b.points - a.points || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
  let position = 0;
  let last: number | null = null;
  return sorted.map((r, i) => {
    if (last === null || r.points !== last) position = i + 1;
    last = r.points;
    return { participantId: r.id, username: r.username, points: r.points, position };
  });
}

export function buildRanking(participants: RankingInput[], chances: ContestChances): Ranking {
  const pools = { double: [] as { id: number; username: string | null; points: number; createdAt: Date | string }[], vip: [] as { id: number; username: string | null; points: number; createdAt: Date | string }[] };
  for (const p of participants) {
    if (p.disqualified) continue;
    pools[drawPoolFor({ hasTicket: !!p.hasTicket, boughtDuringContest: !!p.boughtDuringContest })]
      .push({ id: p.id, username: p.username, points: pointsOf(p, chances), createdAt: p.createdAt });
  }
  const sum = (rows: { points: number }[]) => rows.reduce((s, r) => s + r.points, 0);
  return { double: rankRows(pools.double), vip: rankRows(pools.vip), totals: { double: sum(pools.double), vip: sum(pools.vip) } };
}

/** Probabilidad aproximada (%) de ganar al menos un premio: `winners`
 * sorteos sin reposición sobre `totalPoints`. Una cifra de referencia, no una
 * promesa. */
export function approxWinProbability(points: number, totalPoints: number, winners: number): number {
  if (points <= 0 || totalPoints <= 0 || winners <= 0) return 0;
  const share = Math.min(1, points / totalPoints);
  return Math.round((1 - Math.pow(1 - share, winners)) * 1000) / 10;
}

export interface TipState {
  points: number;
  mentionsUsed: number;
  storyMentioned: boolean;
  invitedPurchases: number;
  hasTicket: boolean;
  boughtDuringContest: boolean;
  chances: ContestChances;
}

export interface Tip {
  key: 'mentions' | 'story' | 'invite' | 'buy' | 'ticket';
  done: boolean;
  text: string;
}

/** Qué le falta para sumar más, según lo que ya hizo. */
export function personalTips(s: TipState): Tip[] {
  const c = s.chances;
  const tips: Tip[] = [];
  if (c.perMention > 0) {
    const left = Math.max(0, c.maxMentions - s.mentionsUsed);
    tips.push(left > 0
      ? { key: 'mentions', done: false, text: `Etiqueta hasta ${left} amigo${left === 1 ? '' : 's'} más en tu comentario (+${c.perMention} por cada uno)` }
      : { key: 'mentions', done: true, text: 'Ya etiquetaste el máximo de amigos' });
  }
  if (c.storyBonus > 0) {
    tips.push(s.storyMentioned
      ? { key: 'story', done: true, text: 'Ya compartiste en tu historia' }
      : { key: 'story', done: false, text: `Comparte el reel en tu historia y menciónanos (+${c.storyBonus})` });
  }
  if (c.perInvitedPurchase > 0) {
    tips.push({ key: 'invite', done: false, text: `Cada amigo que compre con tu link suma +${c.perInvitedPurchase}${s.invitedPurchases > 0 ? ` (ya van ${s.invitedPurchases})` : ''}` });
  }
  if (!s.hasTicket && c.buyerMultiplier > 1) {
    tips.push({ key: 'buy', done: false, text: `Compra tu entrada ahora: tus ${s.points} puntos pasan a ${s.points * c.buyerMultiplier} (x${c.buyerMultiplier}) y, si ganas, te devolvemos tu entrada` });
  } else if (s.hasTicket) {
    tips.push({ key: 'ticket', done: true, text: s.boughtDuringContest ? `Ya compraste: tus puntos van x${c.buyerMultiplier}` : 'Ya tienes tu entrada' });
  }
  return tips;
}

export interface ReplyCandidate {
  participantId: number;
  username: string | null;
  position: number;
  points: number;
  gap: number;
  aboveUsername: string | null;
}

/** Quienes están cerca de pasar a alguien: a `maxGap` puntos o menos de la
 * persona que tienen justo arriba. Los más cerca primero. */
export function rankReplyCandidates(rows: RankRow[], maxGap = 2): ReplyCandidate[] {
  const out: ReplyCandidate[] = [];
  for (const r of rows) {
    if (r.position <= 1) continue;
    const above = [...rows].reverse().find((x) => x.points > r.points);
    if (!above) continue;
    const gap = above.points - r.points;
    if (gap > 0 && gap <= maxGap) {
      out.push({ participantId: r.participantId, username: r.username, position: r.position, points: r.points, gap, aboveUsername: above.username });
    }
  }
  return out.sort((a, b) => a.gap - b.gap || a.position - b.position);
}

/** De los candidatos, quienes todavía no recibieron respuesta hoy, hasta
 * `perRun` en esta corrida y sin pasar del tope del día. */
export function takeReplyTargets(candidates: ReplyCandidate[], repliedToday: Set<number>, remainingToday: number, perRun = 5): ReplyCandidate[] {
  const limit = Math.max(0, Math.min(perRun, remainingToday));
  return candidates.filter((c) => !repliedToday.has(c.participantId)).slice(0, limit);
}

const MEDALS = ['🥇', '🥈', '🥉'];
const medal = (position: number) => MEDALS[position - 1] ?? `${position}.`;
const who = (u: string | null) => (u ? `@${u}` : '—');

/** Claves de "una sola vez": día de Chile (YYYY-MM-DD) que pasa quien llama. */
export const rankPostKey = (day: string) => `rank-post:${day}`;
export const rankReplyKey = (participantId: number, day: string) => `rank-reply:${participantId}:${day}`;
export const rankDmKey = (participantId: number, day: string) => `rank-dm:${participantId}:${day}`;
export const rankMailKey = (participantId: number) => `rank-mail:${participantId}`;

export interface RankingCommentInput {
  ranking: Ranking;
  vipLabel: string;
  topN?: number;
  drawText: string;
  link: string;
  /** Título del comentario (el día del sorteo: «ÚLTIMAS HORAS»). */
  headline?: string;
}

/** Comentario diario en el reel: top N de cada tabla, con @ (les llega una
 * notificación). Instagram acepta hasta 2200 caracteres por comentario. */
export function rankingCommentText(input: RankingCommentInput): string {
  const top = input.topN ?? 5;
  const lines = [input.headline ?? '🏆 RANKING DEL CONCURSO'];
  const section = (title: string, rows: RankRow[]) => {
    if (rows.length === 0) return;
    lines.push('', title);
    for (const r of rows.slice(0, top)) lines.push(`${medal(r.position)} ${who(r.username)} — ${r.points} pts`);
  };
  section('🎟️ Entrada doble', input.ranking.double);
  section(`⭐ ${input.vipLabel}`, input.ranking.vip);
  lines.push('', '¡Aún puedes subir! Etiqueta amigos, comparte en tu historia o invita a comprar 🚀', `Tu posición: ${input.link}`, `Sorteo: ${input.drawText}`);
  return lines.join('\n').slice(0, 2200);
}

export function rankReplyText(c: ReplyCandidate, link: string): string {
  const next = c.aboveUsername ? `a @${c.aboveUsername}` : 'al de arriba';
  return `${who(c.username)} vas ${c.position}º con ${c.points} puntos 🔥 Con ${c.gap} más pasas ${next}: etiqueta amigos, comparte en tu historia o invita a comprar 🚀 Tu posición: ${link}`;
}

export interface DmTipsInput {
  position: number;
  poolLabel: string;
  points: number;
  probability: number;
  tips: Tip[];
  link: string;
}

export function dmTipsText(input: DmTipsInput): string {
  const todo = input.tips.filter((t) => !t.done).slice(0, 3).map((t) => `• ${t.text}`);
  const prob = input.probability > 0 ? ` (≈${input.probability < 1 ? '<1' : Math.round(input.probability)}% de probabilidad)` : '';
  return [
    `📊 Vas ${input.position}º en ${input.poolLabel} con ${input.points} puntos${prob}.`,
    ...(todo.length ? ['', 'Para subir:', ...todo] : []),
    '',
    `Tu posición y el ranking: ${input.link}`,
  ].join('\n');
}

/** ¿El mensaje pregunta por puntos o posición? Eso lo contesta el concurso. */
export function asksAboutRanking(text: string): boolean {
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\b(puntos|ranking|posicion|como voy|mi lugar)\b/.test(t);
}
