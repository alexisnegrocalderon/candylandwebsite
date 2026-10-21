import { describe, expect, it } from 'vitest';
import { normalizeContestConfig } from './contest';
import { attemptsLeft, describePrize, flashBlockers, flashFinalText, flashNeedsVerification, flashSlotCount } from './contestFlash';

const base = normalizeContestConfig(null).flash;

describe('config del reto relámpago', () => {
  it('trae 3 premios (entrada, producto, PlayCoins), 3 intentos, pista y 1 suplente', () => {
    expect(base.prizes.map((p) => p.kind)).toEqual(['ticket', 'product', 'playcoins']);
    expect(base.prizes[2].playcoins).toBe(2000);
    expect(base.maxAttempts).toBe(3);
    expect(base.hintEnabled).toBe(true);
    expect(base.consolationPercent).toBe(10);
    expect(flashSlotCount(base)).toBe(4);
  });
  it('acota números, tipos desconocidos y deja máximo 3 puestos', () => {
    const f = normalizeContestConfig({ flash: { maxAttempts: 99, answers: 'gato, el gato', prizes: [
      { kind: 'nope' }, { kind: 'code', percent: 500 }, { kind: 'manual', label: ' Un shot ' }, { kind: 'manual', label: 'cuarto' },
    ] } }).flash;
    expect(f.maxAttempts).toBe(20);
    expect(f.answers).toEqual(['gato', 'el gato']);
    expect(f.prizes).toHaveLength(3);
    expect(f.prizes[0].kind).toBe('ticket');
    expect(f.prizes[1].percent).toBe(100);
    expect(f.prizes[2].label).toBe('Un shot');
  });
});

describe('flashBlockers', () => {
  it('pide el reto, las respuestas y el detalle de cada premio', () => {
    expect(flashBlockers(base).length).toBeGreaterThanOrEqual(4);
    const ready = { ...base, question: '¿Cuántas diferencias?', answers: ['5'], prizes: [
      { kind: 'ticket' as const, ticketTypeId: 7, playcoins: 0, percent: 0, label: '' },
      { kind: 'code' as const, ticketTypeId: null, playcoins: 0, percent: 30, label: '' },
      { kind: 'manual' as const, ticketTypeId: null, playcoins: 0, percent: 0, label: 'Shot gratis' },
    ] };
    expect(flashBlockers(ready)).toEqual([]);
  });
});

describe('intentos y textos', () => {
  it('cuenta los intentos que le quedan', () => {
    expect(attemptsLeft(3, 1)).toBe(2);
    expect(attemptsLeft(3, 5)).toBe(0);
    expect(attemptsLeft(0, 9)).toBeNull();
  });
  it('solo la entrada exige verificación', () => {
    expect(flashNeedsVerification(base.prizes[0])).toBe(true);
    expect(flashNeedsVerification(base.prizes[1])).toBe(false);
  });
  it('describe cada tipo de premio', () => {
    expect(describePrize(base.prizes[2], {})).toContain('2.000 PlayCoins');
    expect(describePrize({ kind: 'ticket', ticketTypeId: 1, playcoins: 0, percent: 0, label: '' }, { ticket: 'Acceso Dúo' })).toContain('Acceso Dúo');
  });
  it('el anuncio final lista a los ganadores por puesto', () => {
    const t = flashFinalText('Fin\n{{ganadores}}\nGracias', [{ place: 2, username: 'b' }, { place: 1, username: 'a' }]);
    expect(t).toBe('Fin\n🥇 @a\n🥈 @b\nGracias');
    expect(flashFinalText('{{ganadores}}', [])).toContain('nadie acertó');
  });
});
