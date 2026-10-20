import { describe, expect, it } from 'vitest';
import { computeCodeDiscount } from './discountCode';
import {
  DEFAULT_CONTEST_CONFIG, dmFallbackReply, drawPoolFor, fitDmText, priceLockCodePercent, refundAmountFor, utf8Bytes, computeChances, contestPhase, extractEmail, hasContestKeyword, mergeMentions,
  normalizeContestConfig, parseMentions, randomContestCode, renderContestTemplate, weightedDraw,
} from './contest';

describe('normalizeContestConfig', () => {
  it('rellena con los valores propuestos', () => {
    const c = normalizeContestConfig(null);
    expect(c.prizes.couponPercent).toBe(20);
    expect(c.prizes.couponHours).toBe(24);
    expect(c.prizes.doubleWinners).toBe(2);
    expect(c.chances.buyerMultiplier).toBe(3);
    expect(c.keyword).toBe('CONCURSO');
  });

  it('acota números imposibles y conserva lo editado', () => {
    const c = normalizeContestConfig({ prizes: { couponPercent: 150, doubleWinners: '3', prizeTicketTypeId: '7' }, chances: { maxMentions: -4 }, keyword: '  quieroir ' });
    expect(c.prizes.couponPercent).toBe(100);
    expect(c.prizes.doubleWinners).toBe(3);
    expect(c.prizes.prizeTicketTypeId).toBe(7);
    expect(c.chances.maxMentions).toBe(0);
    expect(c.keyword).toBe('quieroir');
  });

  it('un mensaje vacío vuelve al texto propuesto', () => {
    const c = normalizeContestConfig({ messages: { noTicket: '   ', publicReplies: ['', 'hola'] } });
    expect(c.messages.noTicket).toBe(DEFAULT_CONTEST_CONFIG.messages.noTicket);
    expect(c.messages.publicReplies).toEqual(['hola']);
  });
});

describe('computeChances', () => {
  const ch = DEFAULT_CONTEST_CONFIG.chances;
  it('suma base, etiquetas con tope, historia y amigos que compraron', () => {
    expect(computeChances({ mentionCount: 0, storyMentioned: false, invitedPurchases: 0, boughtDuringContest: false }, ch)).toBe(1);
    expect(computeChances({ mentionCount: 25, storyMentioned: true, invitedPurchases: 1, boughtDuringContest: false }, ch)).toBe(1 + 10 + 3 + 10);
  });
  it('comprar durante el concurso multiplica', () => {
    expect(computeChances({ mentionCount: 2, storyMentioned: false, invitedPurchases: 0, boughtDuringContest: true }, ch)).toBe(9);
  });
});

