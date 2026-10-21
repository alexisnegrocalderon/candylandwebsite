import { describe, expect, it } from 'vitest';
import { normalizeContestConfig } from './contest';
import { countdownMetaText, countdownState } from './contestCountdown';

const steps = normalizeContestConfig(null).countdown.steps;

describe('countdownState', () => {
  it('sin meta alcanzada: 0 ganadores y falta para la primera', () => {
    expect(countdownState(10, steps)).toMatchObject({ reachedIndex: -1, winners: 0, remaining: 15, next: { tickets: 25, winners: 1 } });
  });
  it('en la meta exacta ya la desbloquea', () => {
    expect(countdownState(25, steps)).toMatchObject({ reachedIndex: 0, winners: 1, remaining: 25 });
  });
  it('la meta más alta reemplaza a la anterior', () => {
    expect(countdownState(70, steps)).toMatchObject({ reachedIndex: 1, winners: 2, remaining: 30 });
  });
  it('en la última no hay siguiente', () => {
    expect(countdownState(400, steps)).toMatchObject({ reachedIndex: 2, winners: 3, next: null, remaining: 0 });
  });
});

describe('textos y config', () => {
  it('el texto dice cuánto falta o que se llegó al máximo', () => {
    expect(countdownMetaText(countdownState(24, steps))).toBe('Faltan 1 entrada para llegar a 1 ganador 🚀');
    expect(countdownMetaText(countdownState(60, steps))).toContain('Faltan 40 entradas para llegar a 3 ganadores');
    expect(countdownMetaText(countdownState(500, steps))).toContain('meta máxima');
  });
  it('trae 25/50/100 → 1/2/3 y limpia escalones rotos', () => {
    expect(steps.map((s) => [s.tickets, s.winners])).toEqual([[25, 1], [50, 2], [100, 3]]);
    const c = normalizeContestConfig({ countdown: { steps: [{ tickets: 40, winners: 2 }, { tickets: 0, winners: 5 }, { tickets: 10, winners: 'x' }, { tickets: 15, winners: 1 }] } }).countdown.steps;
    expect(c).toEqual([{ tickets: 15, winners: 1 }, { tickets: 40, winners: 2 }]);
    expect(normalizeContestConfig({ countdown: { steps: [] } }).countdown.steps).toHaveLength(3);
  });
});
