import '@/admin.css';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Search, WifiOff, X, Ticket, Car, DollarSign, ShoppingBag } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { useInstallableApp } from '@/hooks/useInstallableApp';
import { QrScanner } from '@/components/QrScanner';
import { parseTicketCodeFromQr } from '@shared/qr';
import { personasForTicket } from '@shared/mission300';
import {
  saveSnapshot, getLocalEvent, searchLocal, enqueueOp, getPendingOps,
  markOpSynced, clearSyncedOps, pendingOpsCount, correctedNow,
  type CajaAttendee,
} from './caja/db';

/* Pantalla de puerta: el anfitrión en la entrada del estacionamiento.
 *
 * Hace UNA sola cosa -- escanear, mostrar a quién corresponde el código y
 * dar acceso. No vende, no cobra, no anula. Va aparte de /caja a propósito:
 * el anfitrión no es cajero y no debería ver nunca el menú de venta.
 *
 * Reusa la cola de operaciones y el snapshot de /caja (IndexedDB es por
 * dominio, no por ruta), así que escanear funciona sin señal. */

type Ficha = {
  ticketCode: string;
  typeName: string;
  accesoSlug: string | null;
  /** Personas cubiertas por ESTE ticket cuando gana sobre accesoSlug -- la
   * invitación especial instantánea (un solo QR para todo un grupo). */
  groupSize: number | null;
  status: string;
  /** Titular + acompañantes, cada uno con su propio nombre y RUT -- ver
   * `caja/db.ts`. */
  attendees: { name: string; rut: string | null }[];
  extras: { typeName: string; status: string }[];
  buyerName: string;
};

function newOpId() {
  return crypto.randomUUID();
}

export default function Puerta() {
  useSeo({ title: 'Puerta — Mansion Playroom', description: 'Control de acceso.', path: '/puerta', noindex: true });
  // Instalable en la pantalla de inicio: el anfitrión escanea de pie, sin la
  // barra del navegador ocupando espacio.
  useInstallableApp('/puerta.webmanifest', '/puerta/sw.js', '/puerta/', 'Puerta');

  const me = trpc.puerta.me.useQuery();
  if (me.isLoading) {
    return <div className="min-h-dvh grid place-items-center puerta-bg"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!me.data) return <Login onDone={() => me.refetch()} />;
  return <Scanner operatorName={me.data.name} />;
}

/* --- Login ---------------------------------------------------------------- */

