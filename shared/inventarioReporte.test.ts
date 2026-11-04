import { describe, expect, it } from 'vitest';
import { armarInventario, valorDe, type InsumoInventario } from './inventarioReporte';

const base = { unit: 'ml' as const, containerSize: 750, containerLabel: 'botella', reference: null, need: null, minimo: 0 };
const ron: InsumoInventario = { ...base, id: 1, name: 'Ron', costPerContainer: 8000, stock: 1500, level: 'ok', grupo: 'bebida', reference: 3000 };
const vodka: InsumoInventario = { ...base, id: 2, name: 'Vodka', costPerContainer: 10000, stock: 0, level: 'agotado', grupo: 'bebida' };
const gin: InsumoInventario = { ...base, id: 3, name: 'Gin', costPerContainer: null, stock: 750, level: 'bajo', grupo: 'bebida', need: 3000 };
const guantes: InsumoInventario = { ...base, id: 4, name: 'Guantes M', unit: 'un', containerSize: 100, containerLabel: 'caja', costPerContainer: 5000, stock: 110, level: 'ok', grupo: 'desechable', minimo: 100 };

const entrada = {
  eventTitle: 'Aniversario', emittedAt: new Date('2026-11-04T18:00:00Z'), personas: 300,
  insumos: [ron, vodka, gin, guantes],
  consumo: [{ insumoId: 1, usado: 2250, merma: 150 }, { insumoId: 2, usado: 3000, merma: 0 }, { insumoId: 4, usado: 50, merma: 0 }, { insumoId: 9, usado: 5, merma: 0 }],
  compras: [{ insumoId: 2, need: 3000, missing: 3000, containersToBuy: 4, cost: 40000 }, { insumoId: 3, need: 3000, missing: 2250, containersToBuy: 3, cost: null }, { insumoId: 1, need: 100, missing: 0, containersToBuy: 0, cost: 0 }],
};

describe('inventario para el PDF', () => {
  it('valorDe usa el costo del envase', () => {
    expect(valorDe(1500, ron)).toBe(16000);
    expect(valorDe(375, ron)).toBe(4000);
    expect(valorDe(100, gin)).toBeNull();
  });

  it('agrupa, ordena por urgencia y valora el stock', () => {
    const r = armarInventario(entrada);
    expect(r.grupos.map((g) => g.id)).toEqual(['bebida', 'desechable']);
    expect(r.grupos[0].filas.map((f) => f.name)).toEqual(['Vodka', 'Gin', 'Ron']);
    expect(r.grupos[0].filas[2]).toMatchObject({ cantidad: '2 botellas', pct: 0.5, valor: 16000 });
    expect(r.grupos[0].filas[1]).toMatchObject({ pct: 0.25, valor: null });
    expect(r.grupos[1].filas[0]).toMatchObject({ cantidad: '1 caja + 10 un', valor: 5500 });
    expect(r.kpis).toMatchObject({ insumos: 4, agotados: 1, bajos: 1, valorStock: 21500, sinCosto: 1 });
  });

  it('alertas: primero lo agotado', () => {
    expect(armarInventario(entrada).alertas.map((a) => [a.name, a.nivel])).toEqual([['Vodka', 'agotado'], ['Gin', 'bajo']]);
  });

  it('lo usado se ordena por plata, compara en envases y ignora insumos que ya no existen', () => {
    const r = armarInventario(entrada);
    expect(r.uso.map((u) => u.name)).toEqual(['Vodka', 'Ron', 'Guantes M']);
    expect(r.uso[0]).toMatchObject({ usado: '4 botellas', pct: 1, valor: 40000 });
    expect(r.uso[1]).toMatchObject({ usado: '3 botellas', merma: '150 ml', valor: 24000 });
    expect(r.uso[1].pct).toBeCloseTo(24000 / 40000);
    expect(r.uso[2].pct).toBeCloseTo(2500 / 40000);
    expect(r.kpis.valorUsado).toBe(40000 + 24000 + 2500);
    expect(r.totalMerma).toBe(1600);
  });

  it('compras: solo lo que hay que comprar, lo más caro primero', () => {
    const r = armarInventario(entrada);
    expect(r.compras.map((c) => [c.name, c.envases, c.envase])).toEqual([['Vodka', 4, 'botellas'], ['Gin', 3, 'botellas']]);
    expect(r.kpis).toMatchObject({ porComprar: 2, costoCompra: 40000 });
  });
});
