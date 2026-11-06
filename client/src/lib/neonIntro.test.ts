import { describe, expect, it } from 'vitest';
import { introRemainingMs } from './neonIntro';

const full = { short: false, still: false };

describe('cuánto falta para que termine la luz de la intro', () => {
  it('recién arrancada falta casi todo (1,7 s)', () => {
    expect(introRemainingMs(10_000, 10_000, full)).toBe(1700);
  });
  it('a la mitad falta la mitad', () => {
    expect(introRemainingMs(10_850, 10_000, full)).toBe(850);
  });
  it('si la app se demoró más que la intro, no espera nada', () => {
    expect(introRemainingMs(13_000, 10_000, full)).toBe(0);
  });
  it('las terminales terminan antes (60 %) y «reducir movimiento» a los 0,9 s', () => {
    expect(introRemainingMs(10_000, 10_000, { short: true, still: false })).toBe(1020);
    expect(introRemainingMs(10_000, 10_000, { short: false, still: true })).toBe(900);
  });
  it('sin hora de inicio no se queda esperando', () => {
    expect(introRemainingMs(10_000, NaN, full)).toBe(0);
    expect(introRemainingMs(10_000, 0, full)).toBe(0);
  });
});
