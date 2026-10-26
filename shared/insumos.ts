/* Stock de la barra por INSUMOS (ron, vodka, jugo, hielo…), no por trago.
 *
 * Un trago de la carta (`ticketTypes` consumo) tiene una receta: cuánto gasta
 * de cada insumo. Cada venta en /caja descuenta del insumo, así dos tragos que
 * usan la misma base gastan del mismo contador, y "cuántos tragos quedan" sale
 * del insumo que se acaba primero. El stock de cada insumo es la suma de su
 * libro de movimientos (carga, compra, venta, anulación, conteo…).
 *
 * Lógica pura, sin base de datos ni React (shared/insumos.test.ts). */

export type InsumoUnit = 'ml' | 'g' | 'un';

export const INSUMO_UNITS: { id: InsumoUnit; label: string; short: string }[] = [
  { id: 'ml', label: 'Mililitros', short: 'ml' },
  { id: 'g', label: 'Gramos', short: 'g' },
  { id: 'un', label: 'Unidades', short: 'un' },
];

export interface Insumo {
  id: number;
  name: string;
  unit: InsumoUnit;
  /** Cuánto trae un envase (botella de 750 ml, bolsa de 2000 g, pack de 24 un). */
  containerSize: number;
  /** "botella", "lata", "bolsa", "pack"… */
  containerLabel: string;
  /** Tamaños de envase con que llega este insumo (botellas de 750, 1000 y 1500 ml).
   * `containerSize` es el de compra (lista de compras y costo); siempre está incluido. */
  sizes?: number[] | null;
  costPerContainer?: number | null;
  /** Avisa cuando este insumo alcance para menos de esta cantidad de tragos. 0 = no avisa. */
  alertDrinks: number;
}

export interface RecetaLinea {
  ticketTypeId: number;
  insumoId: number;
  /** Cuánto gasta UN trago, en la unidad del insumo. */
  amount: number;
  /** El vaso en que sale este trago (todas las líneas de un trago comparten el mismo). Vacío = vaso. */
  glass?: string | null;
}

/** Vasos en que sale un trago. Cada trago viene en su vaso (unos en vaso, otros en copa, otros en shot)
 * y se define en su receta: no es una opción que elija el cliente al comprar. */
export type GlassId = 'vaso' | 'copa' | 'shot';
export const GLASSES: { id: GlassId; label: string; ml: number; emoji: string }[] = [
  { id: 'vaso', label: 'Vaso', ml: 500, emoji: '🥃' },
  { id: 'copa', label: 'Copa', ml: 400, emoji: '🍷' },
  { id: 'shot', label: 'Shot', ml: 30, emoji: '🥂' },
];
export const DEFAULT_GLASS: GlassId = 'vaso';

export const glassInfo = (id: string | null | undefined) => GLASSES.find((g) => g.id === (id || DEFAULT_GLASS));
const glassKey = (r: { glass?: string | null }) => r.glass || DEFAULT_GLASS;

/** Vaso(s) con receta de un trago (en la práctica uno solo). */
export function glassesDeProducto(recetas: { ticketTypeId: number; glass?: string | null }[], ticketTypeId: number): string[] {
  const present = new Set(recetas.filter((r) => r.ticketTypeId === ticketTypeId).map(glassKey));
  return [...GLASSES.map((g) => g.id).filter((g) => present.has(g)), ...Array.from(present).filter((g) => !GLASSES.some((x) => x.id === g))];
}

/** La receta de un trago y el vaso en que sale. */
export function recetaDe<T extends { ticketTypeId: number; glass?: string | null }>(recetas: T[], ticketTypeId: number, glass?: string | null): { glass: string; lines: T[] } {
  const glasses = glassesDeProducto(recetas, ticketTypeId);
  const chosen = glass && glasses.includes(glass) ? glass : (glasses[0] ?? DEFAULT_GLASS);
  return { glass: chosen, lines: recetas.filter((r) => r.ticketTypeId === ticketTypeId && glassKey(r) === chosen) };
}

/** La receta de cada trago, una sola por trago. */
export function recetasPrincipales<T extends { ticketTypeId: number; glass?: string | null }>(recetas: T[]): T[] {
  return Array.from(new Set(recetas.map((r) => r.ticketTypeId))).flatMap((id) => recetaDe(recetas, id).lines);
}

