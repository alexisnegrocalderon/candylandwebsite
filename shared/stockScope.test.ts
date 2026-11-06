import { describe, expect, it } from 'vitest';
import { eventUsesPlatformStock } from './stockScope';
import { proyeccionGenerales } from './insumos';

describe('¿el evento usa el stock de Playroom?', () => {
  it('un evento común sí', () => {
    expect(eventUsesPlatformStock({ presaleParkingOnly: 0 })).toBe(true);
    expect(eventUsesPlatformStock({})).toBe(true);
    expect(eventUsesPlatformStock(null)).toBe(true);
  });
  it('un evento sin caja de la plataforma (PLAYMORE) no', () => {
    expect(eventUsesPlatformStock({ presaleParkingOnly: 1 })).toBe(false);
    expect(eventUsesPlatformStock({ presaleParkingOnly: true })).toBe(false);
  });
});

describe('lista de compras con el stock en cero', () => {
  const insumo = { id: 1, name: 'Vasos', unit: 'un', containerSize: 50, containerLabel: 'paquete', costPerContainer: 2000, grupo: 'desechable', modo: 'por_persona', cantidad: 2, minimo: 0 } as any;
  it('sin stock hay que comprar todo lo que se necesita; con stock, solo la diferencia', () => {
    const sinStock = proyeccionGenerales({ insumos: [insumo], stock: new Map([[1, 0]]), personas: 100, factor: 1 });
    const conStock = proyeccionGenerales({ insumos: [insumo], stock: new Map([[1, 120]]), personas: 100, factor: 1 });
    expect(sinStock.lineas[0].missing).toBeGreaterThan(conStock.lineas[0].missing);
    expect(sinStock.lineas[0].missing).toBe(sinStock.lineas[0].need);
  });
});
