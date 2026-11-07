import { describe, expect, it } from 'vitest';
import { LIVE_GAMES, callText, cleanCount, gameByKey, isComplete, missing, missingText, pickGame } from './playRound';

describe('juegos en vivo de PLAYMORE', () => {
  it('cada juego tiene regla y pide al menos un jugador de cada color', () => {
    expect(LIVE_GAMES.length).toBeGreaterThanOrEqual(8);
    for (const g of LIVE_GAMES) {
      expect(g.rule.length).toBeGreaterThan(10);
      expect(g.need.magenta).toBeGreaterThan(0);
      expect(g.need.azul).toBeGreaterThan(0);
    }
    expect(new Set(LIVE_GAMES.map((g) => g.key)).size).toBe(LIVE_GAMES.length);
  });

  it('dice quién falta para completar la ronda', () => {
    const need = { magenta: 2, azul: 2 };
    expect(missing(need, { magenta: 1, azul: 2 })).toEqual({ magenta: 1, azul: 0 });
    expect(missingText(need, { magenta: 0, azul: 0 })).toBe('Faltan 2 azules y 2 magenta');
    expect(missingText(need, { magenta: 1, azul: 2 })).toBe('Falta 1 magenta');
    expect(missingText(need, { magenta: 2, azul: 1 })).toBe('Falta 1 azul');
    expect(missingText(need, { magenta: 2, azul: 2 })).toBe('¡Completo!');
  });

  it('la ronda está completa solo cuando llegaron todos (y alguien era necesario)', () => {
    expect(isComplete({ magenta: 2, azul: 2 }, { magenta: 2, azul: 2 })).toBe(true);
    expect(isComplete({ magenta: 2, azul: 2 }, { magenta: 3, azul: 2 })).toBe(true);
    expect(isComplete({ magenta: 2, azul: 2 }, { magenta: 2, azul: 1 })).toBe(false);
    expect(isComplete({ magenta: 0, azul: 0 }, { magenta: 0, azul: 0 })).toBe(false);
  });

  it('arma el llamado para la pantalla', () => {
    expect(callText({ magenta: 2, azul: 2 })).toBe('Necesitamos 2 azules y 2 magenta');
    expect(callText({ magenta: 1, azul: 1 })).toBe('Necesitamos 1 azul y 1 magenta');
    expect(callText({ magenta: 3, azul: 0 })).toBe('Necesitamos 3 magenta');
  });

  it('limpia los contadores y sortea un juego distinto del anterior', () => {
    expect(cleanCount(99)).toBe(6);
    expect(cleanCount(-3)).toBe(0);
    expect(cleanCount('x')).toBe(0);
    expect(gameByKey('dados')?.name).toBe('Dados');
    expect(gameByKey('nada')).toBeNull();
    for (let i = 0; i < 50; i++) expect(pickGame(Math.random, 'dados').key).not.toBe('dados');
    expect(pickGame(() => 0).key).toBe(LIVE_GAMES[0].key);
    expect(pickGame(() => 0.999999).key).toBe(LIVE_GAMES[LIVE_GAMES.length - 1].key);
  });
});
