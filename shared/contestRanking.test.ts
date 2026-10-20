import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEST_CONFIG, normalizeContestConfig } from './contest';
import {
  approxWinProbability, approxWinProbabilityWithLeader, pickGuaranteedLeader, asksAboutRanking, buildRanking, dmTipsText, personalTips, rankDmKey, rankMailKey, rankPostKey, rankReplyCandidates,
  rankReplyKey, rankReplyText, rankRows, rankingCommentText, takeReplyTargets, type RankingInput,
} from './contestRanking';

const chances = DEFAULT_CONTEST_CONFIG.chances;
let seq = 0;
const person = (o: Partial<RankingInput> = {}): RankingInput => ({
  id: ++seq, username: `user${seq}`, createdAt: new Date(2026, 9, 19, 12, seq), mentions: [], storyMentioned: false,
  invitedPurchases: 0, hasTicket: false, boughtDuringContest: false, disqualified: false, ...o,
});

describe('ranking', () => {
  it('ordena por puntos y separa las dos tablas', () => {
    const a = person({ mentions: ['a', 'b'] });            // 3 pts, sin entrada
    const b = person({ storyMentioned: true });             // 4 pts, sin entrada
    const c = person({ hasTicket: true });                  // 1 pt, ya tenía entrada → VIP
    const d = person({ hasTicket: true, boughtDuringContest: true }); // compró en el concurso: 1×3 → entrada doble
    const r = buildRanking([a, b, c, d], chances);
    expect(r.double.map((x) => x.participantId)).toEqual([b.id, a.id, d.id]);
    expect(r.double.map((x) => x.points)).toEqual([4, 3, 3]);
    expect(r.vip.map((x) => x.participantId)).toEqual([c.id]);
    expect(r.totals).toEqual({ double: 10, vip: 1 });
  });

  it('los descalificados no aparecen', () => {
    const r = buildRanking([person({ disqualified: true }), person()], chances);
    expect(r.double).toHaveLength(1);
  });

  it('los empates comparten posición y se ordenan por quién entró primero', () => {
    const rows = rankRows([
      { id: 3, username: 'c', points: 2, createdAt: new Date(2026, 9, 19, 12, 3) },
      { id: 1, username: 'a', points: 5, createdAt: new Date(2026, 9, 19, 12, 1) },
      { id: 2, username: 'b', points: 2, createdAt: new Date(2026, 9, 19, 12, 2) },
      { id: 4, username: 'd', points: 1, createdAt: new Date(2026, 9, 19, 12, 4) },
    ]);
    expect(rows.map((r) => [r.username, r.position])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]]);
  });
});

describe('probabilidad aproximada', () => {
  it('crece con los puntos y con la cantidad de premios', () => {
    expect(approxWinProbability(0, 100, 2)).toBe(0);
    expect(approxWinProbability(10, 100, 1)).toBe(10);
    expect(approxWinProbability(10, 100, 2)).toBe(19);
    expect(approxWinProbability(100, 100, 2)).toBe(100);
    expect(approxWinProbability(5, 0, 2)).toBe(0);
  });
});

describe('tips personales', () => {
  const base = { points: 4, mentionsUsed: 3, storyMentioned: false, invitedPurchases: 0, hasTicket: false, boughtDuringContest: false, chances };
  it('dice qué falta según lo que ya hizo', () => {
    const tips = personalTips(base);
    expect(tips.find((t) => t.key === 'mentions')?.text).toContain('hasta 7 amigos más');
    expect(tips.find((t) => t.key === 'story')?.done).toBe(false);
    expect(tips.find((t) => t.key === 'buy')?.text).toContain('4 puntos pasan a 12');
  });
  it('marca como hecho lo cumplido', () => {
    const tips = personalTips({ ...base, mentionsUsed: 10, storyMentioned: true, hasTicket: true, boughtDuringContest: true });
    expect(tips.filter((t) => t.done).map((t) => t.key).sort()).toEqual(['mentions', 'story', 'ticket']);
    expect(tips.find((t) => t.key === 'buy')).toBeUndefined();
  });
});

describe('respuestas públicas', () => {
  const rows = rankRows([
    { id: 1, username: 'a', points: 10, createdAt: new Date(2026, 9, 19, 12, 1) },
    { id: 2, username: 'b', points: 9, createdAt: new Date(2026, 9, 19, 12, 2) },
    { id: 3, username: 'c', points: 6, createdAt: new Date(2026, 9, 19, 12, 3) },
    { id: 4, username: 'd', points: 5, createdAt: new Date(2026, 9, 19, 12, 4) },
    { id: 5, username: 'e', points: 1, createdAt: new Date(2026, 9, 19, 12, 5) },
  ]);
  it('elige a quienes están a 2 puntos o menos de pasar al de arriba, los más cerca primero', () => {
    const c = rankReplyCandidates(rows);
    expect(c.map((x) => [x.username, x.gap, x.aboveUsername])).toEqual([['b', 1, 'a'], ['d', 1, 'c']]);
  });
  it('respeta el tope diario, el de la corrida y a quienes ya recibieron respuesta', () => {
    const c = rankReplyCandidates(rows);
    expect(takeReplyTargets(c, new Set([2]), 15).map((x) => x.username)).toEqual(['d']);
    expect(takeReplyTargets(c, new Set(), 1).map((x) => x.username)).toEqual(['b']);
    expect(takeReplyTargets(c, new Set(), 0)).toEqual([]);
    expect(takeReplyTargets(c, new Set(), 15, 1)).toHaveLength(1);
  });
  it('el texto nombra a quien está arriba y cabe en un comentario', () => {
    const text = rankReplyText(rankReplyCandidates(rows)[0], 'https://mansionplayroom.cl/r/abc123');
    expect(text).toContain('@b vas 2º con 9 puntos');
    expect(text).toContain('te separan de @a');
    expect(text.length).toBeLessThan(400);
  });
});

