import '@/admin.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Check, ChefHat, Inbox, Minus, Package, Plus, Search, Undo2, Volume2, VolumeX, WifiOff, X, LogOut } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { TerminalFrame, TerminalLogin, TerminalSpinner, beep, loginErrorToast, useWakeLock, vibrateAlert } from '@/components/terminal/TerminalShell';
import { OPERATOR_ROLE_LABELS } from '@shared/cajaRoles';
import { averageWaitSeconds, formatElapsed, summarizeKitchenItems, type KitchenTicketStatus } from '@shared/kitchen';
import { normalizeSearch } from '@shared/locker';

/* Pantalla de cocina (se usa desde el celular): recibe los pedidos de comida
 * que salen de /caja (productos con `toKitchen`) y los deja marcar Aprobado ->
 * Entregado. Mismo vidrio oscuro que /caja y el panel admin.
 *
 * A diferencia de /caja y /puerta, esta pantalla SÍ necesita señal siempre:
 * el pedido nace en otra tablet (la caja) y no hay forma de que cocina se
 * entere sin consultar al servidor, así que no tiene cola offline -- solo
 * polling cada 4s.
 *
 * Barra de abajo: Pedidos (Nuevos | En preparación -- pestañas en celular,
 * dos columnas en pantalla ancha), Entregados (última hora, con Deshacer) y
 * Porciones disponibles. */

function newOpId() {
  return crypto.randomUUID();
}

const SOUND_MUTED_KEY = 'cocina_sound_muted';
const UNDO_WINDOW_MS = 8000;
const FLASH_MS = 8000;

export default function Cocina() {
  useSeo({ title: 'Cocina — Mansion Playroom', description: 'Pedidos de comida.', path: '/cocina', noindex: true });
  return (
    <TerminalFrame>
      <Gate />
    </TerminalFrame>
  );
}

function Gate() {
  const me = trpc.cocina.me.useQuery();
  if (me.isLoading) return <TerminalSpinner />;
  if (!me.data) return <Login onDone={() => me.refetch()} />;
  return <Board operatorName={me.data.name} operatorRole={me.data.role} />;
}

/* --- Login ---------------------------------------------------------------- */

function Login({ onDone }: { onDone: () => void }) {
  const { data: operators } = trpc.cocina.listOperators.useQuery();
  const login = trpc.cocina.login.useMutation({ onSuccess: onDone, onError: loginErrorToast });
  return (
    <TerminalLogin
      title="Cocina"
      operators={operators as any}
      emptyText='No hay nadie con permiso de cocina. Pídele a un admin que te cree un usuario con rol "cocina".'
      pending={login.isPending}
      onSubmit={(operatorId, pin, onError) => login.mutate({ operatorId, pin }, { onError })}
    />
  );
}

/* --- Tablero ---------------------------------------------------------------- */

