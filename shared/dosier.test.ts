import { describe, expect, it } from 'vitest';
import { DOSIER_INSUMOS, DOSIER_RECETAS, DOSIER_SUPUESTOS, planDosier } from './dosier';
import { consumoDeVenta, mlDeReceta, normalizeName, glassInfo } from './insumos';

describe('dosier del aniversario', () => {
  it('ningún insumo ni trago está repetido', () => {
    const keys = DOSIER_INSUMOS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const names = DOSIER_INSUMOS.map((i) => normalizeName(i.name));
    expect(new Set(names).size).toBe(names.length);
    const products = DOSIER_RECETAS.map((r) => normalizeName(r.product));
    expect(new Set(products).size).toBe(products.length);
    expect(DOSIER_RECETAS).toHaveLength(13);
  });

  it('cada línea usa un insumo que existe, una sola vez por trago, con cantidad', () => {
    const keys = new Set(DOSIER_INSUMOS.map((i) => i.key));
    for (const r of DOSIER_RECETAS) {
      const used = r.lines.map((l) => l.insumo);
      expect(new Set(used).size, r.product).toBe(used.length);
      for (const l of r.lines) {
        expect(keys.has(l.insumo), `${r.product}: ${l.insumo}`).toBe(true);
        expect(l.amount, `${r.product}: ${l.insumo}`).toBeGreaterThan(0);
      }
    }
  });

  it('las medidas en oz están bien pasadas a ml (1 oz = 30 ml)', () => {
    const r = (name: string) => DOSIER_RECETAS.find((x) => x.product === name)!;
    const ml = (name: string, key: string) => r(name).lines.find((l) => l.insumo === key)?.amount;
    expect(ml('Aperol Spritz', 'aperol')).toBe(60);
    expect(ml('Aperol Spritz', 'espumante')).toBe(90);
    expect(ml('Aperol Spritz', 'agua')).toBe(30);
    expect(ml('Piscolón', 'pisco')).toBe(90);
    expect(ml('Shot Tequila Olmeca', 'tequila')).toBe(30);
    expect(ml('Trío Shots', 'shot_licor')).toBe(90);
    expect(ml('Mojito Candy', 'ron')).toBe(90);
    expect(ml('Mojito Candy', 'limon')).toBe(15);
    expect(ml('Mojito Candy', 'ginger_ale')).toBe(120);
    expect(ml('Toxic Daikiri', 'limon')).toBe(30);
    expect(ml('PlayRoom', 'pulpa_hibiscus')).toBe(60);
  });

  it('el líquido de cada receta cabe en su vaso (los shots pueden ser varios, como el Trío)', () => {
    const unit = (key: string) => DOSIER_INSUMOS.find((i) => i.key === key)?.unit;
    for (const r of DOSIER_RECETAS.filter((x) => x.glass !== 'shot')) {
      const ml = mlDeReceta(r.lines.map((l, i) => ({ insumoId: i, amount: l.amount })), (i) => unit(r.lines[i].insumo));
      expect(ml, r.product).toBeLessThanOrEqual(glassInfo(r.glass)!.ml);
    }
  });

  it('dos tragos que comparten base descuentan del mismo insumo', () => {
    // Mojito Candy y Toxic Daikiri usan ron blanco; Aperol Spritz y Ramazzotti, espumante.
    const idOf = (key: string) => DOSIER_INSUMOS.findIndex((i) => i.key === key) + 1;
    const recetas = DOSIER_RECETAS.flatMap((r, p) => r.lines.map((l) => ({ ticketTypeId: p + 1, insumoId: idOf(l.insumo), amount: l.amount, glass: r.glass })));
    const at = (name: string) => DOSIER_RECETAS.findIndex((r) => r.product === name) + 1;
    const out = consumoDeVenta([{ ticketTypeId: at('Mojito Candy'), quantity: 2 }, { ticketTypeId: at('Toxic Daikiri'), quantity: 3 }], recetas);
    expect(out.find((o) => o.insumoId === idOf('ron'))?.delta).toBe(-(2 * 90 + 3 * 90));
    const spritz = consumoDeVenta([{ ticketTypeId: at('Aperol Spritz'), quantity: 1 }, { ticketTypeId: at('Ramazzotti'), quantity: 1 }], recetas);
    expect(spritz.find((o) => o.insumoId === idOf('espumante'))?.delta).toBe(-180);
  });

  it('tiene los supuestos para que el dueño los confirme', () => {
    expect(DOSIER_SUPUESTOS.length).toBeGreaterThan(5);
  });
});

describe('planDosier', () => {
  const productos = [
    { id: 10, name: 'Aperol Spritz (COPA)' },
    { id: 11, name: 'Piscolon' },
    { id: 12, name: 'Trio Shots' },
    { id: 13, name: 'Cerveza' },
  ];
  const base = { insumos: [] as { id: number; name: string }[], productos, insumosConMovimientos: new Set<number>(), productosConReceta: new Set<number>() };

  it('empareja los tragos con la Carta aunque cambie el vaso entre paréntesis, la tilde o el alias', () => {
    const plan = planDosier(base);
    const get = (n: string) => plan.recetas.find((r) => r.product === n)!;
    expect(get('Aperol Spritz').productId).toBe(10);
    expect(get('Piscolón').productId).toBe(11);
    expect(get('Trío Shots').productId).toBe(12);
    expect(get('Ramazzotti').action).toBe('sin_producto');
    expect(plan.recetas.filter((r) => r.action === 'cargar')).toHaveLength(3);
  });

  it('no pisa recetas que ya existen, salvo que se pida', () => {
    const withRecipe = { ...base, productosConReceta: new Set([10]) };
    expect(planDosier(withRecipe).recetas.find((r) => r.product === 'Aperol Spritz')!.action).toBe('ya_tiene');
    expect(planDosier({ ...withRecipe, reemplazarRecetas: true }).recetas.find((r) => r.product === 'Aperol Spritz')!.action).toBe('cargar');
  });

  it('no vuelve a crear insumos y no pisa un stock que ya se movió', () => {
    const plan = planDosier({ ...base, insumos: [{ id: 5, name: 'ESPUMANTE' }, { id: 6, name: 'Aperol' }], insumosConMovimientos: new Set([5]) });
    const get = (k: string) => plan.insumos.find((i) => i.key === k)!;
    expect(get('espumante')).toMatchObject({ action: 'existe', id: 5, loadStock: false });
    expect(get('aperol')).toMatchObject({ action: 'existe', id: 6, loadStock: true });
    expect(get('ron')).toMatchObject({ action: 'crear', loadStock: true });
    expect(get('ramazzotti')).toMatchObject({ action: 'crear', loadStock: false }); // sin stock de partida
  });
});