describe('textos', () => {
  const ranking = buildRanking(Array.from({ length: 12 }, (_, i) => person({ mentions: Array.from({ length: i }, (_, k) => `x${k}`) })), chances);
  it('el comentario diario trae el top de cada tabla con @ y medallas, dentro del límite', () => {
    const vip = person({ hasTicket: true });
    const text = rankingCommentText({ ranking: buildRanking([...Array.from({ length: 12 }, (_, i) => person({ mentions: Array(i).fill('x') })), vip], chances), vipLabel: 'Mesa VIP', drawText: 'martes 27 a las 20:00', link: 'https://mansionplayroom.cl/concurso' });
    expect(text.startsWith('🏆 RANKING DEL CONCURSO')).toBe(true);
    const last = rankingCommentText({ ranking, vipLabel: 'Mesa VIP', drawText: 'hoy 20:00', link: 'x', headline: '⏳ ÚLTIMAS HORAS: sorteo hoy' });
    expect(last.startsWith('⏳ ÚLTIMAS HORAS')).toBe(true);
    expect(text).toContain('🥇 @');
    expect(text).toContain('⭐ Mesa VIP');
    expect(text.match(/@/g)!.length).toBe(6);
    expect(text.length).toBeLessThan(2200);
    expect(ranking.double).toHaveLength(12);
  });
  it('el DM de tips muestra posición, probabilidad y hasta 3 pendientes', () => {
    const text = dmTipsText({
      position: 4, poolLabel: 'la entrada doble', points: 3, probability: 12.4,
      tips: personalTips({ points: 3, mentionsUsed: 2, storyMentioned: false, invitedPurchases: 0, hasTicket: false, boughtDuringContest: false, chances }),
      link: 'https://mansionplayroom.cl/r/abc123',
    });
    expect(text).toContain('Vas 4º en la entrada doble con 3 puntos (≈12% de probabilidad)');
    expect(text.match(/^• /gm)).toHaveLength(3);
    expect(text).toContain('/r/abc123');
  });
  it('detecta preguntas por puntos o posición', () => {
    expect(asksAboutRanking('¿Cuántos puntos llevo?')).toBe(true);
    expect(asksAboutRanking('en qué posición voy')).toBe(true);
    expect(asksAboutRanking('cómo voy?')).toBe(true);
    expect(asksAboutRanking('hola, a qué hora abren')).toBe(false);
    expect(asksAboutRanking('hay punto de venta cerca?')).toBe(false);
  });
  it('las claves de una sola vez distinguen persona y día', () => {
    expect(rankPostKey('2026-10-27')).toBe('rank-post:2026-10-27');
    expect(rankReplyKey(5, '2026-10-27')).toBe('rank-reply:5:2026-10-27');
    expect(rankDmKey(5, '2026-10-27')).toBe('rank-dm:5:2026-10-27');
    expect(rankMailKey(5)).toBe('rank-mail:5');
  });
});

describe('configuración del ranking', () => {
  it('trae los valores propuestos y acota los números', () => {
    const d = normalizeContestConfig(null).ranking;
    expect(d).toEqual({ dailyComment: true, dailyHour: 20, publicReplies: true, maxRepliesPerDay: 15, dmTips: true, emailBuyers: true });
    const c = normalizeContestConfig({ ranking: { dailyHour: 99, maxRepliesPerDay: -3, dmTips: false } }).ranking;
    expect(c.dailyHour).toBe(23);
    expect(c.maxRepliesPerDay).toBe(0);
    expect(c.dmTips).toBe(false);
    expect(c.dailyComment).toBe(true);
  });
});

describe('premio seguro al 1º del ranking', () => {
  const seq = (...values: number[]) => { let i = 0; return () => values[i++] ?? 0; };
  it('gana seguro el de más puntos', () => {
    expect(pickGuaranteedLeader([{ id: 1, weight: 3 }, { id: 2, weight: 9 }, { id: 3, weight: 5 }], seq(0.99))).toBe(2);
  });
  it('si hay empate arriba, se sortea solo entre los empatados', () => {
    const entries = [{ id: 1, weight: 9 }, { id: 2, weight: 9 }, { id: 3, weight: 4 }];
    expect(pickGuaranteedLeader(entries, seq(0))).toBe(1);
    expect(pickGuaranteedLeader(entries, seq(0.99))).toBe(2);
  });
  it('sin participantes no hay líder', () => {
    expect(pickGuaranteedLeader([], seq(0))).toBeNull();
    expect(pickGuaranteedLeader([{ id: 1, weight: 0 }], seq(0))).toBeNull();
  });
  it('la probabilidad aproximada cuenta al líder como seguro y al resto sin él', () => {
    // 2 premios, 100 puntos en total, el líder tiene 40.
    const leader = { count: 1, points: 40 };
    expect(approxWinProbabilityWithLeader(40, 100, 2, leader)).toBe(100);
    // el resto compite por 1 premio sobre 60 puntos
    expect(approxWinProbabilityWithLeader(6, 100, 2, leader)).toBe(10);
    // con 1 solo premio, el resto no tiene chance
    expect(approxWinProbabilityWithLeader(6, 100, 1, leader)).toBe(0);
    // dos empatados arriba: cada uno tiene 50% de llevarse el seguro
    expect(approxWinProbabilityWithLeader(40, 100, 1, { count: 2, points: 40 })).toBe(50);
  });
});
