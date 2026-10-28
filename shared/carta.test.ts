import { describe, expect, it } from 'vitest';
import {
  adjustPrice, cartaToCsv, filterCarta, groupBySection, marginOf, marginTone, moveInSection, parseClp, parseCsvRows,
  planCartaImport, remaining, sectionNames, sortCarta, stockLevel, summarizeCarta, type CartaProduct,
} from './carta';

const p = (o: Partial<CartaProduct> & { id: number; name: string }): CartaProduct => ({
  category: 'consumo', groupName: 'Tragos', price: 5000, costPrice: 2000, totalStock: 20, soldCount: 5, sortOrder: 0, status: 'active', toKitchen: 0, ...o,
});

describe('stock y margen', () => {
  it('porciones que quedan y nivel de stock', () => {
    expect(remaining(p({ id: 1, name: 'a', totalStock: 20, soldCount: 5 }))).toBe(15);
    expect(stockLevel(p({ id: 1, name: 'a' }))).toBe('ok');
    expect(stockLevel(p({ id: 1, name: 'a', totalStock: 8, soldCount: 5 }))).toBe('bajo');
    expect(stockLevel(p({ id: 1, name: 'a', totalStock: 5, soldCount: 5 }))).toBe('sin_stock');
    expect(stockLevel(p({ id: 1, name: 'a', status: 'soldout' }))).toBe('agotado');
  });
  it('margen en $ y %, null sin costo', () => {
    expect(marginOf(8000, 5000)).toEqual({ amount: 3000, pct: 38 });
    expect(marginOf(8000, null)).toBeNull();
    expect(marginOf(8000, 0)).toBeNull();
    expect(marginTone({ amount: -500, pct: -6 })).toBe('negative');
    expect(marginTone({ amount: 1000, pct: 20 })).toBe('low');
    expect(marginTone({ amount: 3000, pct: 60 })).toBe('ok');
  });
});

describe('buscar, filtrar y ordenar', () => {
  const list = [
    p({ id: 1, name: 'Pisco Sour', price: 6000, costPrice: 1000, sortOrder: 20 }),
    p({ id: 2, name: 'Whisky Jack', groupName: 'Whisky', price: 8000, costPrice: null, sortOrder: 10, status: 'soldout' }),
    p({ id: 3, name: 'Té', groupName: 'Sin Alcohol', price: 2000, costPrice: 1800, totalStock: 7, sortOrder: 30, toKitchen: 1 }),
  ];
  it('busca sin tildes ni mayúsculas, también por sección', () => {
    expect(filterCarta(list, { query: 'PISCO', filter: 'todos' }).map((x) => x.id)).toEqual([1]);
    expect(filterCarta(list, { query: 'te', filter: 'todos' }).map((x) => x.id)).toContain(3);
    expect(filterCarta(list, { query: 'whisky', filter: 'todos' }).map((x) => x.id)).toEqual([2]);
  });
  it('filtros rápidos', () => {
    expect(filterCarta(list, { query: '', filter: 'agotados' }).map((x) => x.id)).toEqual([2]);
    expect(filterCarta(list, { query: '', filter: 'sin_costo' }).map((x) => x.id)).toEqual([2]);
    expect(filterCarta(list, { query: '', filter: 'margen_bajo' }).map((x) => x.id)).toEqual([3]);
    expect(filterCarta(list, { query: '', filter: 'poco_stock' }).map((x) => x.id)).toEqual([3]);
    expect(filterCarta(list, { query: '', filter: 'cocina' }).map((x) => x.id)).toEqual([3]);
  });
  it('ordena por orden de caja, precio, stock y margen', () => {
    expect(sortCarta(list, 'orden').map((x) => x.id)).toEqual([2, 1, 3]);
    expect(sortCarta(list, 'precio_desc').map((x) => x.id)).toEqual([2, 1, 3]);
    expect(sortCarta(list, 'precio_asc').map((x) => x.id)).toEqual([3, 1, 2]);
    expect(sortCarta(list, 'stock').map((x) => x.id)[0]).toBe(3);
    expect(sortCarta(list, 'margen').map((x) => x.id)).toEqual([3, 1, 2]); // el sin costo al final
  });
  it('resumen y secciones', () => {
    expect(summarizeCarta(list)).toMatchObject({ total: 3, agotados: 1, pocoStock: 1, sinCosto: 1, margenBajo: 1 });
    expect(summarizeCarta([]).margenPromedioPct).toBeNull();
    expect(groupBySection(list).map((g) => g.name)).toEqual(['Whisky', 'Tragos', 'Sin Alcohol']);
    expect(groupBySection([p({ id: 9, name: 'x', groupName: '' }), p({ id: 8, name: 'y' })]).map((g) => g.name)).toEqual(['Tragos', 'Sin sección']);
    expect(sectionNames(list)).toEqual(['Sin Alcohol', 'Tragos', 'Whisky']);
  });
});