/** El jigger de la barra: la medida con que se sirven los destilados (30 ml = 1 onza). */
export const JIGGER_ML = 30;

/** Las recetas se guardan siempre en ml; en la barra se piensan en jiggers (1,5 jigger = 45 ml). */
export const jiggersAMl = (jiggers: number): number => Math.round(jiggers * JIGGER_ML * 100) / 100;
export const mlAJiggers = (ml: number): number => Math.round((ml / JIGGER_ML) * 100) / 100;

/** ¿Esta cantidad en ml se lee bien en jiggers? (múltiplo de ¼ de jigger: 7,5 ml). */
export const esJiggerExacto = (ml: number): boolean => ml > 0 && Math.abs(ml / (JIGGER_ML / 4) - Math.round(ml / (JIGGER_ML / 4))) < 1e-6;

/** "1,5 jigger (45 ml)" para los ml que se miden en jiggers; "200 ml" para el resto. */
export function formatPorcion(amount: number, unit: InsumoUnit): string {
  if (unit === 'ml' && esJiggerExacto(amount)) {
    const j = mlAJiggers(amount);
    return `${j.toLocaleString('es-CL')} ${j === 1 ? 'jigger' : 'jiggers'} (${amount.toLocaleString('es-CL')} ml)`;
  }
  return `${amount.toLocaleString('es-CL')} ${unit}`;
}

/** Cuánto líquido suma una receta (solo insumos en ml) frente a la capacidad del vaso. */
export function mlDeReceta(lines: { insumoId: number; amount: number }[], unitOf: (insumoId: number) => InsumoUnit | undefined): number {
  return Math.round(lines.reduce((s, l) => s + (unitOf(l.insumoId) === 'ml' ? l.amount : 0), 0) * 100) / 100;
}

export type MovimientoKind = 'carga' | 'compra' | 'venta' | 'anulacion' | 'conteo_ajuste' | 'merma' | 'ajuste';

export const MOVIMIENTO_LABEL: Record<MovimientoKind, string> = {
  carga: 'Carga inicial',
  compra: 'Compra',
  venta: 'Venta',
  anulacion: 'Venta anulada',
  conteo_ajuste: 'Ajuste por conteo',
  merma: 'Merma',
  ajuste: 'Ajuste manual',
};

/** La botella abierta se cuenta porcionada en 10: 5/10 = a la mitad. */
export const OPEN_PORTIONS = 10;

/** Porciones de la botella abierta que se pueden marcar al contar (0/10 … 10/10). */
export const OPEN_FRACTIONS = Array.from({ length: OPEN_PORTIONS + 1 }, (_, k) => ({
  value: k / OPEN_PORTIONS,
  label: `${k}/${OPEN_PORTIONS}`,
}));

/** Tamaños de botella de siempre para los destilados: 750 ml, 1 L y 1,5 L. */
export const COMMON_BOTTLE_SIZES = [750, 1000, 1500] as const;

/** Tamaños de envase de un insumo, de menor a mayor (el de compra siempre está). */
export function insumoSizes(i: Pick<Insumo, 'containerSize' | 'sizes'>): number[] {
  const all = new Set<number>([...(i.sizes ?? []), i.containerSize].filter((s) => Number.isFinite(s) && s > 0));
  return Array.from(all).sort((a, b) => a - b);
}

/** "750 ml", "1 L", "1,5 L" -- como se dice en la barra. */
export function formatSize(size: number, unit: InsumoUnit): string {
  if (unit === 'ml' && size >= 1000) return `${(size / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} L`;
  if (unit === 'g' && size >= 1000) return `${(size / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} kg`;
  return `${size.toLocaleString('es-CL')} ${unit}`;
}

/** Botellas contadas: cerradas por tamaño y abiertas (cada una con su tamaño
 * y cuántas décimas le quedan, 0 a 10). */
export interface ConteoDetalle {
  closed: { size: number; count: number }[];
  open: { size: number; portions: number }[];
}

/** Total de un conteo con botellas de distintos tamaños. */
export function detalleATotal(d: ConteoDetalle): number {
  const closed = d.closed.reduce((s, c) => s + Math.max(0, Math.floor(c.count || 0)) * Math.max(0, c.size || 0), 0);
  const open = d.open.reduce((s, o) => s + (Math.min(OPEN_PORTIONS, Math.max(0, o.portions || 0)) / OPEN_PORTIONS) * Math.max(0, o.size || 0), 0);
  return round(closed + open);
}

