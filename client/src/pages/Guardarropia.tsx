import '@/admin.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Volume2, VolumeX, WifiOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';

/* Pantalla de guardarropía: recibe/entrega las prendas ya cobradas en
 * /caja, sin papeles. Mismo criterio que /cocina -- la prenda nace en
 * otra tablet y no hay forma de enterarse sin consultar al servidor, así
 * que no tiene cola offline, solo polling cada 4s. */

function newOpId() {
  return crypto.randomUUID();
}

const SOUND_MUTED_KEY = 'guardarropia_sound_muted';

/** Pitido corto con Web Audio API -- sin archivo de sonido que cargar. */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Sin Web Audio (raro) -- silencioso, no rompe nada.
  }
}

export default function Guardarropia() {
  useSeo({ title: 'Guardarropía — Mansion Playroom', description: 'Recibir y entregar prendas.', path: '/guardarropia', noindex: true });

  const me = trpc.guardarropia.me.useQuery();
  if (me.isLoading) {
    return <div className="min-h-dvh grid place-items-center bg-[#0d0810]"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!me.data) return <Login onDone={() => me.refetch()} />;
  return <Board operatorName={me.data.name} />;
}

/* --- Login ---------------------------------------------------------------- */

function Login({ onDone }: { onDone: () => void }) {
  const { data: operators } = trpc.guardarropia.listOperators.useQuery();
  const [operatorId, setOperatorId] = useState<number | null>(null);
  const [pin, setPin] = useState('');

  const login = trpc.guardarropia.login.useMutation({
    onSuccess: onDone,
    onError: (e) => { toast.error(e.message); setPin(''); },
  });

  return (
    <div className="min-h-dvh bg-[#0d0810] text-white px-5 py-10">
      <div className="max-w-sm mx-auto">
        <img
          src="/candyland/logo-wordmark.webp"
          alt="Mansion Playroom"
          className="h-12 w-auto mx-auto mb-6"
        />
        <h1 className="font-heading font-extrabold text-3xl tracking-tight text-center mb-1">Guardarropía</h1>
        <p className="text-white/45 text-sm text-center mb-8">Recibir y entregar prendas</p>

        {!operatorId ? (
          <>
            <p className="text-xs uppercase tracking-wide text-white/50 mb-2">¿Quién eres?</p>
            <div className="space-y-2">
              {operators?.map((o: any) => (
                <button
                  key={o.id}
                  onClick={() => setOperatorId(o.id)}
                  className="w-full h-14 rounded-2xl border border-white/12 text-left px-5 font-semibold active:scale-[0.99] transition-transform"
                >
                  {o.name}
                </button>
              ))}
              {operators?.length === 0 && (
                <p className="text-sm text-white/40 text-center py-6">
                  No hay nadie con permiso de guardarropía. Pídele a un admin que te cree un usuario con rol "guardarropía".
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setOperatorId(null); setPin(''); }} className="text-sm text-white/40 mb-4">← Cambiar</button>
            <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Tu PIN</p>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoFocus
              type="password"
              className="w-full h-16 px-5 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-2xl tracking-[0.4em] text-center focus:border-primary/60 focus:outline-none"
            />
            <button
              disabled={pin.length < 4 || login.isPending}
              onClick={() => login.mutate({ operatorId, pin })}
              className="w-full h-14 mt-5 rounded-full bg-primary font-bold disabled:opacity-35"
            >
              {login.isPending ? 'Entrando…' : 'Entrar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* --- Tablero ---------------------------------------------------------------- */

type LockerItemRow = {
  id: number;
  tagNumber: string;
  customerName: string | null;
  status: 'pendiente' | 'guardado' | 'retirado';
  chargedAt: string;
  receivedAt: string | null;
  retrievedAt: string | null;
};

function Board({ operatorName }: { operatorName: string }) {
  const [muted, setMuted] = useState(() => localStorage.getItem(SOUND_MUTED_KEY) === '1');
  const lastOkAtRef = useRef(Date.now());
  const knownTags = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const { data: event } = trpc.guardarropia.activeEvent.useQuery();
  const listQuery = trpc.guardarropia.list.useQuery(
    { eventId: event?.id ?? 0 },
    { enabled: !!event, refetchInterval: 4000 },
  );
  const update = trpc.guardarropia.update.useMutation();

  useEffect(() => {
    if (listQuery.isSuccess) lastOkAtRef.current = Date.now();
  }, [listQuery.isSuccess, listQuery.dataUpdatedAt]);

  // Banner de "no me estoy enterando" -- mismo patrón que /cocina: un solo
  // intervalo creado UNA vez (deps vacías), ver el comentario largo en
  // Cocina.tsx sobre por qué no puede depender de estado que cambia cada poll.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setStale(Date.now() - lastOkAtRef.current > 30_000), 5000);
    return () => clearInterval(id);
  }, []);

  const items = (listQuery.data ?? []) as unknown as LockerItemRow[];
  const pending = useMemo(
    () => items.filter((i) => i.status === 'pendiente').sort((a, b) => new Date(a.chargedAt).getTime() - new Date(b.chargedAt).getTime()),
    [items]
  );
  // Lista de consulta permanente -- a diferencia de `pending`, no filtra por
  // estado: una vez que alguien tiene número, queda visible acá toda la
  // noche (guardado, retirado, sin importar cuántas veces alterne entre los
  // dos), sin tener que buscarlo. Ordenada por nombre/número para barrer
  // con la vista, no por fecha (que cambiaría de orden todo el tiempo).
  const all = useMemo(
    () => [...items].sort((a, b) => (a.customerName || a.tagNumber).localeCompare(b.customerName || b.tagNumber)),
    [items]
  );

  // Sonido al llegar una prenda nueva -- compara contra la última lista
  // conocida, no contra el estado de React (que se resetea en cada poll).
  useEffect(() => {
    if (pending.length === 0 && knownTags.current.size === 0 && firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const current = new Set(pending.map((i) => i.tagNumber));
    if (!firstLoad.current) {
      Array.from(current).forEach((tag) => {
        if (!knownTags.current.has(tag) && !muted) beep();
      });
    }
    knownTags.current = current;
    firstLoad.current = false;
  }, [pending, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(SOUND_MUTED_KEY, next ? '1' : '0');
  };

  // Estado de carga por tarjeta -- mismo patrón "Recibiendo…"/"Entregando…"
  // que /cocina agrega al Aprobar/Entregado.
  const [pendingAction, setPendingAction] = useState<{ tagNumber: string; to: 'guardado' | 'retirado' } | null>(null);

  const doUpdate = (tagNumber: string, to: 'guardado' | 'retirado') => {
    if (!event) return;
    setPendingAction({ tagNumber, to });
    update.mutate(
      { opId: newOpId(), eventId: event.id, tagNumber, to, clientAt: new Date().toISOString() },
      {
        onSuccess: (res) => {
          if (res.result === 'conflict') toast.warning(res.conflictNote || 'Esa percha ya cambió de estado');
          else listQuery.refetch();
        },
        onSettled: () => setPendingAction(null),
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="min-h-dvh bg-[#0d0810] text-white flex flex-col">
      <header className="px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <div>
          <p className="font-bold leading-tight">{event?.title ?? 'Guardarropía'}</p>
          <p className="text-xs text-white/45">{operatorName}</p>
        </div>
        <button onClick={toggleMute} className="p-2 text-white/60" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </header>

      {stale && (
        <div className="px-4 py-2 bg-red-500/15 border-b border-red-500/30 text-red-200 text-sm flex items-center gap-2 shrink-0">
          <WifiOff className="w-4 h-4" /> No me estoy enterando de prendas nuevas hace rato -- revisa la conexión.
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-3 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Recién llegadas</p>
          {pending.length === 0 ? (
            <p className="text-center text-white/40 py-6 text-sm">No hay prendas esperando confirmación.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {pending.map((item) => (
                <LockerCard
                  key={item.id}
                  item={item}
                  pendingTo={pendingAction?.tagNumber === item.tagNumber ? pendingAction.to : null}
                  onReceive={() => doUpdate(item.tagNumber, 'guardado')}
                  onDeliver={() => doUpdate(item.tagNumber, 'retirado')}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Todas las prendas de hoy ({all.length})</p>
          {all.length === 0 ? (
            <p className="text-center text-white/40 py-8">Todavía no hay ninguna prenda registrada.</p>
          ) : (
            <div className="space-y-1.5">
              {all.map((item) => (
                <LockerRow
                  key={item.id}
                  item={item}
                  pendingTo={pendingAction?.tagNumber === item.tagNumber ? pendingAction.to : null}
                  onReceive={() => doUpdate(item.tagNumber, 'guardado')}
                  onDeliver={() => doUpdate(item.tagNumber, 'retirado')}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LockerCard({ item, pendingTo, onReceive, onDeliver }: {
  item: LockerItemRow;
  pendingTo: 'guardado' | 'retirado' | null;
  onReceive: () => void;
  onDeliver: () => void;
}) {
  const disabled = pendingTo !== null;
  const badge = item.status === 'pendiente'
    ? { label: 'Sin confirmar', className: 'bg-amber-500/15 text-amber-300' }
    : item.status === 'guardado'
    ? { label: 'Guardado', className: 'bg-emerald-500/15 text-emerald-300' }
    : { label: 'Retirado', className: 'bg-white/10 text-white/50' };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-heading font-extrabold text-xl tracking-tight truncate">{item.customerName || item.tagNumber}</p>
          {item.customerName && <p className="text-xs text-white/30 font-mono mt-0.5">{item.tagNumber}</p>}
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${badge.className}`}>{badge.label}</span>
      </div>
      <div className="flex gap-2">
        {(item.status === 'pendiente' || item.status === 'retirado') && (
          <button onClick={onReceive} disabled={disabled} className="flex-1 h-9 text-sm rounded-full bg-primary font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100">
            {pendingTo === 'guardado' ? 'Recibiendo…' : 'Recibido'}
          </button>
        )}
        {item.status === 'guardado' && (
          <button onClick={onDeliver} disabled={disabled} className="flex-1 h-9 text-sm rounded-full bg-white/10 font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100">
            {pendingTo === 'retirado' ? 'Entregando…' : 'Entregado'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Fila angosta para la lista permanente "Todas las prendas de hoy" -- a
 * diferencia de `LockerCard` (pensada para la cola de recibir, tarjeta
 * cuadrada grande), esta es una lista larga de consulta: una fila chica por
 * persona, con su botón de acción al lado según el estado actual. */
function LockerRow({ item, pendingTo, onReceive, onDeliver }: {
  item: LockerItemRow;
  pendingTo: 'guardado' | 'retirado' | null;
  onReceive: () => void;
  onDeliver: () => void;
}) {
  const disabled = pendingTo !== null;
  const badge = item.status === 'pendiente'
    ? { label: 'Sin confirmar', className: 'bg-amber-500/15 text-amber-300' }
    : item.status === 'guardado'
    ? { label: 'Guardado', className: 'bg-emerald-500/15 text-emerald-300' }
    : { label: 'Retirado', className: 'bg-white/10 text-white/50' };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{item.customerName || item.tagNumber}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {item.customerName && <p className="text-[11px] text-white/30 font-mono">{item.tagNumber}</p>}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>{badge.label}</span>
        </div>
      </div>
      {(item.status === 'pendiente' || item.status === 'retirado') && (
        <button onClick={onReceive} disabled={disabled} className="h-8 px-3 text-xs shrink-0 rounded-full bg-primary font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100">
          {pendingTo === 'guardado' ? 'Recibiendo…' : 'Recibir'}
        </button>
      )}
      {item.status === 'guardado' && (
        <button onClick={onDeliver} disabled={disabled} className="h-8 px-3 text-xs shrink-0 rounded-full bg-white/10 font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100">
          {pendingTo === 'retirado' ? 'Entregando…' : 'Entregar'}
        </button>
      )}
    </div>
  );
}