type KitchenTicketRow = {
  id: number;
  ticketNumber: string;
  customerName: string | null;
  status: KitchenTicketStatus;
  items: { name: string; quantity: number }[];
  note: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

type Tab = 'pedidos' | 'entregados' | 'stock';
type Column = 'nuevos' | 'preparando';

/** Lo último que se movió, para ofrecer "Deshacer" unos segundos. */
type LastMove = { ticketNumber: string; name: string; from: KitchenTicketStatus; to: KitchenTicketStatus; at: number };

const MOVE_LABEL: Record<KitchenTicketStatus, string> = {
  pendiente: 'devuelto a nuevos',
  aprobado: 'aprobado',
  entregado: 'entregado',
};

function inventoryDoneKey(eventId: number) {
  return `kitchen_inventory_done:${eventId}`;
}

function itemsDoneKey(eventId: number) {
  return `kitchen_items_done:${eventId}`;
}

/** Ítems marcados como listos, por comanda. Solo vive en este celular (no se
 * guarda en el servidor): ayuda a no perder la cuenta mientras se arma el
 * pedido. Se recuerda en el navegador para no perderlo al recargar. */
function useItemChecks(eventId: number | undefined, activeIds: number[], listLoaded: boolean) {
  const [done, setDone] = useState<Record<number, number[]>>({});
  useEffect(() => {
    if (!eventId) return;
    try { setDone(JSON.parse(localStorage.getItem(itemsDoneKey(eventId)) || '{}')); } catch { setDone({}); }
  }, [eventId]);

  // Se olvidan las comandas que ya no están activas, para que no crezca --
  // solo una vez cargada la lista (antes de eso `activeIds` está vacío y
  // borraría todo lo guardado).
  const activeKey = activeIds.join(',');
  useEffect(() => {
    if (!eventId || !listLoaded) return;
    setDone((prev) => {
      const keep = new Set(activeIds);
      const next: Record<number, number[]> = {};
      let changed = false;
      for (const k of Object.keys(prev)) {
        if (keep.has(Number(k))) next[Number(k)] = prev[Number(k)]; else changed = true;
      }
      if (!changed) return prev;
      try { localStorage.setItem(itemsDoneKey(eventId), JSON.stringify(next)); } catch { /* sin storage */ }
      return next;
    });
  }, [activeKey, eventId, listLoaded]);

  const toggle = (ticketId: number, idx: number) => {
    setDone((prev) => {
      const cur = new Set(prev[ticketId] ?? []);
      if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
      const next = { ...prev, [ticketId]: Array.from(cur) };
      if (eventId) { try { localStorage.setItem(itemsDoneKey(eventId), JSON.stringify(next)); } catch { /* sin storage */ } }
      return next;
    });
  };
  return { done, toggle };
}

function Board({ operatorName, operatorRole }: { operatorName: string; operatorRole: string }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>('pedidos');
  const [column, setColumn] = useState<Column>('nuevos');
  const [muted, setMuted] = useState(() => localStorage.getItem(SOUND_MUTED_KEY) === '1');
  const [now, setNow] = useState(() => Date.now());
  const lastOkAtRef = useRef(Date.now());
  const knownNumbers = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const { data: event } = trpc.cocina.activeEvent.useQuery();
  const listQuery = trpc.cocina.list.useQuery(
    { eventId: event?.id ?? 0 },
    { enabled: !!event, refetchInterval: 4000 },
  );
  const update = trpc.cocina.update.useMutation();
  const logout = trpc.cocina.logout.useMutation({ onSuccess: () => utils.cocina.me.invalidate() });

  useWakeLock();

  // Asistente de inventario inicial: solo la PRIMERA vez que esta tablet ve
  // este evento (pedido explícito del dueño) -- los ajustes de ahí en
  // adelante se hacen desde la pestaña "Porciones". `null` mientras no se
  // sabe todavía (evita el parpadeo del asistente antes de confirmar que ya
  // se hizo).
  const [inventoryDone, setInventoryDone] = useState<boolean | null>(null);
  useEffect(() => {
    if (!event) return;
    setInventoryDone(localStorage.getItem(inventoryDoneKey(event.id)) === '1');
  }, [event?.id]);
  const markInventoryDone = () => {
    if (event) localStorage.setItem(inventoryDoneKey(event.id), '1');
    setInventoryDone(true);
  };

  useEffect(() => {
    if (listQuery.isSuccess) lastOkAtRef.current = Date.now();
  }, [listQuery.isSuccess, listQuery.dataUpdatedAt]);

  // Banner de "no me estoy enterando": se distingue de "no hay pedidos" --
  // confundir las dos cosas es exactamente lo que hace que a alguien no le
  // llegue su comida. Un solo intervalo creado UNA vez (deps vacías) -- si
  // dependiera de `lastOkAtRef`/estado que cambia en cada poll exitoso (cada
  // 4s), el intervalo se destruía y recreaba antes de llegar a dispararse
  // (su período es 5s, más que los 4s entre polls), y `stale` quedaba
  // pegado en el último valor que tuvo.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setStale(Date.now() - lastOkAtRef.current > 30_000), 5000);
    return () => clearInterval(id);
  }, []);
  // Cronómetros de las tarjetas: un solo reloj para todas, cada segundo.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // `items` es una columna `json`, drizzle la infiere como `unknown` -- acá
  // se sabe que siempre es `{ name, quantity }[]` (lo arma `createCajaSale`).
  const active = (listQuery.data?.active ?? []) as unknown as KitchenTicketRow[];
  const recentlyDelivered = (listQuery.data?.recentlyDelivered ?? []) as unknown as KitchenTicketRow[];
  const nuevos = useMemo(() => active.filter((t) => t.status === 'pendiente'), [active]);
  const preparando = useMemo(() => active.filter((t) => t.status === 'aprobado'), [active]);
  const avgWait = useMemo(() => averageWaitSeconds(recentlyDelivered), [recentlyDelivered]);
  const oldestSeconds = active.length > 0 ? Math.max(...active.map((t) => (now - new Date(t.createdAt).getTime()) / 1000)) : null;

  const { done: itemsDone, toggle: toggleItem } = useItemChecks(event?.id, active.map((t) => t.id), listQuery.isSuccess);

  // Aviso de pedido nuevo: pitido, vibración (donde el navegador la deja) y
  // un aviso arriba con el contador parpadeando unos segundos. Compara contra
  // la última lista conocida, no contra el estado de React (que se resetea en
  // cada poll).
  const [flash, setFlash] = useState<{ labels: string[]; until: number } | null>(null);
  useEffect(() => {
    if (!listQuery.isSuccess) return;
    const current = new Set(active.map((t) => t.ticketNumber));
    if (firstLoad.current) {
      firstLoad.current = false;
      knownNumbers.current = current;
      return;
    }
    const fresh = active.filter((t) => !knownNumbers.current.has(t.ticketNumber));
    knownNumbers.current = current;
    if (fresh.length === 0) return;
    if (!muted) beep();
    vibrateAlert();
    setFlash({
      labels: fresh.map((t) => `${t.customerName || t.ticketNumber} · ${t.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`),
      until: Date.now() + FLASH_MS,
    });
  }, [active, muted, listQuery.isSuccess]);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), Math.max(0, flash.until - Date.now()));
    return () => clearTimeout(id);
  }, [flash]);
  const flashing = !!flash && flash.until > now - 1000;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(SOUND_MUTED_KEY, next ? '1' : '0');
  };

  // Estado de carga por tarjeta -- sin esto, apretar "Aprobar" no cambiaba
  // nada visible hasta que volvía la respuesta (pedido explícito del
  // dueño: debería decir "Preparando…" apenas se aprieta).
  const [pendingAction, setPendingAction] = useState<{ ticketNumber: string; to: KitchenTicketStatus } | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  useEffect(() => {
    if (!lastMove) return;
    const id = setTimeout(() => setLastMove(null), Math.max(0, lastMove.at + UNDO_WINDOW_MS - Date.now()));
    return () => clearTimeout(id);
  }, [lastMove]);

  const doUpdate = (ticket: Pick<KitchenTicketRow, 'ticketNumber' | 'customerName' | 'status'>, to: KitchenTicketStatus, isUndo = false) => {
    if (!event || pendingAction) return;
    const from = ticket.status;
    setPendingAction({ ticketNumber: ticket.ticketNumber, to });
    update.mutate(
      { opId: newOpId(), eventId: event.id, ticketNumber: ticket.ticketNumber, to, clientAt: new Date().toISOString() },
      {
        onSuccess: (res) => {
          if (res.result === 'conflict' || res.result === 'rejected') {
            toast.warning(res.conflictNote || 'Ese pedido ya cambió de estado');
          } else if (isUndo) {
            setLastMove(null);
          } else {
            setLastMove({ ticketNumber: ticket.ticketNumber, name: ticket.customerName || ticket.ticketNumber, from, to, at: Date.now() });
          }
          listQuery.refetch();
        },
        onSettled: () => setPendingAction(null),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const undo = () => {
    if (!lastMove) return;
    // El estado actual del pedido (por si otro celular ya lo movió).
    const current = [...active, ...recentlyDelivered].find((t) => t.ticketNumber === lastMove.ticketNumber);
    doUpdate({ ticketNumber: lastMove.ticketNumber, customerName: current?.customerName ?? lastMove.name, status: current?.status ?? lastMove.to }, lastMove.from, true);
  };

  if (event && inventoryDone === false) {
    return <InventorySetupWizard eventId={event.id} onDone={markInventoryDone} />;
  }

  const busyFor = (t: KitchenTicketRow) => (pendingAction?.ticketNumber === t.ticketNumber ? pendingAction.to : null);
  const renderColumn = (kind: Column) => {
    const tickets = kind === 'nuevos' ? nuevos : preparando;
    return (
      <TicketColumn
        key={kind}
        kind={kind}
        tickets={tickets}
        now={now}
        itemsDone={itemsDone}
        onToggleItem={toggleItem}
        busyFor={busyFor}
        anyBusy={!!pendingAction}
        onMove={(t, to) => doUpdate(t, to)}
      />
    );
  };

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none text-white flex flex-col">
      <header className="shrink-0 z-10 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <div className="admin-glass-panel admin-glass-panel-sm flex items-center gap-3 px-4 py-2.5">
          <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-lg leading-tight">{event?.title ?? 'Cocina'}</p>
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
      </header>

      {flashing && (
        <div role="status" className="shrink-0 z-10 mx-3 mb-2 flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black">
          <BellRing className="h-5 w-5 shrink-0 animate-pulse" />
          <span className="min-w-0 flex-1 truncate">Nuevo pedido: {flash!.labels.join(' · ')}</span>
        </div>
      )}

      {stale && tab !== 'stock' && (
        <div className="shrink-0 z-10 mx-3 mb-2 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm text-red-200">
          <WifiOff className="h-4 w-4 shrink-0" /> No me estoy enterando de pedidos nuevos hace rato -- revisa la conexión.
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col px-3">
        {tab === 'pedidos' && (
          <>
            {/* Celular: Nuevos / En preparación como pestañas con su contador.
                Pantalla ancha: las dos columnas a la vez. */}
            <div className="shrink-0 grid grid-cols-2 gap-2 pb-2 md:hidden" role="tablist">
              {([['nuevos', 'Nuevos', nuevos.length, flashing], ['preparando', 'En preparación', preparando.length, false]] as const).map(([value, label, count, pulse]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={column === value}
                  onClick={() => setColumn(value)}
                  className={`flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold ${column === value ? 'border-primary/50 bg-primary/20 text-white' : 'border-white/10 text-white/60'} ${pulse ? 'animate-pulse ring-2 ring-amber-400/70' : ''}`}
                >
                  {label}
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">{count}</span>
                </button>
              ))}
            </div>

            <p className="shrink-0 pb-2 text-xs text-white/60">
              Espera promedio (última hora): <span className="font-semibold text-white/80">{avgWait != null ? formatElapsed(avgWait) : '—'}</span>
              {' · '}Más antiguo esperando: <span className={`font-semibold ${oldestSeconds != null && oldestSeconds >= 600 ? 'text-red-400' : oldestSeconds != null && oldestSeconds >= 300 ? 'text-amber-300' : 'text-white/80'}`}>{oldestSeconds != null ? formatElapsed(oldestSeconds) : '—'}</span>
            </p>

            <div className="flex-1 min-h-0 md:grid md:grid-cols-2 md:gap-3">
              <div className={`h-full min-h-0 ${column === 'nuevos' ? '' : 'hidden md:block'}`}>{renderColumn('nuevos')}</div>
              <div className={`h-full min-h-0 ${column === 'preparando' ? '' : 'hidden md:block'}`}>{renderColumn('preparando')}</div>
            </div>
          </>
        )}

        {tab === 'entregados' && (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 pb-3">
            <p className="text-xs text-white/60">Entregados en la última hora · {recentlyDelivered.length}</p>
            {recentlyDelivered.length === 0 ? (
              <p className="py-10 text-center text-sm text-white/50">Todavía no se ha entregado ningún pedido en la última hora.</p>
            ) : recentlyDelivered.map((t) => (
              <div key={t.id} className="admin-tile flex items-center gap-3 rounded-2xl px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{t.customerName || t.ticketNumber} <span className="ml-1 font-mono text-xs font-normal text-white/50">{t.ticketNumber}</span></p>
                  <p className="truncate text-sm text-white/60">{t.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</p>
                </div>
                <button
                  onClick={() => doUpdate(t, 'aprobado', true)}
                  disabled={!!pendingAction}
                  className="flex h-12 shrink-0 items-center gap-1.5 rounded-full bg-white/12 px-4 text-sm font-bold active:scale-95 disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" /> {pendingAction?.ticketNumber === t.ticketNumber ? 'Deshaciendo…' : 'Deshacer'}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'stock' && <StockPanel eventId={event?.id} />}
      </main>

      {lastMove && tab !== 'stock' && (
        <div role="status" className="shrink-0 z-10 mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-white/12 px-4 py-2 backdrop-blur-md">
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{lastMove.name}</span> · {MOVE_LABEL[lastMove.to]}
          </p>
          <button
            onClick={undo}
            disabled={!!pendingAction}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold active:scale-95 disabled:opacity-50"
          >
            <Undo2 className="h-4 w-4" /> Deshacer
          </button>
        </div>
      )}

      <nav aria-label="Secciones de cocina" className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1">
        <div className="admin-glass-panel flex items-stretch justify-around gap-1 px-1 py-1.5">
          {([
            ['pedidos', 'Pedidos', Inbox, active.length],
            ['entregados', 'Entregados', Check, 0],
            ['stock', 'Porciones', Package, 0],
          ] as const).map(([value, label, Icon, badge]) => {
            const activeTab = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-current={activeTab ? 'page' : undefined}
                className={`admin-tabbar-item relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 ${activeTab ? 'admin-tabbar-item-active' : ''}`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate text-[12px] font-medium leading-none">{label}</span>
                {badge > 0 && <span className={`admin-badge absolute right-2 top-1 ${flashing && value === 'pedidos' ? 'animate-pulse' : ''}`}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Una columna de comandas (Nuevos / En preparación): arriba el resumen de lo
 * que hay que preparar, sumado por producto, y abajo las comandas, la más
 * antigua primero. */
function TicketColumn({ kind, tickets, now, itemsDone, onToggleItem, busyFor, anyBusy, onMove }: {
  kind: Column;
  tickets: KitchenTicketRow[];
  now: number;
  itemsDone: Record<number, number[]>;
  onToggleItem: (ticketId: number, idx: number) => void;
  busyFor: (t: KitchenTicketRow) => KitchenTicketStatus | null;
  anyBusy: boolean;
  onMove: (t: KitchenTicketRow, to: KitchenTicketStatus) => void;
}) {
  const summary = useMemo(() => summarizeKitchenItems(tickets), [tickets]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="hidden shrink-0 pb-2 text-xs font-semibold uppercase tracking-widest text-white/50 md:block">
        {kind === 'nuevos' ? 'Nuevos' : 'En preparación'} · {tickets.length}
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 pb-3">
        {tickets.length > 0 && (
          <div className="admin-glass-panel admin-glass-panel-sm px-4 py-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/60">
              <ChefHat className="h-4 w-4" /> {kind === 'nuevos' ? 'Por preparar' : 'En preparación ahora'}
            </p>
            <div className="flex flex-wrap gap-2">
              {summary.map((it) => (
                <span key={it.name} className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">
                  <span className="text-primary">{it.quantity}×</span> {it.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {tickets.length === 0 ? (
          <p className="py-12 text-center text-sm text-white/50">{kind === 'nuevos' ? 'No hay pedidos nuevos.' : 'No hay pedidos en preparación.'}</p>
        ) : tickets.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            now={now}
            doneIdx={new Set(itemsDone[t.id] ?? [])}
            onToggleItem={(idx) => onToggleItem(t.id, idx)}
            pendingTo={busyFor(t)}
            disabled={anyBusy}
            onApprove={() => onMove(t, 'aprobado')}
            onDeliver={() => onMove(t, 'entregado')}
          />
        ))}
      </div>
    </div>
  );
}

/** Cronómetro desde que entró: gris -> ámbar a los 5min -> rojo a los 10min.
 * Es el dato que de verdad ordena una cocina: cuál lleva más rato esperando. */
function elapsedTone(createdAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return { label: formatElapsed(seconds), tone: minutes >= 10 ? 'text-red-400' : minutes >= 5 ? 'text-amber-300' : 'text-white/60' };
}

function TicketCard({ ticket, now, doneIdx, onToggleItem, pendingTo, disabled, onApprove, onDeliver }: {
  ticket: KitchenTicketRow;
  now: number;
  doneIdx: Set<number>;
  onToggleItem: (idx: number) => void;
  pendingTo: KitchenTicketStatus | null;
  disabled: boolean;
  onApprove: () => void;
  onDeliver: () => void;
}) {
  const { label, tone } = elapsedTone(ticket.createdAt, now);
  const allReady = ticket.items.length > 0 && ticket.items.every((_, i) => doneIdx.has(i));

  return (
    <div className={`admin-tile rounded-3xl p-4 space-y-3 ${allReady ? 'border-emerald-400/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-3xl font-extrabold leading-tight tracking-tight">{ticket.customerName || ticket.ticketNumber}</p>
          {ticket.customerName && <p className="mt-0.5 font-mono text-xs text-white/50">{ticket.ticketNumber}</p>}
        </div>
        <span className={`shrink-0 font-mono text-lg font-bold tabular-nums ${tone}`}>{label}</span>
      </div>

      <div className="space-y-1.5">
        {ticket.items.map((it, i) => {
          const ready = doneIdx.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onToggleItem(i)}
              aria-pressed={ready}
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left active:scale-[0.99] transition-colors ${ready ? 'bg-emerald-500/15 text-white/60' : 'bg-white/5'}`}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${ready ? 'border-emerald-400 bg-emerald-400 text-black' : 'border-white/30'}`}>
                {ready && <Check className="h-4 w-4" />}
              </span>
              <span className={`text-lg ${ready ? 'line-through' : ''}`}>
                <span className="font-bold">{it.quantity}×</span> {it.name}
              </span>
            </button>
          );
        })}
      </div>

      {ticket.note && <p className="text-sm italic text-white/60">{ticket.note}</p>}

      <div className="flex gap-2 pt-1">
        {ticket.status === 'pendiente' && (
          <button onClick={onApprove} disabled={disabled} className="h-14 flex-1 rounded-2xl bg-white/12 text-base font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100">
            {pendingTo === 'aprobado' ? 'Preparando…' : 'Aprobar'}
          </button>
        )}
        <button
          onClick={onDeliver}
          disabled={disabled}
          className={`h-14 flex-1 rounded-2xl text-base font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100 ${allReady ? 'bg-emerald-500 text-black shadow-[0_0_20px_-4px_rgba(16,185,129,0.8)]' : 'bg-primary text-primary-foreground'}`}
        >
          {pendingTo === 'entregado' ? 'Entregando…' : allReady ? 'Todo listo · Entregado' : 'Entregado'}
        </button>
      </div>
    </div>
  );
}

/* --- Porciones disponibles ---------------------------------------------------------------- */

type KitchenProductRow = {
  id: number;
  name: string;
  groupName: string | null;
  emoji: string | null;
  totalStock: number;
  soldCount: number;
  status: 'active' | 'soldout' | 'hidden';
};

/* --- Asistente de inventario inicial ---------------------------------------------------------------- */

/** Solo la primera vez que esta tablet entra a un evento (ver
 * `inventoryDoneKey` en `Board`): pregunta un producto a la vez, prellenado
 * con su stock actual -- así confirmar sin cambios es un solo tap, no hace
 * falta escribir todo de nuevo. Después de esto, los ajustes siguen
 * disponibles en cualquier momento desde "Porciones". */
function InventorySetupWizard({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const productsQuery = trpc.cocina.products.useQuery({ eventId });
  const updateStock = trpc.cocina.updateStock.useMutation();
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');

  const products = (productsQuery.data ?? []) as unknown as KitchenProductRow[];
  const product = products[index];

  // Nada que configurar -- no vale la pena mostrar un asistente vacío. No
  // marca el evento como "hecho" (no hay flag que guardar): si más tarde el
  // admin carga productos que van a cocina, el asistente va a aparecer en
  // el próximo login en vez de quedar bloqueado para siempre.
  useEffect(() => {
    if (productsQuery.isSuccess && products.length === 0) onDone();
  }, [productsQuery.isSuccess, products.length]);

  useEffect(() => {
    if (product) setValue(String(product.totalStock));
  }, [product?.id]);

  if (productsQuery.isLoading || (productsQuery.isSuccess && products.length === 0)) return <TerminalSpinner />;
  if (!product) return null;

  const isLast = index === products.length - 1;

  const confirmAndAdvance = () => {
    const finish = () => { if (isLast) onDone(); else setIndex((i) => i + 1); };
    const parsed = parseInt(value, 10);
    const qty = Number.isFinite(parsed) && parsed >= 0 ? parsed : product.totalStock;
    if (qty === product.totalStock) { finish(); return; }
    updateStock.mutate(
      { productId: product.id, eventId, totalStock: qty },
      { onSuccess: finish, onError: (e) => { toast.error(e.message); finish(); } },
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-none text-white px-5 py-10 flex flex-col">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <p className="mb-1 text-center text-xs uppercase tracking-widest text-white/50">Inventario inicial · {index + 1} / {products.length}</p>
        <h1 className="mb-8 text-center font-heading text-2xl font-extrabold">¿Cuántas porciones hay?</h1>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="text-5xl">{product.emoji || '🍽️'}</span>
          <p className="text-center text-xl font-bold">{product.name}</p>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            autoFocus
            className="admin-tile h-16 w-32 rounded-2xl text-center text-3xl text-white focus:border-primary/60 focus:outline-none"
          />
        </div>
        <div className="mt-8 space-y-2">
          <div className="flex gap-2">
            {index > 0 && (
              <button onClick={() => setIndex((i) => i - 1)} className="admin-tile h-14 rounded-full px-5 font-bold text-white/80">
                Atrás
              </button>
            )}
            <button
              onClick={confirmAndAdvance}
              disabled={updateStock.isPending}
              className="h-14 flex-1 rounded-full bg-primary font-bold text-primary-foreground disabled:opacity-40"
            >
              {isLast ? 'Terminar' : 'Siguiente'}
            </button>
          </div>
          <button onClick={onDone} className="w-full py-3 text-center text-sm text-white/60 underline">
            Saltar por ahora
          </button>
        </div>
      </div>
    </div>
  );
}

const SAVE_DEBOUNCE_MS = 600;
const MAX_PORTIONS = 9999;

function StockPanel({ eventId }: { eventId: number | undefined }) {
  const productsQuery = trpc.cocina.products.useQuery({ eventId: eventId ?? 0 }, { enabled: !!eventId });
  const updateStock = trpc.cocina.updateStock.useMutation();
  const toggleSoldOut = trpc.cocina.toggleSoldOut.useMutation();
  const [search, setSearch] = useState('');
  // Porciones disponibles que se están editando (todavía sin guardar): se
  // guardan solas medio segundo después del último toque, sin botón.
  const [edits, setEdits] = useState<Record<number, number>>({});
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  const products = (productsQuery.data ?? []) as unknown as KitchenProductRow[];

  const setAvailable = (p: KitchenProductRow, value: number) => {
    if (!eventId) return;
    const next = Math.min(MAX_PORTIONS, Math.max(0, value));
    setEdits((e) => ({ ...e, [p.id]: next }));
    const prev = timers.current.get(p.id);
    if (prev) clearTimeout(prev);
    timers.current.set(p.id, setTimeout(() => {
      timers.current.delete(p.id);
      // El total que se guarda es lo ya vendido + lo disponible que quedó.
      updateStock.mutate(
        { productId: p.id, eventId, totalStock: p.soldCount + next },
        {
          onSuccess: () => productsQuery.refetch().finally(() => setEdits((e) => { const n = { ...e }; delete n[p.id]; return n; })),
          onError: (err) => { toast.error(err.message); setEdits((e) => { const n = { ...e }; delete n[p.id]; return n; }); },
        },
      );
    }, SAVE_DEBOUNCE_MS));
  };

  // Botón de emergencia: agotar/reponer sin tener que calcular porciones
  // exactas -- bloquea la venta de verdad en /caja (a diferencia de dejar
  // el stock en 0, que ahí solo "avisa pero no bloquea").
  const doToggleSoldOut = (p: KitchenProductRow) => {
    if (!eventId) return;
    const soldOut = p.status !== 'soldout';
    toggleSoldOut.mutate(
      { productId: p.id, eventId, soldOut },
      {
        onSuccess: () => { toast.success(soldOut ? `${p.name}: marcado agotado` : `${p.name}: repuesto`); productsQuery.refetch(); },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const q = normalizeSearch(search);
  const groups = new Map<string, KitchenProductRow[]>();
  for (const p of products) {
    if (q && !normalizeSearch(p.name).includes(q)) continue;
    const key = p.groupName || 'Sin sección';
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="relative shrink-0 pb-2">
        <Search className="pointer-events-none absolute left-4 top-[1.4rem] h-4 w-4 -translate-y-1/2 text-white/60" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto"
          aria-label="Buscar producto"
          className="admin-tile h-12 w-full rounded-2xl pl-11 pr-11 text-base text-white placeholder:text-white/50 focus:border-primary/60 focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-1 top-[1.4rem] grid h-11 w-11 -translate-y-1/2 place-items-center text-white/60" aria-label="Limpiar búsqueda">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3">
        {products.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/50">No hay productos configurados para cocina.</p>
        ) : groups.size === 0 ? (
          <p className="py-16 text-center text-sm text-white/50">Nada coincide con la búsqueda.</p>
        ) : (
          Array.from(groups.entries()).map(([groupName, items]) => (
            <div key={groupName} className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">{groupName}</p>
              <div className="space-y-2">
                {items.map((p) => {
                  const available = edits[p.id] ?? Math.max(0, p.totalStock - p.soldCount);
                  const soldOut = p.status === 'soldout';
                  const saving = edits[p.id] !== undefined;
                  return (
                    <div key={p.id} className={`admin-tile space-y-3 rounded-2xl p-3 ${soldOut ? '!border-red-500/50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className={`shrink-0 text-3xl ${soldOut ? 'grayscale' : ''}`}>{p.emoji || '🍽️'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold">{p.name}</p>
                          <p className="text-xs text-white/60">Vendidos: {p.soldCount}{saving ? ' · guardando…' : ''}</p>
                        </div>
                        <button
                          onClick={() => doToggleSoldOut(p)}
                          disabled={toggleSoldOut.isPending}
                          className={`h-12 shrink-0 rounded-2xl px-4 text-sm font-bold active:scale-95 ${soldOut ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}
                        >
                          {soldOut ? '✅ Reponer' : '🚨 Agotado'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-white/50">Disponibles</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAvailable(p, available - 1)}
                            disabled={available <= 0}
                            aria-label={`Una porción menos de ${p.name}`}
                            className="admin-tile grid h-12 w-12 place-items-center rounded-2xl active:scale-95 disabled:opacity-30"
                          >
                            <Minus className="h-5 w-5" />
                          </button>
                          <input
                            value={String(available)}
                            onChange={(e) => setAvailable(p, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                            inputMode="numeric"
                            aria-label={`Porciones disponibles de ${p.name}`}
                            className="h-12 w-20 rounded-2xl bg-white/10 text-center text-2xl font-bold tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-primary/60"
                          />
                          <button
                            onClick={() => setAvailable(p, available + 1)}
                            aria-label={`Una porción más de ${p.name}`}
                            className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground active:scale-95"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
