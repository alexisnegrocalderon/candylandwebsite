/* «Mis movimientos»: la línea de tiempo de todo lo que una persona hizo y gastó (compras, saldo, Playcoins,
 * canjes e ingreso, guardarropía y cocina). Esto es lo puro: las etiquetas que ve el cliente, cómo se mezclan
 * las fuentes, el filtro y el cursor de paginación. La lectura de la base está en server/memberHistory.ts.
 *
 * Privacidad: las filas se arman SOLO con campos pensados para el cliente. Nunca entran costos, ids de
 * operadores, el id de pago ni las notas internas de los ajustes (las notas se reemplazan por una etiqueta fija). */

export type HistoryKind = 'compra' | 'saldo' | 'playcoins' | 'canje' | 'ingreso' | 'guardarropia' | 'cocina';
export type HistoryFilter = 'todo' | 'compras' | 'saldo' | 'playcoins' | 'canjes';
export const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'compras', label: 'Compras' },
  { key: 'saldo', label: 'Saldo' },
  { key: 'playcoins', label: 'Playcoins' },
  { key: 'canjes', label: 'Canjes' },
];

export interface HistoryItem {
  id: string;
  kind: HistoryKind;
  /** Además del suyo, en qué otros filtros aparece (un cobro con saldo es «Saldo» y también «Compras»). */
  alsoIn?: HistoryKind[];
  at: string;
  title: string;
  detail?: string | null;
  amount?: number | null;
  unit?: 'clp' | 'pc' | null;
  balanceAfter?: number | null;
  orderNumber?: string | null;
  eventTitle?: string | null;
  /** Para pintar el estado: 'reembolsada', 'anulada'… */
  status?: string | null;
}

export const HISTORY_PAGE_SIZE = 30;

const KINDS_BY_FILTER: Record<HistoryFilter, readonly HistoryKind[] | null> = {
  todo: null,
  compras: ['compra'],
  saldo: ['saldo'],
  playcoins: ['playcoins'],
  canjes: ['canje', 'ingreso', 'guardarropia', 'cocina'],
};

export function matchesFilter(item: Pick<HistoryItem, 'kind' | 'alsoIn'>, filter: HistoryFilter): boolean {
  const kinds = KINDS_BY_FILTER[filter];
  if (!kinds) return true;
  return kinds.includes(item.kind) || (item.alsoIn ?? []).some((k) => kinds.includes(k));
}

/* ── Etiquetas ───────────────────────────────────────────────────────────── */

/** Qué fuentes hay que leer para llenar un filtro (las demás se saltan). */
export function sourcesFor(filter: HistoryFilter): { orders: boolean; prepaid: boolean; playcoins: boolean; uses: boolean; onSite: boolean } {
  return {
    orders: filter === 'todo' || filter === 'compras',
    prepaid: filter === 'todo' || filter === 'saldo' || filter === 'compras',
    playcoins: filter === 'todo' || filter === 'playcoins',
    uses: filter === 'todo' || filter === 'canjes',
    onSite: filter === 'todo' || filter === 'canjes',
  };
}

export function prepaidTitle(reason: string): string {
  switch (reason) {
    case 'topup_web': return 'Recargaste saldo';
    case 'spend_caja': return 'Pagaste con tu saldo';
    case 'spend_puerta': return 'Pagaste en la puerta';
    case 'refund': return 'Devolución a tu saldo';
    default: return 'Ajuste de tu saldo';
  }
}

export function playcoinsTitle(reason: string, delta: number): string {
  switch (reason) {
    case 'earn_web': return 'Ganaste Playcoins por tu compra';
    case 'earn_caja': return 'Ganaste Playcoins en caja';
    case 'redeem_caja': return 'Canjeaste Playcoins en caja';
    default: return delta >= 0 ? 'Playcoins de regalo' : 'Ajuste de tus Playcoins';
  }
}

/** «2× Dúo · 1× Estacionamiento» (los repetidos se suman). */
export function summarizeItems(items: readonly { name: string; quantity: number }[]): string {
  const total = new Map<string, number>();
  for (const i of items) {
    const name = i.name.trim();
    if (!name || !(i.quantity > 0)) continue;
    total.set(name, (total.get(name) ?? 0) + i.quantity);
  }
  return Array.from(total, ([name, q]) => `${q}× ${name}`).join(' · ');
}

/* ── Cursor y mezcla ─────────────────────────────────────────────────────── */

/** Cursor = «fecha|id» del último elemento entregado: con la fecha sola se perderían los que empatan. */
export function encodeCursor(item: Pick<HistoryItem, 'at' | 'id'>): string {
  return `${item.at}|${item.id}`;
}

export function decodeCursor(cursor: string | null | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  const i = cursor.indexOf('|');
  if (i <= 0) return null;
  const at = cursor.slice(0, i);
  return Number.isNaN(new Date(at).getTime()) ? null : { at, id: cursor.slice(i + 1) };
}

/** Más nuevo primero; ante empate, por id (descendente) para que el orden no cambie entre páginas. */
function newestFirst(a: HistoryItem, b: HistoryItem): number {
  const d = new Date(b.at).getTime() - new Date(a.at).getTime();
  return d !== 0 ? d : b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

/** Junta las fuentes, aplica el filtro y el cursor y devuelve una página. `next` es el cursor de la siguiente
 * (null si no hay más). */
export function mergeHistory(
  sources: readonly (readonly HistoryItem[])[],
  opts: { filter?: HistoryFilter; cursor?: string | null; limit?: number } = {},
): { items: HistoryItem[]; next: string | null } {
  const limit = Math.max(1, Math.min(100, opts.limit ?? HISTORY_PAGE_SIZE));
  const cursor = decodeCursor(opts.cursor);
  const seen = new Set<string>();
  const all = sources.flat()
    .filter((i) => matchesFilter(i, opts.filter ?? 'todo'))
    .filter((i) => !seen.has(i.id) && !!seen.add(i.id))
    .sort(newestFirst);
  const after = cursor
    ? all.filter((i) => newestFirst({ at: cursor.at, id: cursor.id } as HistoryItem, i) < 0)
    : all;
  const items = after.slice(0, limit);
  return { items, next: after.length > limit ? encodeCursor(items[items.length - 1]) : null };
}
