/* Los extras de un cliente en la ficha de /caja, agrupados por producto: «Trago · quedan 3 de 4» en una sola fila, con
 * un selector de cuántos cobrar, en vez de una fila (y un toque) por cada código. Cada unidad comprada sigue siendo un
 * código propio: cobrar 3 es canjear 3 códigos, cada uno con su operación idempotente (funciona sin señal igual que
 * antes). Lo puro vive acá; la pantalla, en client/src/pages/caja/ExtrasGroups.tsx. */

export interface CajaExtraItem { displayCode: string | null; status: string; typeName: string }

export interface CajaExtraGroup {
  key: string;
  name: string;
  items: CajaExtraItem[];
  /** Códigos que se pueden cobrar ahora, en orden. */
  validCodes: string[];
  used: number;
  cancelled: number;
}

/** Una fila por producto, en el orden en que aparecen. Los productos con el mismo nombre se juntan. */
export function groupCajaExtras(extras: CajaExtraItem[]): CajaExtraGroup[] {
  const byKey = new Map<string, CajaExtraGroup>();
  for (const e of extras) {
    const name = e.typeName.trim() || 'Extra';
    const key = name.toLowerCase();
    const g = byKey.get(key) ?? { key, name, items: [], validCodes: [], used: 0, cancelled: 0 };
    g.items.push(e);
    if (e.status === 'valid' && e.displayCode) g.validCodes.push(e.displayCode);
    else if (e.status === 'used') g.used += 1;
    else if (e.status === 'cancelled') g.cancelled += 1;
    byKey.set(key, g);
  }
  return Array.from(byKey.values());
}

/** La cantidad a cobrar, siempre entre 1 y lo que queda. */
export function clampQty(qty: number, max: number): number {
  if (max < 1) return 0;
  return Math.max(1, Math.min(max, Math.floor(Number.isFinite(qty) ? qty : 1)));
}

/** Los primeros `qty` códigos que se pueden cobrar. */
export function pickCodes(group: CajaExtraGroup, qty: number): string[] {
  return group.validCodes.slice(0, clampQty(qty, group.validCodes.length));
}

/** «quedan 3 de 4», «queda 1 de 4», «Todo canjeado»… */
export function groupSummary(g: CajaExtraGroup): string {
  const live = g.items.length - g.cancelled;
  if (live === 0) return 'Anulado';
  const left = g.validCodes.length;
  if (left === 0) return live > 1 ? `Todos canjeados (${live})` : 'Canjeado';
  if (live === 1) return 'Pendiente';
  return `${left === 1 ? 'queda 1' : `quedan ${left}`} de ${live}`;
}

/** Qué se anuncia tras cobrar: «1 Trago» o «3 × Trago». */
export function redeemLabel(name: string, qty: number): string {
  return qty === 1 ? `1 ${name}` : `${qty} × ${name}`;
}

/* --- Deshacer ------------------------------------------------------------- */

/** Cuánto tiempo se puede deshacer un canje, desde que se hizo. */
export const UNDO_WINDOW_MS = 60_000;
/** El servidor acepta un poco más (relojes de las tablets, el momento exacto del toque): nunca menos. */
export const UNDO_SERVER_GRACE_MS = 10_000;

/** Segundos que le quedan al «Deshacer» (0 = ya no se puede). */
export function undoSecondsLeft(redeemedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((UNDO_WINDOW_MS - (nowMs - redeemedAtMs)) / 1000));
}

/** ¿Cabe este deshacer en la ventana, según la hora de la tablet en el canje y en el deshacer? */
export function undoWithinWindow(redeemClientAtMs: number, undoClientAtMs: number): boolean {
  const gap = undoClientAtMs - redeemClientAtMs;
  return gap >= -UNDO_SERVER_GRACE_MS && gap <= UNDO_WINDOW_MS + UNDO_SERVER_GRACE_MS;
}
