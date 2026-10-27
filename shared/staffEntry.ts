/* La entrada «Staff» y el botón «Llegué» (docs/ARQUITECTURA-CAJA.md §17b): quien trabaja en la fiesta, y el
 * administrador, tienen una entrada oficial gratis que queda en «Mis entradas»; al llegar la marcan desde su propia
 * app y quedan adentro, contados, con Playmatch abierto y, si vienen en auto, con su estacionamiento sin cobro.
 * Lo puro (nombres, claves e idempotencia, ventana de llegada) vive acá para poder probarlo. */

export const STAFF_TICKET_TYPE_NAME = 'Staff';
/** `orders.paymentMethod` de las entradas y estacionamientos del staff (el reporte de estacionamiento los cuenta como «staff»). */
export const STAFF_PAYMENT_METHOD = 'Manual: Staff';
export const staffEntryPaymentId = (eventId: number, staffId: number) => `STAFF-ENTRY-${eventId}-${staffId}`;
export const staffParkingPaymentId = (eventId: number, staffId: number) => `STAFF-PARKING-${eventId}-${staffId}`;

/** Desde cuánto antes de la apertura se puede marcar la llegada (el staff llega antes que el público). */
export const ARRIVAL_OPENS_BEFORE_MS = 3 * 3_600_000;
/** Cuánto tiempo hay para deshacer un «Llegué» marcado por error. */
export const UNDO_WINDOW_MS = 10 * 60_000;

export type ArrivalPhase = 'antes' | 'abierto' | 'cerrado';

/** La ventana para marcar llegada: abre 3 horas antes de la apertura y cierra al terminar la fiesta
 * (o 12 horas después de la hora de inicio si no hay hora de término). */
export function arrivalWindow(
  ev: { eventDate: Date | string; doorsOpen?: Date | string | null; eventEnd?: Date | string | null },
  now: Date = new Date(),
): { phase: ArrivalPhase; opensAt: Date; closesAt: Date } {
  const start = new Date(ev.eventDate).getTime();
  const doors = ev.doorsOpen ? new Date(ev.doorsOpen).getTime() : start;
  const opensAt = new Date(doors - ARRIVAL_OPENS_BEFORE_MS);
  const closesAt = new Date(ev.eventEnd ? new Date(ev.eventEnd).getTime() : start + 12 * 3_600_000);
  const t = now.getTime();
  return { phase: t < opensAt.getTime() ? 'antes' : t > closesAt.getTime() ? 'cerrado' : 'abierto', opensAt, closesAt };
}

/** ¿Se puede deshacer el «Llegué»? Solo unos minutos después de marcarlo. */
export function canUndoArrival(arrivedAtIso: string | null | undefined, now: Date = new Date()): boolean {
  if (!arrivedAtIso) return false;
  const at = new Date(arrivedAtIso).getTime();
  return Number.isFinite(at) && now.getTime() - at <= UNDO_WINDOW_MS;
}

/** ¿Es una entrada del staff (por cómo se pagó)? */
export const isStaffEntryOrder = (paymentMethod: string | null | undefined) => paymentMethod === STAFF_PAYMENT_METHOD;
