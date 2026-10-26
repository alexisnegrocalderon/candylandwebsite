import { describe, expect, it } from 'vitest';
import { baseIdOf, cartToItems, expandCatalog } from './cajaGlasses';

const item = (id: number, name: string) => ({ id, name, price: 5000, color: null, internalCode: null, emoji: null, groupName: 'Tragos', description: null, category: 'consumo', status: 'active' as const, totalStock: 0, soldCount: 0, toKitchen: false, sortOrder: 0 });
const recetas = [
  { ticketTypeId: 2, insumoId: 1, amount: 60, glass: 'vaso' },
  { ticketTypeId: 2, insumoId: 1, amount: 45, glass: 'copa' },
  { ticketTypeId: 3, insumoId: 1, amount: 40 }, // sin vaso: el de siempre
];

describe('tarjetas por vaso en /caja', () => {
  const catalog = expandCatalog([item(1, 'Cerveza'), item(2, 'Mojito'), item(3, 'Piscola')], recetas);

  it('un trago con varios vasos sale como una tarjeta por vaso; el resto queda igual', () => {
    expect(catalog.map((c) => c.name)).toEqual(['Cerveza', 'Mojito · Vaso', 'Mojito · Copa', 'Piscola']);
    expect(catalog.map((c) => c.baseId)).toEqual([1, 2, 2, 3]);
    expect(new Set(catalog.map((c) => c.id)).size).toBe(4);
    expect(catalog[0].id).toBe(1);
  });

  it('al cobrar vuelve al producto real con el vaso elegido', () => {
    const [, vaso, copa] = catalog;
    const items = cartToItems({ 1: 2, [vaso.id]: 1, [copa.id]: 3, 3: 0 });
    expect(items).toEqual([
      { ticketTypeId: 1, quantity: 2 },
      { ticketTypeId: 2, quantity: 1, glass: 'vaso' },
      { ticketTypeId: 2, quantity: 3, glass: 'copa' },
    ]);
    expect(baseIdOf(copa.id)).toBe(2);
    expect(baseIdOf(7)).toBe(7);
  });
});
