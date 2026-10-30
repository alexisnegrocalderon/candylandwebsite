/* Devolución de una compra web (server/orderRefund.ts): las reglas puras de la
 * política de reembolso (client/src/pages/RefundPolicy.tsx) -- porcentaje
 * estándar, plazo y cuánto se devuelve / se retiene. */

/** Porcentaje estándar de devolución del valor pagado. */
export const DEFAULT_REFUND_PERCENT = 50;
/** Días antes del evento hasta los que se aceptan devoluciones. */
export const REFUND_DEADLINE_DAYS = 5;

/** `true` si ya no se alcanza a devolver según la política (faltan menos de
 * `REFUND_DEADLINE_DAYS` días, o el evento ya pasó). */
export function isPastRefundDeadline(eventDate: Date | string, now: Date = new Date()): boolean {
  const msLeft = new Date(eventDate).getTime() - now.getTime();
  return msLeft < REFUND_DEADLINE_DAYS * 24 * 3_600_000;
}

/** Monto a devolver para un porcentaje del total pagado, en pesos enteros. */
export function refundAmountForPercent(paid: number, percent: number): number {
  const pct = Math.min(100, Math.max(0, percent));
  return Math.round((paid * pct) / 100);
}

/** Porcentaje equivalente a un monto (para guardar junto al monto corregido a
 * mano). Dos decimales, como la columna `refundPercent`. */
export function refundPercentForAmount(paid: number, amount: number): number {
  if (paid <= 0) return 0;
  return Math.round((amount / paid) * 10_000) / 100;
}

/** Lo que se queda el negocio: es lo único que cuenta como ingreso. */
export function retainedAmount(paid: number, refundAmount: number): number {
  return Math.max(0, paid - refundAmount);
}

/* ─── Devolución de EXTRAS (tragos, estacionamiento…) de una compra ───────────
 * Se devuelven solos, sin tocar el acceso: por eso no aplican el 50% del acceso
 * ni el plazo (el dueño decide, por defecto el monto completo). */

export interface ExtraTicketRow {
  id: number;
  status: string;
  displayCode: string | null;
  /** Lo que se pagó por UNA unidad de este extra (orderItems.unitPrice). */
  unitPrice: number;
}

export type ExtrasRefundPlan =
  | { ok: true; ticketIds: number[]; computed: number; amount: number; percent: number; newRefundTotal: number }
  | { ok: false; error: string };

/** Valida y calcula una devolución de extras. Pura: no toca la base. */
export function planExtrasRefund(input: {
  paid: number;
  alreadyRefunded: number;
  tickets: ExtraTicketRow[];
  selectedIds: number[];
  /** Monto corregido a mano; si falta, se devuelve el valor completo de lo elegido. */
  amount?: number;
}): ExtrasRefundPlan {
  const ids = Array.from(new Set(input.selectedIds));
  if (ids.length === 0) return { ok: false, error: 'Elige al menos un extra para devolver.' };
  const byId = new Map(input.tickets.map((t) => [t.id, t]));
  const chosen: ExtraTicketRow[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t || !t.displayCode) return { ok: false, error: 'Ese ticket no es un extra de esta compra.' };
    if (t.status === 'used') return { ok: false, error: `El extra ${t.displayCode} ya se canjeó; no se puede devolver.` };
    if (t.status !== 'valid') return { ok: false, error: `El extra ${t.displayCode} ya estaba anulado.` };
    chosen.push(t);
  }
  const computed = chosen.reduce((sum, t) => sum + Math.max(0, Math.round(t.unitPrice)), 0);
  const amount = input.amount != null ? Math.round(input.amount) : computed;
  if (!(amount > 0)) return { ok: false, error: 'El monto a devolver debe ser mayor a $0.' };
  const room = Math.max(0, input.paid - input.alreadyRefunded);
  if (amount > room) return { ok: false, error: `No puedes devolver más de lo que queda por devolver de esta compra (${room}).` };
  const newRefundTotal = input.alreadyRefunded + amount;
  return { ok: true, ticketIds: ids, computed, amount, percent: refundPercentForAmount(input.paid, newRefundTotal), newRefundTotal };
}
