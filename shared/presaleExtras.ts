import { isAnyParkingTicketType } from './parking';

/** Eventos que venden por adelantado SOLO entrada y estacionamiento (ej. la colaboración con Dalmore): ningún
 * otro extra (tragos, piscolón, recargas de PlayCard) se ofrece ni se puede comprar por la web. Los accesos
 * y el estacionamiento (VIP incluido) siempre pasan. */
export function presaleAllows(
  event: { presaleParkingOnly?: number | boolean | null } | null | undefined,
  ticketType: { category?: string | null; name: string },
): boolean {
  if (!event?.presaleParkingOnly) return true;
  if (ticketType.category !== 'extra') return true;
  return isAnyParkingTicketType(ticketType.name);
}
