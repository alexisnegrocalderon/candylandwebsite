import { describe, expect, it } from 'vitest';
import { MAX_EVENT_MAILS_PER_PERSON, pickDueForRotation, remainingMailsNeeded, type MailStat } from './mailRotation';

const NOW = new Date('2026-11-10T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const people = (...ids: number[]) => ids.map((id) => ({ id }));
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

describe('pickDueForRotation', () => {
  it('el tope por defecto es 3 (el masivo del lanzamiento cuenta como el primero)', () => {
    expect(MAX_EVENT_MAILS_PER_PERSON).toBe(3);
  });

  it('quien ya recibió 3 no recibe más, pase el tiempo que pase', () => {
    const stats = new Map<number, MailStat>([[1, { count: 3, last: ago(60) }]]);
    expect(pickDueForRotation(people(1), stats, { intervalDays: 4, now: NOW })).toEqual([]);
  });

  it('respeta la espera mínima entre mails', () => {
    const stats = new Map<number, MailStat>([[1, { count: 1, last: ago(1) }], [2, { count: 1, last: ago(4) }]]);
    expect(ids(pickDueForRotation(people(1, 2), stats, { intervalDays: 4, now: NOW }))).toEqual([2]);
  });

  it('se turnan: primero los que menos mails llevan, luego el envío más antiguo', () => {
    const stats = new Map<number, MailStat>([
      [1, { count: 2, last: ago(20) }],
      [2, { count: 1, last: ago(5) }],
      [3, { count: 1, last: ago(9) }],
    ]);
    // 4 nunca recibió nada; después 3 y 2 (1 mail, el 3 hace más tiempo); al final 1 (ya lleva 2).
    expect(ids(pickDueForRotation(people(1, 2, 3, 4), stats, { intervalDays: 4, now: NOW }))).toEqual([4, 3, 2, 1]);
  });

  it('el orden es estable con empates', () => {
    expect(ids(pickDueForRotation(people(9, 3, 5), new Map(), { intervalDays: 4, now: NOW }))).toEqual([3, 5, 9]);
  });
});

describe('remainingMailsNeeded', () => {
  it('suma lo que le falta a cada uno para llegar a 3', () => {
    const stats = new Map<number, MailStat>([[1, { count: 1, last: ago(5) }], [2, { count: 3, last: ago(5) }]]);
    // 1 → 2 más, 2 → 0, 3 (sin envíos) → 3
    expect(remainingMailsNeeded([1, 2, 3], stats)).toBe(5);
  });
});