function Login({ onDone }: { onDone: () => void }) {
  const { data: operators } = trpc.puerta.listOperators.useQuery();
  const [operatorId, setOperatorId] = useState<number | null>(null);
  const [pin, setPin] = useState('');

  const login = trpc.puerta.login.useMutation({
    onSuccess: onDone,
    onError: (e) => { toast.error(e.message); setPin(''); },
  });

  return (
    <div className="min-h-dvh puerta-bg text-white px-5 py-10">
      <div className="max-w-sm mx-auto">
        <img
          src="/candyland/logo-wordmark.webp"
          alt="Mansion Playroom"
          className="h-12 w-auto mx-auto mb-6"
        />
        <h1 className="font-heading font-extrabold text-3xl tracking-tight text-center mb-1">Puerta</h1>
        <p className="text-white/45 text-sm text-center mb-8">Control de acceso</p>

        {!operatorId ? (
          <>
            <p className="text-xs uppercase tracking-wide text-white/50 mb-2">¿Quién eres?</p>
            <div className="space-y-2">
              {operators?.map((o: any) => (
                <button
                  key={o.id}
                  onClick={() => setOperatorId(o.id)}
                  className="glass-btn w-full h-14 rounded-2xl text-left px-5 font-semibold text-white/95"
                >
                  {o.name}
                </button>
              ))}
              {operators?.length === 0 && (
                <p className="text-sm text-white/40 text-center py-6">
                  No hay nadie con permiso de puerta. Pídele a un admin que te cree un usuario con rol "acceso".
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
              className="glass-surface w-full h-16 px-5 rounded-2xl text-white text-2xl tracking-[0.4em] text-center focus:outline-none"
            />
            <button
              disabled={pin.length < 4 || login.isPending}
              onClick={() => login.mutate({ operatorId, pin })}
              className="glass-btn-primary w-full h-14 mt-5 rounded-full text-white font-bold disabled:opacity-35"
            >
              {login.isPending ? 'Entrando…' : 'Entrar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* --- Escáner -------------------------------------------------------------- */

function Scanner({ operatorName }: { operatorName: string }) {
  const [scanning, setScanning] = useState(true);

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [localEvent, setLocalEvent] = useState<{ id: number; title: string } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CajaAttendee[]>([]);

  const { data: remoteEvent } = trpc.puerta.activeEvent.useQuery();
  const snapshotQuery = trpc.puerta.snapshot.useQuery(
    { eventId: remoteEvent?.id ?? 0 },
    { enabled: !!remoteEvent, refetchInterval: 60_000 },
  );
  const syncMutation = trpc.puerta.sync.useMutation();

  useEffect(() => { getLocalEvent().then((e) => e && setLocalEvent(e)); }, []);
  useEffect(() => {
    if (snapshotQuery.data) saveSnapshot(snapshotQuery.data).then(() => setLocalEvent(snapshotQuery.data!.event));
  }, [snapshotQuery.data]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refreshPending = useCallback(() => { pendingOpsCount().then(setPending); }, []);
  useEffect(() => { refreshPending(); }, [refreshPending]);

  // Vaciado de la cola. Solo manda los check-in: la puerta comparte la cola
  // con la caja pero no tiene permiso para nada más.
  useEffect(() => {
    const run = async () => {
      if (!isOnline || !localEvent) return;
      const ops = (await getPendingOps()).filter((o) => o.op.type === 'checkin');
      if (ops.length === 0) return;
      try {
        const results = await syncMutation.mutateAsync({
          eventId: localEvent.id,
          ops: ops.slice(0, 50).map((o) => o.op as { type: 'checkin'; opId: string; ticketCode: string; clientAt: string }),
        });
        for (const [opId, res] of Object.entries(results)) {
          await markOpSynced(opId, res.result, res.conflictNote);
          if (res.result === 'conflict') toast.warning(res.conflictNote || 'Conflicto al sincronizar');
        }
        await clearSyncedOps();
        refreshPending();
      } catch {
        // Sin red real -- se reintenta en el próximo tick.
      }
    };
    const id = setInterval(run, 5000);
    run();
    return () => clearInterval(id);
  }, [isOnline, localEvent, syncMutation, refreshPending]);

  // Busca el código en el snapshot local: así la ficha aparece igual de
  // rápido con o sin señal.
  const buildFicha = useCallback(async (ticketCode: string): Promise<Ficha | null> => {
    const found = await searchLocal(ticketCode);
    const attendee = found[0];
    if (!attendee) return null;
    const acc = attendee.access.find((a) => a.ticketCode.toUpperCase() === ticketCode.toUpperCase());
    if (!acc) return null;
    return {
      ticketCode: acc.ticketCode,
      typeName: acc.typeName,
      accesoSlug: acc.accesoSlug,
      groupSize: acc.groupSize ?? null,
      status: acc.status,
      attendees: attendee.attendees?.length ? attendee.attendees : [{ name: attendee.buyerName, rut: null }],
      extras: attendee.extras.map((e) => ({ typeName: e.typeName, status: e.status })),
      buyerName: attendee.buyerName,
    };
  }, []);

  const handleCode = useCallback(async (raw: string) => {
    const code = parseTicketCodeFromQr(raw);
    if (!code) return;
    setScanning(false);
    const f = await buildFicha(code);
    if (!f) {
      // Sin ficha local: puede ser de otro evento o de una compra hecha
      // en el último minuto, todavía no descargada.
      setFicha({ ticketCode: code, typeName: '', accesoSlug: null, groupSize: null, status: 'desconocido', attendees: [], extras: [], buyerName: '' });
    } else {
      setFicha(f);
    }
    navigator.vibrate?.(60);
  }, [buildFicha]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    searchLocal(q).then(setResults);
  }, [query]);

  const darAcceso = async (ticketCode: string) => {
    await enqueueOp({ opId: newOpId(), type: 'checkin', ticketCode, clientAt: (await correctedNow()).toISOString() });
    toast.success('Acceso dado ✅');
    refreshPending();
    setFicha(null);
    setBuscando(false);
    setQuery('');
    setScanning(true);
  };

  // No cierra la ficha (a diferencia de darAcceso): el anfitrión puede
  // seguir viendo los nombres/RUT mientras confirma con el auto, y recién
  // cierra con "Aprobar acceso" o "Volver a escanear".
  const cobrarEstacionamiento = async (ticketCode: string, metodo: 'efectivo' | 'debito' | 'credito') => {
    await enqueueOp({ opId: newOpId(), type: 'parking_paid', ticketCode, paymentMethod: metodo, clientAt: (await correctedNow()).toISOString() });
    toast.success('Estacionamiento cobrado 🅿️');
    refreshPending();
    setFicha((prev) => (prev && prev.ticketCode === ticketCode)
      ? { ...prev, extras: [...prev.extras, { typeName: 'Estacionamiento', status: 'used' }] }
      : prev);
  };

  const cerrar = () => { setFicha(null); setScanning(true); };

  return (
    <div className="min-h-dvh puerta-bg text-white flex flex-col">
      <header
        className="px-4 py-3 flex items-center justify-between border-b border-white/10 shrink-0 gap-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/candyland/logo-isotipo.webp" alt="" aria-hidden className="h-8 w-8 rounded-lg shrink-0" />
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate">{localEvent?.title ?? 'Puerta'}</p>
            <p className="text-xs text-white/45">{operatorName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isOnline && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 inline-flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Sin señal
            </span>
          )}
          {pending > 0 && <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/60">{pending} por enviar</span>}
          <button onClick={() => setBuscando(true)} className="p-2 text-white/60" aria-label="Buscar por nombre">
            <Search className="w-5 h-5" />
          </button>
        </div>
      </header>

      <QrScanner
        paused={!scanning}
        onDecode={handleCode}
        className="flex-1"
        onError={() => toast.message('Igual puedes buscar por nombre con la lupa de arriba.')}
      >
        {/* Marco de puntería: le dice al anfitrión dónde poner el QR. */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="w-56 h-56 rounded-3xl border-2 border-primary/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
        </div>
        <p className="absolute bottom-6 inset-x-0 text-center text-sm text-white/70 inline-flex items-center justify-center gap-2">
          <Camera className="w-4 h-4" /> Apunta al QR de la entrada
        </p>
      </QrScanner>

      {ficha && (
        <FichaVerificacion
          ficha={ficha}
          onAceptar={() => darAcceso(ficha.ticketCode)}
          onCerrar={cerrar}
          onCobrarEstacionamiento={(metodo) => cobrarEstacionamiento(ficha.ticketCode, metodo)}
        />
      )}

      {buscando && (
        <BuscarPorNombre
          query={query}
          onQuery={setQuery}
          results={results}
          onPick={async (code) => {
            const f = await buildFicha(code);
            if (f) { setFicha(f); setBuscando(false); }
          }}
          onClose={() => { setBuscando(false); setQuery(''); }}
        />
      )}
    </div>
  );
}

/* --- Ficha de verificación ------------------------------------------------ */

function FichaVerificacion({ ficha, onAceptar, onCerrar, onCobrarEstacionamiento }: {
  ficha: Ficha;
  onAceptar: () => void;
  onCerrar: () => void;
  onCobrarEstacionamiento: (metodo: 'efectivo' | 'debito' | 'credito') => void;
}) {
  const personas = personasForTicket(ficha.groupSize, ficha.accesoSlug);
  const puedeEntrar = ficha.status === 'valid';
  const [cobrando, setCobrando] = useState(false);

  // El estacionamiento es lo primero que el anfitrión necesita saber para
  // decirle al auto dónde ir, así que va destacado y aparte del resto.
  const estacionamiento = ficha.extras.filter((e) => /estacionamiento|parking/i.test(e.typeName));
  const otrosExtras = ficha.extras.filter((e) => !/estacionamiento|parking/i.test(e.typeName));
  // El admin crea "Estacionamiento VIP" como un extra más -- el nombre es la
  // única señal de que es VIP, así que se distingue con esa misma palabra.
  const esVip = (nombre: string) => /vip/i.test(nombre);

  return (
    <div className="fixed inset-0 z-50 puerta-bg flex flex-col">
      <div className="flex-1 overflow-y-auto p-5 max-w-lg w-full mx-auto">
        <div className="flex justify-end -mt-1 -mr-1 mb-2">
          <button onClick={onCerrar} className="p-2 text-white/40" aria-label="Cerrar"><X className="w-6 h-6" /></button>
        </div>

        {ficha.status === 'used' && <Estado tono="amber" titulo="Esta entrada ya fue usada" detalle="Alguien ya entró con este código. Confirma con un supervisor antes de dejar pasar." />}
        {ficha.status === 'cancelled' && <Estado tono="red" titulo="Entrada anulada" detalle="No dar acceso." />}
        {ficha.status === 'desconocido' && <Estado tono="red" titulo="No encontramos esta entrada" detalle={`Código ${ficha.ticketCode}. Puede ser de otro evento, o una compra de último minuto que aún no descargamos. Revisa con conexión.`} />}

        {puedeEntrar && (
          <>
            <div className="glass-surface rounded-[28px] p-6 mb-4 relative bg-gradient-to-br from-primary/20 to-transparent">
              <span className="glass-btn absolute top-5 right-5 w-9 h-9 rounded-full grid place-items-center">
                <Ticket className="w-4 h-4 text-primary" />
              </span>
              <p className="text-xs uppercase tracking-widest text-white/55 mb-1">Acceso</p>
              <p className="font-heading font-extrabold text-4xl tracking-tight pr-12 leading-[1.05]">{ficha.typeName}</p>
              <p className="text-sm text-white/60 mt-1.5">{personas} {personas === 1 ? 'persona' : 'personas'}</p>
            </div>

            {/* Cada persona del acceso con SU nombre y SU RUT -- no solo el
             * titular -- porque el anfitrión compara a cada una contra su
             * propia cédula. El tamaño de letra se achica un poco a medida
             * que hay más personas, para que todas quepan sin scroll en un
             * Dúo/Trío/grupo sin dejar de leerse bien. */}
            <div className="glass-surface rounded-3xl p-5 mb-4 divide-y divide-white/10">
              {ficha.attendees.map((p, i) => {
                const n = ficha.attendees.length;
                const nameSize = n <= 1 ? 'text-2xl' : n === 2 ? 'text-xl' : 'text-lg';
                const rutSize = n <= 1 ? 'text-4xl' : n === 2 ? 'text-3xl' : 'text-2xl';
                return (
                  <div key={i} className={i === 0 ? 'pb-3.5' : 'py-3.5'}>
                    <p className="text-xs uppercase tracking-widest text-white/45 mb-1">
                      {ficha.attendees.length > 1 ? `Persona ${i + 1}` : 'A nombre de'}
                    </p>
                    <p className={`${nameSize} font-bold leading-snug`}>{p.name}</p>
                    {p.rut ? (
                      <p className={`${rutSize} font-mono font-bold tracking-wider mt-1`}>{p.rut}</p>
                    ) : (
                      <p className="text-sm text-amber-200/80 mt-1">RUT no registrado — pídelo verbalmente</p>
                    )}
                  </div>
                );
              })}
            </div>

            {estacionamiento.length > 0 && (
              <div className="glass-surface rounded-2xl p-4 mb-3 relative bg-gradient-to-br from-candy-blue/20 to-transparent">
                <span className="glass-btn absolute top-3.5 right-3.5 w-8 h-8 rounded-full grid place-items-center">
                  <Car className="w-3.5 h-3.5 text-candy-blue" />
                </span>
                <p className="text-xs uppercase tracking-widest text-white/55 mb-1 pr-9">Estacionamiento</p>
                {estacionamiento.map((e, i) => (
                  <p key={i} className={`font-bold text-lg ${esVip(e.typeName) ? 'text-amber-300' : ''}`}>
                    {esVip(e.typeName) ? '⭐' : '🅿️'} {e.typeName}
                  </p>
                ))}
              </div>
            )}

            {/* Solo se ofrece cobrar si esta ficha todavía NO tiene
             * estacionamiento -- online, de staff, o ya cobrado acá mismo.
             * No es obligatorio antes de dar acceso: no trabar la fila por
             * alguien que llegó a pie. */}
            {estacionamiento.length === 0 && (
              <div className="glass-surface rounded-2xl p-4 mb-3 relative bg-gradient-to-br from-candy-blue/10 to-transparent">
                <span className="glass-btn absolute top-3.5 right-3.5 w-8 h-8 rounded-full grid place-items-center">
                  <DollarSign className="w-3.5 h-3.5 text-candy-blue" />
                </span>
                <p className="text-xs uppercase tracking-widest text-white/55 mb-2 pr-9">¿Paga estacionamiento ahora?</p>
                {cobrando ? (
                  <p className="text-sm text-white/50">Cobrando…</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(['efectivo', 'debito', 'credito'] as const).map((metodo) => (
                      <button
                        key={metodo}
                        onClick={() => { setCobrando(true); onCobrarEstacionamiento(metodo); }}
                        className="glass-btn h-12 rounded-xl text-sm font-semibold capitalize text-white/95"
                      >
                        {metodo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {otrosExtras.length > 0 && (
              <div className="glass-surface rounded-2xl p-4 mb-3 relative">
                <span className="glass-btn absolute top-3.5 right-3.5 w-8 h-8 rounded-full grid place-items-center">
                  <ShoppingBag className="w-3.5 h-3.5 text-white/70" />
                </span>
                <p className="text-xs uppercase tracking-widest text-white/55 mb-1.5 pr-9">También compró</p>
                {otrosExtras.map((e, i) => (
                  <p key={i} className="text-sm text-white/80">{e.typeName}{e.status === 'used' ? ' · ya retirado' : ''}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div
        className="p-4 shrink-0 space-y-2.5 max-w-lg w-full mx-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {puedeEntrar && (
          <>
            <p className="text-center text-sm text-amber-200/90 font-semibold px-2">
              Revisa la cédula y compara con los nombres de arriba
            </p>
            <button onClick={onAceptar} className="glass-btn-primary w-full h-16 rounded-full text-white text-lg font-bold">
              Coincide — dar acceso
            </button>
          </>
        )}
        <button onClick={onCerrar} className="glass-btn w-full h-13 rounded-full text-white/85 font-semibold">
          {puedeEntrar ? 'No coincide / cancelar' : 'Volver a escanear'}
        </button>
      </div>
    </div>
  );
}

function Estado({ tono, titulo, detalle }: { tono: 'red' | 'amber'; titulo: string; detalle: string }) {
  const cls = tono === 'red'
    ? 'border-red-500/40 bg-red-500/12 text-red-200'
    : 'border-amber-500/40 bg-amber-500/12 text-amber-200';
  return (
    <div className={`rounded-3xl border p-5 mb-4 ${cls}`}>
      <p className="font-heading font-extrabold text-xl tracking-tight mb-1">{titulo}</p>
      <p className="text-sm opacity-90 leading-relaxed">{detalle}</p>
    </div>
  );
}

/* --- Respaldo: buscar por nombre ------------------------------------------ */

function BuscarPorNombre({ query, onQuery, results, onPick, onClose }: {
  query: string;
  onQuery: (q: string) => void;
  results: CajaAttendee[];
  onPick: (ticketCode: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 puerta-bg flex flex-col p-4">
      <div className="flex items-center gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          autoFocus
          placeholder="Nombre, correo o teléfono"
          className="flex-1 h-13 px-4 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-base placeholder:text-white/25 focus:outline-none focus:border-primary/50"
        />
        <button onClick={onClose} className="p-2 text-white/50" aria-label="Cerrar"><X className="w-6 h-6" /></button>
      </div>

      <p className="text-xs text-white/35 mb-3">
        Para cuando alguien llega sin el QR a mano.
      </p>

      <div className="flex-1 overflow-y-auto space-y-2">
        {results.map((r) => (
          <div key={r.orderId} className="p-4 rounded-2xl bg-white/[0.04] border border-white/10">
            <p className="font-semibold">{r.buyerName}</p>
            <p className="text-xs text-white/45 mb-2">{r.buyerEmail}</p>
            {r.access.map((a) => (
              <button
                key={a.ticketCode}
                onClick={() => onPick(a.ticketCode)}
                disabled={a.status !== 'valid'}
                className="w-full mt-1.5 h-11 rounded-xl bg-primary/15 border border-primary/30 text-sm font-semibold disabled:opacity-35"
              >
                {a.typeName}{a.status === 'used' ? ' · ya entró' : ''}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
