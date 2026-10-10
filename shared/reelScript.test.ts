import { describe, expect, it } from 'vitest';
import { beatSheet, formatSecs, scoreHookEs } from './reelScript';

describe('scoreHookEs', () => {
  it('castiga saludos y preámbulos', () => {
    expect(scoreHookEs('Hola chicos, hoy les voy a contar algo de la fiesta').label).toBe('débil');
  });
  it('premia lo concreto y corto, que le habla a la persona', () => {
    const s = scoreHookEs('¿Sabías que el viernes 30 tu pareja entra gratis?');
    expect(s.score).toBeGreaterThanOrEqual(75);
    expect(s.label).toBe('fuerte');
  });
  it('baja si suena a IA', () => {
    expect(scoreHookEs('Sumérgete en una experiencia única').score).toBeLessThan(scoreHookEs('Así se ve Playroom a las 3 de la mañana').score);
  });
});

describe('beatSheet', () => {
  it('arma tiempos y avisa gancho largo, línea larga y que no vuelve al inicio', () => {
    const r = beatSheet([
      { say: 'Esta es una frase de gancho demasiado larga para tres segundos de video', screen: '' },
      { say: 'Una línea corta', screen: 'texto' },
      { say: 'Y esta otra línea del medio también es bastante larga y no deja respirar a nadie que la escuche', screen: '' },
      { say: 'Cierre distinto', screen: '' },
    ]);
    expect(r.beats[1].start).toBe(r.beats[0].end);
    expect(r.warnings.some((w) => w.includes('gancho'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('línea 3'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('no vuelve'))).toBe(true);
  });
  it('no avisa el loop si el final repite una palabra del gancho', () => {
    const r = beatSheet([{ say: 'Tres reglas de Playroom', screen: '' }, { say: 'Nadie se las salta en Playroom', screen: '' }]);
    expect(r.warnings.some((w) => w.includes('no vuelve'))).toBe(false);
  });
  it('formatea segundos', () => {
    expect(formatSecs(3.5)).toBe('0:03.5');
    expect(formatSecs(62)).toBe('1:02.0');
  });
});