/** "2 × 750 ml, 1 × 1,5 L" para la nota de una compra o carga. */
export function describirBotellas(items: { size: number; count: number }[], unit: InsumoUnit): string {
  return items.filter((i) => i.count > 0).map((i) => `${i.count} × ${formatSize(i.size, unit)}`).join(', ');
}

/** Descuadre del conteo de cierre por sobre este % de lo esperado: se avisa. */
export const DESCUADRE_PCT = 10;
/** Umbrales de aviso sobre el stock con que se abrió la noche. */
export const STOCK_PCT_STEPS = [25, 10] as const;
/** Ventana para medir el ritmo de consumo. */
export const RITMO_WINDOW_MIN = 60;

const round = (n: number) => Math.round(n * 100) / 100;

// --- Consumo y stock ---

/** Lo que gasta una venta, sumado por insumo (dos tragos con ron = un solo
 * movimiento de ron). `delta` va negativo: es lo que sale del stock. */
export function consumoDeVenta(
  items: { ticketTypeId: number; quantity: number }[],
  recetas: RecetaLinea[],
): { insumoId: number; delta: number }[] {
  const byInsumo = new Map<number, number>();
  for (const item of items) {
    for (const r of recetaDe(recetas, item.ticketTypeId).lines) {
      if (!(r.amount > 0)) continue;
      byInsumo.set(r.insumoId, (byInsumo.get(r.insumoId) ?? 0) + r.amount * item.quantity);
    }
  }
  return Array.from(byInsumo, ([insumoId, used]) => ({ insumoId, delta: -round(used) }));
}

/** Stock de cada insumo = suma de su libro de movimientos. */
export function stockActual(movimientos: { insumoId: number; delta: number | string }[]): Map<number, number> {
  const stock = new Map<number, number>();
  for (const m of movimientos) stock.set(m.insumoId, round((stock.get(m.insumoId) ?? 0) + Number(m.delta)));
  return stock;
}

/** Cuántos tragos más alcanzan de un producto: el insumo que se acaba primero
 * manda. `null` si el producto no tiene receta (se sigue usando su stock por
 * unidades de siempre). */
export function tragosDisponibles(
  receta: { insumoId: number; amount: number }[],
  stock: Map<number, number>,
): { drinks: number; limitingInsumoId: number } | null {
  let best: { drinks: number; limitingInsumoId: number } | null = null;
  for (const r of receta) {
    if (!(r.amount > 0)) continue;
    const drinks = Math.max(0, Math.floor((stock.get(r.insumoId) ?? 0) / r.amount + 1e-9));
    if (!best || drinks < best.drinks) best = { drinks, limitingInsumoId: r.insumoId };
  }
  return best;
}

/** Cuántos tragos "típicos" alcanzan de un insumo: stock dividido por lo que
 * gasta en promedio un trago que lo usa. `null` si ningún trago lo usa. */
export function tragosPorInsumo(insumoId: number, stockValue: number, recetas: RecetaLinea[]): number | null {
  const amounts = recetasPrincipales(recetas).filter((r) => r.insumoId === insumoId && r.amount > 0).map((r) => r.amount);
  if (amounts.length === 0) return null;
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  return Math.max(0, Math.floor(stockValue / avg + 1e-9));
}

// --- Conteo físico ---

/** Total contado = botellas cerradas × tamaño + la abierta (fracción) + suelto. */
export function conteoATotal(closedContainers: number, openFraction: number, containerSize: number, loose = 0): number {
  const closed = Math.max(0, Math.floor(closedContainers || 0));
  const fraction = Math.min(1, Math.max(0, openFraction || 0));
  return round(closed * containerSize + fraction * containerSize + Math.max(0, loose || 0));
}

/** Diferencia entre lo que el sistema esperaba y lo contado. Negativo = falta. */
export function descuadre(expected: number, counted: number): { diff: number; pct: number } {
  const diff = round(counted - expected);
  const pct = expected > 0 ? round((diff / expected) * 100) : counted > 0 ? 100 : 0;
  return { diff, pct };
}

