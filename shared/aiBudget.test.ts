import { describe, expect, it } from 'vitest';
import { chileMonthKey, chileMonthStart, computeAiBudget } from './aiBudget';

describe('computeAiBudget', () => {
  it('sin tope ni saldo no controla nada', () => {
    expect(computeAiBudget({ capUsd: 0, balanceUsd: 0, spentMonthUsd: 3, spentSinceBalanceUsd: 0 }).level).toBe('sin-tope');
  });
  it('lo gastable es el menor entre lo que queda del tope y el saldo', () => {
    const b = computeAiBudget({ capUsd: 10, balanceUsd: 4.27, spentMonthUsd: 5, spentSinceBalanceUsd: 0.27 });
    expect(b.capLeftUsd).toBe(5);
    expect(b.balanceLeftUsd).toBeCloseTo(4, 6);
    expect(b.spendableUsd).toBeCloseTo(4, 6);
    expect(b.level).toBe('ok');
  });
  it('sube de nivel con el tope y bloquea al llegar', () => {
    expect(computeAiBudget({ capUsd: 10, balanceUsd: 0, spentMonthUsd: 7.5, spentSinceBalanceUsd: 0 }).level).toBe('warn');
    expect(computeAiBudget({ capUsd: 10, balanceUsd: 0, spentMonthUsd: 9.2, spentSinceBalanceUsd: 0 }).level).toBe('danger');
    expect(computeAiBudget({ capUsd: 10, balanceUsd: 0, spentMonthUsd: 10, spentSinceBalanceUsd: 0 }).level).toBe('blocked');
  });
  it('se bloquea también si el saldo se acaba', () => {
    expect(computeAiBudget({ capUsd: 10, balanceUsd: 2, spentMonthUsd: 3, spentSinceBalanceUsd: 2.5 }).level).toBe('blocked');
  });
});

describe('mes de Chile', () => {
  it('el mes parte el día 1 a medianoche de Chile', () => {
    const start = chileMonthStart(new Date('2026-10-16T12:00:00Z'));
    expect(chileMonthKey(start)).toBe('2026-10');
    expect(chileMonthKey(new Date(start.getTime() - 1))).toBe('2026-09');
  });
});
