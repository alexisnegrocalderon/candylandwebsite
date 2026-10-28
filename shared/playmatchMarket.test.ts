import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYMATCH_CONFIG, affinityPercent, describePayment, normalizePlaymatchConfig, paidSuperLikesLeft, splitPayment,
  standings, superLikeOffers, superLikePlan, superLikesPrice,
} from './playmatchMarket';

const cfg = DEFAULT_PLAYMATCH_CONFIG;

describe('config', () => {
  it('sin nada guardado usa lo acordado: $500, pack de 10 a $2.500, hasta 10 comprados', () => {
    const c = normalizePlaymatchConfig(null);
    expect([c.superLikePrice, c.superLikePackSize, c.superLikePackPrice, c.maxPaidSuperLikes]).toEqual([500, 10, 2500, 10]);
    expect(c.enabled && c.superLikes && c.costumes && c.likesUnlock).toBe(true);
    expect(c.costumeRevealed).toBe(false);
  });
  it('lee la config aunque el motor la entregue como texto', () => {
    const c = normalizePlaymatchConfig(JSON.stringify({ superLikePrice: 700, hostGoal: { profiles: 30 } }));
    expect(c.superLikePrice).toBe(700);
    expect(c.hostGoal.profiles).toBe(30);
    expect(normalizePlaymatchConfig('{no es json').superLikePrice).toBe(500);
  });
  it('respeta lo que el administrador cambió y acota lo absurdo', () => {
    const c = normalizePlaymatchConfig({ superLikes: false, superLikePrice: 700, maxPaidSuperLikes: 9999, superLikePackSize: 1, hostGoal: { profiles: 'x', photos: 50 } });
    expect(c.superLikes).toBe(false);
    expect(c.superLikePrice).toBe(700);
    expect(c.maxPaidSuperLikes).toBe(100);
    expect(c.superLikePackSize).toBe(2);
    expect(c.hostGoal).toEqual({ profiles: 100, photos: 50, matches: 40 });
  });
});

describe('super likes', () => {
  it('el primero es gratis, después se usa un crédito y sin crédito hay que comprar', () => {
    expect(superLikePlan(0, 0)).toBe('free');
    expect(superLikePlan(1, 3)).toBe('credit');
    expect(superLikePlan(4, 0)).toBe('needs_purchase');
  });
  it('el tope cuenta los comprados y se puede cambiar por persona', () => {
    expect(paidSuperLikesLeft(cfg, 0, null)).toBe(10);
    expect(paidSuperLikesLeft(cfg, 7, null)).toBe(3);
    expect(paidSuperLikesLeft(cfg, 12, null)).toBe(0);
    expect(paidSuperLikesLeft(cfg, 7, 20)).toBe(13);
  });
  it('el pack de 10 sale a $2.500 y el resto suelto a $500', () => {
    expect(superLikesPrice(cfg, 1)).toBe(500);
    expect(superLikesPrice(cfg, 3)).toBe(1500);
    expect(superLikesPrice(cfg, 10)).toBe(2500);
    expect(superLikesPrice(cfg, 12)).toBe(3500);
  });
  it('ofrece el pack solo si entero todavía cabe', () => {
    expect(superLikeOffers(cfg, 10).map((o) => o.key)).toEqual(['one', 'pack']);
    expect(superLikeOffers(cfg, 9).map((o) => o.key)).toEqual(['one']);
    expect(superLikeOffers(cfg, 0)).toEqual([]);
  });
});

describe('cobro', () => {
  it('primero Playcoins', () => {
    expect(splitPayment(500, 800, 5000)).toEqual({ coins: 500, saldo: 0, missing: 0 });
  });
  it('lo que falte sale del saldo', () => {
    const s = splitPayment(500, 200, 5000);
    expect(s).toEqual({ coins: 200, saldo: 300, missing: 0 });
    expect(describePayment(s)).toBe('200 Playcoins + $300 de saldo');
  });
  it('sin Playcoins paga todo con saldo', () => {
    expect(splitPayment(2500, 0, 3000)).toEqual({ coins: 0, saldo: 2500, missing: 0 });
  });
  it('si no alcanza no se descuenta nada y dice cuánto falta', () => {
    expect(splitPayment(500, 100, 150)).toEqual({ coins: 0, saldo: 0, missing: 250 });
  });
});

describe('afinidad', () => {
  it('sin datos con qué comparar no inventa un número', () => {
    expect(affinityPercent({}, {})).toBeNull();
    expect(affinityPercent({ intents: 'bailar' }, {})).toBeNull();
  });
  it('mismos gustos y misma forma de relacionarse es lo más alto', () => {
    const p = affinityPercent({ intents: 'bailar,coquetear', relationStyle: 'abierta', zone: 'piscina' }, { intents: 'bailar,coquetear', relationStyle: 'poliamor', zone: 'piscina' })!;
    expect(p).toBeGreaterThanOrEqual(95);
    expect(p).toBeLessThanOrEqual(99);
  });
  it('nada en común es lo más bajo, pero nunca 0', () => {
    const p = affinityPercent({ intents: 'cita', relationStyle: 'monogamia' }, { intents: 'casual', relationStyle: 'poliamor' })!;
    expect(p).toBe(30);
  });
  it('quien solo busca amistad no es afín con quien no la busca', () => {
    const friend = affinityPercent({ intents: 'amistad' }, { intents: 'casual,coquetear' })!;
    const same = affinityPercent({ intents: 'amistad' }, { intents: 'amistad,bailar' })!;
    expect(same).toBeGreaterThan(friend);
  });
  it('estar en la misma zona suma un poco', () => {
    const near = affinityPercent({ intents: 'bailar,cita', zone: 'barra' }, { intents: 'bailar,casual', zone: 'barra' })!;
    const far = affinityPercent({ intents: 'bailar,cita', zone: 'barra' }, { intents: 'bailar,casual', zone: 'piscina' })!;
    expect(near).toBeGreaterThan(far);
  });
});

describe('podio', () => {
  it('los empates comparten el lugar', () => {
    expect(standings([{ profileId: 5, votes: 3 }, { profileId: 2, votes: 7 }, { profileId: 9, votes: 3 }, { profileId: 1, votes: 1 }])).toEqual([
      { profileId: 2, votes: 7, place: 1 },
      { profileId: 5, votes: 3, place: 2 },
      { profileId: 9, votes: 3, place: 2 },
      { profileId: 1, votes: 1, place: 4 },
    ]);
  });
});
