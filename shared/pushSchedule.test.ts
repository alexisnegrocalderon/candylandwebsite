import { describe, expect, it } from 'vitest';
import { bestHour, chileParts, computeSendAt, DEFAULT_HOUR, isQuietHour, nextAtChileHour, recordOpenHour } from './pushSchedule';

// 2026-10-21 en Chile es horario de verano (UTC-3): 20:00 UTC = 17:00 Chile.
const at = (utc: string) => new Date(`${utc}:00Z`);

describe('pushSchedule', () => {
  it('lee la hora de Chile', () => {
    expect(chileParts(at('2026-10-21T20:00')).hour).toBe(17);
    expect(chileParts(at('2026-10-22T02:30')).day).toBe('2026-10-21');
  });
  it('horas silenciosas', () => {
    expect([22, 23, 0, 8, 9].map(isQuietHour)).toEqual([false, true, true, true, false]);
  });
  it('mejor hora: la más abierta dentro del horario, o la estándar con pocos datos', () => {
    expect(bestHour(null)).toBe(DEFAULT_HOUR);
    let h: number[] | null = null;
    for (const hr of [12, 12, 12, 21]) h = recordOpenHour(h, hr);
    expect(bestHour(h)).toBe(12);
    let few: number[] | null = null;
    for (const hr of [10, 10]) few = recordOpenHour(few, hr);
    expect(bestHour(few)).toBe(DEFAULT_HOUR);
    // aperturas de madrugada no cuentan
    let night: number[] | null = null;
    for (const hr of [2, 2, 2, 2, 15]) night = recordOpenHour(night, hr);
    expect(bestHour(night)).toBe(15);
  });
  it('próxima hora de Chile', () => {
    const now = at('2026-10-21T20:00'); // 17:00 Chile
    expect(nextAtChileHour(now, 17).getTime()).toBe(now.getTime());
    expect(chileParts(nextAtChileHour(now, 19)).hour).toBe(19);
    expect(nextAtChileHour(now, 19).getTime() - now.getTime()).toBe(2 * 3_600_000);
    expect(nextAtChileHour(now, 9).getTime() - now.getTime()).toBe(16 * 3_600_000);
  });
  it('sendAt: ahora, a su hora, y fuera de la madrugada', () => {
    const now = at('2026-10-21T20:00'); // 17:00
    expect(computeSendAt(now, null, { smart: false }).getTime()).toBe(now.getTime());
    expect(chileParts(computeSendAt(now, null, { smart: true })).hour).toBe(DEFAULT_HOUR);
    const night = at('2026-10-22T06:00'); // 03:00 Chile
    const r = computeSendAt(night, null, { smart: false });
    expect(chileParts(r).hour).toBe(9);
    expect(computeSendAt(night, null, { smart: false, respectQuiet: false }).getTime()).toBe(night.getTime());
  });
});
