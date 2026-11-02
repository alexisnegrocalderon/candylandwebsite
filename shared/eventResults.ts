/** Resultados de la noche: agregaciones puras (sin base de datos) para la pantalla «Resultados» de Cierre. */

/** Clave para juntar productos que son el mismo con otro nombre: sin mayúsculas, tildes ni espacios dobles
 * (FIREROOM = FireRoom = Fire Room → los dos primeros; el último conserva su espacio y queda aparte a propósito). */
export function productKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Dónde se vendió: una caja (`r:<id>`), la web, o una venta de caja sin caja asignada. */
export type SaleColumn = string;
export const WEB_COLUMN = 'web';
export const NO_REGISTER_COLUMN = 'none';
export const registerColumn = (id: number) => `r:${id}`;
export const columnOf = (o: { channel: string; registerId: number | null }): SaleColumn =>
  o.channel === 'web' ? WEB_COLUMN : o.registerId ? registerColumn(o.registerId) : NO_REGISTER_COLUMN;

export interface ResultLine { name: string; category: string; quantity: number; revenue: number; column: SaleColumn }
export interface ProductRow {
  key: string; name: string; category: string;
  /** Nombres distintos que se juntaron en esta fila (si es más de uno, hay un producto duplicado). */
  variants: string[];
  units: number; revenue: number; byColumn: Record<SaleColumn, number>;
}

export function buildProductRows(lines: ResultLine[]): ProductRow[] {
  const map = new Map<string, ProductRow>();
  for (const l of lines) {
    const key = productKey(l.name);
    const row = map.get(key) ?? { key, name: l.name, category: l.category, variants: [], units: 0, revenue: 0, byColumn: {} };
    if (!row.variants.includes(l.name)) row.variants.push(l.name);
    row.units += l.quantity;
    row.revenue += l.revenue;
    row.byColumn[l.column] = (row.byColumn[l.column] ?? 0) + l.quantity;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.units - a.units || b.revenue - a.revenue);
}

export interface WhoOrder {
  channel: string; registerId: number | null; operatorId: number | null;
  total: number; refundAmount: number | null; paymentStatus: string; paymentMethod: string | null;
}
export interface WhoRow { id: number | null; name: string; sales: number; total: number; voided: number; voidedTotal: number; byMethod: Record<string, number> }

/** Una anulación de caja queda `refunded` sin `refundAmount`: no suma plata, pero se cuenta aparte. */
const isVoid = (o: WhoOrder) => o.paymentStatus === 'refunded' && o.refundAmount == null;
const isIncome = (o: WhoOrder) => o.paymentStatus === 'approved' || (o.paymentStatus === 'refunded' && o.refundAmount != null);

export function buildWhoRows(
  orders: WhoOrder[], pick: 'register' | 'operator', names: Map<number, string>, fallbackName: string,
): WhoRow[] {
  const map = new Map<number | null, WhoRow>();
  for (const o of orders) {
    if (o.channel !== 'caja') continue;
    const id = pick === 'register' ? o.registerId : o.operatorId;
    const row = map.get(id) ?? { id, name: id == null ? fallbackName : (names.get(id) ?? `#${id}`), sales: 0, total: 0, voided: 0, voidedTotal: 0, byMethod: {} };
    if (isVoid(o)) { row.voided += 1; row.voidedTotal += o.total; }
    else if (isIncome(o)) {
      const amount = o.total - (o.refundAmount ?? 0);
      row.sales += 1; row.total += amount;
      const m = o.paymentMethod ?? 'sin medio';
      row.byMethod[m] = (row.byMethod[m] ?? 0) + amount;
    }
    map.set(id, row);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
