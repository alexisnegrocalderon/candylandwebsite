/* Páginas y evento inicial de Ventas Web / Ventas Caja
 * (client/src/pages/admin/Dashboard.tsx → OrdersView). Lo puro vive acá para
 * poder probarlo sin pantalla. */

export const ORDERS_PAGE_SIZE = 25;
/** En el modo "Sin pagar" (recordatorios) se pueden marcar varias a la vez:
 * una página más grande evita tener que ir marcando de a 25. */
export const ORDERS_REMINDERS_PAGE_SIZE = 100;

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

/** "Mostrando 26–50 de 143" → { from: 26, to: 50 }. Con 0 órdenes: 0–0. */
export function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (Math.max(1, page) - 1) * pageSize + 1;
  return { from: Math.min(from, total), to: Math.min(from + pageSize - 1, total) };
}

/** Cuántos de los `status` por contador; los que no vienen cuentan 0. */
export interface StatusCounts {
  approved: number;
  pending: number;
  rejected: number;
  refunded: number;
  total: number;
}

export function normalizeStatusCounts(rows: Array<{ status: string; count: number | string }>): StatusCounts {
  const out: StatusCounts = { approved: 0, pending: 0, rejected: 0, refunded: 0, total: 0 };
  for (const r of rows) {
    const n = Number(r.count) || 0;
    if (r.status === 'approved' || r.status === 'pending' || r.status === 'rejected' || r.status === 'refunded') out[r.status] += n;
    out.total += n;
  }
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** El próximo evento para abrir la lista ahí: el publicado (o agotado) más
 * cercano que no pasó hace más de un día. `undefined` = no hay (→ "Todos"). */
export function nextEventId(
  events: Array<{ id: number; status: string; eventDate: string | Date }>,
  now: Date = new Date(),
): number | undefined {
  const from = now.getTime() - DAY_MS;
  return events
    .filter((e) => (e.status === 'published' || e.status === 'soldout') && new Date(e.eventDate).getTime() >= from)
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())[0]?.id;
}
