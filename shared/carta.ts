/* Carta de la fiesta (admin → Eventos → Carta): lógica pura de la lista de
 * productos -- filtros, orden, márgenes, ajuste de precios, reordenar y CSV.
 * Sin base de datos ni React, para poder testearla (shared/carta.test.ts).
 *
 * Un producto de la carta es una fila de `ticketTypes` con categoría
 * consumo/locker/merch/extra (ver el comentario de CartaManager). */

export interface CartaProduct {
  id: number;
  name: string;
  category: string;
  groupName?: string | null;
  emoji?: string | null;
  color?: string | null;
  price: number | string;
  costPrice?: number | string | null;
  totalStock: number | string;
  soldCount: number | string;
  sortOrder?: number | string | null;
  status?: string | null;
  toKitchen?: number | string | null;
  description?: string | null;
  internalCode?: string | null;
  /** Porciones que alcanzan según el stock de insumos (Stock de barra). Si viene, manda sobre el stock cargado a mano. */
  portions?: number | null;
  /** Qué insumo hace que se acabe o ya no alcance (viene de Stock de barra). */
  aviso?: AvisoInsumos | null;
  /** Trago de la carta sin receta ni marca de «se vende solo»: no puede calcular porciones por insumos. */
  sinReceta?: boolean;
}

export interface AvisoInsumos {
  estado: 'ok' | 'bajo' | 'agotado';
  limitante: { insumoId: number; name: string; drinks: number; sinComprar: boolean };
  faltantes: { insumoId: number; name: string; sinComprar: boolean }[];
  bajos: { insumoId: number; name: string; drinks: number }[];
  /** Con qué reemplazar el insumo que falta (otro de la misma categoría, con stock). */
  sugerencias: { insumoId: number; name: string; drinks: number }[];
}

const listar = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);

/** «Falta Ginger ale (sin comprar)», «Se acaba Gin Beefeater» o «Limita Gin Beefeater»: qué insumo manda en un trago. */
export function textoAviso(a: AvisoInsumos): string {
  if (a.estado === 'agotado') {
    const f = a.faltantes.length ? a.faltantes : [{ ...a.limitante }];
    const nombres = f.map((x) => (x.sinComprar ? `${x.name} (sin comprar)` : x.name));
    return `${f.length === 1 ? 'Falta' : 'Faltan'} ${listar(nombres)}`;
  }
  if (a.estado === 'bajo') return `Se acaba ${listar(a.bajos.map((b) => b.name))}`;
  return `Limita ${a.limitante.name}`;
}

export const NO_SECTION = 'Sin sección';
/** Con tan pocas porciones o menos, el producto se marca "poco stock". */
export const LOW_STOCK_THRESHOLD = 5;
/** Margen (sobre el precio) por debajo del cual se avisa. */
export const LOW_MARGIN_PCT = 30;

const num = (v: unknown) => Number(v ?? 0);

/** Porciones que quedan: las del stock de insumos si el producto tiene receta; si no, el stock cargado menos lo
 * vendido (puede ser negativo: la caja nunca impide vender). */
export function remaining(p: Pick<CartaProduct, 'totalStock' | 'soldCount'> & { portions?: number | null }): number {
  if (p.portions != null && Number.isFinite(p.portions)) return p.portions;
  return num(p.totalStock) - num(p.soldCount);
}

export type StockLevel = 'agotado' | 'sin_stock' | 'bajo' | 'ok';

export function stockLevel(p: Pick<CartaProduct, 'totalStock' | 'soldCount' | 'status'> & { portions?: number | null }): StockLevel {
  if (p.status === 'soldout') return 'agotado';
  const left = remaining(p);
  if (left <= 0) return 'sin_stock';
  if (left <= LOW_STOCK_THRESHOLD) return 'bajo';
  return 'ok';
}

/** Margen en pesos y en % del precio. `null` si no hay costo cargado (sin
 * costo no hay margen) o el precio no es válido. */
export function marginOf(price: number | string, cost: number | string | null | undefined): { amount: number; pct: number } | null {
  const p = num(price);
  if (cost == null || cost === '' || num(cost) <= 0 || p <= 0) return null;
  const amount = p - num(cost);
  return { amount, pct: Math.round((amount / p) * 100) };
}

