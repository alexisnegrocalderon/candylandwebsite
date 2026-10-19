import '@/admin.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Camera, Car, Check, DollarSign, Flashlight, ListChecks, LogOut, ScanLine, Search, ShoppingBag, Ticket, Users, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { useInstallableApp } from '@/hooks/useInstallableApp';
import { QrScanner } from '@/components/QrScanner';
import { TerminalFrame, TerminalLogin, TerminalSpinner, loginErrorToast, playTone, useWakeLock, vibrateAlert } from '@/components/terminal/TerminalShell';
import { OPERATOR_ROLE_LABELS } from '@shared/cajaRoles';
import { parseTicketCodeFromQr } from '@shared/qr';
import { personasForTicket } from '@shared/mission300';
import {
  saveSnapshot, getLocalEvent, searchLocal, enqueueOp, getPendingOps,
  markOpSynced, clearSyncedOps, pendingOpsCount, correctedNow, countCheckedInPersonas,
  type CajaAttendee,
} from './caja/db';

/* Pantalla de puerta: el anfitrión en la entrada del estacionamiento (se usa
 * desde su celular). Mismo vidrio oscuro que /caja, el panel admin y los
 * demás terminales.
 *
 * Hace UNA sola cosa -- escanear, mostrar a quién corresponde el código y
 * dar acceso. No vende, no cobra, no anula. Va aparte de /caja a propósito:
 * el anfitrión no es cajero y no debería ver nunca el menú de venta.
 *
 * Reusa la cola de operaciones y el snapshot de /caja (IndexedDB es por
 * dominio, no por ruta), así que escanear funciona sin señal.
 *
 * Barra de abajo: Escanear (cámara), Buscar (por nombre o tecleando el
 * código) e Ingresos (lo que se dio acceso desde este celular). */

type Ficha = {
  ticketCode: string;
  typeName: string;
  accesoSlug: string | null;
  /** Personas cubiertas por ESTE ticket cuando gana sobre accesoSlug -- la
   * invitación especial instantánea (un solo QR para todo un grupo). */
  groupSize: number | null;
  status: string;
  /** Titular + acompañantes, cada uno con su propio nombre y documento -- ver
   * `caja/db.ts`. */
  attendees: { name: string; rut: string | null; docType: 'rut' | 'passport' }[];
  extras: { typeName: string; status: string }[];
  buyerName: string;
  /** Entró por el link de una campaña aliada: primera vez en Playroom. */
  partnerBadge?: { label: string; emoji: string; refLabel: string | null } | null;
};

type Tab = 'escanear' | 'buscar' | 'ingresos';

/** Un acceso dado desde este celular, para el historial de "Ingresos". */
type HistoryEntry = { opId: string; ticketCode: string; typeName: string; names: string[]; personas: number; at: string };

const SOUND_MUTED_KEY = 'puerta_sound_muted';
const HISTORY_MAX = 100;
const FLASH_MS = 1400;
/** Mismo QR todavía a la vista de la cámara justo después de cerrar la
 * ficha: se ignora un rato para no volver a abrirla. */
const REPEAT_SCAN_GUARD_MS = 2500;

function historyKey(eventId: number) {
  return `puerta_history:${eventId}`;
}
function loadHistory(eventId: number): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(historyKey(eventId)) || '[]'); } catch { return []; }
}

function newOpId() {
  return crypto.randomUUID();
}

export default function Puerta() {
  useSeo({ title: 'Puerta — Mansion Playroom', description: 'Control de acceso.', path: '/puerta', noindex: true });
  // Instalable en la pantalla de inicio: el anfitrión escanea de pie, sin la
  // barra del navegador ocupando espacio.
  useInstallableApp('/puerta/sw.js', '/puerta/');
  return (
    <TerminalFrame>
      <Gate />
    </TerminalFrame>
  );
}

function Gate() {
  const me = trpc.puerta.me.useQuery();
  if (me.isLoading) return <TerminalSpinner />;
  if (!me.data) return <Login onDone={() => me.refetch()} />;
  return <Scanner operatorName={me.data.name} operatorRole={me.data.role} />;
}

