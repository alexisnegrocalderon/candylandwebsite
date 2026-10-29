import '@/admin.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Archive, BellRing, Delete, Hash, Inbox, LogOut, Search, Undo2, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { AreaGuard, TerminalFrame, TerminalLogin, TerminalSpinner, beep, loginErrorToast, useWakeLock, vibrateAlert } from '@/components/terminal/TerminalShell';
import { compareLockerTags, lockerMatchesSearch, lockerTagMatchesDigits, type LockerItemStatus } from '@shared/locker';
import { OPERATOR_ROLE_LABELS } from '@shared/cajaRoles';

/* Terminal de guardarropía (se usa desde el celular): recibe/entrega las
 * prendas ya cobradas en /caja, sin papeles. Mismo vidrio oscuro que /caja y
 * el panel admin. Mismo criterio que /cocina -- la prenda nace en otra
 * tablet y no hay forma de enterarse sin consultar al servidor, así que no
 * tiene cola offline, solo polling cada 4s.
 *
 * Tres secciones en la barra de abajo (alcanzables con el pulgar):
 *  - Por recibir: las recién cobradas en caja, en orden de llegada.
 *  - Guardadas: lo que está en el mostrador (y lo ya entregado), con
 *    buscador, ordenado por número de percha.
 *  - Entregar: teclado numérico para teclear el número de percha y entregar. */

function newOpId() {
  return crypto.randomUUID();
}

const SOUND_MUTED_KEY = 'guardarropia_sound_muted';
const UNDO_WINDOW_MS = 8000;
const FLASH_MS = 8000;

export default function Guardarropia() {
  useSeo({ title: 'Guardarropía — Mansion Playroom', description: 'Recibir y entregar prendas.', path: '/guardarropia', noindex: true });
  return (
    <TerminalFrame>
      <Gate />
    </TerminalFrame>
  );
}

function Gate() {
  const me = trpc.guardarropia.me.useQuery();
  if (me.isLoading) {
    return <TerminalSpinner />;
  }
  if (!me.data) return <Login onDone={() => me.refetch()} />;
  return <AreaGuard area="guardarropia" role={me.data.role}><Board operatorName={me.data.name} operatorRole={me.data.role} /></AreaGuard>;
}

/* --- Login ---------------------------------------------------------------- */

function Login({ onDone }: { onDone: () => void }) {
  const { data: operators } = trpc.guardarropia.listOperators.useQuery();
  const login = trpc.guardarropia.login.useMutation({ onSuccess: onDone, onError: loginErrorToast });
  return (
    <TerminalLogin
      title="Guardarropía"
      operators={operators as any}
      emptyText='No hay nadie con permiso de guardarropía. Pídele a un admin que te cree un usuario con rol "guardarropía".'
      pending={login.isPending}
      onSubmit={(operatorId, pin, onError) => login.mutate({ operatorId, pin }, { onError })}
    />
  );
}

/* --- Tablero ---------------------------------------------------------------- */

type LockerItemRow = {
  id: number;
  tagNumber: string;
  customerName: string | null;
  status: LockerItemStatus;
  chargedAt: string;
  receivedAt: string | null;
  retrievedAt: string | null;
};

type Tab = 'recibir' | 'guardadas' | 'entregar';
type ListFilter = 'guardado' | 'retirado' | 'todas';

/** Lo último que se movió, para ofrecer "Deshacer" unos segundos. */
type LastMove = { tagNumber: string; name: string; from: LockerItemStatus; to: LockerItemStatus; at: number };

const MOVE_LABEL: Record<LockerItemStatus, string> = {
  pendiente: 'devuelta a por recibir',
  guardado: 'recibida',
  retirado: 'entregada',
};

