import '@/admin.css';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Volume2, VolumeX, WifiOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';

/* Pantalla de cocina: recibe los pedidos de comida que salen de /caja
 * (productos con `toKitchen`) y los deja marcar Aprobado -> Entregado.
 *
 * A diferencia de /caja y /puerta, esta pantalla SÍ necesita señal siempre:
 * el pedido nace en otra tablet (la caja) y no hay forma de que cocina se
 * entere sin consultar al servidor, así que no tiene cola offline -- solo
 * polling cada 4s. */

function newOpId() {
  return crypto.randomUUID();
}

const SOUND_MUTED_KEY = 'cocina_sound_muted';

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

export default function Cocina() {
  useSeo({ title: 'Cocina — Mansion Playroom', description: 'Pedidos de comida.', path: '/cocina', noindex: true });

  const me = trpc.cocina.me.useQuery();
  if (me.isLoading) {
    return <div className="min-h-dvh grid place-items-center bg-[#0d0810]"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!me.data) return <Login onDone={() => me.refetch()} />;
  return <Board operatorName={me.data.name} />;
}

/* --- Login ---------------------------------------------------------------- */

function Login({ onDone }: { onDone: () => void }) {
  const { data: operators } = trpc.cocina.listOperators.useQuery();
  const [operatorId, setOperatorId] = useState<number | null>(null);
  const [pin, setPin] = useState('');

  const login = trpc.cocina.login.useMutation({
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
        <h1 className="font-heading font-extrabold text-3xl tracking-tight text-center mb-1">Cocina</h1>
        <p className="text-white/45 text-sm text-center mb-8">Pedidos de comida</p>

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
                  No hay nadie con permiso de cocina. Pídele a un admin que te cree un usuario con rol "cocina".
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

type KitchenTicketRow = {
  id: number;
  ticketNumber: string;
  customerName: string | null;
  status: 'pendiente' | 'aprobado' | 'entregado';
  items: { name: string; quantity: number }[];
  note: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

function Board({ operatorName }: { operatorName: string }) {
  const [muted, setMuted] = useState(() => localStorage.getItem(SOUND_MUTED_KEY) === '1');
  const lastOkAtRef = useRef(Date.now());
  const knownNumbers = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const { data: event } = trpc.cocina.activeEvent.useQuery();
  const listQuery = trpc.cocina.list.useQuery(
    { eventId: event?.id ?? 0 },
    { enabled: !!event, refetchInterval: 4000 },
  );
  const update = trpc.cocina.update.useMutation();

  useEffect(() => {
    if (listQuery.isSuccess) lastOkAtRef.current = Date.now();
  }, [listQuery.isSuccess, listQuery.dataUpdatedAt]);

  // Banner de "no me estoy enterando": se distingue de "no hay pedidos" --
  // confundir las dos cosas es exactamente lo que hace que a alguien no le
  // llegue su comida. Un solo intervalo creado UNA vez (deps vacías) -- si
  // dependiera de `lastOkAtRef`/estado que cambia en cada poll exitoso (cada
  // 4s), el intervalo se destruía y recreaba antes de llegar a dispararse
  // (su período es 5s, más que los 4s entre polls), y `stale` quedaba
  // pegado en el último valor que tuvo -- si se puso en `true` una vez
  // (ej. mientras `event` todavía cargaba, antes de que `listQuery` pudiera
  // arrancar), nunca se volvía a bajar aunque los pedidos siguieran llegando.
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setStale(Date.now() - lastOkAtRef.current > 30_000), 5000);
    return () => clearInterval(id);
  }, []);

  // `items` es una columna `json`, drizzle la infiere como `unknown` -- acá
  // se sabe que siempre es `{ name, quantity }[]` (lo arma `createCajaSale`).
  const active = (listQuery.data?.active ?? []) as unknown as KitchenTicketRow[];
  const recentlyDelivered = (listQuery.data?.recentlyDelivered ?? []) as unknown as KitchenTicketRow[];

  // Sonido al entrar un pedido nuevo -- compara contra la última lista
  // conocida, no contra el estado de React (que se resetea en cada poll).
  useEffect(() => {
    if (active.length === 0 && knownNumbers.current.size === 0 && firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const current = new Set(active.map((t) => t.ticketNumber));
    if (!firstLoad.current) {
      Array.from(current).forEach((n) => {
        if (!knownNumbers.current.has(n) && !muted) beep();
      });
    }
    knownNumbers.current = current;
    firstLoad.current = false;
  }, [active, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(SOUND_MUTED_KEY, next ? '1' : '0');
  };

  const doUpdate = (ticketNumber: string, to: 'aprobado' | 'entregado') => {
    if (!event) return;
    update.mutate(
      { opId: newOpId(), eventId: event.id, ticketNumber, to, clientAt: new Date().toISOString() },
      {
        onSuccess: (res) => {
          if (res.result === 'conflict') toast.warning(res.conflictNote || 'Ese pedido ya cambió de estado');
          else listQuery.refetch();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <div className="min-h-dvh bg-[#0d0810] text-white flex flex-col">
      <header className="px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0">
        <div>
          <p className="font-bold leading-tight">{event?.title ?? 'Cocina'}</p>
          <p className="text-xs text-white/45">{operatorName}</p>
        </div>
        <button onClick={toggleMute} className="p-2 text-white/60" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </header>

      {stale && (
        <div className="px-4 py-2 bg-red-500/15 border-b border-red-500/30 text-red-200 text-sm flex items-center gap-2 shrink-0">
          <WifiOff className="w-4 h-4" /> No me estoy enterando de pedidos nuevos hace rato -- revisa la conexión.
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-3">
        {active.length === 0 ? (
          <p className="text-center text-white/40 py-16">No hay pedidos pendientes.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map((t) => (
              <TicketCard key={t.id} ticket={t} onApprove={() => doUpdate(t.ticketNumber, 'aprobado')} onDeliver={() => doUpdate(t.ticketNumber, 'entregado')} />
            ))}
          </div>
        )}

        {recentlyDelivered.length > 0 && (
          <div className="mt-8">
            <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Entregados (última hora)</p>
            <div className="space-y-2">
              {recentlyDelivered.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <div>
                    <span className="font-bold">{t.customerName || t.ticketNumber}</span>
                    <span className="text-white/30 text-xs ml-2 font-mono">{t.ticketNumber}</span>
                    <span className="text-white/40 text-sm ml-2">{t.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</span>
                  </div>
                  <button onClick={() => doUpdate(t.ticketNumber, 'aprobado')} className="text-xs text-white/50 underline shrink-0">
                    Deshacer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/** Cronómetro desde que entró: gris -> ámbar a los 5min -> rojo a los 10min.
 * Es el dato que de verdad ordena una cocina: cuál lleva más rato esperando. */
function useElapsed(createdAt: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const label = `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  const tone = minutes >= 10 ? 'text-red-400' : minutes >= 5 ? 'text-amber-300' : 'text-white/50';
  return { label, tone };
}

function TicketCard({ ticket, onApprove, onDeliver }: { ticket: KitchenTicketRow; onApprove: () => void; onDeliver: () => void }) {
  const { label, tone } = useElapsed(ticket.createdAt);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-heading font-extrabold text-4xl tracking-tight">{ticket.customerName || ticket.ticketNumber}</p>
          {ticket.customerName && <p className="text-xs text-white/30 font-mono mt-0.5">{ticket.ticketNumber}</p>}
        </div>
        <span className={`text-sm font-mono ${tone}`}>{label}</span>
      </div>
      <div className="space-y-1">
        {ticket.items.map((it, i) => (
          <p key={i} className="text-lg">
            <span className="font-bold">{it.quantity}×</span> {it.name}
          </p>
        ))}
      </div>
      {ticket.note && <p className="text-sm text-white/50 italic">{ticket.note}</p>}
      <div className="flex gap-2 pt-1">
        {ticket.status === 'pendiente' && (
          <button onClick={onApprove} className="flex-1 h-12 rounded-full bg-white/10 font-bold active:scale-[0.98] transition-transform">
            Aprobar
          </button>
        )}
        <button onClick={onDeliver} className="flex-1 h-12 rounded-full bg-primary font-bold active:scale-[0.98] transition-transform">
          Entregado
        </button>
      </div>
    </div>
  );
}
