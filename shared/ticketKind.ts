import { isAnyParkingTicketType } from './parking';

/* Qué es cada código QR de una compra (para la app: PlayCard y «Mis entradas»).
 * Una misma compra trae el acceso y, a veces, extras con su propio QR
 * (estacionamiento, guardarropía, consumo…). Sin esto se veían como «dos
 * entradas iguales». */

export type TicketKind = 'acceso' | 'estacionamiento' | 'guardarropia' | 'consumo' | 'merch' | 'extra';

export const TICKET_KIND_META: Record<TicketKind, { emoji: string; short: string; label: string; where: string }> = {
  acceso: { emoji: '🎟️', short: 'Acceso', label: 'Acceso', where: 'Muéstralo en la puerta para entrar.' },
  estacionamiento: { emoji: '🚗', short: 'Auto', label: 'Estacionamiento', where: 'Muéstralo al entrar con el auto.' },
  guardarropia: { emoji: '🧥', short: 'Locker', label: 'Guardarropía', where: 'Muéstralo en la guardarropía.' },
  consumo: { emoji: '🍹', short: 'Consumo', label: 'Consumo', where: 'Muéstralo en la barra para canjearlo.' },
  merch: { emoji: '🛍️', short: 'Merch', label: 'Merch', where: 'Muéstralo en la caja para retirarlo.' },
  extra: { emoji: '✨', short: 'Extra', label: 'Extra', where: 'Muéstralo en la caja para canjearlo.' },
};

export function ticketKind(category: string | null | undefined, typeName: string | null | undefined): TicketKind {
  const name = typeName ?? '';
  if (isAnyParkingTicketType(name)) return 'estacionamiento';
  if (category === 'acceso' || !category) return 'acceso';
  if (category === 'locker') return 'guardarropia';
  if (category === 'consumo') return 'consumo';
  if (category === 'merch') return 'merch';
  return 'extra';
}

/** El nombre a mostrar: el del tipo para los accesos («Acceso Dúo») y el genérico para los extras. */
export function ticketKindLabel(kind: TicketKind, typeName: string | null | undefined): string {
  if (kind === 'acceso') return typeName?.trim() || TICKET_KIND_META.acceso.label;
  return TICKET_KIND_META[kind].label;
}

/** Accesos primero; los extras después, en el orden en que venían. */
export function sortByKind<T extends { kind: TicketKind }>(list: T[]): T[] {
  return [...list.filter((t) => t.kind === 'acceso'), ...list.filter((t) => t.kind !== 'acceso')];
}