/** "3 botellas + 250 ml" (o "−120 ml" si quedó negativo). */
export function formatCantidad(amount: number, insumo: Pick<Insumo, 'unit' | 'containerSize' | 'containerLabel'>): string {
  const unit = insumo.unit === 'un' ? 'un' : insumo.unit;
  if (amount < 0) return `−${Math.round(-amount).toLocaleString('es-CL')} ${unit}`;
  const size = insumo.containerSize > 0 ? insumo.containerSize : 0;
  if (!size || size === 1) return `${Math.round(amount).toLocaleString('es-CL')} ${unit}`;
  const full = Math.floor(amount / size + 1e-9);
  const rest = Math.round(amount - full * size);
  const label = full === 1 ? insumo.containerLabel : pluralize(insumo.containerLabel);
  if (full === 0) return `${rest.toLocaleString('es-CL')} ${unit}`;
  return rest > 0 ? `${full} ${label} + ${rest.toLocaleString('es-CL')} ${unit}` : `${full} ${label}`;
}

function pluralize(word: string): string {
  if (!word) return word;
  if (/[aeiouáéó]$/i.test(word)) return `${word}s`;
  return `${word}es`;
}

/** Semáforo de un insumo según cuántos tragos alcanzan. */
export function nivelInsumo(drinks: number | null, alertDrinks: number): 'agotado' | 'bajo' | 'ok' | 'sin_uso' {
  if (drinks === null) return 'sin_uso';
  if (drinks <= 0) return 'agotado';
  if (alertDrinks > 0 && drinks < alertDrinks) return 'bajo';
  return 'ok';
}

// --- Proyección de compra ---

export const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface ProyeccionInput {
  /** Fiestas anteriores: cuánta gente fue y cuánto se vendió de cada trago (por nombre,
   * porque cada fiesta tiene sus propios ids de productos). */
  historico: { personas: number; ventas: { name: string; quantity: number }[] }[];
  /** Tragos de la carta de esta fiesta, con su receta. */
  productos: { id: number; name: string; receta: { insumoId: number; amount: number }[] }[];
  insumos: Insumo[];
  stock: Map<number, number>;
  personasObjetivo: number;
  /** Multiplicador sobre lo histórico (1 = igual, 1.2 = 20 % más de margen). */
  factor?: number;
  /** Tragos por persona a mano; si no viene, se saca del histórico. */
  tragosPorPersona?: number | null;
  /** Cantidad esperada a mano para algún trago (gana sobre el mix histórico). */
  overrides?: Record<number, number>;
}

export interface ProyeccionProducto { id: number; name: string; quantity: number; share: number; fromHistory: boolean; /** Cantidad fijada a mano. */ manual: boolean }
export interface ProyeccionInsumo {
  insumoId: number;
  name: string;
  need: number;
  stock: number;
  missing: number;
  containersToBuy: number;
  cost: number | null;
}

export interface Proyeccion {
  tragosPorPersona: number;
  personasHistoricas: number;
  totalTragos: number;
  productos: ProyeccionProducto[];
  insumos: ProyeccionInsumo[];
  costoTotal: number;
  /** Tragos de la carta que nunca se vendieron antes (no entran en el mix). */
  sinHistorial: string[];
}

/** Lista de compras: tragos por persona y mix de las fiestas anteriores,
 * escalados a `personasObjetivo` → necesidad por insumo → lo que falta. */
