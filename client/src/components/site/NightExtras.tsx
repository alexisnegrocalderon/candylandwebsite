import type { ReactNode } from 'react';
import { Car, Check, ChefHat, ChevronRight, Martini, QrCode, ShoppingBag, Shirt, Sparkles, Ticket } from 'lucide-react';
import { BottomSheet } from '@/components/site/AccountPayments';
import { tapHaptic, type MeEvent, type MeTicket } from '@/components/site/walletParts';
import {
  groupDetail, isPaidAtDoor, kitchenStatusLabel, kitchenStep, liveItems, lockerStatusLabel,
  nextUnit, nightSummary, type NightKitchen, type NightLocker, type TicketGroup,
} from '@shared/nightExtras';
import type { TicketKind } from '@shared/ticketKind';

/* «Mi noche»: todo lo que la persona tiene para la fiesta además de su entrada, en la App.
 * - `NightRow`: una fila de vidrio bajo los botones de la PlayCard («Tus extras · 3 por canjear ›»).
 * - `NightSheet`: la hoja con todo agrupado (extras por producto, guardarropía y cocina) y su estado.
 * - `LiveStrip`: avisos que aparecen arriba SOLO mientras pasan (el pedido en cocina, el abrigo en guardarropía). */

const KIND_ICON: Record<TicketKind, typeof Car> = {
  acceso: Ticket, estacionamiento: Car, consumo: Martini, merch: ShoppingBag, guardarropia: Shirt, extra: Sparkles,
};
const KIND_TINT: Record<TicketKind, string> = {
  acceso: 'bg-pink-500', estacionamiento: 'bg-sky-500', consumo: 'bg-fuchsia-500', merch: 'bg-orange-500', guardarropia: 'bg-amber-500', extra: 'bg-violet-500',
};