function agoLabel(iso: string, now: number) {
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`;
}

function Board({ operatorName, operatorRole }: { operatorName: string; operatorRole: string }) {
  const utils = trpc.useUtils();
  const [muted, setMuted] = useState(() => localStorage.getItem(SOUND_MUTED_KEY) === '1');
  const [tab, setTab] = useState<Tab>('recibir');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('guardado');
  const [digits, setDigits] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const lastOkAtRef = useRef(Date.now());
  const knownTags = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const { data: event } = trpc.guardarropia.activeEvent.useQuery();
  const listQuery = trpc.guardarropia.list.useQuery(
    { eventId: event?.id ?? 0 },
    { enabled: !!event, refetchInterval: 4000 },
  );
  const update = trpc.guardarropia.update.useMutation();
  const logout = trpc.guardarropia.logout.useMutation({ onSuccess: () => utils.guardarropia.me.invalidate() });

  useEffect(() => {
    if (listQuery.isSuccess) lastOkAtRef.current = Date.now();
  }, [listQuery.isSuccess, listQuery.dataUpdatedAt]);

  // Banner de "no me estoy enterando" -- mismo patrón que /cocina: un solo
  // intervalo creado UNA vez (deps vacías), ver el comentario largo en
  // Cocina.tsx sobre por qué no puede depender de estado que cambia cada poll.
  // De paso refresca el "hace N min" de las tarjetas.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setStale(Date.now() - lastOkAtRef.current > 30_000);
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useWakeLock();

  const items = (listQuery.data ?? []) as unknown as LockerItemRow[];
  const pending = useMemo(
    () => items.filter((i) => i.status === 'pendiente').sort((a, b) => new Date(a.chargedAt).getTime() - new Date(b.chargedAt).getTime()),
    [items],
  );
  const stored = useMemo(() => items.filter((i) => i.status === 'guardado'), [items]);
  const delivered = useMemo(() => items.filter((i) => i.status === 'retirado'), [items]);

  // Lista de consulta: por número de percha (del 1 en adelante), filtrada por
  // estado y por el buscador (nombre sin tildes o número).
  const listed = useMemo(() => {
    const base = listFilter === 'guardado' ? stored : listFilter === 'retirado' ? delivered : items.filter((i) => i.status !== 'pendiente');
    return base.filter((i) => lockerMatchesSearch(i, search)).sort((a, b) => compareLockerTags(a.tagNumber, b.tagNumber));
  }, [items, stored, delivered, listFilter, search]);

  const pendingFiltered = useMemo(() => pending.filter((i) => lockerMatchesSearch(i, search)), [pending, search]);

  const quickMatches = useMemo(
    () => (digits ? items.filter((i) => lockerTagMatchesDigits(i.tagNumber, digits)).sort((a, b) => compareLockerTags(a.tagNumber, b.tagNumber)) : []),
    [items, digits],
  );

  // Aviso de prenda nueva: pitido, vibración (donde el navegador la deja) y
  // un aviso arriba con el contador parpadeando unos segundos. Compara contra
  // la última lista conocida, no contra el estado de React (que se resetea en
  // cada poll).
  const [flash, setFlash] = useState<{ labels: string[]; until: number } | null>(null);
  useEffect(() => {
    if (!listQuery.isSuccess) return;
    const current = new Set(pending.map((i) => i.tagNumber));
    if (firstLoad.current) {
      firstLoad.current = false;
      knownTags.current = current;
      return;
    }
    const fresh = pending.filter((i) => !knownTags.current.has(i.tagNumber));
    knownTags.current = current;
    if (fresh.length === 0) return;
    if (!muted) beep();
    vibrateAlert();
    setFlash({ labels: fresh.map((i) => `${i.customerName || 'Sin nombre'} · ${i.tagNumber}`), until: Date.now() + FLASH_MS });
  }, [pending, muted, listQuery.isSuccess]);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), Math.max(0, flash.until - Date.now()));
    return () => clearTimeout(id);
  }, [flash]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(SOUND_MUTED_KEY, next ? '1' : '0');
  };

  // Una acción a la vez por percha -- mismo patrón "Recibiendo…"/"Entregando…"
  // que /cocina agrega al Aprobar/Entregado.
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  useEffect(() => {
    if (!lastMove) return;
    const id = setTimeout(() => setLastMove(null), Math.max(0, lastMove.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(id);
  }, [lastMove]);

  const doUpdate = (item: Pick<LockerItemRow, 'tagNumber' | 'customerName' | 'status'>, to: LockerItemStatus, isUndo = false) => {
    if (!event || busyTag) return;
    const from = item.status;
    setBusyTag(item.tagNumber);
    update.mutate(
      { opId: newOpId(), eventId: event.id, tagNumber: item.tagNumber, to, clientAt: new Date().toISOString() },
      {
        onSuccess: (res) => {
          if (res.result === 'conflict' || res.result === 'rejected') {
            toast.warning(res.conflictNote || 'Esa percha ya cambió de estado');
          } else if (isUndo) {
            setLastMove(null);
          } else {
            setLastMove({ tagNumber: item.tagNumber, name: item.customerName || 'Sin nombre', from, to, at: Date.now() });
          }
          listQuery.refetch();
        },
        onSettled: () => setBusyTag(null),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const undo = () => {
    if (!lastMove) return;
    // El estado actual de la prenda (por si otro celular ya la movió).
    const current = items.find((i) => i.tagNumber === lastMove.tagNumber);
    doUpdate({ tagNumber: lastMove.tagNumber, customerName: current?.customerName ?? lastMove.name, status: current?.status ?? lastMove.to }, lastMove.from, true);
  };

  const flashing = !!flash && flash.until > now - 1000;

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none text-white flex flex-col">
      <header className="shrink-0 z-10 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 space-y-2">
        <div className="admin-glass-panel admin-glass-panel-sm flex items-center gap-3 px-4 py-2.5">
          <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-lg leading-tight">{event?.title ?? 'Guardarropía'}</p>
            <p className="truncate text-xs text-white/60">{operatorName} · {OPERATOR_ROLE_LABELS[operatorRole] ?? operatorRole}</p>
          </div>
          <button onClick={toggleMute} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 active:bg-white/10" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 active:bg-red-500/15 active:text-red-300 disabled:opacity-40"
            aria-label="Salir o cambiar de persona"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Por recibir" value={pending.length} tone="amber" pulse={flashing} />
          <Stat label="Guardadas" value={stored.length} tone="emerald" />
          <Stat label="Entregadas" value={delivered.length} tone="slate" />
        </div>
      </header>

      {flashing && (
        <div role="status" className="shrink-0 z-10 mx-3 mb-2 flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black">
          <BellRing className="h-5 w-5 shrink-0 animate-pulse" />
          <span className="min-w-0 flex-1 truncate">Llegó: {flash!.labels.join(', ')}</span>
        </div>
      )}

      {stale && (
        <div className="shrink-0 z-10 mx-3 mb-2 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm text-red-200">
          <WifiOff className="h-4 w-4 shrink-0" /> No me estoy enterando de prendas nuevas hace rato -- revisa la conexión.
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col px-3">
        {tab === 'recibir' && (
          <>
            <SearchBox value={search} onChange={setSearch} />
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pb-3">
              {pendingFiltered.length === 0 ? (
                <Empty text={search ? 'Nada coincide con la búsqueda.' : 'No hay prendas esperando confirmación.'} />
              ) : pendingFiltered.map((item) => (
                <ItemRow key={item.id} item={item} now={now} busy={busyTag === item.tagNumber} disabled={!!busyTag} onMove={(to) => doUpdate(item, to)} />
              ))}
            </div>
          </>
        )}

        {tab === 'guardadas' && (
          <>
            <SearchBox value={search} onChange={setSearch} />
            <div className="shrink-0 flex gap-2 pb-2">
              {([['guardado', 'Guardadas', stored.length], ['retirado', 'Entregadas', delivered.length], ['todas', 'Todas', stored.length + delivered.length]] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  onClick={() => setListFilter(value)}
                  aria-pressed={listFilter === value}
                  className={`h-11 flex-1 rounded-full border text-sm font-semibold ${listFilter === value ? 'border-primary/50 bg-primary/20 text-white' : 'border-white/10 text-white/60'}`}
                >
                  {label} · {count}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pb-3">
              {listed.length === 0 ? (
                <Empty text={search ? 'Nada coincide con la búsqueda.' : listFilter === 'retirado' ? 'Todavía no se ha entregado ninguna prenda.' : 'Todavía no hay prendas guardadas.'} />
              ) : listed.map((item) => (
                <ItemRow key={item.id} item={item} now={now} busy={busyTag === item.tagNumber} disabled={!!busyTag} onMove={(to) => doUpdate(item, to)} />
              ))}
            </div>
          </>
        )}

        {tab === 'entregar' && (
          <QuickDeliver
            digits={digits}
            setDigits={setDigits}
            matches={quickMatches}
            now={now}
            busyTag={busyTag}
            onMove={(item, to) => doUpdate(item, to)}
          />
        )}
      </main>

      {lastMove && (
        <div role="status" className="shrink-0 z-10 mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-white/12 px-4 py-2 backdrop-blur-md">
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{lastMove.name}</span> · {lastMove.tagNumber} {MOVE_LABEL[lastMove.to]}
          </p>
          <button
            onClick={undo}
            disabled={!!busyTag}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold active:scale-95 disabled:opacity-50"
          >
            <Undo2 className="h-4 w-4" /> Deshacer
          </button>
        </div>
      )}

      <nav aria-label="Secciones de guardarropía" className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1">
        <div className="admin-glass-panel flex items-stretch justify-around gap-1 px-1 py-1.5">
          {([
            ['recibir', 'Por recibir', Inbox, pending.length],
            ['guardadas', 'Guardadas', Archive, 0],
            ['entregar', 'Entregar', Hash, 0],
          ] as const).map(([value, label, Icon, badge]) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-current={active ? 'page' : undefined}
                className={`admin-tabbar-item relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 ${active ? 'admin-tabbar-item-active' : ''}`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate text-[12px] font-medium leading-none">{label}</span>
                {badge > 0 && <span className={`admin-badge absolute right-2 top-1 ${flashing && value === 'recibir' ? 'animate-pulse' : ''}`}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Stat({ label, value, tone, pulse = false }: { label: string; value: number; tone: 'amber' | 'emerald' | 'slate'; pulse?: boolean }) {
  const color = tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white/70';
  return (
    <div className={`admin-glass-panel admin-glass-panel-sm flex flex-col items-center px-2 py-2 ${pulse ? 'animate-pulse ring-2 ring-amber-400/70' : ''}`}>
      <span className={`text-2xl font-bold leading-none tabular-nums ${color}`}>{value}</span>
      <span className="mt-1 text-[11px] text-white/60">{label}</span>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative shrink-0 pb-2">
      <Search className="pointer-events-none absolute left-4 top-[1.4rem] h-4 w-4 -translate-y-1/2 text-white/60" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar nombre o número"
        aria-label="Buscar por nombre o número de percha"
        className="admin-tile h-12 w-full rounded-2xl pl-11 pr-11 text-base text-white placeholder:text-white/50 focus:border-primary/60 focus:outline-none"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-1 top-[1.4rem] grid h-11 w-11 -translate-y-1/2 place-items-center text-white/60" aria-label="Limpiar búsqueda">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-white/50">{text}</p>;
}

/** Una prenda: número de percha grande (lo que la persona muestra o dice),
 * nombre, estado y la acción que toca según ese estado. */
function ItemRow({ item, now, busy, disabled, onMove }: {
  item: LockerItemRow;
  now: number;
  busy: boolean;
  disabled: boolean;
  onMove: (to: LockerItemStatus) => void;
}) {
  const badge = item.status === 'pendiente'
    ? { label: 'Sin confirmar', className: 'bg-amber-500/15 text-amber-300', since: item.chargedAt }
    : item.status === 'guardado'
    ? { label: 'Guardada', className: 'bg-emerald-500/15 text-emerald-300', since: item.receivedAt ?? item.chargedAt }
    : { label: 'Entregada', className: 'bg-white/10 text-white/60', since: item.retrievedAt ?? item.chargedAt };

  const action = item.status === 'pendiente'
    ? { label: 'Recibido', busyLabel: 'Recibiendo…', to: 'guardado' as const, className: 'bg-primary text-primary-foreground' }
    : item.status === 'guardado'
    ? { label: 'Entregar', busyLabel: 'Entregando…', to: 'retirado' as const, className: 'bg-emerald-500 text-black' }
    : { label: 'Reingresar', busyLabel: 'Guardando…', to: 'guardado' as const, className: 'bg-white/12 text-white' };

  return (
    <div className="admin-tile flex items-center gap-3 rounded-2xl px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-2xl font-bold leading-none tracking-tight">{item.tagNumber}</p>
        <p className="mt-1.5 truncate text-base font-semibold text-white">{item.customerName || 'Sin nombre'}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
          <span className={`rounded-full px-2 py-0.5 font-medium ${badge.className}`}>{badge.label}</span>
          <span>{agoLabel(badge.since, now)}</span>
        </p>
      </div>
      <button
        onClick={() => onMove(action.to)}
        disabled={disabled}
        className={`h-14 min-w-[7.5rem] shrink-0 rounded-2xl px-4 text-base font-bold active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100 ${action.className}`}
      >
        {busy ? action.busyLabel : action.label}
      </button>
    </div>
  );
}

/** Entrega rápida: se teclea el número de percha y se entrega con un toque.
 * Teclado grande abajo, al alcance del pulgar. */
function QuickDeliver({ digits, setDigits, matches, now, busyTag, onMove }: {
  digits: string;
  setDigits: (fn: (d: string) => string) => void;
  matches: LockerItemRow[];
  now: number;
  busyTag: string | null;
  onMove: (item: LockerItemRow, to: LockerItemStatus) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 pb-2">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2">
        {!digits ? (
          <Empty text="Teclea el número de percha para encontrarla." />
        ) : matches.length === 0 ? (
          <Empty text="No hay ninguna percha con ese número." />
        ) : matches.map((item) => (
          <ItemRow key={item.id} item={item} now={now} busy={busyTag === item.tagNumber} disabled={!!busyTag} onMove={(to) => onMove(item, to)} />
        ))}
      </div>

      <div className="admin-glass-panel admin-glass-panel-sm flex shrink-0 items-center justify-between px-5 py-2" aria-live="polite">
        <span className="text-xs uppercase tracking-wide text-white/50">Percha</span>
        <span className="font-mono text-4xl font-bold tabular-nums">{digits || <span className="text-white/20">—</span>}</span>
        <button
          onClick={() => setDigits(() => '')}
          disabled={!digits}
          className="grid h-11 w-11 place-items-center rounded-full text-white/60 disabled:opacity-30"
          aria-label="Borrar todo"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
          <button
            key={k}
            onClick={() => {
              if (k === 'C') setDigits(() => '');
              else if (k === '⌫') setDigits((d) => d.slice(0, -1));
              else setDigits((d) => (d + k).slice(0, 6));
            }}
            aria-label={k === '⌫' ? 'Borrar último dígito' : k === 'C' ? 'Borrar todo' : k}
            className="admin-tile grid h-12 place-items-center rounded-2xl text-xl font-semibold active:scale-95 transition-transform"
          >
            {k === '⌫' ? <Delete className="h-6 w-6" /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
