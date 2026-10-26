/* Las tarjetas de la pestaña PlayCard, en el orden en que se deslizan: por cada fiesta vigente (la más próxima
 * primero) sus entradas, el estacionamiento, los extras con código y la guardarropía y cocina de caja; y al
 * final la PlayCard (saldo y Playcoins). Esto es lo puro; el dibujo está en client/src/components/site/PlayCardTab.tsx. */

export type WalletCardSpec =
  | { key: string; type: 'ticket'; eventId: number; ticketCode: string; kind: string }
  | { key: string; type: 'locker'; eventId: number; tagNumber: string }
  | { key: string; type: 'kitchen'; eventId: number; ticketNumber: string }
  | { key: string; type: 'playcard' };

export interface CardEvent {
  eventId: number;
  eventDate: string | Date;
  tickets: { ticketCode: string; kind?: string | null }[];
  lockers?: { tagNumber: string }[];
  kitchen?: { ticketNumber: string }[];
}

/** Dentro de una fiesta: accesos, estacionamiento, lo que se canjea (consumo, merch, extra) y la guardarropía. */
const KIND_ORDER = ['acceso', 'estacionamiento', 'consumo', 'merch', 'extra', 'guardarropia'];
const rank = (kind: string | null | undefined) => {
  const i = KIND_ORDER.indexOf(kind ?? 'acceso');
  return i === -1 ? KIND_ORDER.indexOf('extra') : i;
};

export function buildWalletCards(events: readonly CardEvent[] | null | undefined): WalletCardSpec[] {
  const out: WalletCardSpec[] = [];
  const sorted = [...(events ?? [])].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  for (const ev of sorted) {
    // `sort` es estable: entre tickets del mismo tipo se mantiene el orden en que vienen.
    for (const t of [...ev.tickets].sort((a, b) => rank(a.kind) - rank(b.kind))) {
      out.push({ key: `t-${t.ticketCode}`, type: 'ticket', eventId: ev.eventId, ticketCode: t.ticketCode, kind: t.kind ?? 'acceso' });
    }
    for (const l of ev.lockers ?? []) out.push({ key: `l-${ev.eventId}-${l.tagNumber}`, type: 'locker', eventId: ev.eventId, tagNumber: l.tagNumber });
    for (const k of ev.kitchen ?? []) out.push({ key: `k-${ev.eventId}-${k.ticketNumber}`, type: 'kitchen', eventId: ev.eventId, ticketNumber: k.ticketNumber });
  }
  out.push({ key: 'playcard', type: 'playcard' });
  return out;
}