describe('ajuste de precios en bloque', () => {
  it('sube o baja por % o por monto, y redondea', () => {
    expect(adjustPrice(8000, { mode: 'percent', value: 10, direction: 'up', roundTo: 100 })).toBe(8800);
    expect(adjustPrice(2500, { mode: 'percent', value: 10, direction: 'up', roundTo: 100 })).toBe(2800); // 2750 -> 2800
    expect(adjustPrice(8000, { mode: 'amount', value: 500, direction: 'down', roundTo: 0 })).toBe(7500);
    expect(adjustPrice(300, { mode: 'amount', value: 1000, direction: 'down', roundTo: 0 })).toBe(1); // nunca 0 ni negativo
  });
});

describe('reordenar dentro de la sección', () => {
  const sec = [p({ id: 1, name: 'a', sortOrder: 10 }), p({ id: 2, name: 'b', sortOrder: 20 }), p({ id: 3, name: 'c', sortOrder: 30 })];
  it('intercambia con el vecino y renumera solo lo que cambia', () => {
    expect(moveInSection(sec, 2, 'up')).toEqual([{ id: 2, sortOrder: 10 }, { id: 1, sortOrder: 20 }]);
    expect(moveInSection(sec, 2, 'down')).toEqual([{ id: 3, sortOrder: 20 }, { id: 2, sortOrder: 30 }]);
  });
  it('no mueve más allá del borde', () => {
    expect(moveInSection(sec, 1, 'up')).toEqual([]);
    expect(moveInSection(sec, 3, 'down')).toEqual([]);
    expect(moveInSection(sec, 99, 'up')).toEqual([]);
  });
  it('con todos en orden 0 los numera de 10 en 10', () => {
    const iguales = [p({ id: 1, name: 'a', sortOrder: 0 }), p({ id: 2, name: 'b', sortOrder: 0 })];
    expect(moveInSection(iguales, 2, 'up')).toEqual([{ id: 2, sortOrder: 10 }, { id: 1, sortOrder: 20 }]);
  });
});

