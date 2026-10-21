import { describe, expect, it } from 'vitest';
import { parseKeywords } from './contest';
import { likesCommentText, rankLikes, referralStandings, referralsCommentText, type LikeComment } from './contestRaces';

const c = (id: string, user: string, likes: number, minute: number, text = 'quiero mi entrada'): LikeComment => ({
  id, igUserId: `ig-${user}`, username: user, text, likes, timestamp: new Date(2026, 9, 21, 12, minute).toISOString(),
});
const keywords = parseKeywords('quiero, entrada');

describe('rankLikes', () => {
  it('ordena por likes y desempata por el comentario más antiguo', () => {
    const r = rankLikes([c('1', 'a', 5, 3), c('2', 'b', 9, 5), c('3', 'c', 5, 1)], { keywords });
    expect(r.map((x) => x.username)).toEqual(['b', 'c', 'a']);
    expect(r.map((x) => x.position)).toEqual([1, 2, 3]);
  });
  it('cuenta un comentario por persona (el de más likes)', () => {
    const r = rankLikes([c('1', 'a', 2, 1), c('2', 'a', 8, 2), c('3', 'b', 5, 3)], { keywords });
    expect(r.map((x) => [x.username, x.likes, x.commentId])).toEqual([['a', 8, '2'], ['b', 5, '3']]);
  });
  it('ignora comentarios sin las palabras clave y los de la cuenta propia', () => {
    const r = rankLikes([c('1', 'a', 50, 1, 'hola'), c('2', 'mansion', 99, 2), c('3', 'b', 1, 3)], { keywords, ownerUsername: 'Mansion' });
    expect(r.map((x) => x.username)).toEqual(['b']);
  });
  it('sin palabras clave, cualquier comentario cuenta', () => {
    expect(rankLikes([c('1', 'a', 1, 1, 'hola')], { keywords: [] })).toHaveLength(1);
  });
});

describe('referralStandings', () => {
  const d = (m: number) => new Date(2026, 9, 21, 12, m);
  it('solo entran quienes hicieron comprar a alguien; empates comparten posición', () => {
    const s = referralStandings([
      { id: 1, username: 'a', invitedPurchases: 2, createdAt: d(1) },
      { id: 2, username: 'b', invitedPurchases: 0, createdAt: d(2) },
      { id: 3, username: 'c', invitedPurchases: 2, createdAt: d(0) },
      { id: 4, username: 'd', invitedPurchases: 1, createdAt: d(3) },
      { id: 5, username: 'e', invitedPurchases: 9, createdAt: d(4), disqualified: true },
    ]);
    expect(s.map((x) => [x.username, x.position])).toEqual([['c', 1], ['a', 1], ['d', 3]]);
  });
});

describe('textos', () => {
  it('el resultado de likes nombra el top 3 con @', () => {
    const t = likesCommentText({ top: rankLikes([c('1', 'a', 9, 1), c('2', 'b', 5, 2), c('3', 'c', 3, 3), c('4', 'd', 1, 4)], { keywords }), final: true, drawText: 'hoy' });
    expect(t).toContain('🥇 @a — 9 ❤️');
    expect(t).toContain('🥉 @c');
    expect(t).not.toContain('@d');
  });
  it('la carrera de referidos invita a compartir mientras corre', () => {
    const t = referralsCommentText({ top: [], final: false, drawText: 'mañana 20:00', link: 'https://x/concurso' });
    expect(t).toContain('Cierra mañana 20:00');
    expect(t).toContain('https://x/concurso');
  });
});