/** El cuadradito de color con su ícono, como en Ajustes del iPhone. */
function Tile({ icon: Icon, tint, size = 40 }: { icon: typeof Car; tint: string; size?: number }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-[12px] ${tint} shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]`} style={{ width: size, height: size }}>
      <Icon className="text-white" style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

/* --- Fila bajo los botones ------------------------------------------------ */

export function NightRow({ ev, onOpen }: { ev: MeEvent | null; onOpen: () => void }) {
  const s = nightSummary(ev);
  if (!ev || s.empty) return null;
  const urgent = s.pending > 0;
  return (
    <button type="button" onClick={() => { tapHaptic(); onOpen(); }} className="account-glass flex w-full shrink-0 items-center gap-3 rounded-[20px] px-4 py-3 text-left interactive">
      <Tile icon={Sparkles} tint="bg-violet-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold leading-tight">Mi noche</span>
        <span className="mt-0.5 block truncate text-footnote text-white/60">Tus extras · {s.label}</span>
      </span>
      {urgent && <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-gradient-to-r from-pink-500 to-sky-400 px-1.5 text-caption1 font-bold tabular-nums text-white">{s.pending}</span>}
      <ChevronRight className="h-5 w-5 shrink-0 text-white/35" />
    </button>
  );
}

/* --- La hoja ---------------------------------------------------------------- */

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 px-1 text-footnote font-semibold uppercase tracking-wide text-white/50">{title}</h3>
      <div className="account-glass divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">{children}</div>
    </section>
  );
}

function ExtraRow({ g, onShowQr }: { g: TicketGroup; onShowQr: (t: MeTicket) => void }) {
  const unit = nextUnit(g);
  const single = g.units.length === 1;
  const door = single && isPaidAtDoor(g.units[0]);
  const canShow = !door && !!unit?.qrImageUrl && g.state !== 'canjeado';
  const done = g.state === 'canjeado';
  const code = single && !done && !door ? (g.units[0] as MeTicket).displayCode : null;
  const inner = (
    <>
      <Tile icon={KIND_ICON[g.kind]} tint={KIND_TINT[g.kind]} />
      <span className="min-w-0 flex-1">
        <span className={`block text-body font-semibold leading-tight ${done ? 'text-white/55' : ''}`}>{g.name}</span>
        <span className={`mt-0.5 block truncate text-footnote ${done ? 'text-emerald-300/80' : 'text-white/60'}`}>{groupDetail(g)}</span>
        {code && <span className="mt-0.5 block truncate font-mono text-footnote font-semibold tracking-[0.08em] text-white/80">{code}</span>}
      </span>
      {done ? <Check className="h-5 w-5 shrink-0 text-emerald-300" /> : canShow ? <QrCode className="h-5 w-5 shrink-0 text-white/50" /> : null}
      {canShow && <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />}
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left';
  return canShow
    ? <button type="button" onClick={() => { tapHaptic(); onShowQr(unit as MeTicket); }} className={`${cls} active:bg-white/10`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

function LockerRow({ l }: { l: NightLocker }) {
  const done = l.status === 'retirado';
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Tile icon={Shirt} tint={KIND_TINT.guardarropia} />
      <span className="min-w-0 flex-1">
        <span className={`block text-body font-semibold leading-tight ${done ? 'text-white/55' : ''}`}>Percha N° {l.tagNumber}</span>
        <span className={`mt-0.5 block truncate text-footnote ${done ? 'text-emerald-300/80' : 'text-white/60'}`}>{lockerStatusLabel(l)}</span>
      </span>
      {done && <Check className="h-5 w-5 shrink-0 text-emerald-300" />}
    </div>
  );
}

function KitchenRow({ k }: { k: NightKitchen }) {
  const done = k.status === 'entregado';
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Tile icon={ChefHat} tint="bg-emerald-500" />
      <span className="min-w-0 flex-1">
        <span className={`block text-body font-semibold leading-tight ${done ? 'text-white/55' : ''}`}>Comanda {k.ticketNumber}</span>
        <span className="mt-0.5 block truncate text-footnote text-white/60">{k.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</span>
        <span className={`mt-0.5 block truncate text-footnote ${done ? 'text-emerald-300/80' : 'text-amber-200'}`}>{kitchenStatusLabel(k)}</span>
      </span>
      {done && <Check className="h-5 w-5 shrink-0 text-emerald-300" />}
    </div>
  );
}

export function NightSheet({ open, onClose, ev, onShowQr }: { open: boolean; onClose: () => void; ev: MeEvent | null; onShowQr: (t: MeTicket) => void }) {
  const s = nightSummary(ev);
  return (
    <BottomSheet open={open} onClose={onClose} title="Mi noche">
      {ev && (
        <div className="space-y-5 pb-2">
          <p className="-mt-2 text-subhead text-white/60">{ev.eventTitle}</p>
          {s.groups.length > 0 && (
            <Group title="Para canjear">
              {s.groups.map((g) => <ExtraRow key={g.key} g={g} onShowQr={onShowQr} />)}
            </Group>
          )}
          {s.lockers.length > 0 && <Group title="Guardarropía">{s.lockers.map((l) => <LockerRow key={l.tagNumber} l={l} />)}</Group>}
          {s.kitchen.length > 0 && <Group title="Cocina">{s.kitchen.map((k) => <KitchenRow key={k.ticketNumber} k={k} />)}</Group>}
          {s.groups.length > 0 && <p className="px-2 text-center text-footnote text-white/45">Toca un extra para mostrar su QR en la caja o la barra.</p>}
        </div>
      )}
    </BottomSheet>
  );
}

/* --- Avisos vivos ------------------------------------------------------------ */

const STEPS = ['En cola', 'Preparando', 'Entregado'];

function LiveRow({ icon, tint, title, line, progress, onOpen }: { icon: typeof Car; tint: string; title: string; line: string; progress?: 0 | 1 | 2; onOpen: () => void }) {
  return (
    <button type="button" onClick={() => { tapHaptic(); onOpen(); }} className="block w-full px-4 py-2.5 text-left active:bg-white/10">
      <span className="flex items-center gap-3">
        <Tile icon={icon} tint={tint} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold leading-tight">{title}</span>
          <span className="block truncate text-footnote text-white/65">{line}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
      </span>
      {progress !== undefined && (
        <span className="mt-2 grid grid-cols-3 gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={2} aria-valuenow={progress} aria-label={STEPS[progress]}>
          {STEPS.map((label, n) => (
            <span key={label} className="block">
              <span className={`block h-1.5 rounded-full transition-colors ${n <= progress ? 'bg-gradient-to-r from-pink-500 to-sky-400' : 'bg-white/15'}`} />
              <span className={`mt-1 block text-center text-caption2 ${n === progress ? 'font-semibold text-white' : 'text-white/40'}`}>{label}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** Lo que está pasando ahora: el pedido en cocina y el abrigo en guardarropía, en una sola tarjeta con «En vivo»
 * arriba. No dibuja nada si no hay nada. */
export function LiveStrip({ ev, onOpen }: { ev: MeEvent | null; onOpen: () => void }) {
  const live = liveItems(ev);
  if (live.kitchen.length === 0 && live.lockers.length === 0) return null;
  return (
    <div className="account-glass shrink-0 overflow-hidden rounded-[20px]">
      <p className="flex items-center gap-1.5 px-4 pt-2.5 text-caption2 font-semibold uppercase tracking-[0.14em] text-emerald-300">
        <span aria-hidden className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
        En vivo
      </p>
      <div className="divide-y divide-white/[0.08]">
        {live.kitchen.map((k) => (
          <LiveRow key={`k-${k.ticketNumber}`} icon={ChefHat} tint="bg-emerald-500" title={`Comanda ${k.ticketNumber}`} line={`${kitchenStatusLabel(k)} · ${k.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`} progress={kitchenStep(k)} onOpen={onOpen} />
        ))}
        {live.lockers.map((l) => (
          <LiveRow key={`l-${l.tagNumber}`} icon={Shirt} tint={KIND_TINT.guardarropia} title={`Tu percha: N° ${l.tagNumber}`} line={lockerStatusLabel(l)} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