export type MarginTone = 'negative' | 'low' | 'ok';

export function marginTone(m: { amount: number; pct: number }): MarginTone {
  if (m.amount < 0) return 'negative';
  return m.pct < LOW_MARGIN_PCT ? 'low' : 'ok';
}

/* --- Filtros, búsqueda y orden --------------------------------------------- */

export type CartaFilter = 'todos' | 'agotados' | 'poco_stock' | 'sin_costo' | 'margen_bajo' | 'cocina';

export function matchesFilter(p: CartaProduct, filter: CartaFilter): boolean {
  switch (filter) {
    case 'todos': return true;
    case 'agotados': return p.status === 'soldout';
    case 'poco_stock': { const l = stockLevel(p); return l === 'bajo' || l === 'sin_stock'; }
    case 'sin_costo': return marginOf(p.price, p.costPrice) == null;
    case 'margen_bajo': { const m = marginOf(p.price, p.costPrice); return !!m && marginTone(m) !== 'ok'; }
    case 'cocina': return num(p.toKitchen) === 1;
  }
}

/** Texto sin tildes ni mayúsculas, para buscar "pisco" y encontrar "Písco". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filterCarta(products: CartaProduct[], opts: { query: string; filter: CartaFilter }): CartaProduct[] {
  const q = normalizeText(opts.query);
  return products.filter((p) => {
    if (!matchesFilter(p, opts.filter)) return false;
    if (!q) return true;
    return normalizeText(`${p.name} ${p.groupName ?? ''}`).includes(q);
  });
}

export type CartaSort = 'orden' | 'nombre' | 'precio_desc' | 'precio_asc' | 'stock' | 'margen';

const byOrder = (a: CartaProduct, b: CartaProduct) => num(a.sortOrder) - num(b.sortOrder) || a.name.localeCompare(b.name);

export function sortCarta(products: CartaProduct[], sort: CartaSort): CartaProduct[] {
  const list = [...products];
  switch (sort) {
    case 'orden': return list.sort(byOrder);
    case 'nombre': return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'precio_desc': return list.sort((a, b) => num(b.price) - num(a.price) || byOrder(a, b));
    case 'precio_asc': return list.sort((a, b) => num(a.price) - num(b.price) || byOrder(a, b));
    // Menos porciones primero: lo que hay que reponer antes.
    case 'stock': return list.sort((a, b) => remaining(a) - remaining(b) || byOrder(a, b));
    // Menor margen primero (los sin costo al final).
    case 'margen': return list.sort((a, b) => {
      const ma = marginOf(a.price, a.costPrice)?.pct ?? Infinity;
      const mb = marginOf(b.price, b.costPrice)?.pct ?? Infinity;
      return ma - mb || byOrder(a, b);
    });
  }
}

/** Resumen de la franja de arriba. `margenPromedioPct` solo cuenta los que
 * tienen costo cargado. */
export function summarizeCarta(products: CartaProduct[]) {
  let agotados = 0, pocoStock = 0, sinCosto = 0, margenBajo = 0, marginSum = 0, marginCount = 0;
  for (const p of products) {
    if (p.status === 'soldout') agotados++;
    const l = stockLevel(p);
    if (l === 'bajo' || l === 'sin_stock') pocoStock++;
    const m = marginOf(p.price, p.costPrice);
    if (!m) sinCosto++;
    else {
      marginSum += m.pct; marginCount++;
      if (marginTone(m) !== 'ok') margenBajo++;
    }
  }
  return {
    total: products.length, agotados, pocoStock, sinCosto, margenBajo,
    margenPromedioPct: marginCount > 0 ? Math.round(marginSum / marginCount) : null,
  };
}

/** Secciones en el orden en que aparecen (por el orden de su primer
 * producto); "Sin sección" siempre al final. */
