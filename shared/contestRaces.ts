import { matchesAllKeywords } from './contest';

/* Concursos de "carrera" (sin puntos): gana el comentario con más "me gusta"
 * o quien más amigos hace comprar con su link. Reglas puras; lo que toca la
 * base y Meta vive en server/contestRaces.ts. */

export interface LikeComment {
  id: string;
  igUserId: string | null;
  username: string | null;
  text: string;
  likes: number;
  timestamp: string | null;
}

export interface LikeEntry {
  position: number;
  igUserId: string | null;
  username: string | null;
  commentId: string;
  likes: number;
}

const stamp = (c: LikeComment) => (c.timestamp ? new Date(c.timestamp).getTime() : Number.MAX_SAFE_INTEGER);

/** Ranking de comentarios por "me gusta": 1 por persona (cuenta su comentario
 * con más likes), solo comentarios con las palabras clave, sin la cuenta
 * propia; el empate lo gana el comentario más antiguo. */
export function rankLikes(
  comments: LikeComment[],
  opts: { keywords: string[]; ownerUsername?: string | null; ownerId?: string | null },
): LikeEntry[] {
  const own = (opts.ownerUsername ?? '').toLowerCase();
  const best = new Map<string, LikeComment>();
  for (const c of comments) {
    if (opts.ownerId && c.igUserId === opts.ownerId) continue;
    if (own && c.username?.toLowerCase() === own) continue;
    if (opts.keywords.length > 0 && !matchesAllKeywords(c.text, opts.keywords)) continue;
    const who = c.igUserId ?? (c.username ? `u:${c.username.toLowerCase()}` : null);
    if (!who) continue;
    const prev = best.get(who);
    if (!prev || c.likes > prev.likes || (c.likes === prev.likes && stamp(c) < stamp(prev))) best.set(who, c);
  }
  return Array.from(best.values())
    .sort((a, b) => b.likes - a.likes || stamp(a) - stamp(b) || a.id.localeCompare(b.id))
    .map((c, i) => ({ position: i + 1, igUserId: c.igUserId, username: c.username, commentId: c.id, likes: c.likes }));
}

export interface ReferralRow {
  id: number;
  username: string | null;
  invitedPurchases: number;
  createdAt: Date;
  disqualified?: boolean;
}

export interface ReferralEntry {
  position: number;
  participantId: number;
  username: string | null;
  purchases: number;
}

/** Tabla de referidos: solo quienes ya hicieron comprar a alguien; empate →
 * quien entró antes (misma posición si tienen las mismas compras). */
export function referralStandings(rows: ReferralRow[]): ReferralEntry[] {
  const sorted = rows
    .filter((r) => !r.disqualified && r.invitedPurchases > 0)
    .sort((a, b) => b.invitedPurchases - a.invitedPurchases || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
  let lastPurchases = -1;
  let lastPosition = 0;
  return sorted.map((r, i) => {
    const position = r.invitedPurchases === lastPurchases ? lastPosition : i + 1;
    lastPurchases = r.invitedPurchases;
    lastPosition = position;
    return { position, participantId: r.id, username: r.username, purchases: r.invitedPurchases };
  });
}

const medal = (position: number) => (position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`);
const who = (username: string | null) => (username ? `@${username}` : 'alguien');

export function likesCommentText(input: { top: LikeEntry[]; final: boolean; drawText: string; headline?: string }): string {
  const lines = [input.headline ?? (input.final ? '🏆 ¡TENEMOS GANADOR DEL COMENTARIO MÁS VOTADO!' : '❤️ ASÍ VA EL CONCURSO: comentarios más votados')];
  if (input.top.length === 0) lines.push('', 'Todavía no hay comentarios con likes. ¡Comenta y pide que te voten! 👀');
  else {
    lines.push('');
    for (const e of input.top.slice(0, 3)) lines.push(`${medal(e.position)} ${who(e.username)} — ${e.likes} ❤️`);
  }
  lines.push('', input.final ? 'Gracias a todos por participar 🍬 Escribe por DM a los ganadores para reclamar.' : `Cierra ${input.drawText}. ¿Te pasaron? Pide likes a tus amigos 🚀`);
  return lines.join('\n').slice(0, 2200);
}

export function referralsCommentText(input: { top: ReferralEntry[]; final: boolean; drawText: string; link: string }): string {
  const lines = [input.final ? '🏆 ¡CERRÓ LA CARRERA DE REFERIDOS!' : '🚀 CARRERA DE REFERIDOS: quién ha hecho comprar a más amigos'];
  if (input.top.length === 0) lines.push('', 'Nadie ha hecho comprar a un amigo todavía. ¡El primero se lleva ventaja! 👀');
  else {
    lines.push('');
    for (const e of input.top.slice(0, 5)) lines.push(`${medal(e.position)} ${who(e.username)} — ${e.purchases} compra${e.purchases === 1 ? '' : 's'}`);
  }
  lines.push('', input.final ? 'Gracias a todos por participar 🍬' : `Cierra ${input.drawText}. Comparte tu link y sube 🔥 ${input.link}`);
  return lines.join('\n').slice(0, 2200);
}
