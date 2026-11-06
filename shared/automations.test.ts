import { describe, expect, it } from 'vitest';
import { chileTimeOfUtc, weekdayName } from './automations';

describe('automáticos de mailing', () => {
  it('pasa la hora UTC de un cron a hora de Chile (verano UTC-3, invierno UTC-4)', () => {
    expect(chileTimeOfUtc(14, 0, new Date('2026-11-06T12:00:00Z'))).toBe('11:00');
    expect(chileTimeOfUtc(14, 20, new Date('2026-11-06T12:00:00Z'))).toBe('11:20');
    expect(chileTimeOfUtc(14, 0, new Date('2026-07-06T12:00:00Z'))).toBe('10:00');
  });
  it('nombra el día de la semana de la configuración de embajadores', () => {
    expect(weekdayName(1)).toBe('lunes');
    expect(weekdayName(0)).toBe('domingo');
    expect(weekdayName(7)).toBe('domingo');
  });
});
