/* Inventario para el PDF (server/inventarioPdf.ts): arma, a partir de lo que hay en la base, todo lo que el PDF muestra —
 * stock por grupo con su nivel, lo usado en el evento, lo que falta comprar y cuánto vale todo— con los números ya
 * calculados y los textos listos. Es puro: no toca la base ni dibuja, así se puede probar. */
import { GRUPOS_INSUMO, formatCantidad, pluralize, type GrupoInsumo, type InsumoUnit } from './insumos';

export type NivelInventario = 'agotado' | 'bajo' | 'ok' | 'sin_uso';

export interface InsumoInventario {
  id: number;
  name: string;
  unit: InsumoUnit;
  containerSize: number;
  containerLabel: string;
  costPerContainer: number | null;
  stock: number;
  level: NivelInventario;
  grupo: GrupoInsumo;
  /** Stock con que se abrió la noche (si hubo conteo). */
  reference: number | null;
  /** Lo que se necesita para el evento según las reglas y recetas. */
  need: number | null;
  minimo: number;
}

export interface InventarioEntrada {
  eventTitle: string;
  emittedAt: Date;
  personas: number;
  insumos: InsumoInventario[];
  /** Lo gastado en el evento por insumo: ventas (ya con las anulaciones restadas) y mermas, en la unidad del insumo. */
  consumo: { insumoId: number; usado: number; merma: number }[];
  /** Lo que falta para el próximo evento: envases por comprar según las recetas y las reglas. */
  compras: { insumoId: number; need: number; missing: number; containersToBuy: number; cost: number | null }[];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que vale una cantidad de un insumo según el costo de su envase; null si no se sabe su costo. */
export function valorDe(cantidad: number, i: Pick<InsumoInventario, 'containerSize' | 'costPerContainer'>): number | null {
  if (i.costPerContainer == null || !(i.containerSize > 0)) return null;
  return Math.round((cantidad / i.containerSize) * i.costPerContainer);
}

const RANGO: Record<NivelInventario, number> = { agotado: 0, bajo: 1, ok: 2, sin_uso: 3 };

export interface FilaStock {
  id: number;
  name: string;
  nivel: NivelInventario;
  /** «3 botellas + 250 ml». */
  cantidad: string;
  /** Qué tan lleno está (0 a 1) respecto de lo que se abrió o se necesita; null si no hay con qué comparar. */
  pct: number | null;
  valor: number | null;
}

export interface FilaUso { id: number; name: string; usado: string; merma: string | null; /** Frente al que más se usó (0 a 1). */ pct: number; valor: number | null }
export interface FilaCompra { id: number; name: string; necesita: string; hay: string; envases: number; envase: string; costo: number | null }

export interface Inventario {
  eventTitle: string;
  emittedAt: Date;
  personas: number;
  kpis: { insumos: number; agotados: number; bajos: number; valorStock: number; sinCosto: number; valorUsado: number; porComprar: number; costoCompra: number };
  alertas: { name: string; nivel: NivelInventario; cantidad: string }[];
  grupos: { id: GrupoInsumo; label: string; emoji: string; valor: number; filas: FilaStock[] }[];
  uso: FilaUso[];
  totalMerma: number;
  compras: FilaCompra[];
}

const pluralEnvase = (n: number, label: string) => (n === 1 ? label : pluralize(label));

export function armarInventario(e: InventarioEntrada): Inventario {
  const consumo = new Map(e.consumo.map((c) => [c.insumoId, c]));

  const grupos = GRUPOS_INSUMO.map((g) => {
    const filas: FilaStock[] = e.insumos
      .filter((i) => i.grupo === g.id)
      .sort((a, b) => RANGO[a.level] - RANGO[b.level] || a.name.localeCompare(b.name))
      .map((i) => {
        const base = Math.max(i.reference ?? 0, i.need ?? 0, i.minimo);
        return {
          id: i.id, name: i.name, nivel: i.level, cantidad: formatCantidad(i.stock, i),
          pct: base > 0 ? Math.max(0, Math.min(1, i.stock / base)) : null,
          valor: i.stock > 0 ? valorDe(i.stock, i) : 0,
        };
      });
    return { id: g.id, label: g.label, emoji: g.emoji, valor: filas.reduce((s, f) => s + (f.valor ?? 0), 0), filas };
  }).filter((g) => g.filas.length > 0);

  const byId = new Map(e.insumos.map((i) => [i.id, i]));
  const usos = e.consumo
    .map((c) => ({ c, i: byId.get(c.insumoId) }))
    .filter((x): x is { c: typeof x.c; i: InsumoInventario } => !!x.i && x.c.usado > 0)
    .sort((a, b) => valorUso(b) - valorUso(a) || b.c.usado / Math.max(1, b.i.containerSize) - a.c.usado / Math.max(1, a.i.containerSize) || a.i.name.localeCompare(b.i.name));
  function valorUso(x: { c: { usado: number }; i: InsumoInventario }) { return valorDe(x.c.usado, x.i) ?? 0; }
  // La barra compara lo que movió cada uno en plata (un insumo sin costo no tiene barra): comparar ml con latas no tendría sentido.
  const maxUso = Math.max(0, ...usos.map(valorUso));
  const uso: FilaUso[] = usos.map((x) => ({
    id: x.i.id, name: x.i.name, usado: formatCantidad(x.c.usado, x.i), merma: x.c.merma > 0 ? formatCantidad(x.c.merma, x.i) : null,
    pct: maxUso > 0 ? valorUso(x) / maxUso : 0, valor: valorDe(x.c.usado, x.i),
  }));
  const totalMerma = e.consumo.reduce((s, c) => { const i = byId.get(c.insumoId); return s + (i && c.merma > 0 ? valorDe(c.merma, i) ?? 0 : 0); }, 0);

  const compras: FilaCompra[] = e.compras
    .filter((c) => c.containersToBuy > 0 && byId.has(c.insumoId))
    .map((c) => {
      const i = byId.get(c.insumoId)!;
      return { id: i.id, name: i.name, necesita: formatCantidad(c.need, i), hay: formatCantidad(i.stock, i), envases: c.containersToBuy, envase: pluralEnvase(c.containersToBuy, i.containerLabel), costo: c.cost };
    })
    .sort((a, b) => (b.costo ?? 0) - (a.costo ?? 0) || b.envases - a.envases || a.name.localeCompare(b.name));

  const todas = grupos.flatMap((g) => g.filas);
  const conStock = e.insumos.filter((i) => i.stock > 0);
  return {
    eventTitle: e.eventTitle, emittedAt: e.emittedAt, personas: e.personas,
    kpis: {
      insumos: e.insumos.length,
      agotados: todas.filter((f) => f.nivel === 'agotado').length,
      bajos: todas.filter((f) => f.nivel === 'bajo').length,
      valorStock: grupos.reduce((s, g) => s + g.valor, 0),
      sinCosto: conStock.filter((i) => valorDe(i.stock, i) === null).length,
      valorUsado: uso.reduce((s, u) => s + (u.valor ?? 0), 0),
      porComprar: compras.length,
      costoCompra: compras.reduce((s, c) => s + (c.costo ?? 0), 0),
    },
    alertas: e.insumos
      .filter((i) => i.level === 'agotado' || i.level === 'bajo')
      .sort((a, b) => RANGO[a.level] - RANGO[b.level] || a.name.localeCompare(b.name))
      .map((i) => ({ name: i.name, nivel: i.level, cantidad: formatCantidad(i.stock, i) })),
    grupos, uso, totalMerma, compras,
  };
}
