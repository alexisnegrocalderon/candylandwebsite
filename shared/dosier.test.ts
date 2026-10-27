import { describe, expect, it } from 'vitest';
import { DOSIER_INSUMOS, DOSIER_RECETAS, DOSIER_SUPUESTOS, planDosier, puntajeProducto } from './dosier';
import { consumoDeVenta, mlDeReceta, normalizeName, glassInfo } from './insumos';

describe('dosier del aniversario', () => {
  it('ningún insumo ni trago está repetido', () => {
    const keys = DOSIER_INSUMOS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const names = DOSIER_INSUMOS.map((i) => normalizeName(i.name));
    expect(new Set(names).size).toBe(names.length);
    const products = DOSIER_RECETAS.map((r) => normalizeName(r.product));
    expect(new Set(products).size).toBe(products.length);
    const nombres = DOSIER_RECETAS.map((r) => r.product);
    expect(nombres).not.toContain('Mojito Candy'); // ya no van
    expect(nombres).not.toContain('Toxic Daikiri');
    for (const n of ['Aperol Spritz', 'Ramazzotti', 'Piscolón', 'Tropical Gin RedBull', 'Tropical Gin con Pulpa', 'Johnnie Walker + Bebida', 'Shot Tequila Olmeca', 'Trío Shots', 'PlayRoom', 'Mojito Tradicional', 'Mojito Maracuyá', 'Mojito Arándanos', 'Mocktail Candy', 'Mocktail Toxic']) expect(nombres).toContain(n);
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
    expect(ml('Mojito Tradicional', 'ron')).toBe(60); // 2 oz (infografía)
    expect(ml('Mojito Tradicional', 'limon')).toBe(15);
    expect(ml('Mojito Tradicional', 'goma')).toBe(15);
    expect(ml('Mojito Maracuyá', 'sirope_maracuya')).toBe(30);
    expect(ml('Mojito Arándanos', 'sirope_arandanos')).toBe(30);
    expect(ml('PlayRoom', 'pulpa_hibiscus')).toBe(60);
  });

  it('el líquido de cada receta cabe en su vaso (los shots pueden ser varios, como el Trío)', () => {
    const unit = (key: string) => DOSIER_INSUMOS.find((i) => i.key === key)?.unit;
    for (const r of DOSIER_RECETAS.filter((x) => x.glass !== 'shot' && x.glass !== 'botella')) {
      const ml = mlDeReceta(r.lines.map((l, i) => ({ insumoId: i, amount: l.amount })), (i) => unit(r.lines[i].insumo));
      expect(ml, r.product).toBeLessThanOrEqual(glassInfo(r.glass)!.ml);
    }
  });

  it('dos tragos que comparten base descuentan del mismo insumo', () => {
    // Los tres mojitos usan ron blanco; Aperol Spritz y Ramazzotti, espumante.
    const idOf = (key: string) => DOSIER_INSUMOS.findIndex((i) => i.key === key) + 1;
    const recetas = DOSIER_RECETAS.flatMap((r, p) => r.lines.map((l) => ({ ticketTypeId: p + 1, insumoId: idOf(l.insumo), amount: l.amount, glass: r.glass })));
    const at = (name: string) => DOSIER_RECETAS.findIndex((r) => r.product === name) + 1;
    const out = consumoDeVenta([{ ticketTypeId: at('Mojito Tradicional'), quantity: 2 }, { ticketTypeId: at('Mojito Maracuyá'), quantity: 3 }, { ticketTypeId: at('Mojito Arándanos'), quantity: 1 }], recetas);
    expect(out.find((o) => o.insumoId === idOf('ron'))?.delta).toBe(-(2 * 60 + 3 * 60 + 1 * 60));
    expect(out.find((o) => o.insumoId === idOf('sirope_maracuya'))?.delta).toBe(-90); // solo el sabor que se vendió
    expect(out.find((o) => o.insumoId === idOf('sirope_arandanos'))?.delta).toBe(-30);
    const spritz = consumoDeVenta([{ ticketTypeId: at('Aperol Spritz'), quantity: 1 }, { ticketTypeId: at('Ramazzotti'), quantity: 1 }], recetas);
    expect(spritz.find((o) => o.insumoId === idOf('espumante'))?.delta).toBe(-180);
  });

  it('tiene los supuestos para que el dueño los confirme', () => {
    expect(DOSIER_SUPUESTOS.length).toBeGreaterThan(5);
  });
});