/* --- Login ---------------------------------------------------------------- */

function Login({ onDone }: { onDone: () => void }) {
  const { data: operators } = trpc.puerta.listOperators.useQuery();
  const login = trpc.puerta.login.useMutation({ onSuccess: onDone, onError: loginErrorToast });
  return (
    <TerminalLogin
      title="Puerta"
      operators={operators as any}
      emptyText='No hay nadie con permiso de puerta. Pídele a un admin que te cree un usuario con rol "acceso".'
      pending={login.isPending}
      onSubmit={(operatorId, pin, onError) => login.mutate({ operatorId, pin }, { onError })}
    />
  );
}

/* --- Escáner -------------------------------------------------------------- */

function Scanner({ operatorName, operatorRole }: { operatorName: string; operatorRole: string }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>('escanear');
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [localEvent, setLocalEvent] = useState<{ id: number; title: string } | null>(null);
  const [counts, setCounts] = useState<{ entered: number; expected: number } | null>(null);
  const [muted, setMuted] = useState(() => localStorage.getItem(SOUND_MUTED_KEY) === '1');
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [flash, setFlash] = useState<{ names: string; personas: number } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const recentRef = useRef<{ code: string; until: number }>({ code: '', until: 0 });

  useWakeLock();

  const { data: remoteEvent } = trpc.puerta.activeEvent.useQuery();
  const snapshotQuery = trpc.puerta.snapshot.useQuery(
    { eventId: remoteEvent?.id ?? 0 },
    { enabled: !!remoteEvent, refetchInterval: 60_000 },
  );
  const syncMutation = trpc.puerta.sync.useMutation();
  const logout = trpc.puerta.logout.useMutation({ onSuccess: () => utils.puerta.me.invalidate() });

  const refreshCounts = useCallback(() => { countCheckedInPersonas().then(setCounts).catch(() => {}); }, []);

  useEffect(() => { getLocalEvent().then((e) => e && setLocalEvent(e)); }, []);
  useEffect(() => {
    if (snapshotQuery.data) saveSnapshot(snapshotQuery.data).then(() => { setLocalEvent(snapshotQuery.data!.event); refreshCounts(); });
  }, [snapshotQuery.data, refreshCounts]);
  useEffect(() => { refreshCounts(); }, [refreshCounts]);
  useEffect(() => { if (localEvent) setHistory(loadHistory(localEvent.id)); }, [localEvent?.id]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refreshPending = useCallback(() => {
    pendingOpsCount().then(setPending);
    getPendingOps().then((ops) => setPendingIds(new Set(ops.map((o) => o.opId))));
  }, []);
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
      attendees: attendee.attendees?.length ? attendee.attendees : [{ name: attendee.buyerName, rut: null, docType: 'rut' as const }],
      extras: attendee.extras.map((e) => ({ typeName: e.typeName, status: e.status })),
      buyerName: attendee.buyerName,
      partnerBadge: attendee.partnerBadge ?? null,
    };
  }, []);

  const showFicha = useCallback((f: Ficha) => {
    setFicha(f);
    // Sonido y vibración distintos según el resultado: se reacciona sin leer.
    if (f.status === 'valid') {
      if (!muted) playTone('ok');
      vibrateAlert(60);
    } else {
      if (!muted) playTone(f.status === 'used' ? 'warn' : 'error');
      vibrateAlert([200, 100, 200]);
    }
  }, [muted]);

  const handleCode = useCallback(async (raw: string) => {
    const code = parseTicketCodeFromQr(raw);
    if (!code) return;
    if (recentRef.current.code === code && Date.now() < recentRef.current.until) return;
    const f = await buildFicha(code);
    // Sin ficha local: puede ser de otro evento o de una compra hecha en el
    // último minuto, todavía no descargada.
    showFicha(f ?? { ticketCode: code, typeName: '', accesoSlug: null, groupSize: null, status: 'desconocido', attendees: [], extras: [], buyerName: '' });
  }, [buildFicha, showFicha]);

  const guardRepeat = (code: string) => { recentRef.current = { code, until: Date.now() + REPEAT_SCAN_GUARD_MS }; };

  const darAcceso = async (f: Ficha) => {
    const opId = newOpId();
    const at = (await correctedNow()).toISOString();
    await enqueueOp({ opId, type: 'checkin', ticketCode: f.ticketCode, clientAt: at });
    const personas = personasForTicket(f.groupSize, f.accesoSlug);
    const names = f.attendees.map((p) => p.name).filter(Boolean);
    // Historial de lo dado desde este celular (solo local).
    if (localEvent) {
      const next = [{ opId, ticketCode: f.ticketCode, typeName: f.typeName, names, personas, at }, ...loadHistory(localEvent.id)].slice(0, HISTORY_MAX);
      try { localStorage.setItem(historyKey(localEvent.id), JSON.stringify(next)); } catch { /* sin storage */ }
      setHistory(next);
    }
    refreshPending();
    refreshCounts();
    guardRepeat(f.ticketCode);
    setFicha(null);
    setTab('escanear');
    // Destello verde con el nombre y la cámara queda lista para el siguiente.
    setFlash({ names: names.join(' · ') || f.buyerName, personas });
    setTimeout(() => setFlash(null), FLASH_MS);
  };

  // No cierra la ficha (a diferencia de darAcceso): el anfitrión puede
  // seguir viendo los nombres/RUT mientras confirma con el auto, y recién
  // cierra con "Coincide — dar acceso" o "No coincide / cancelar".
  //
  // Nunca con saldo (decisión explícita del dueño): el estacionamiento se
  // paga como extra en el checkout online, o acá mismo en la puerta con
  // efectivo/débito/crédito -- nunca descontando la tarjeta de membresía.
  const cobrarEstacionamiento = async (ticketCode: string, metodo: 'efectivo' | 'debito' | 'credito') => {
    await enqueueOp({ opId: newOpId(), type: 'parking_paid', ticketCode, paymentMethod: metodo, clientAt: (await correctedNow()).toISOString() });
    toast.success('Estacionamiento cobrado 🅿️');
    refreshPending();
    setFicha((prev) => (prev && prev.ticketCode === ticketCode)
      ? { ...prev, extras: [...prev.extras, { typeName: 'Estacionamiento', status: 'used' }] }
      : prev);
  };

  const cerrar = () => {
    if (ficha) guardRepeat(ficha.ticketCode);
    setFicha(null);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(SOUND_MUTED_KEY, next ? '1' : '0');
  };

  const goTab = (t: Tab) => {
    setTab(t);
    if (t !== 'escanear') { setTorch(false); setTorchSupported(false); }
    if (t === 'ingresos') refreshPending();
  };

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none text-white flex flex-col">
      <header className="shrink-0 z-10 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 space-y-2">
        <div className="admin-glass-panel admin-glass-panel-sm flex items-center gap-3 px-4 py-2.5">
          <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-lg leading-tight">{localEvent?.title ?? 'Puerta'}</p>
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

        <div className="flex flex-wrap items-center gap-2">
          <span className="admin-glass-panel admin-glass-panel-sm inline-flex items-center gap-2 px-3.5 py-1.5 text-sm">
            <Users className="h-4 w-4 text-emerald-300" />
            <span>Entraron <span className="font-bold tabular-nums text-emerald-300">{counts?.entered ?? '—'}</span>{counts ? <> de <span className="tabular-nums">{counts.expected}</span></> : null}</span>
          </span>
          {!isOnline && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs text-amber-300">
              <WifiOff className="h-3 w-3" /> Sin señal
            </span>
          )}
          {pending > 0 && <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/70">{pending} por enviar</span>}
        </div>
      </header>

      <main className="relative flex-1 min-h-0 px-3 pb-2">
        {tab === 'escanear' && (
          <div className="relative h-full overflow-hidden rounded-3xl border border-white/10">
            <QrScanner
              paused={!!ficha}
              onDecode={handleCode}
              torch={torch}
              onTorchSupport={setTorchSupported}
              className="h-full"
              onError={() => toast.message('Igual puedes buscar por nombre o código en la pestaña Buscar.')}
            >
              {/* Marco de puntería: le dice al anfitrión dónde poner el QR. */}
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="h-56 w-56 rounded-3xl border-2 border-primary/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
              </div>
              <p className="pointer-events-none absolute bottom-5 inset-x-0 inline-flex items-center justify-center gap-2 text-center text-sm text-white/80">
                <Camera className="h-4 w-4" /> Apunta al QR de la entrada
              </p>
            </QrScanner>
            {torchSupported && (
              <button
                onClick={() => setTorch((v) => !v)}
                aria-pressed={torch}
                aria-label={torch ? 'Apagar linterna' : 'Encender linterna'}
                className={`absolute right-3 top-3 grid h-12 w-12 place-items-center rounded-full backdrop-blur-md active:scale-95 ${torch ? 'bg-amber-400 text-black' : 'bg-black/50 text-white'}`}
              >
                <Flashlight className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        {tab === 'buscar' && (
          <BuscarPanel
            onPick={async (code) => {
              const f = await buildFicha(code);
              if (f) showFicha(f);
            }}
            onCode={handleCode}
          />
        )}

        {tab === 'ingresos' && <IngresosPanel history={history} pendingIds={pendingIds} />}

        {flash && (
          <div role="status" className="pointer-events-none absolute inset-x-6 top-4 z-30 flex items-center gap-3 rounded-2xl bg-emerald-500 px-4 py-3 text-black shadow-[0_0_30px_-4px_rgba(16,185,129,0.9)]">
            <Check className="h-7 w-7 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold">Acceso dado · {flash.personas} {flash.personas === 1 ? 'persona' : 'personas'}</p>
              <p className="truncate text-base font-extrabold">{flash.names}</p>
            </div>
          </div>
        )}
      </main>

      <nav aria-label="Secciones de la puerta" className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1">
        <div className="admin-glass-panel flex items-stretch justify-around gap-1 px-1 py-1.5">
          {([
            ['escanear', 'Escanear', ScanLine, 0],
            ['buscar', 'Buscar', Search, 0],
            ['ingresos', 'Ingresos', ListChecks, pending],
          ] as const).map(([value, label, Icon, badge]) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => goTab(value)}
                aria-current={active ? 'page' : undefined}
                className={`admin-tabbar-item relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 ${active ? 'admin-tabbar-item-active' : ''}`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate text-[12px] font-medium leading-none">{label}</span>
                {badge > 0 && <span className="admin-badge absolute right-2 top-1">{badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {ficha && (
        <FichaVerificacion
          ficha={ficha}
          onAceptar={() => darAcceso(ficha)}
          onCerrar={cerrar}
          onCobrarEstacionamiento={(metodo) => cobrarEstacionamiento(ficha.ticketCode, metodo)}
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
  onCobrarEstacionamiento: (metodo: 'efectivo' | 'debito' | 'credito') => Promise<void>;
}) {
  const personas = personasForTicket(ficha.groupSize, ficha.accesoSlug);
  const puedeEntrar = ficha.status === 'valid';
  const [cobrando, setCobrando] = useState(false);

  // Entrada ya usada / anulada / desconocida: aviso grande de pantalla
  // completa, con el color del problema -- no se puede confundir con una
  // entrada válida ni pasar por alto al apuro.
  if (!puedeEntrar) {
    const used = ficha.status === 'used';
    const titulo = used ? 'ENTRADA YA USADA' : ficha.status === 'cancelled' ? 'ENTRADA ANULADA' : 'NO ENCONTRAMOS LA ENTRADA';
    const detalle = used
      ? 'Alguien ya entró con este código. No dejes pasar: confirma con un supervisor.'
      : ficha.status === 'cancelled'
      ? 'No dar acceso.'
      : `Código ${ficha.ticketCode}. Puede ser de otro evento, o una compra de último minuto que aún no descargamos. Revisa con conexión.`;
    const tono = used ? { bg: 'from-amber-600/50', text: 'text-amber-200', btn: 'bg-amber-400 text-black' } : { bg: 'from-red-600/50', text: 'text-red-200', btn: 'bg-red-500 text-white' };
    return (
      <div role="alertdialog" aria-label={titulo} className={`fixed inset-0 z-50 flex flex-col bg-[#0b0612] bg-gradient-to-b ${tono.bg} to-transparent p-5`}>
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center text-center">
          <AlertTriangle className={`mb-5 h-20 w-20 ${tono.text}`} />
          <h1 className={`font-heading text-4xl font-extrabold leading-tight tracking-tight ${tono.text}`}>{titulo}</h1>
          <p className="mt-4 text-lg leading-relaxed text-white/85">{detalle}</p>
          {ficha.typeName && (
            <div className="admin-tile mt-6 w-full rounded-3xl p-5 text-left">
              <p className="text-xs uppercase tracking-widest text-white/50">Acceso</p>
              <p className="font-heading text-2xl font-bold">{ficha.typeName}</p>
              {ficha.attendees.map((p, i) => (
                <p key={i} className="mt-1 text-base text-white/80">{p.name}{p.rut ? ` · ${p.rut}` : ''}</p>
              ))}
            </div>
          )}
        </div>
        <div className="mx-auto w-full max-w-lg pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button onClick={onCerrar} className={`h-16 w-full rounded-full text-lg font-bold active:scale-[0.99] ${tono.btn}`}>
            Entendido — no dar acceso
          </button>
        </div>
      </div>
    );
  }

  const cobrarConMetodo = async (metodo: 'efectivo' | 'debito' | 'credito') => {
    setCobrando(true);
    try {
      await onCobrarEstacionamiento(metodo);
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo cobrar el estacionamiento -- intenta de nuevo.', { duration: 8000 });
      setCobrando(false);
    }
  };

  // El estacionamiento es lo primero que el anfitrión necesita saber para
  // decirle al auto dónde ir, así que va destacado y aparte del resto.
  const estacionamiento = ficha.extras.filter((e) => /estacionamiento|parking/i.test(e.typeName));
  const otrosExtras = ficha.extras.filter((e) => !/estacionamiento|parking/i.test(e.typeName));
  // El admin crea "Estacionamiento VIP" como un extra más -- el nombre es la
  // única señal de que es VIP, así que se distingue con esa misma palabra.
  const esVip = (nombre: string) => /vip/i.test(nombre);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0612]">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Banda verde: puede entrar. */}
        <div className="bg-gradient-to-b from-emerald-600/45 to-transparent px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto max-w-lg">
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400 px-3 py-1 text-sm font-extrabold text-black">
                <Check className="h-4 w-4" /> PUEDE ENTRAR
              </span>
              <button onClick={onCerrar} className="grid h-11 w-11 place-items-center rounded-full text-white/70 active:bg-white/10" aria-label="Cerrar"><X className="h-6 w-6" /></button>
            </div>
            <div className="relative">
              <span className="absolute right-0 top-1 grid h-9 w-9 place-items-center rounded-full bg-white/10"><Ticket className="h-4 w-4 text-primary" /></span>
              <p className="text-xs uppercase tracking-widest text-white/60">Acceso</p>
              <p className="pr-12 font-heading text-4xl font-extrabold leading-[1.05] tracking-tight">{ficha.typeName}</p>
              <p className="mt-1.5 text-base text-white/75">{personas} {personas === 1 ? 'persona' : 'personas'}</p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-lg px-5 pb-4">
          {/* Comunidad aliada: vienen por primera vez a Playroom. */}
          {ficha.partnerBadge && (
            <div className="mb-4 rounded-3xl border border-cyan-300/40 bg-cyan-400/15 p-4">
              <p className="text-lg font-bold">{ficha.partnerBadge.emoji} Primera vez · {ficha.partnerBadge.label}</p>
              {ficha.partnerBadge.refLabel && <p className="text-sm text-white/70">Invitados de {ficha.partnerBadge.refLabel}</p>}
              <p className="mt-1.5 text-sm text-white/80">Dales la bienvenida y recuérdales lo básico: respeto, consentimiento y cuidar su estado.</p>
            </div>
          )}

          {/* Cada persona del acceso con SU nombre y SU RUT -- no solo el
           * titular -- porque el anfitrión compara a cada una contra su
           * propia cédula. El tamaño de letra se achica un poco a medida
           * que hay más personas, para que todas quepan sin scroll en un
           * Dúo/Trío/grupo sin dejar de leerse bien. */}
          <div className="admin-tile mb-4 divide-y divide-white/10 rounded-3xl p-5">
            {ficha.attendees.map((p, i) => {
              const n = ficha.attendees.length;
              const nameSize = n <= 1 ? 'text-2xl' : n === 2 ? 'text-xl' : 'text-lg';
              const rutSize = n <= 1 ? 'text-4xl' : n === 2 ? 'text-3xl' : 'text-2xl';
              return (
                <div key={i} className={i === 0 ? 'pb-3.5' : 'py-3.5'}>
                  <p className="mb-1 text-xs uppercase tracking-widest text-white/50">
                    {ficha.attendees.length > 1 ? `Persona ${i + 1}` : 'A nombre de'}
                  </p>
                  <p className={`${nameSize} font-bold leading-snug`}>{p.name}</p>
                  {p.rut ? (
                    <>
                      <p className="mt-1.5 text-xs uppercase tracking-widest text-white/50">{p.docType === 'passport' ? 'Pasaporte' : 'RUT'}</p>
                      <p className={`${rutSize} font-mono font-bold tracking-wider`}>{p.rut}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-amber-200/80">RUT no registrado — pídelo verbalmente</p>
                  )}
                </div>
              );
            })}
          </div>

          {estacionamiento.length > 0 && (
            <div className="admin-tile relative mb-3 rounded-2xl p-4">
              <span className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-full bg-white/10"><Car className="h-3.5 w-3.5 text-candy-blue" /></span>
              <p className="mb-1 pr-9 text-xs uppercase tracking-widest text-white/50">Estacionamiento</p>
              {estacionamiento.map((e, i) => (
                <p key={i} className={`text-lg font-bold ${esVip(e.typeName) ? 'text-amber-300' : ''}`}>
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
            <div className="admin-tile relative mb-3 rounded-2xl p-4">
              <span className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-full bg-white/10"><DollarSign className="h-3.5 w-3.5 text-candy-blue" /></span>
              <p className="mb-2 pr-9 text-xs uppercase tracking-widest text-white/50">¿Paga estacionamiento ahora?</p>
              {cobrando ? (
                <p className="text-sm text-white/60">Cobrando…</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(['efectivo', 'debito', 'credito'] as const).map((metodo) => (
                    <button
                      key={metodo}
                      onClick={() => cobrarConMetodo(metodo)}
                      className="admin-tile h-12 rounded-xl text-sm font-semibold capitalize active:scale-95"
                    >
                      {metodo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {otrosExtras.length > 0 && (
            <div className="admin-tile relative mb-3 rounded-2xl p-4">
              <span className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-full bg-white/10"><ShoppingBag className="h-3.5 w-3.5 text-white/70" /></span>
              <p className="mb-1.5 pr-9 text-xs uppercase tracking-widest text-white/50">También compró</p>
              {otrosExtras.map((e, i) => (
                <p key={i} className="text-sm text-white/80">{e.typeName}{e.status === 'used' ? ' · ya retirado' : ''}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-lg shrink-0 space-y-2.5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="px-2 text-center text-sm font-semibold text-amber-200/90">
          Revisa la cédula y compara con los nombres de arriba
        </p>
        <button onClick={onAceptar} className="h-16 w-full rounded-full bg-emerald-500 text-lg font-bold text-black shadow-[0_0_24px_-6px_rgba(16,185,129,0.9)] active:scale-[0.99]">
          Coincide — dar acceso
        </button>
        <button onClick={onCerrar} className="admin-tile h-14 w-full rounded-full font-semibold text-white/90 active:scale-[0.99]">
          No coincide / cancelar
        </button>
      </div>
    </div>
  );
}

/* --- Buscar: por nombre o tecleando el código ------------------------------ */

function BuscarPanel({ onPick, onCode }: {
  onPick: (ticketCode: string) => void;
  onCode: (raw: string) => void;
}) {
  const [mode, setMode] = useState<'nombre' | 'codigo'>('nombre');
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [results, setResults] = useState<CajaAttendee[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (mode !== 'nombre' || q.length < 2) { setResults([]); return; }
    searchLocal(q).then(setResults);
  }, [query, mode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 grid shrink-0 grid-cols-2 gap-2">
        {([['nombre', 'Por nombre'], ['codigo', 'Por código']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={`h-12 rounded-full border text-sm font-semibold ${mode === value ? 'border-primary/50 bg-primary/20 text-white' : 'border-white/10 text-white/60'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'nombre' ? (
        <>
          <div className="relative shrink-0 pb-2">
            <Search className="pointer-events-none absolute left-4 top-[1.5rem] h-4 w-4 -translate-y-1/2 text-white/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder="Nombre, correo o teléfono"
              aria-label="Buscar por nombre, correo o teléfono"
              className="admin-tile h-12 w-full rounded-2xl pl-11 pr-4 text-base text-white placeholder:text-white/50 focus:border-primary/60 focus:outline-none"
            />
          </div>
          <p className="shrink-0 pb-2 text-xs text-white/60">Para cuando alguien llega sin el QR a mano.</p>
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto overscroll-contain pb-3">
            {query.trim().length >= 2 && results.length === 0 && <p className="py-8 text-center text-sm text-white/50">No encontramos a nadie con ese dato.</p>}
            {results.map((r) => (
              <div key={r.orderId} className="admin-tile rounded-2xl p-4">
                <p className="font-semibold">{r.buyerName}</p>
                <p className="mb-2 truncate text-xs text-white/60">{r.buyerEmail}</p>
                {r.access.map((a) => (
                  <button
                    key={a.ticketCode}
                    onClick={() => onPick(a.ticketCode)}
                    disabled={a.status !== 'valid'}
                    className="mt-1.5 h-12 w-full rounded-xl border border-primary/30 bg-primary/15 text-sm font-semibold active:scale-[0.99] disabled:opacity-35"
                  >
                    {a.typeName}{a.status === 'used' ? ' · ya entró' : a.status === 'cancelled' ? ' · anulada' : ''}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-white/70">Teclea el código de la entrada (ej. <span className="font-mono">MP-ABC123456789</span>) cuando el QR está dañado o no lee.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) onCode(code); }}
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Código de la entrada"
            aria-label="Código de la entrada"
            className="admin-tile h-14 w-full rounded-2xl px-4 text-center font-mono text-xl tracking-wider text-white placeholder:text-white/40 focus:border-primary/60 focus:outline-none"
          />
          <button
            onClick={() => onCode(code)}
            disabled={code.trim().length < 5}
            className="h-14 w-full rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-35"
          >
            Abrir ficha
          </button>
        </div>
      )}
    </div>
  );
}

/* --- Ingresos: lo que se dio acceso desde este celular --------------------- */

function IngresosPanel({ history, pendingIds }: { history: HistoryEntry[]; pendingIds: Set<string> }) {
  const total = history.reduce((n, h) => n + h.personas, 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 pb-2 text-xs text-white/60">
        Desde este celular: <span className="font-semibold text-white/80">{history.length}</span> {history.length === 1 ? 'acceso' : 'accesos'} · <span className="font-semibold text-white/80">{total}</span> {total === 1 ? 'persona' : 'personas'}
      </p>
      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto overscroll-contain pb-3">
        {history.length === 0 ? (
          <p className="py-12 text-center text-sm text-white/50">Todavía no has dado ningún acceso desde este celular.</p>
        ) : history.map((h) => {
          const synced = !pendingIds.has(h.opId);
          return (
            <div key={h.opId} className="admin-tile flex items-center gap-3 rounded-2xl px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{h.names.join(' · ') || h.ticketCode}</p>
                <p className="truncate text-xs text-white/60">{h.typeName} · {h.personas} {h.personas === 1 ? 'persona' : 'personas'}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm tabular-nums text-white/80">{new Date(h.at).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })}</p>
                <p className={`text-[11px] ${synced ? 'text-emerald-300' : 'text-amber-300'}`}>{synced ? '✓ enviado' : '⏳ por enviar'}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
