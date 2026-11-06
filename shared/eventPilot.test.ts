import { describe, expect, it } from 'vitest';
import { duePilotSteps, PILOT_STEP_BY_KEY, pilotStepExpiry, pilotStepTime } from './eventPilot';
import { describeRunResult } from './crossCheck';

// Fiesta el sábado 14-nov-2026 a las 23:00 de Chile (UTC-3 en verano) = 15-nov 02:00 UTC.
const eventDate = new Date('2026-11-15T02:00:00Z');
const startedAt = new Date('2026-11-01T15:00:00Z');
const step = (k: string) => PILOT_STEP_BY_KEY.get(k as any)!;

describe('piloto del evento', () => {
  it('los pasos de inicio tocan apenas se prende', () => {
    expect(pilotStepTime(step('anuncio'), eventDate, startedAt)).toEqual(startedAt);
    expect(duePilotSteps(eventDate, startedAt, new Date('2026-11-01T15:05:00Z')).map((s) => s.key)).toEqual(['anuncio', 'aviso-diario']);
  });
  it('la lista de compras toca 3 días antes a las 12:00 de Chile', () => {
    expect(pilotStepTime(step('compras-barra'), eventDate, startedAt).toISOString()).toBe('2026-11-11T15:00:00.000Z');
  });
  it('el recordatorio es el mismo día de la fiesta a mediodía, y la encuesta el día siguiente a las 13:00', () => {
    expect(pilotStepTime(step('recordatorio-dia'), eventDate, startedAt).toISOString()).toBe('2026-11-14T15:00:00.000Z');
    expect(pilotStepTime(step('encuesta'), eventDate, startedAt).toISOString()).toBe('2026-11-15T16:00:00.000Z');
  });
  it('un paso que ya pasó su plazo no se pide', () => {
    const afterParty = new Date('2026-11-15T10:00:00Z');
    expect(afterParty > pilotStepExpiry(step('recordatorio-dia'), eventDate)).toBe(true);
    expect(duePilotSteps(eventDate, startedAt, afterParty).map((s) => s.key)).toEqual([]);
    expect(duePilotSteps(eventDate, startedAt, new Date('2026-11-15T17:00:00Z')).map((s) => s.key)).toEqual(['encuesta']);
  });
  it('si se prende tarde, pide lo que todavía sirve', () => {
    const late = new Date('2026-11-14T18:00:00Z');
    expect(duePilotSteps(eventDate, late, late).map((s) => s.key)).toEqual(['anuncio', 'aviso-diario', 'compras-barra', 'recordatorio-dia']);
  });
});

describe('describeRunResult', () => {
  it('cuenta enviados y errores', () => {
    expect(describeRunResult({ ran: true, sent: 12, failed: 1 })).toBe('12 enviados, 1 con error');
    expect(describeRunResult({ sent: 1, failed: [] })).toBe('1 enviado');
  });
  it('explica cuando no salió nada', () => {
    expect(describeRunResult({ ran: false, reason: 'disabled' })).toBe('No salió nada (disabled)');
  });
});