describe('planDosier', () => {
  // La Carta real del aniversario: las preparaciones del dosier no existen como productos, son la base de estos.
  const nombres = [
    'Piscolón Mistral 35', 'Piscolón Mistral Nobel', 'Cuba Liberal', 'Tropical Gin', 'Tropical Gin XL', 'Aperol', 'Ramazzotti',
    'Mojito Tradicional', 'Mojito Maracuyá', 'Mojito Arándanos', 'Mojito Sabores', 'Mocktail Sabores', 'Jack Daniels', 'Jägermeister', 'Peroni', 'Peroni Sin Alcohol',
    'Vaso PlayRoom', 'Aros Playroom', 'Shot Jose Cuervo Reposado', 'Shot Jose Cuervo Silver', 'Piscola Sin Alcohol',
    'Energética Score', 'Gatorlite Isotónica', 'Kunstmann Torobayo', 'Gin con Gin', 'Te', 'Lucky Click', 'Aperol Spritz (COPA)', 'Trio Shots',
  ];
  const productos = nombres.map((name, i) => ({ id: i + 1, name }));
  const idOf = (name: string) => productos.find((p) => p.name === name)!.id;
  const base = { insumos: [] as { id: number; name: string }[], productos, insumosConMovimientos: new Set<number>(), productosConReceta: new Set<number>() };
  const sugeridos = (receta: string) => planDosier(base).recetas.find((r) => r.product === receta)!.sugeridos;

  it('sugiere a qué productos de la Carta aplica cada preparación, por nombre', () => {
    expect(sugeridos('Piscolón').sort()).toEqual([idOf('Piscolón Mistral 35'), idOf('Piscolón Mistral Nobel')].sort());
    expect(sugeridos('Aperol Spritz').sort()).toEqual([idOf('Aperol'), idOf('Aperol Spritz (COPA)')].sort());
    expect(sugeridos('Ramazzotti')).toEqual([idOf('Ramazzotti')]);
    expect(sugeridos('Cuba Libre')).toEqual([idOf('Cuba Liberal')]);
    expect(sugeridos('Tropical Gin RedBull').sort()).toEqual([idOf('Tropical Gin'), idOf('Tropical Gin XL')].sort());
    expect(sugeridos('Jack Daniels + Bebida')).toEqual([idOf('Jack Daniels')]);
    expect(sugeridos('Shot Jägermeister')).toEqual([idOf('Jägermeister')]);
    expect(sugeridos('Shot José Cuervo Reposado')).toEqual([idOf('Shot Jose Cuervo Reposado')]);
    expect(sugeridos('Shot José Cuervo Silver')).toEqual([idOf('Shot Jose Cuervo Silver')]);
    expect(sugeridos('Mojito Tradicional')).toEqual([idOf('Mojito Tradicional')]);
    expect(sugeridos('Mojito Maracuyá')).toEqual([idOf('Mojito Maracuyá')]);
    expect(sugeridos('Mojito Arándanos')).toEqual([idOf('Mojito Arándanos')]);
    expect(sugeridos('PlayRoom')).toEqual([idOf('Vaso PlayRoom')]); // no los Aros
    expect(sugeridos('Trío Shots')).toEqual([idOf('Trio Shots')]);
  });

  it('lo que se vende tal cual se asigna sin confundir Peroni con Peroni sin alcohol', () => {
    expect(sugeridos('Peroni')).toEqual([idOf('Peroni')]);
    expect(sugeridos('Peroni Sin Alcohol')).toEqual([idOf('Peroni Sin Alcohol')]);
    expect(sugeridos('Energética Score')).toEqual([idOf('Energética Score')]);
    expect(sugeridos('Kunstmann Torobayo')).toEqual([idOf('Kunstmann Torobayo')]);
    expect(sugeridos('Gatorlite Isotónica')).toEqual([idOf('Gatorlite Isotónica')]);
  });

  it('cada producto se sugiere a una sola preparación y los que no están en el dosier quedan sin receta', () => {
    const all = planDosier(base).recetas.flatMap((r) => r.sugeridos);
    expect(new Set(all).size).toBe(all.length);
    for (const sin of ['Mojito Sabores', 'Mocktail Sabores', 'Piscola Sin Alcohol', 'Gin con Gin', 'Te', 'Lucky Click', 'Aros Playroom']) {
      expect(all).not.toContain(idOf(sin));
    }
  });

  it('el nombre idéntico gana y "Tropical Gin con Pulpa" no se lo lleva "Tropical Gin"', () => {
    const conPulpa = DOSIER_RECETAS.find((r) => r.product === 'Tropical Gin con Pulpa')!;
    const redbull = DOSIER_RECETAS.find((r) => r.product === 'Tropical Gin RedBull')!;
    expect(puntajeProducto(conPulpa, 'Tropical Gin')).toBe(0);
    expect(puntajeProducto(conPulpa, 'Tropical Gin con Pulpa')).toBeGreaterThan(puntajeProducto(redbull, 'Tropical Gin con Pulpa'));
  });

  it('lista los productos de la Carta y cuáles ya tienen receta', () => {
    const plan = planDosier({ ...base, productosConReceta: new Set([idOf('Aperol')]) });
    expect(plan.productos).toHaveLength(nombres.length);
    expect(plan.productos.find((p) => p.id === idOf('Aperol'))?.tieneReceta).toBe(true);
    expect(plan.productos.find((p) => p.id === idOf('Ramazzotti'))?.tieneReceta).toBe(false);
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

describe('inventario de la barra', () => {
  it('carga toda la lista de stock de la barra con sus cantidades', () => {
    const stock = (key: string) => DOSIER_INSUMOS.find((i) => i.key === key)?.stock?.amount;
    expect(stock('peroni')).toBe(24);
    expect(stock('peroni_zero')).toBe(3);
    expect(stock('score')).toBe(3);
    expect(stock('torobayo')).toBe(2);
    expect(stock('gatorlite')).toBe(12);
    expect(stock('redbull')).toBe(6);
    expect(stock('espumante')).toBe(4500);
    expect(stock('pisco')).toBe(4400);
    expect(stock('pisco_alto')).toBe(1000);
    expect(stock('bebida')).toBe(9000 + 2800 + 3000);
    expect(stock('sprite')).toBe(1500);
    expect(stock('gin')).toBe(1050);
    expect(stock('ron')).toBe(2250);
    expect(stock('aperol')).toBe(1125);
    expect(stock('cuervo_dorado')).toBe(900);
    expect(stock('cuervo_silver')).toBe(300);
    expect(stock('jack_daniels')).toBe(150);
    expect(stock('triple_sec')).toBe(1050);
    expect(stock('bacardi_anejo')).toBe(750);
    expect(stock('bacardi_pro')).toBe(675);
  });

  it('lo que se vende por unidad se cuenta en unidades enteras', () => {
    for (const k of ['peroni', 'peroni_zero', 'score', 'torobayo', 'gatorlite', 'redbull']) {
      const i = DOSIER_INSUMOS.find((x) => x.key === k)!;
      expect(i.unit).toBe('un');
      expect(i.containerSize).toBe(1);
    }
  });
});
