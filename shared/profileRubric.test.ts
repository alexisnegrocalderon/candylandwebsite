import { describe, expect, it } from 'vitest';
import { levelFor, PROFILE_RUBRIC, PROFILE_RUBRIC_MAX, scoreProfile } from './profileRubric';

describe('rúbrica del perfil', () => {
  it('suma exactamente 100 puntos y los ids son únicos', () => {
    expect(PROFILE_RUBRIC_MAX).toBe(100);
    expect(new Set(PROFILE_RUBRIC.map((i) => i.id)).size).toBe(PROFILE_RUBRIC.length);
  });
  it('el total lo suma el código, aunque la IA se pase del máximo o devuelva basura', () => {
    const raw = [
      { id: 'nombre', score: 99, note: 'bien' },       // máximo 8
      { id: 'bio-que-es', score: -5, note: 'x' },       // mínimo 0
      { id: 'cta', score: '6' },                         // número como texto
      { id: 'inventado', score: 50 },                    // criterio que no existe
      { id: 'link', score: 'mucho' },                    // no es número
    ];
    const r = scoreProfile(raw);
    expect(r.items.find((i) => i.id === 'nombre')?.score).toBe(8);
    expect(r.items.find((i) => i.id === 'bio-que-es')?.score).toBe(0);
    expect(r.items.find((i) => i.id === 'cta')?.score).toBe(6);
    expect(r.items.find((i) => i.id === 'link')?.score).toBe(0);
    expect(r.total).toBe(14);
    expect(r.items).toHaveLength(PROFILE_RUBRIC.length);
  });
  it('nunca pasa de 100 y sin datos es 0', () => {
    expect(scoreProfile(PROFILE_RUBRIC.map((i) => ({ id: i.id, score: 1000 }))).total).toBe(100);
    expect(scoreProfile(undefined).total).toBe(0);
  });
  it('niveles', () => {
    expect(levelFor(90)).toBe('excelente');
    expect(levelFor(70)).toBe('bueno');
    expect(levelFor(50)).toBe('a mejorar');
    expect(levelFor(10)).toBe('urgente');
  });
});
