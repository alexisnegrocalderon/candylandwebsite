import { describe, expect, it } from 'vitest';
import { PLAYMORE_TANDA_ROWS, buildPlaymorePhases, exactPercents, tandaRowProblem } from './playmoreTandas';
import { phasePriceFor, nextPhase, normalizeTandaSchedule } from './tandaSchedule';

describe('porcentajes exactos de PLAYMORE', () => {
  const pct = (slug: string) => exactPercents(PLAYMORE_TANDA_ROWS.find((r) => r.slug === slug)!);
  it('descuento de cada entrada en cada tanda', () => {
    expect(pct('duo')).toEqual({ t1: 42.86, t2: 28.57, general: 0 });
    expect(pct('soltera')).toEqual({ t1: 33.33, t2: 16.67, general: 0 });
    expect(pct('duo_mujeres')).toEqual({ t1: 40, t2: 20, general: 0 });
    expect(pct('trio')).toEqual({ t1: 37.5, t2: 25, general: 0 });
  });
  it('las filas del dueño son coherentes', () => {
    for (const r of PLAYMORE_TANDA_ROWS) expect(tandaRowProblem(r)).toBeNull();
    expect(tandaRowProblem({ slug: 'x', label: 'X', general: 10000, t1: 12000, t2: 11000 })).toMatch(/1ª tanda/);
    expect(tandaRowProblem({ slug: 'x', label: 'X', general: 10000.5, t1: 5000, t2: 6000 })).toMatch(/enteros/);
  });
});

describe('fases con precio exacto', () => {
  const phases = buildPlaymorePhases(PLAYMORE_TANDA_ROWS);
  it('son 4: 1ª tanda, 2ª tanda y dos generales', () => {
    expect(phases).toHaveLength(4);
    expect(phases[3].prices).toEqual(phases[2].prices);
    expect(phases[0].prices).toMatchObject({ duo: 40000, soltera: 10000, duo_mujeres: 15000, trio: 50000 });
    expect(phases[1].prices).toMatchObject({ duo: 50000, soltera: 12500, duo_mujeres: 20000, trio: 60000 });
    expect(phases[2].prices).toMatchObject({ duo: 70000, soltera: 15000, duo_mujeres: 25000, trio: 80000 });
  });
  it('el precio de la tanda siguiente es el exacto (incluye 12.500, que no es múltiplo de mil)', () => {
    const next = nextPhase(0, phases)!;
    expect(phasePriceFor(next.phase, 'soltera', 15000)).toBe(12500);
    expect(phasePriceFor(next.phase, 'duo', 70000)).toBe(50000);
    expect(phasePriceFor(nextPhase(1, phases)!.phase, 'trio', 80000)).toBe(80000);
  });
  it('un acceso sin precio exacto usa el % parejo de siempre', () => {
    expect(phasePriceFor({ percent: 50, prices: { duo: 1 } }, 'grupo', 80000)).toBe(40000);
  });
  it('sobrevive a guardar y leer (JSON)', () => {
    const again = normalizeTandaSchedule(JSON.parse(JSON.stringify(phases)));
    expect(again[1].prices?.soltera).toBe(12500);
  });
});
