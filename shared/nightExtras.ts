import { formatChileTime } from './chileDate';
import { TICKET_KIND_META, type TicketKind } from './ticketKind';

/* «Mi noche»: lo que la persona tiene para esa fiesta además de su entrada (estacionamiento, consumos, merch,
 * guardarropía y cocina de caja), ordenado y agrupado para mostrarlo en una sola hoja de la App. Acá vive lo PURO
 * (agrupar, estados, qué está «vivo» ahora); las pantallas están en components/site/NightExtras.tsx. */

export interface NightTicket {
  ticketCode: string;
  status: string;
  kind?: TicketKind;
  typeName?: string;
  kindLabel?: string;
  displayCode?: string | null;
  usedAt?: string | Date | null;
  qrImageUrl?: string | null;
}
export interface NightLocker { tagNumber: string; status: string; receivedAt?: string | Date | null; retrievedAt?: string | Date | null }
export interface NightKitchen { ticketNumber: string; status: string; items: { name: string; quantity: number }[]; createdAt?: string | Date; deliveredAt?: string | Date | null }
export interface NightEvent { eventId: number; tickets: NightTicket[]; lockers?: NightLocker[]; kitchen?: NightKitchen[] }

export type GroupState = 'pendiente' | 'parcial' | 'canjeado';

export interface TicketGroup {
  key: string;
  kind: TicketKind;
  /** «Estacionamiento», «Pack 2 tragos»… («Entradas» para los accesos). */
  name: string;
  units: NightTicket[];
  redeemed: number;
  pending: number;
  state: GroupState;
}

const kindOf = (t: NightTicket): TicketKind => t.kind ?? 'acceso';

/** El estacionamiento que se cobra en la puerta: queda «usado» sin QR (no hay nada que mostrar). */
export function isPaidAtDoor(t: NightTicket): boolean {
  return kindOf(t) === 'estacionamiento' && t.status === 'used' && !t.qrImageUrl;
}

/** Nombre de un extra: el del producto («Pack 2 tragos»); el estacionamiento siempre «Estacionamiento». */
export function extraName(t: NightTicket): string {
  const kind = kindOf(t);
  if (kind === 'estacionamiento') return 'Estacionamiento';
  return t.typeName?.trim() || t.kindLabel || TICKET_KIND_META[kind].label;
}

function build(key: string, kind: TicketKind, name: string, units: NightTicket[]): TicketGroup {
  const redeemed = units.filter((u) => u.status === 'used').length;
  const pending = units.length - redeemed;
  return { key, kind, name, units, redeemed, pending, state: pending === 0 ? 'canjeado' : redeemed === 0 ? 'pendiente' : 'parcial' };
}

/** Las entradas (accesos) juntas y cada extra por producto: dos «Pack 2 tragos» son UNA fila con ×2. Los accesos
 * van primero; los extras con algo por canjear, antes que los ya canjeados. */
export function groupTickets(tickets: NightTicket[]): TicketGroup[] {
  const access = tickets.filter((t) => kindOf(t) === 'acceso');
  const groups: TicketGroup[] = access.length > 0 ? [build('acceso', 'acceso', 'Entradas', access)] : [];
  const byKey = new Map<string, NightTicket[]>();
  for (const t of tickets) {
    if (kindOf(t) === 'acceso') continue;
    const key = `${kindOf(t)}::${extraName(t).toLowerCase()}`;
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }
  const extras = Array.from(byKey, ([key, units]) => build(key, kindOf(units[0]), extraName(units[0]), units));
  return [...groups, ...extras.filter((g) => g.state !== 'canjeado'), ...extras.filter((g) => g.state === 'canjeado')];
}

/** Solo los extras (sin la entrada). */
export function extraGroups(tickets: NightTicket[]): TicketGroup[] {
  return groupTickets(tickets).filter((g) => g.kind !== 'acceso');
}

/** La unidad a mostrar al tocar un grupo: la primera por canjear que tenga QR; si no, la primera. */
export function nextUnit(g: TicketGroup): NightTicket {
  return g.units.find((u) => u.status !== 'used' && u.qrImageUrl) ?? g.units.find((u) => u.qrImageUrl) ?? g.units[0];
}

/** El grupo al que pertenece un ticket. */
export function groupOf(groups: TicketGroup[], ticketCode: string): TicketGroup | null {
  return groups.find((g) => g.units.some((u) => u.ticketCode === ticketCode)) ?? null;
}

