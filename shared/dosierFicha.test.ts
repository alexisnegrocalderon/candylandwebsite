import { describe, expect, it } from 'vitest';
import { armarFichas, bordeDeFicha, capasDeFicha, hieloDeFicha } from './dosierFicha';

const insumos = [
  { id: 1, name: 'Pisco Mistral 35', unit: 'ml' as const }, { id: 2, name: 'Bebida de mezcla', unit: 'ml' as const },
  { id: 3, name: 'Coca Cola', unit: 'ml' as const }, { id: 4, name: 'Tequila', unit: 'ml' as const }, { id: 5, name: 'Peroni', unit: 'un' as const },
];
const base = { extras: [] as string[], opciones: [], pasos: [] as string[], foto: null, sinInsumos: false, oculto: false, groupName: 'Pisco' };
const productos = [
  { ...base, id: 10, name: 'Piscolón', glass: 'vaso', receta: [{ insumoId: 1, amount: 90 }, { insumoId: 2, amount: 200 }],
    opciones: [{ id: 'g', label: 'Con', reemplaza: 2, choices: [{ id: 'a', label: 'Coca Cola', insumoId: 3, amount: 200 }] }], extras: ['Hielo en cubos'] },
  { ...base, id: 11, name: 'FireRoom', glass: 'vaso', groupName: 'Autor', receta: [{ insumoId: 4, amount: 60 }], extras: ['Borde de Tajín'], pasos: ['Escarchar.'] },
  { ...base, id: 12, name: 'Peroni', glass: 'botella', groupName: 'Cerveza', receta: [{ insumoId: 5, amount: 1 }] },
  { ...base, id: 13, name: 'Oculto', glass: 'vaso', oculto: true, receta: [{ insumoId: 1, amount: 30 }] },
  { ...base, id: 14, name: 'Cigarros', glass: 'vaso', sinInsumos: true, receta: [] },
];

describe('fichas del dosier', () => {
  const d = armarFichas('Fiesta', productos, insumos);
  it('deja fuera ocultos y lo que se vende solo; las botellas van aparte', () => {
    expect(d.fichas.map((f) => f.name)).toEqual(['FireRoom', 'Piscolón']);
    expect(d.talCual).toEqual([{ name: 'Peroni', section: 'Cerveza' }]);
  });
  it('la bebida elegida reemplaza a la de mezcla y se dibuja arriba', () => {
    const p = d.fichas.find((f) => f.name === 'Piscolón')!;
    expect(p.lineas.map((l) => l.name)).toEqual(['Pisco Mistral 35']);
    expect(p.lineas[0].texto).toBe('3 jiggers · 90 ml');
    const capas = capasDeFicha(p);
    expect(capas.map((c) => c.ml)).toEqual([90, 200]);
    expect(p.pasos.length).toBeGreaterThan(2);
  });
  it('pasos guardados mandan; extras definen hielo y borde', () => {
    const f = d.fichas.find((x) => x.name === 'FireRoom')!;
    expect(f.pasos).toEqual(['Escarchar.']);
    expect(bordeDeFicha(f)).toBe('Borde de Tajín');
    expect(hieloDeFicha(f)).toBe('cubos');
  });
  it('una línea de un insumo archivado no sale en la ficha', () => {
    const f = armarFichas('F', [{ ...productos[0], receta: [{ insumoId: 1, amount: 90 }, { insumoId: 999, amount: 250 }] }], insumos).fichas[0];
    expect(f.lineas.map((l) => l.name)).toEqual(['Pisco Mistral 35']);
  });
  it('el hash cambia cuando cambia la receta y no si no', () => {
    const a = armarFichas('F', productos, insumos).fichas[0].hash;
    expect(armarFichas('F', productos, insumos).fichas[0].hash).toBe(a);
    const cambiado = armarFichas('F', productos.map((p) => (p.id === 11 ? { ...p, receta: [{ insumoId: 4, amount: 90 }] } : p)), insumos).fichas[0].hash;
    expect(cambiado).not.toBe(a);
  });
});