export function proyeccionCompra(input: ProyeccionInput): Proyeccion {
  const factor = input.factor && input.factor > 0 ? input.factor : 1;
  const personasHistoricas = input.historico.reduce((s, h) => s + Math.max(0, h.personas), 0);
  const productNames = new Map(input.productos.map((p) => [normalizeName(p.name), p.id]));

  // Solo cuentan las ventas de tragos que existen en esta carta: el mix es de ESTA carta.
  const soldByProduct = new Map<number, number>();
  let soldTotal = 0;
  let soldAll = 0;
  for (const h of input.historico) {
    for (const v of h.ventas) {
      soldAll += v.quantity;
      const id = productNames.get(normalizeName(v.name));
      if (id === undefined) continue;
      soldByProduct.set(id, (soldByProduct.get(id) ?? 0) + v.quantity);
      soldTotal += v.quantity;
    }
  }

  const historicPerPerson = personasHistoricas > 0 ? soldAll / personasHistoricas : 0;
  const tragosPorPersona = input.tragosPorPersona != null && input.tragosPorPersona >= 0 ? input.tragosPorPersona : historicPerPerson;
  const overrides = input.overrides ?? {};
  const overrideTotal = Object.values(overrides).reduce((s, n) => s + Math.max(0, n), 0);
  const totalPorRitmo = Math.max(0, Math.round(tragosPorPersona * input.personasObjetivo * factor));
  // Lo que no está fijado a mano se reparte según el mix histórico; sin
  // historial de esos tragos, en partes iguales entre los que no tienen cantidad fija.
  const toDistribute = Math.max(0, totalPorRitmo - overrideTotal);
  const free = input.productos.filter((p) => overrides[p.id] === undefined);
  const freeSold = free.reduce((s, p) => s + (soldByProduct.get(p.id) ?? 0), 0);

  const productos: ProyeccionProducto[] = input.productos.map((p) => {
    if (overrides[p.id] !== undefined) {
      const q = Math.max(0, Math.round(overrides[p.id]));
      return { id: p.id, name: p.name, quantity: q, share: 0, fromHistory: false, manual: true };
    }
    const sold = soldByProduct.get(p.id) ?? 0;
    const share = freeSold > 0 ? sold / freeSold : free.length > 0 ? 1 / free.length : 0;
    return { id: p.id, name: p.name, quantity: Math.round(toDistribute * share), share, fromHistory: sold > 0, manual: false };
  });
  // El total es lo que realmente suman los tragos (si fijaste cantidades a mano, manda lo que fijaste).
  const totalTragos = productos.reduce((s, p) => s + p.quantity, 0);
  for (const p of productos) p.share = totalTragos > 0 ? p.quantity / totalTragos : 0;

  const need = new Map<number, number>();
  for (const p of productos) {
    const receta = input.productos.find((x) => x.id === p.id)?.receta ?? [];
    for (const r of receta) need.set(r.insumoId, (need.get(r.insumoId) ?? 0) + r.amount * p.quantity);
  }

  const insumos: ProyeccionInsumo[] = input.insumos
    .filter((i) => need.has(i.id))
    .map((i) => {
      const n = round(need.get(i.id) ?? 0);
      const s = round(input.stock.get(i.id) ?? 0);
      const missing = round(Math.max(0, n - s));
      const containersToBuy = i.containerSize > 0 ? Math.ceil(missing / i.containerSize - 1e-9) : 0;
      const cost = i.costPerContainer != null ? containersToBuy * Number(i.costPerContainer) : null;
      return { insumoId: i.id, name: i.name, need: n, stock: s, missing, containersToBuy, cost };
    })
    .sort((a, b) => b.containersToBuy - a.containersToBuy || a.name.localeCompare(b.name));

  return {
    tragosPorPersona: round(tragosPorPersona),
    personasHistoricas,
    totalTragos,
    productos: productos.sort((a, b) => b.quantity - a.quantity),
    insumos,
    costoTotal: insumos.reduce((s, i) => s + (i.cost ?? 0), 0),
    sinHistorial: input.productos.filter((p) => !soldByProduct.has(p.id)).map((p) => p.name),
  };
}

/** Lista de compras como texto para mandar por WhatsApp. */
export function listaComprasTexto(p: Proyeccion, insumos: Insumo[], personas: number): string {
  const byId = new Map(insumos.map((i) => [i.id, i]));
  const lines = p.insumos.filter((i) => i.containersToBuy > 0).map((i) => {
    const ins = byId.get(i.insumoId);
    const label = ins ? (i.containersToBuy === 1 ? ins.containerLabel : pluralize(ins.containerLabel)) : '';
    return `• ${i.name}: ${i.containersToBuy} ${label}`.trim();
  });
  if (lines.length === 0) return `Lista de compras para ${personas} personas: no falta nada 🎉`;
  return [`🛒 Lista de compras para ${personas} personas`, ...lines].join('\n');
}

// --- Alertas (las dispara server/caja/alerts.ts) ---

export type InsumoAlertDraft = { kind: string; severity: 'info' | 'warning' | 'critical'; title: string; body: string; dedupeKey: string };

/** Alertas al cambiar el stock de insumos (tras una venta): solo al CRUZAR un
 * umbral, para no repetir en cada trago.
 *  - agotado: llegó a 0;
 *  - alcanza para menos de `alertDrinks` tragos;
 *  - bajó del 25 % y del 10 % del stock con que se abrió la noche. */
