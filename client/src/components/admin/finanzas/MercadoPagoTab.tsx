import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { CheckSquare, Download, Loader2, MoreHorizontal, RefreshCw, Search, Upload, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useIsDemo } from '@/lib/demoMode';
import { formatChileShortDate } from '@shared/chileDate';
import { EXPENSE_CATEGORIES } from '@shared/expenses';
import type { MovementClass } from '@shared/cash';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatementUpload } from './StatementUpload';

/* Finanzas → Mercado Pago: TODOS los movimientos de la cuenta, mes a mes, para
 * saber en qué se fue la plata. Mientras la cuenta se usa también para cosas
 * personales, lo personal se marca como "retiro mío": baja lo que quedó en la
 * empresa, pero nunca la ganancia de los eventos. */

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo completar la acción');
const pill = 'rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60';
const pillOn = 'bg-pink-500 text-white shadow-sm';
const pillOff = 'bg-black/5 text-[var(--admin-muted)] hover:bg-black/10';

const CLASS_LABEL: Record<MovementClass, string> = {
  venta: 'Venta', comision: 'Comisión MP', gasto_evento: 'Playroom · evento', gasto_empresa: 'Playroom',
  retiro_dueno: 'Personal', traspaso: 'Traspaso', otro: 'Otro', por_clasificar: 'Por clasificar',
};
const CLASS_TONE: Record<MovementClass, string> = {
  venta: 'bg-emerald-500/15 text-emerald-600', comision: 'bg-violet-500/15 text-violet-500',
  gasto_evento: 'bg-orange-500/15 text-orange-500', gasto_empresa: 'bg-orange-500/15 text-orange-500',
  retiro_dueno: 'bg-sky-500/15 text-sky-500', traspaso: 'bg-black/5 text-[var(--admin-muted)]',
  otro: 'bg-black/5 text-[var(--admin-muted)]', por_clasificar: 'bg-amber-500/20 text-amber-600',
};
const CAT = new Map<string, (typeof EXPENSE_CATEGORIES)[number]>(EXPENSE_CATEGORIES.map((c) => [c.value, c]));

type Filter = 'todos' | 'entradas' | 'salidas' | 'por_clasificar' | 'playroom' | 'personal' | 'comisiones' | 'traspasos';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' }, { id: 'por_clasificar', label: 'Por clasificar' }, { id: 'salidas', label: 'Salidas' }, { id: 'entradas', label: 'Entradas' },
  { id: 'playroom', label: 'Playroom' }, { id: 'personal', label: 'Personal' }, { id: 'comisiones', label: 'Comisiones' }, { id: 'traspasos', label: 'Traspasos' },
];

type Mv = {
  id: number; date: string | Date; amount: number; description: string | null; kind: string | null;
  classification: MovementClass; eventId: number | null; category: string | null; fee: number; suggestion: MovementClass | null;
};

function matches(m: Mv, f: Filter) {
  switch (f) {
    case 'todos': return true;
    case 'entradas': return m.amount > 0;
    case 'salidas': return m.amount < 0;
    case 'por_clasificar': return m.classification === 'por_clasificar';
    case 'playroom': return m.classification === 'gasto_evento' || m.classification === 'gasto_empresa';
    case 'personal': return m.classification === 'retiro_dueno';
    case 'comisiones': return m.classification === 'comision' || m.fee > 0;
    case 'traspasos': return m.classification === 'traspaso';
  }
}

const chileMonthNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const dayKey = (d: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const monthLabel = (k: string) => {
  const [y, m] = k.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dayLabel = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Qué fue un movimiento: un toque para lo simple; gasto pide categoría (y evento). */
function ClassifyPanel({ m, events, busy, onApply }: {
  m: Mv; events: any[]; busy: boolean;
  onApply: (classification: MovementClass, extra?: { eventId?: number | null; category?: string }) => void;
}) {
  const isDemo = useIsDemo();
  const [mode, setMode] = useState<'gasto_evento' | 'gasto_empresa' | null>(
    m.classification === 'gasto_evento' || m.classification === 'gasto_empresa' ? m.classification : null,
  );
  const [eventId, setEventId] = useState(m.eventId ? String(m.eventId) : '');
  const [category, setCategory] = useState(m.category ?? 'otros');
  const out = m.amount < 0;
  const tone = (c: MovementClass) => (m.classification === c ? pillOn : m.suggestion === c ? 'bg-pink-500/15 text-pink-500' : pillOff);
  const dis = isDemo || busy;
  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap gap-1.5">
        {out && <button type="button" disabled={dis} className={`${pill} ${tone('retiro_dueno')}`} onClick={() => onApply('retiro_dueno')}>Personal (retiro mío)</button>}
        {out && <button type="button" disabled={dis} className={`${pill} ${mode === 'gasto_empresa' ? pillOn : tone('gasto_empresa')}`} onClick={() => setMode(mode === 'gasto_empresa' ? null : 'gasto_empresa')}>Gasto de Playroom</button>}
        {out && <button type="button" disabled={dis} className={`${pill} ${mode === 'gasto_evento' ? pillOn : tone('gasto_evento')}`} onClick={() => setMode(mode === 'gasto_evento' ? null : 'gasto_evento')}>Gasto de un evento</button>}
        {out && <button type="button" disabled={dis} className={`${pill} ${tone('comision')}`} onClick={() => onApply('comision')}>Comisión</button>}
        {!out && <button type="button" disabled={dis} className={`${pill} ${tone('venta')}`} onClick={() => onApply('venta')}>Venta / ingreso</button>}
        <button type="button" disabled={dis} className={`${pill} ${tone('traspaso')}`} onClick={() => onApply('traspaso')}>Traspaso entre mis cuentas</button>
        <button type="button" disabled={dis} className={`${pill} ${tone('otro')}`} onClick={() => onApply('otro')}>Otro</button>
        {m.classification !== 'por_clasificar' && <button type="button" disabled={dis} className={`${pill} ${pillOff}`} onClick={() => onApply('por_clasificar')}>Dejar por clasificar</button>}
      </div>
      {mode && (
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'gasto_evento' && (
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="¿De qué evento?" /></SelectTrigger>
              <SelectContent>{events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}</SelectContent>
          </Select>
          <button type="button" disabled={dis || (mode === 'gasto_evento' && !eventId)} className={`${pill} bg-emerald-500 text-white`}
            onClick={() => onApply(mode, { eventId: mode === 'gasto_evento' ? Number(eventId) : null, category })}>Guardar como gasto</button>
        </div>
      )}
    </div>
  );
}

export function MercadoPagoTab() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const [monthKey, setMonthKey] = useState(chileMonthNow());
  const { data, isLoading, isError, error } = trpc.cash.accountMonth.useQuery({ monthKey, source: 'mercadopago' });
  const { data: events } = trpc.events.listAll.useQuery();
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkGasto, setBulkGasto] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('otros');
  const [showUpload, setShowUpload] = useState(false);

  const refresh = () => { utils.cash.invalidate(); utils.finance.invalidate(); };
  const sync = trpc.cash.syncMercadoPago.useMutation({
    onSuccess: (r: any) => { refresh(); r.errors?.length ? toast.warning(`Mercado Pago: ${r.errors.join(' · ')}`) : toast.success(`Mercado Pago: ${r.payments} cobros y ${r.movements} movimientos. Reporte: ${r.reportStatus}`); },
    onError: onErr,
  });
  const classify = trpc.cash.classify.useMutation({ onSuccess: () => { refresh(); setOpenId(null); toast.success('Listo'); }, onError: onErr });
  const classifyMany = trpc.cash.classifyMany.useMutation({
    onSuccess: (r) => { refresh(); setSelected(new Set()); setSelecting(false); setBulkGasto(false); toast.success(`${r.done} movimientos clasificados`); },
    onError: onErr,
  });

  const months = useMemo(() => { const out: string[] = []; let m = chileMonthNow(); for (let i = 0; i < 12; i++) { out.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; } return out; }, []);
  const eventTitle = useMemo(() => new Map((events ?? []).map((e: any) => [e.id, e.title as string])), [events]);

  const movements = (data?.movements ?? []) as Mv[];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movements.filter((m) => matches(m, filter) && (!q || (m.description ?? '').toLowerCase().includes(q) || CLASS_LABEL[m.classification].toLowerCase().includes(q)));
  }, [movements, filter, query]);
  const days = useMemo(() => {
    const map = new Map<string, Mv[]>();
    for (const m of visible) { const k = dayKey(m.date); map.set(k, [...(map.get(k) ?? []), m]); }
    return Array.from(map, ([day, items]) => ({ day, items, total: items.reduce((s, x) => s + x.amount, 0) }));
  }, [visible]);

  const exportCsv = () => {
    const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [['fecha', 'descripcion', 'monto', 'comision_mp', 'clasificacion', 'categoria', 'evento'],
      ...movements.map((m) => [dayKey(m.date), m.description ?? '', m.amount, m.fee || '', CLASS_LABEL[m.classification], m.category ? CAT.get(m.category)?.label ?? m.category : '', m.eventId ? eventTitle.get(m.eventId) ?? m.eventId : ''])];
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mercado-pago-${monthKey}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = (id: number, on: boolean) => setSelected((prev) => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; });
  const bulk = (classification: MovementClass, extra: { category?: string } = {}) => classifyMany.mutate({ ids: Array.from(selected), classification, ...extra });

  const s = data?.summary;
  const tiles: { label: string; value: number; filter: Filter; tone?: string; hint?: string }[] = s ? [
    { label: 'Entró', value: s.entro, filter: 'entradas', tone: 'text-emerald-600' },
    { label: 'Salió', value: s.salio, filter: 'salidas', tone: 'text-red-500', hint: s.traspasos ? `${money(s.traspasos)} fueron a tu banco` : undefined },
    { label: 'Gastos Playroom', value: s.playroom, filter: 'playroom' },
    { label: 'Personal', value: s.personal, filter: 'personal', hint: 'cuenta como retiro tuyo' },
    { label: 'Comisiones MP', value: s.comisiones, filter: 'comisiones' },
    { label: 'Por clasificar', value: s.porClasificarMonto, filter: 'por_clasificar', tone: s.porClasificar ? 'text-amber-500' : undefined, hint: `${s.porClasificar} movimientos` },
  ] : [];
  const maxCat = Math.max(1, ...(s?.byCategory ?? []).map((c) => c.amount));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Select value={monthKey} onValueChange={(v) => { setMonthKey(v); setSelected(new Set()); }}>
          <SelectTrigger className="min-w-0 flex-1 sm:max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" className="shrink-0" disabled={isDemo || sync.isPending} onClick={() => sync.mutate()}>
          {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="ml-1.5 hidden sm:inline">Actualizar</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0" aria-label="Más opciones de Mercado Pago"><MoreHorizontal className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => setSelecting(true)} disabled={movements.length === 0}><CheckSquare className="mr-2 h-4 w-4" /> Seleccionar varios</DropdownMenuItem>
            <DropdownMenuItem onSelect={exportCsv} disabled={movements.length === 0}><Download className="mr-2 h-4 w-4" /> Exportar el mes (CSV)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowUpload(true)}><Upload className="mr-2 h-4 w-4" /> Subir estado de cuenta</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {data?.balance && (
        <p className="-mt-2 text-xs text-[var(--admin-muted)]">
          Saldo en Mercado Pago: <strong className="text-foreground">{money(data.balance.balance)}</strong> · {formatChileShortDate(data.balance.asOf as any)}
        </p>
      )}

      {showUpload && (
        <div className="admin-clay-sm space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Subir estado de cuenta de Mercado Pago</p>
              <p className="text-xs text-[var(--admin-muted)]">En Mercado Pago: Tu dinero → Estado de cuenta → descarga el mes en CSV. Completa lo que la conexión automática no trae; volver a subirlo no duplica nada.</p>
            </div>
            <button type="button" aria-label="Cerrar" onClick={() => setShowUpload(false)} className="p-1"><X className="h-4 w-4" /></button>
          </div>
          <StatementUpload onImported={() => { refresh(); setShowUpload(false); }} buttonClass={`${pill} bg-emerald-500 text-white`} />
        </div>
      )}

      {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      {isError && <p className="text-sm text-destructive">No se pudo cargar: {error?.message}</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((t) => (
              <button key={t.label} type="button" onClick={() => setFilter(filter === t.filter ? 'todos' : t.filter)}
                className={`admin-clay-sm p-3 text-left ${filter === t.filter ? 'ring-2 ring-pink-500' : ''}`}>
                <span className="block text-xs text-[var(--admin-muted)]">{t.label}</span>
                <span className={`block font-heading text-xl tabular-nums ${t.tone ?? ''}`}>{money(t.value)}</span>
                {t.hint && <span className="block text-[11px] text-[var(--admin-muted)]">{t.hint}</span>}
              </button>
            ))}
          </div>

          {(s.byCategory.length > 0 || s.topDestinos.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {s.byCategory.length > 0 && (
                <div className="admin-clay-sm space-y-2 p-4">
                  <p className="text-sm font-semibold">Gastos de Playroom por categoría</p>
                  {s.byCategory.map((c) => (
                    <div key={c.category} className="space-y-1">
                      <div className="flex justify-between gap-2 text-xs"><span className="truncate">{CAT.get(c.category as any)?.emoji} {CAT.get(c.category as any)?.label ?? c.category}</span><span className="tabular-nums">{money(c.amount)}</span></div>
                      <div className="h-1.5 rounded-full bg-black/5"><div className="h-full rounded-full bg-orange-500" style={{ width: `${(c.amount / maxCat) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {s.topDestinos.length > 0 && (
                <div className="admin-clay-sm space-y-2 p-4">
                  <p className="text-sm font-semibold">Dónde se fue más plata</p>
                  {s.topDestinos.map((d) => (
                    <button key={d.name} type="button" onClick={() => { setQuery(d.name); setFilter('todos'); }} className="flex w-full justify-between gap-2 text-left text-sm">
                      <span className="truncate">{d.name} <span className="text-xs text-[var(--admin-muted)]">· {d.count}</span></span>
                      <span className="shrink-0 tabular-nums">{money(d.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {data && (
        <div className="sticky top-20 z-20 -mx-1 space-y-2 bg-background/90 px-1 py-2 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-muted)]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar movimiento…" className="pl-9 pr-9" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1"><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${filter === f.id ? pillOn : pillOff}`}>
                {f.label}{f.id === 'por_clasificar' && s?.porClasificar ? ` (${s.porClasificar})` : ''}
              </button>
            ))}
          </div>
          {selecting && (
            <div className="flex items-center justify-between rounded-xl bg-pink-500/10 px-3 py-2 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={visible.length > 0 && visible.every((m) => selected.has(m.id))} onCheckedChange={(v) => visible.forEach((m) => toggle(m.id, !!v))} />
                Seleccionar los {visible.length} que se ven
              </label>
              <button type="button" className="text-xs underline" onClick={() => { setSelecting(false); setSelected(new Set()); }}>Salir</button>
            </div>
          )}
        </div>
      )}

      {data && movements.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-[var(--admin-muted)]">
          No hay movimientos de Mercado Pago en {monthLabel(monthKey).toLowerCase()}. Toca «Actualizar» o sube el estado de cuenta del mes.
        </div>
      )}
      {data && movements.length > 0 && visible.length === 0 && (
        <p className="py-6 text-center text-sm text-[var(--admin-muted)]">Ningún movimiento coincide. <button type="button" className="underline" onClick={() => { setQuery(''); setFilter('todos'); }}>Quitar filtros</button></p>
      )}

      <div className={`space-y-4 ${selecting && selected.size > 0 ? 'pb-28' : ''}`}>
        {days.map((d) => (
          <section key={d.day} className="space-y-1.5">
            <div className="flex items-baseline justify-between px-1 text-xs text-[var(--admin-muted)]">
              <span className="font-semibold">{dayLabel(d.day)}</span>
              <span className="tabular-nums">{money(d.total)}</span>
            </div>
            {d.items.map((m) => {
              const open = openId === m.id && !selecting;
              const cat = m.category ? CAT.get(m.category as any) : null;
              const tag = m.classification === 'gasto_evento' && m.eventId ? `${CLASS_LABEL[m.classification]}: ${eventTitle.get(m.eventId) ?? ''}` : cat ? `${CLASS_LABEL[m.classification]} · ${cat.label}` : CLASS_LABEL[m.classification];
              return (
                <div key={m.id} className={`admin-clay-sm px-3 py-2.5 ${selected.has(m.id) ? 'ring-2 ring-pink-500' : ''}`}>
                  <div className="flex items-center gap-3">
                    {selecting && <Checkbox checked={selected.has(m.id)} onCheckedChange={(v) => toggle(m.id, !!v)} aria-label={`Seleccionar ${m.description ?? 'movimiento'}`} />}
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => (selecting ? toggle(m.id, !selected.has(m.id)) : setOpenId(open ? null : m.id))}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.description || 'Movimiento'}</span>
                        <span className={`mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${CLASS_TONE[m.classification]}`}>
                          {tag}{m.classification === 'por_clasificar' && m.suggestion ? ` · ¿${CLASS_LABEL[m.suggestion].toLowerCase()}?` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-sm font-semibold tabular-nums ${m.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{money(m.amount)}</span>
                        {m.fee > 0 && <span className="block text-[11px] text-[var(--admin-muted)]">comisión {money(m.fee)}</span>}
                      </span>
                    </button>
                  </div>
                  {open && (
                    <ClassifyPanel key={`${m.id}-${m.classification}`} m={m} events={events ?? []} busy={classify.isPending}
                      onApply={(classification, extra = {}) => classify.mutate({ id: m.id, classification, ...extra })} />
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {selecting && selected.size > 0 && createPortal(
        <div className="fixed inset-x-3 bottom-[5.75rem] z-40 mx-auto flex max-w-xl items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900/95 p-2 text-white shadow-2xl backdrop-blur md:bottom-6">
          <span className="shrink-0 px-2 text-sm font-semibold">{selected.size}</span>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={isDemo || classifyMany.isPending} onClick={() => bulk('retiro_dueno')}>Personal</Button>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={isDemo || classifyMany.isPending} onClick={() => setBulkGasto(true)}>Gasto Playroom</Button>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={isDemo || classifyMany.isPending} onClick={() => bulk('traspaso')}>Traspaso</Button>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={isDemo || classifyMany.isPending} onClick={() => bulk('comision')}>Comisión</Button>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={isDemo || classifyMany.isPending} onClick={() => bulk('otro')}>Otro</Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-white hover:bg-white/10" aria-label="Cancelar selección" onClick={() => { setSelected(new Set()); setSelecting(false); }}><X className="h-4 w-4" /></Button>
        </div>,
        document.body,
      )}

      <Dialog open={bulkGasto} onOpenChange={setBulkGasto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Gasto de Playroom</DialogTitle>
            <DialogDescription>{selected.size} movimientos. Se cargan como gastos de la empresa (del mes, no de un evento).</DialogDescription>
          </DialogHeader>
          <Select value={bulkCategory} onValueChange={setBulkCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkGasto(false)}>Cancelar</Button>
            <Button disabled={isDemo || classifyMany.isPending} onClick={() => bulk('gasto_empresa', { category: bulkCategory })}>{classifyMany.isPending ? 'Guardando…' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
