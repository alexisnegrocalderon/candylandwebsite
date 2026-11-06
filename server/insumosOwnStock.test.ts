import { beforeEach, describe, expect, it, vi } from 'vitest';
import { events, insumoConteoLineas, insumoConteos, insumoMovimientos, insumoRecetas, insumos } from '../drizzle/schema';

/* Base simulada: cada tabla devuelve sus filas y se anota cada insert. Prueba que un evento sin caja de la plataforma
 * (PLAYMORE) NO descuenta ventas ni corrige el stock con su conteo, y que uno común sí lo hace como siempre. */
const state = { event: { slug: 'x', presaleParkingOnly: 0 }, inserts: [] as { table: unknown; values: unknown }[] };
const tableRows = () => new Map<unknown, unknown[]>([
  [events, [state.event]],
  [insumos, [{ id: 1, name: 'Pisco', unit: 'ml', containerSize: 750, containerLabel: 'botella', sizes: null, costPerContainer: null, alertDrinks: 0, active: 1, sortOrder: 1 }]],
  // En el inventario de Playroom hay 10 botellas de pisco (7.500 ml).
  [insumoMovimientos, [{ insumoId: 1, total: '7500' }]],
  [insumoRecetas, [{ ticketTypeId: 5, insumoId: 1, amount: '60', glass: 'vaso' }]],
]);

function fakeDb() {
  const chain = (rows: unknown[]) => {
    const c: any = { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(rows).then(res, rej) };
    for (const m of ['where', 'orderBy', 'limit', 'groupBy', 'innerJoin', 'leftJoin']) c[m] = () => c;
    return c;
  };
  return {
    select: () => ({ from: (t: unknown) => chain(tableRows().get(t) ?? []) }),
    insert: (table: unknown) => ({
      values: (values: unknown) => { state.inserts.push({ table, values }); return Promise.resolve([{ insertId: 77 }]); },
    }),
  };
}

vi.mock('./db', () => ({ getDb: vi.fn(async () => fakeDb()) }));
vi.mock('./schemaUpdates', () => ({
  insumoSchemaStatus: vi.fn(async () => ({ ready: true, missing: [] })),
  reglasSchemaStatus: vi.fn(async () => ({ ready: true, missing: [] })),
}));

import { crearConteo, descontarVenta } from './insumos';

const movimientos = () => state.inserts.filter((i) => i.table === insumoMovimientos);
const conteoLineas = () => state.inserts.filter((i) => i.table === insumoConteoLineas);

beforeEach(() => { state.inserts = []; state.event = { slug: 'x', presaleParkingOnly: 0 }; });

describe('evento que no usa el stock de Playroom (PLAYMORE)', () => {
  it('una venta no descuenta nada del inventario', async () => {
    state.event = { slug: 'playmore', presaleParkingOnly: 1 };
    await descontarVenta(fakeDb(), { opId: 'op-1', eventId: 9, operatorId: 1, items: [{ ticketTypeId: 5, quantity: 3 }] });
    expect(movimientos()).toHaveLength(0);
  });

  it('el conteo de barra queda guardado pero NO corrige el stock ni marca descuadres', async () => {
    state.event = { slug: 'playmore', presaleParkingOnly: 1 };
    // Cuentan 2 botellas de pisco; el inventario de Playroom dice 10: si lo tomara como real, borraría 8 botellas.
    const res = await crearConteo({
      eventId: 9, kind: 'cierre', operatorId: 1, operatorName: 'Staff',
      lines: [{ insumoId: 1, closed: [{ size: 750, count: 2 }], open: [] }],
    });
    expect(res.ownStock).toBe(true);
    expect(conteoLineas()).toHaveLength(1); // el conteo se guarda
    expect(movimientos()).toHaveLength(0); // y el stock queda como estaba
    expect(res.lines[0].diff).toBe(0); // sin descuadre inventado contra el inventario de Playroom
  });
});

describe('evento común', () => {
  it('una venta descuenta del inventario, como siempre', async () => {
    await descontarVenta(fakeDb(), { opId: 'op-2', eventId: 3, operatorId: 1, items: [{ ticketTypeId: 5, quantity: 3 }] });
    expect(movimientos()).toHaveLength(1);
  });

  it('el conteo corrige el stock con la diferencia, como siempre', async () => {
    const res = await crearConteo({
      eventId: 3, kind: 'cierre', operatorId: 1, operatorName: 'Staff',
      lines: [{ insumoId: 1, closed: [{ size: 750, count: 2 }], open: [] }],
    });
    expect(res.ownStock).toBe(false);
    expect(movimientos()).toHaveLength(1);
    const ajuste = (movimientos()[0].values as { delta: string }[])[0];
    expect(Number(ajuste.delta)).toBe(-6000); // 1.500 contados − 7.500 en el inventario
  });
});