describe('CSV', () => {
  it('parsea comillas, saltos de línea, ; de Excel y BOM', () => {
    expect(parseCsvRows('a,b\r\n"x, y","di ""hola"""\n')).toEqual([['a', 'b'], ['x, y', 'di "hola"']]);
    expect(parseCsvRows('﻿nombre;precio\nPiscola;5.000')).toEqual([['nombre', 'precio'], ['Piscola', '5.000']]);
    expect(parseCsvRows('a\n"l1\nl2"')).toEqual([['a'], ['l1\nl2']]);
  });
  it('parseClp', () => {
    expect(parseClp('$8.000')).toBe(8000);
    expect(parseClp('8 000')).toBe(8000);
    expect(parseClp('')).toBeNull();
  });
  it('exportar y volver a importar sin cambios no toca nada', () => {
    const list = [p({ id: 1, name: 'Pisco, Sour', emoji: '🍸', color: '#f472b6', description: 'con "limón"' }), p({ id: 2, name: 'Té', groupName: 'Sin Alcohol', toKitchen: 1 })];
    const plan = planCartaImport(cartaToCsv(list), list, 'consumo');
    expect(plan.errors).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.creates).toEqual([]);
    expect(plan.unchanged).toBe(2);
  });
  it('importa: actualiza solo lo cambiado, crea los sin id y avisa los errores', () => {
    const list = [p({ id: 1, name: 'Pisco Sour', price: 6000 }), p({ id: 2, name: 'Té', price: 2000 })];
    const csv = [
      'id,nombre,categoria,seccion,precio,costo,stock',
      '1,Pisco Sour,consumo,Tragos,6500,2000,20',
      ',Mojito,consumo,Tragos,"$7.000",2500,30',
      '2,,consumo,Tragos,2000,,10',
      '3,Fantasma,consumo,Tragos,1000,,10',
      ',Gratis,consumo,Tragos,0,,10',
      ',Raro,bebida,Tragos,1000,,10',
    ].join('\n');
    const plan = planCartaImport(csv, list, 'consumo');
    expect(plan.updates).toEqual([{ id: 1, name: 'Pisco Sour', data: { price: 6500 } }]);
    expect(plan.creates).toEqual([{ name: 'Mojito', category: 'consumo', groupName: 'Tragos', price: 7000, costPrice: 2500, totalStock: 30 }]);
    expect(plan.errors).toHaveLength(4);
    expect(plan.errors.join(' ')).toMatch(/falta el nombre/);
    expect(plan.errors.join(' ')).toMatch(/no existe en este evento/);
    expect(plan.errors.join(' ')).toMatch(/precio tiene que ser mayor a 0/);
    expect(plan.errors.join(' ')).toMatch(/categoría "bebida"/);
  });
  it('sin columnas nombre/precio o vacío: error claro', () => {
    expect(planCartaImport('a,b\n1,2', [], 'consumo').errors[0]).toMatch(/Faltan las columnas/);
    expect(planCartaImport('', [], 'consumo').errors[0]).toMatch(/vacío/);
  });
});

describe('porciones por insumos', () => {
  it('si el producto tiene porciones por insumos, mandan sobre el stock manual', async () => {
    const { remaining, stockLevel } = await import('./carta');
    const p = { totalStock: 100, soldCount: 10, status: 'active', portions: 3 };
    expect(remaining(p)).toBe(3);
    expect(stockLevel(p)).toBe('bajo');
    expect(remaining({ ...p, portions: 0 })).toBe(0);
    expect(remaining({ ...p, portions: null })).toBe(90);
  });
});

describe('textoAviso', () => {
  it('dice qué insumo falta, y si nunca se compró', async () => {
    const { textoAviso } = await import('./carta');
    const base = { limitante: { insumoId: 11, name: 'Ginger ale', drinks: 0, sinComprar: true }, bajos: [], sugerencias: [] };
    expect(textoAviso({ ...base, estado: 'agotado', faltantes: [{ insumoId: 11, name: 'Ginger ale', sinComprar: true }] })).toBe('Falta Ginger ale (sin comprar)');
    expect(textoAviso({ ...base, estado: 'agotado', faltantes: [{ insumoId: 11, name: 'Ginger ale', sinComprar: false }, { insumoId: 4, name: 'Limón', sinComprar: false }] })).toBe('Faltan Ginger ale y Limón');
    expect(textoAviso({ ...base, estado: 'bajo', faltantes: [], bajos: [{ insumoId: 10, name: 'Gin Beefeater', drinks: 3 }] })).toBe('Se acaba Gin Beefeater');
    expect(textoAviso({ ...base, estado: 'ok', faltantes: [] })).toBe('Limita Ginger ale');
  });
});