/** La línea de estado de un grupo: «Por canjear», «×2 · queda 1», «Canjeado · 23:41». */
export function groupDetail(g: TicketGroup): string {
  if (g.units.length === 1) {
    const u = g.units[0];
    if (isPaidAtDoor(u)) return 'Ya cobrado en la puerta';
    if (g.state === 'canjeado') return u.usedAt ? `Canjeado · ${formatChileTime(u.usedAt)}` : 'Canjeado';
    return 'Por canjear';
  }
  if (g.state === 'canjeado') return `×${g.units.length} · canjeados`;
  return `×${g.units.length} · ${g.pending === 1 ? 'queda 1' : `quedan ${g.pending}`}`;
}

/* --- Guardarropía y cocina ------------------------------------------------ */

const LOCKER_STATE: Record<string, string> = { pendiente: 'Entrega tu abrigo en la guardarropía', guardado: 'Guardado', parcial: 'Retiraste una parte', retirado: 'Retirado' };
const KITCHEN_STATE: Record<string, string> = { pendiente: 'En la cola de cocina', aprobado: 'Se está preparando', entregado: 'Entregado' };

export function lockerStatusLabel(l: NightLocker): string {
  const base = LOCKER_STATE[l.status] ?? l.status;
  const when = l.status === 'retirado' || l.status === 'parcial' ? l.retrievedAt : l.status === 'guardado' ? l.receivedAt : null;
  return when ? `${base} · ${formatChileTime(when)}` : base;
}

export function kitchenStatusLabel(k: NightKitchen): string {
  const base = KITCHEN_STATE[k.status] ?? k.status;
  return k.status === 'entregado' && k.deliveredAt ? `${base} · ${formatChileTime(k.deliveredAt)}` : base;
}

/** El pedido de cocina en tres pasos (para la barra de progreso): 0 = en cola, 1 = preparando, 2 = entregado. */
export function kitchenStep(k: NightKitchen): 0 | 1 | 2 {
  return k.status === 'entregado' ? 2 : k.status === 'aprobado' ? 1 : 0;
}

/** Una percha o un pedido siguen «vivos» hasta que se retiran / se entregan. */
export const lockerIsLive = (l: NightLocker) => l.status === 'pendiente' || l.status === 'guardado';
export const kitchenIsLive = (k: NightKitchen) => k.status === 'pendiente' || k.status === 'aprobado';

export interface LiveItems { kitchen: NightKitchen[]; lockers: NightLocker[] }

/** Lo que se muestra arriba de la PlayCard mientras está pasando (y nada cuando no). */
export function liveItems(ev: NightEvent | null | undefined): LiveItems {
  return { kitchen: (ev?.kitchen ?? []).filter(kitchenIsLive), lockers: (ev?.lockers ?? []).filter(lockerIsLive) };
}

export const hasLive = (ev: NightEvent | null | undefined): boolean => {
  const l = liveItems(ev);
  return l.kitchen.length + l.lockers.length > 0;
};

/** ¿Alguna fiesta de la lista tiene algo vivo? Mientras sí, la App vuelve a preguntar sola. */
export const anyLive = (events: NightEvent[] | null | undefined): boolean => (events ?? []).some((e) => hasLive(e));

/* --- Resumen para la fila «Mi noche» -------------------------------------- */

export interface NightSummary { groups: TicketGroup[]; lockers: NightLocker[]; kitchen: NightKitchen[]; pending: number; empty: boolean; label: string }

export function nightSummary(ev: NightEvent | null | undefined): NightSummary {
  const groups = extraGroups(ev?.tickets ?? []);
  const lockers = ev?.lockers ?? [];
  const kitchen = ev?.kitchen ?? [];
  const pending = groups.reduce((n, g) => n + g.pending, 0);
  const empty = groups.length + lockers.length + kitchen.length === 0;
  const live = liveItems(ev);
  const label = pending > 0
    ? `${pending} por canjear`
    : live.kitchen.length > 0 ? 'Tu pedido está en cocina'
    : live.lockers.length > 0 ? 'Tu abrigo está en guardarropía'
    : groups.length > 0 ? 'Todo canjeado' : 'Ver detalle';
  return { groups, lockers, kitchen, pending, empty, label };
}
