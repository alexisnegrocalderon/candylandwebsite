import { useState } from 'react';
import { ArrowLeft, ArrowRight, Banknote, ChevronDown, Radio, Users, type LucideIcon } from 'lucide-react';
import { EventoBlock, type EventoData } from './EventoBlock';
import { PlataBlock, type PlataData } from './PlataBlock';
import { GenteBlock, type GenteData } from './GenteBlock';

type Id = 'evento' | 'plata' | 'gente';
const ORDER_KEY = 'home.order';
const DEFAULT_ORDER: Id[] = ['evento', 'plata', 'gente'];

const loadOrder = (): Id[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') as Id[];
    const valid = saved.filter((i) => DEFAULT_ORDER.includes(i));
    return [...valid, ...DEFAULT_ORDER.filter((i) => !valid.includes(i))];
  } catch { return DEFAULT_ORDER; }
};

/** $1.234.567 → "1,2M"; $564.000 → "564k" (cabe en una tarjeta chica). */
export const short = (n: number) => {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(Math.round(n));
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (v >= 1000) return `${sign}$${Math.round(v / 1000)}k`;
  return `${sign}$${v}`;
};

function Tile({ icon: Icon, label, value, caption, tone, open, onClick, reorder, onLeft, onRight }: {
  icon: LucideIcon; label: string; value: string; caption: string; tone?: 'warn' | 'bad' | 'good';
  open: boolean; onClick: () => void; reorder: boolean; onLeft?: () => void; onRight?: () => void;
}) {
  const color = tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-300' : '';
  return (
    <div className="min-w-0">
      <button
        type="button" onClick={onClick} aria-expanded={open}
        className={`admin-clay flex h-full w-full min-w-0 flex-col items-start gap-1 p-3 text-left transition-transform hover:-translate-y-0.5 md:p-4 ${open ? 'ring-2 ring-primary' : ''}`}
      >
        <span className="flex w-full items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.6_0.2_290)] text-white md:h-8 md:w-8"><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 truncate font-heading text-base leading-tight">{label}</span>
          <ChevronDown className={`hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform md:block ${open ? 'rotate-180' : ''}`} />
        </span>
        <span className={`mt-1 block w-full truncate font-heading text-xl tabular-nums leading-tight md:text-2xl ${color}`}>{value}</span>
        <span className="block w-full text-[11px] leading-tight text-muted-foreground line-clamp-2 md:text-xs">{caption}</span>
      </button>
      {reorder && (
        <div className="mt-1 flex justify-center gap-2">
          <button type="button" onClick={onLeft} disabled={!onLeft} aria-label={`Mover ${label} a la izquierda`} className="rounded-full bg-white/10 p-1.5 disabled:opacity-30"><ArrowLeft className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onRight} disabled={!onRight} aria-label={`Mover ${label} a la derecha`} className="rounded-full bg-white/10 p-1.5 disabled:opacity-30"><ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

/** Tres tarjetas cerradas arriba (Evento, Plata, Gente) con 1 número clave
 * cada una. Al tocar una se abre su detalle debajo (una a la vez); siempre
 * parten cerradas. El orden se puede cambiar y se recuerda. */
export function SummaryTabs({ evento, eventoLoading, plata, plataLoading, gente, genteLoading, hasEvent, isDemo, badgeCounts, onOpen }: {
  evento: EventoData; eventoLoading: boolean; plata: PlataData; plataLoading: boolean; gente: GenteData; genteLoading: boolean;
  hasEvent: boolean; isDemo: boolean; badgeCounts: Record<string, number>; onOpen: (s: string) => void;
}) {
  const [openId, setOpenId] = useState<Id | null>(null);
  const [order, setOrder] = useState<Id[]>(loadOrder);
  const [reorder, setReorder] = useState(false);

  const available = order.filter((id) => (id === 'evento' ? hasEvent : id === 'plata' ? !isDemo : true));
  const move = (id: Id, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    // Se salta lo que no se muestra (ej. Plata en demo) para que la flecha siempre haga algo visible.
    let k = j;
    while (k >= 0 && k < order.length && !available.includes(order[k])) k += dir;
    if (k < 0 || k >= order.length) return;
    const next = [...order];
    [next[i], next[k]] = [next[k], next[i]];
    setOrder(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* sin storage: no se recuerda */ }
  };

  const e = evento;
  const tiles: Record<Id, { icon: LucideIcon; label: string; value: string; caption: string; tone?: 'warn' | 'bad' | 'good' }> = {
    evento: {
      icon: Radio, label: 'Evento',
      value: e?.caja ? `${e.caja.insideCount} / ${e.caja.expectedCount}` : eventoLoading ? '…' : '—',
      caption: e?.pulse ? `${short(e.pulse.pace.last60)} última hora` : e?.tickets ? `${e.tickets.reduce((s: number, t: any) => s + t.sold, 0)} entradas vendidas` : 'adentro / esperados',
    },
    plata: {
      icon: Banknote, label: 'Plata',
      value: plata?.payables ? short(plata.payables.total) : plataLoading ? '…' : '—',
      caption: plata?.company ? `por pagar · mes ${short(plata.company.result)}` : 'por pagar',
      tone: plata?.payables && plata.payables.total > 0 ? 'warn' : undefined,
    },
    gente: {
      icon: Users, label: 'Gente',
      value: gente?.clientes ? `+${gente.clientes.nuevos7d}` : genteLoading ? '…' : '—',
      caption: `clientes 7 días · ${(badgeCounts['instagram'] ?? 0) + (badgeCounts['whatsapp'] ?? 0)} chats`,
    },
  };

  const close = () => setOpenId(null);

  return (
    <div className="space-y-3">
      <div className={`grid gap-2 md:gap-4 ${available.length === 3 ? 'grid-cols-3' : available.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {available.map((id) => {
          const idx = available.indexOf(id);
          return (
            <Tile
              key={id} {...tiles[id]} open={openId === id} onClick={() => setOpenId(openId === id ? null : id)}
              reorder={reorder}
              onLeft={idx > 0 ? () => move(id, -1) : undefined}
              onRight={idx < available.length - 1 ? () => move(id, 1) : undefined}
            />
          );
        })}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={() => setReorder((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">{reorder ? 'Listo' : 'Ordenar tarjetas'}</button>
      </div>
      {openId === 'evento' && hasEvent && <EventoBlock data={evento} loading={eventoLoading} onOpen={onOpen} onClose={close} />}
      {openId === 'plata' && !isDemo && <PlataBlock data={plata} loading={plataLoading} onOpen={onOpen} onClose={close} />}
      {openId === 'gente' && <GenteBlock data={gente} loading={genteLoading} badgeCounts={badgeCounts} onOpen={onOpen} onClose={close} />}
    </div>
  );
}