export function groupBySection(products: CartaProduct[]): { name: string; items: CartaProduct[] }[] {
  const groups = new Map<string, CartaProduct[]>();
  for (const p of products) {
    const key = p.groupName?.trim() || NO_SECTION;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  const first = (items: CartaProduct[]) => Math.min(...items.map((i) => num(i.sortOrder)));
  return Array.from(groups, ([name, items]) => ({ name, items }))
    .sort((a, b) => (a.name === NO_SECTION ? 1 : b.name === NO_SECTION ? -1 : first(a.items) - first(b.items) || a.name.localeCompare(b.name)));
}

/** Nombres de sección ya usados (sin "Sin sección"), para elegir de una lista
 * en vez de tipearla (un error de tipeo creaba una sección repetida). */
export function sectionNames(products: CartaProduct[]): string[] {
  return Array.from(new Set(products.map((p) => p.groupName?.trim()).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b));
}

/* --- Ajuste de precios en bloque ------------------------------------------ */

export interface PriceAdjustment {
  mode: 'percent' | 'amount';
  /** Cuánto: % o pesos (siempre positivo; la dirección va aparte). */
  value: number;
  direction: 'up' | 'down';
  /** Redondea al múltiplo más cercano (ej. 100); 0 = sin redondear. */
  roundTo: number;
}

/** Precio nuevo (entero, mínimo $1). */
export function adjustPrice(price: number | string, adj: PriceAdjustment): number {
  const base = num(price);
  const delta = adj.mode === 'percent' ? (base * adj.value) / 100 : adj.value;
  let next = adj.direction === 'up' ? base + delta : base - delta;
  if (adj.roundTo > 0) next = Math.round(next / adj.roundTo) * adj.roundTo;
  return Math.max(1, Math.round(next));
}

/* --- Reordenar ------------------------------------------------------------- */

/** Mueve un producto una posición hacia arriba/abajo dentro de su sección y
 * devuelve los `sortOrder` a guardar (renumerados de 10 en 10 para que
 * quede espacio). `items` = los productos de ESA sección. Lista vacía si no
 * se puede mover (ya está en el borde). */
export function moveInSection(items: CartaProduct[], id: number, dir: 'up' | 'down'): { id: number; sortOrder: number }[] {
  const sorted = [...items].sort(byOrder);
  const i = sorted.findIndex((p) => p.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sorted.length) return [];
  const before = new Map(sorted.map((p) => [p.id, num(p.sortOrder)]));
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  return sorted
    .map((p, idx) => ({ id: p.id, sortOrder: (idx + 1) * 10 }))
    .filter((u) => before.get(u.id) !== u.sortOrder);
}

/* --- CSV (exportar / importar) --------------------------------------------- */

export const CARTA_CSV_HEADERS = ['id', 'nombre', 'categoria', 'seccion', 'precio', 'costo', 'stock', 'orden', 'emoji', 'color', 'cocina', 'estado', 'ingredientes', 'codigo_interno'] as const;

const CATEGORIES = ['consumo', 'locker', 'merch', 'extra'] as const;
const STATUSES = ['active', 'soldout', 'hidden'] as const;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function cartaToCsv(products: CartaProduct[]): string {
  const rows = products.map((p) => [
    p.id, p.name, p.category, p.groupName ?? '', num(p.price), p.costPrice != null ? num(p.costPrice) : '', num(p.totalStock),
    num(p.sortOrder), p.emoji ?? '', p.color ?? '', num(p.toKitchen) === 1 ? 'si' : 'no', p.status ?? 'active', p.description ?? '', p.internalCode ?? '',
  ]);
  return [CARTA_CSV_HEADERS.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}

/** Parte un CSV en filas de celdas (comillas, saltos de línea dentro de
 * comillas, `,` o `;` como separador -- Excel en español usa `;`). */
export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** "$8.000", "8000" o "8 000" -> 8000; `null` si no hay dígitos. */
export function parseClp(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

export interface CartaImportData {
  name: string;
  category: string;
  groupName?: string;
  price: number;
  costPrice?: number;
  totalStock?: number;
  sortOrder?: number;
  emoji?: string;
  color?: string;
  toKitchen?: number;
  status?: string;
  description?: string;
  internalCode?: string;
}

export interface CartaImportPlan {
  updates: { id: number; name: string; data: Partial<CartaImportData> }[];
  creates: CartaImportData[];
  errors: string[];
  unchanged: number;
}

/** Convierte el CSV en un plan: qué productos se actualizan (fila con `id`
 * que existe en `existing`, solo los campos que cambiaron), cuáles se crean
 * (fila sin `id`) y qué filas tienen error. No toca nada. */
export function planCartaImport(text: string, existing: CartaProduct[], defaultCategory: string): CartaImportPlan {
  const plan: CartaImportPlan = { updates: [], creates: [], errors: [], unchanged: 0 };
  const rows = parseCsvRows(text);
  if (rows.length === 0) { plan.errors.push('El archivo está vacío.'); return plan; }
  const header = rows[0].map((h) => normalizeText(h).replace(/\s+/g, '_'));
  if (!header.includes('nombre') || !header.includes('precio')) {
    plan.errors.push('Faltan las columnas "nombre" y "precio" (usa el archivo que se descarga con Exportar).');
    return plan;
  }
  const col = (r: string[], name: string) => { const i = header.indexOf(name); return i >= 0 ? (r[i] ?? '').trim() : ''; };
  const byId = new Map(existing.map((p) => [p.id, p]));

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const name = col(r, 'nombre');
    if (!name) { plan.errors.push(`Fila ${line}: falta el nombre.`); return; }
    const price = parseClp(col(r, 'precio'));
    if (price == null || price <= 0) { plan.errors.push(`Fila ${line} (${name}): el precio tiene que ser mayor a 0.`); return; }
    const category = normalizeText(col(r, 'categoria')) || defaultCategory;
    if (!(CATEGORIES as readonly string[]).includes(category)) { plan.errors.push(`Fila ${line} (${name}): categoría "${category}" no válida (${CATEGORIES.join(', ')}).`); return; }
    const estado = col(r, 'estado').toLowerCase();
    if (estado && !(STATUSES as readonly string[]).includes(estado)) { plan.errors.push(`Fila ${line} (${name}): estado "${estado}" no válido (${STATUSES.join(', ')}).`); return; }

    const data: CartaImportData = { name, category, price };
    const seccion = col(r, 'seccion'); if (seccion) data.groupName = seccion;
    const costo = parseClp(col(r, 'costo')); if (costo != null && costo > 0) data.costPrice = costo;
    const stock = parseClp(col(r, 'stock')); if (stock != null) data.totalStock = stock;
    const orden = col(r, 'orden'); if (orden !== '' && !Number.isNaN(Number(orden))) data.sortOrder = Number(orden);
    const emoji = col(r, 'emoji'); if (emoji) data.emoji = emoji.slice(0, 4);
    const color = col(r, 'color'); if (/^#[0-9a-fA-F]{6}$/.test(color)) data.color = color;
    const cocina = normalizeText(col(r, 'cocina')); if (cocina) data.toKitchen = ['si', '1', 'true', 'x'].includes(cocina) ? 1 : 0;
    if (estado) data.status = estado;
    const ingredientes = col(r, 'ingredientes'); if (ingredientes) data.description = ingredientes;
    const codigo = col(r, 'codigo_interno'); if (codigo) data.internalCode = codigo.toUpperCase().slice(0, 10);

    const idRaw = col(r, 'id');
    if (!idRaw) { plan.creates.push(data); return; }
    const prev = byId.get(Number(idRaw));
    if (!prev) { plan.errors.push(`Fila ${line} (${name}): el id ${idRaw} no existe en este evento (borra el id para crearlo como producto nuevo).`); return; }

    const current: Record<string, unknown> = {
      name: prev.name, category: prev.category, groupName: prev.groupName?.trim() || undefined, price: num(prev.price),
      costPrice: prev.costPrice != null && num(prev.costPrice) > 0 ? num(prev.costPrice) : undefined, totalStock: num(prev.totalStock),
      sortOrder: num(prev.sortOrder), emoji: prev.emoji || undefined, color: prev.color || undefined, toKitchen: num(prev.toKitchen),
      status: prev.status || 'active', description: prev.description || undefined, internalCode: prev.internalCode || undefined,
    };
    const changed: Partial<CartaImportData> = {};
    for (const [k, v] of Object.entries(data)) {
      if (current[k] !== v) (changed as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(changed).length === 0) plan.unchanged++;
    else plan.updates.push({ id: prev.id, name: prev.name, data: changed });
  });
  return plan;
}