export function insumoStockAlerts(
  changes: { insumo: Insumo; before: number; after: number; reference: number | null }[],
  recetas: RecetaLinea[],
  eventId: number,
): InsumoAlertDraft[] {
  const drafts: InsumoAlertDraft[] = [];
  for (const { insumo, before, after, reference } of changes) {
    if (after >= before) continue;
    const left = formatCantidad(after, insumo);
    if (after <= 0 && before > 0) {
      drafts.push({
        kind: 'insumo_out', severity: 'critical', dedupeKey: `insumo_out:${eventId}:${insumo.id}`,
        title: `Se acabó: ${insumo.name}`,
        body: 'Según las ventas ya no queda. Revisa la barra o carga una compra si hay más en bodega.',
      });
      continue;
    }
    const drinksBefore = tragosPorInsumo(insumo.id, before, recetas);
    const drinksAfter = tragosPorInsumo(insumo.id, after, recetas);
    if (insumo.alertDrinks > 0 && drinksBefore !== null && drinksAfter !== null && drinksAfter < insumo.alertDrinks && drinksBefore >= insumo.alertDrinks) {
      drafts.push({
        kind: 'insumo_low', severity: 'warning', dedupeKey: `insumo_low:${eventId}:${insumo.id}:${insumo.alertDrinks}`,
        title: `Queda poco: ${insumo.name}`,
        body: `Alcanza para ~${drinksAfter} tragos (${left}).`,
      });
    }
    if (reference && reference > 0) {
      for (const pct of STOCK_PCT_STEPS) {
        const limit = (reference * pct) / 100;
        if (after <= limit && before > limit) {
          drafts.push({
            kind: 'insumo_pct', severity: pct <= 10 ? 'critical' : 'warning', dedupeKey: `insumo_pct:${eventId}:${insumo.id}:${pct}`,
            title: `${insumo.name} bajo el ${pct} %`,
            body: `Queda ${left} de ${formatCantidad(reference, insumo)} con que se abrió la noche.`,
          });
        }
      }
    }
  }
  return drafts;
}

/** Al ritmo de la última hora, ¿se acaba antes del cierre? Un aviso por hora. */
export function insumoRitmoAlerts(
  rows: { insumo: Insumo; stock: number; usedLastWindow: number }[],
  minutesToClose: number,
  eventId: number,
  now: Date,
): InsumoAlertDraft[] {
  if (minutesToClose <= 0) return [];
  const bucket = Math.floor(now.getTime() / 3_600_000);
  const drafts: InsumoAlertDraft[] = [];
  for (const r of rows) {
    if (r.usedLastWindow <= 0 || r.stock <= 0) continue;
    const perMinute = r.usedLastWindow / RITMO_WINDOW_MIN;
    const minutesLeft = r.stock / perMinute;
    if (minutesLeft >= minutesToClose) continue;
    const at = new Date(now.getTime() + minutesLeft * 60_000);
    const hhmm = at.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
    drafts.push({
      kind: 'insumo_ritmo', severity: 'warning', dedupeKey: `insumo_ritmo:${eventId}:${r.insumo.id}:${bucket}`,
      title: `${r.insumo.name} no llega al cierre`,
      body: `Al ritmo de la última hora se acaba cerca de las ${hhmm} (quedan ${formatCantidad(r.stock, r.insumo)}).`,
    });
  }
  return drafts;
}

/** Conteo de cierre que no cuadra con lo vendido. Ignora diferencias menores
 * a un cuarto de envase (no se puede contar más fino que eso a ojo). */
export function descuadreAlerts(
  lines: { insumo: Insumo; expected: number; counted: number }[],
  conteoId: number,
  who: string,
  eventId: number,
): InsumoAlertDraft[] {
  const bad = lines
    .map((l) => ({ ...l, ...descuadre(l.expected, l.counted) }))
    .filter((l) => l.diff < 0 && Math.abs(l.pct) > DESCUADRE_PCT && Math.abs(l.diff) >= l.insumo.containerSize * 0.25);
  if (bad.length === 0) return [];
  const parts = bad.slice(0, 4).map((l) => `${l.insumo.name} faltan ${formatCantidad(-l.diff, l.insumo)} (${Math.round(Math.abs(l.pct))} %)`);
  return [{
    kind: 'insumo_descuadre', severity: 'critical', dedupeKey: `insumo_descuadre:${eventId}:${conteoId}`,
    title: `Descuadre en el conteo de barra (${bad.length})`,
    body: `${parts.join(' · ')}${bad.length > 4 ? '…' : ''} — conteo de ${who}.`,
  }];
}