describe('parseMentions', () => {
  it('saca etiquetas únicas, sin la cuenta oficial ni la propia', () => {
    expect(parseMentions('@Ana @ana @pedro.perez. vamos!! @mansionplayroom.cl @yo', ['mansionplayroom.cl', 'yo'])).toEqual(['ana', 'pedro.perez']);
  });
  it('no confunde un email con una etiqueta', () => {
    expect(parseMentions('mi correo es ana@gmail.com')).toEqual([]);
  });
  it('mergeMentions no repite', () => {
    expect(mergeMentions(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('palabra clave y email', () => {
  it('calza sin tildes ni mayúsculas, como palabra', () => {
    expect(hasContestKeyword('Quiero ir a la FIESTA!!', 'fiesta')).toBe(true);
    expect(hasContestKeyword('fiestas', 'fiesta')).toBe(false);
    expect(hasContestKeyword('algo', '')).toBe(false);
  });
  it('extrae el email', () => {
    expect(extractEmail('es Ana.Perez@Gmail.com gracias')).toBe('ana.perez@gmail.com');
    expect(extractEmail('no tengo')).toBeNull();
  });
});

describe('renderContestTemplate', () => {
  it('reemplaza y borra claves sin valor', () => {
    expect(renderContestTemplate('Hola {{nombre}}{{nada}}\n\n\n\nchau {{ chances }}', { nombre: '@ana', chances: 3 })).toBe('Hola @ana\n\nchau 3');
  });
});

describe('weightedDraw', () => {
  it('no repite y respeta el orden de salida', () => {
    const seq = [0.0, 0.0, 0.0];
    let i = 0;
    const picked = weightedDraw([{ id: 1, weight: 1 }, { id: 2, weight: 5 }, { id: 3, weight: 0 }], 5, () => seq[i++] ?? 0);
    expect(picked).toEqual([1, 2]);
  });
  it('el peso cuenta: con r alto sale el último', () => {
    expect(weightedDraw([{ id: 1, weight: 1 }, { id: 2, weight: 9 }], 1, () => 0.5)).toEqual([2]);
    expect(weightedDraw([{ id: 1, weight: 1 }, { id: 2, weight: 9 }], 1, () => 0.05)).toEqual([1]);
  });
});

describe('contestPhase', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('distingue programado, en vivo y sorteado', () => {
    expect(contestPhase({ status: 'draft', drawnAt: null }, { startsAt: null }, now)).toBe('draft');
    expect(contestPhase({ status: 'active', drawnAt: null }, { startsAt: '2026-10-21T00:00:00Z' }, now)).toBe('scheduled');
    expect(contestPhase({ status: 'active', drawnAt: null }, { startsAt: null }, now)).toBe('live');
    expect(contestPhase({ status: 'active', drawnAt: now }, { startsAt: null }, now)).toBe('drawn');
  });
});

describe('randomContestCode', () => {
  it('usa el prefijo y caracteres no ambiguos', () => {
    expect(randomContestCode('REGALO', 5, () => 0)).toBe('REGALO-AAAAA');
    expect(randomContestCode('X')).toMatch(/^X-[A-HJ-NP-Z2-9]{5}$/);
  });
});

describe('mensajes propuestos', () => {
  // Las variables que arma server/contests.ts (templateVars + extras).
  const KNOWN = new Set(['nombre', 'chances', 'ganadores_doble', 'premio', 'premio_singular', 'premio_vip', 'por_etiqueta', 'max_etiquetas',
    'bonus_historia', 'bonus_compra_amigo', 'multiplicador', 'porcentaje', 'horas', 'cupon', 'porcentaje_amigo', 'codigo_amigo',
    'link_invitar', 'fecha_sorteo', 'link_bases', 'evento', 'lista_regalos', 'codigo_premio', 'plazo',
    'congelado_hasta', 'link_elegir', 'monto_devolucion']);
  it('solo usan variables que existen', () => {
    const all = Object.values(DEFAULT_CONTEST_CONFIG.messages).flat().join('\n');
    const used = Array.from(all.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)).map((m) => m[1]);
    expect(used.filter((k) => !KNOWN.has(k))).toEqual([]);
  });
});

describe('precio congelado', () => {
  it('calcula el % sobre el precio general', () => {
    expect(priceLockCodePercent(50, 50, 0)).toBe(0);
    expect(priceLockCodePercent(50, 40, 0)).toBe(10);
    expect(priceLockCodePercent(50, 40, 20)).toBe(20);
    expect(priceLockCodePercent(50, 50, 20)).toBe(10);
    // Nunca negativo (si la tanda bajara de precio).
    expect(priceLockCodePercent(40, 50, 0)).toBe(0);
  });

  it('el checkout cobra el precio congelado en cualquier acceso y cantidad', () => {
    // Tanda al participar: 50%. Hoy: 40%. Dúo general $40.000 (hoy $24.000), Soltera general $20.000 (hoy $12.000).
    const lines = [
      { ticketTypeId: 1, category: 'acceso', unitPrice: 24000, originalPrice: 40000, quantity: 1 },
      { ticketTypeId: 2, category: 'acceso', unitPrice: 12000, originalPrice: 20000, quantity: 2 },
    ];
    const subtotal = 24000 + 24000;
    const sinExtra = computeCodeDiscount({ discountType: 'percentage', discountValue: priceLockCodePercent(50, 40, 0), basedOnOriginalPrice: 1 }, lines, 'web');
    expect(subtotal - sinExtra).toBe(20000 + 2 * 10000); // precios de la tanda del 50%
    const conExtra = computeCodeDiscount({ discountType: 'percentage', discountValue: priceLockCodePercent(50, 40, 20), basedOnOriginalPrice: 1 }, lines, 'web');
    expect(subtotal - conExtra).toBe(Math.round((20000 + 20000) * 0.8));
  });
});

describe('devolución y sorteo', () => {
  it('tope en el valor del premio', () => {
    expect(refundAmountFor(60000, 40000)).toBe(40000);
    expect(refundAmountFor(15000, 40000)).toBe(15000);
  });
  it('quien compra durante el concurso sigue en el sorteo de entradas dobles', () => {
    expect(drawPoolFor({ hasTicket: false, boughtDuringContest: false })).toBe('double');
    expect(drawPoolFor({ hasTicket: true, boughtDuringContest: true })).toBe('double');
    expect(drawPoolFor({ hasTicket: true, boughtDuringContest: false })).toBe('vip');
  });
});

describe('DM de comentario', () => {
  it('un DM largo se acorta por párrafos sin cortar el link del final', () => {
    const long = ['Hola', 'x'.repeat(400), 'y'.repeat(400), '👉 https://mansionplayroom.cl/p/abc123'].join('\n\n');
    const fitted = fitDmText(long, 600);
    expect(utf8Bytes(fitted)).toBeLessThanOrEqual(600);
    expect(fitted.startsWith('Hola')).toBe(true);
    expect(fitted.endsWith('https://mansionplayroom.cl/p/abc123')).toBe(true);
  });
  it('lo que ya cabe no se toca', () => {
    expect(fitDmText('uno\n\ndos\n\ntres')).toBe('uno\n\ndos\n\ntres');
  });
  it('cuenta bytes reales: emojis y tildes pesan más que un carácter', () => {
    expect(utf8Bytes('a')).toBe(1);
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes('🎉')).toBe(4);
  });
  it('si no sale el DM, el comentario invita a escribir la palabra clave', () => {
    expect(dmFallbackReply(' CONCURSO ')).toContain('Escríbenos CONCURSO por DM');
    expect(dmFallbackReply('')).toContain('CONCURSO');
  });
});
