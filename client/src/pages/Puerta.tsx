import '@/admin.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Banknote, Camera, Car, Check, CreditCard, Flashlight, ListChecks, LogOut, ScanLine, Search, ShoppingBag, Ticket, Users, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { useInstallableApp } from '@/hooks/useInstallableApp';
import { QrScanner } from '@/components/QrScanner';
import { TerminalFrame, TerminalLogin, TerminalSpinner, loginErrorToast, playTone, useWakeLock, vibrateAlert } from '@/components/terminal/TerminalShell';
import { OPERATOR_ROLE_LABELS } from '@shared/cajaRoles';
import { parseTicketCodeFromQr } from '@shared/qr';
import { personasForTicket } from '@shared/mission300';
import { cashChange, doorParkingScript, summarizeDoorParking, type DoorParkingCharge, type DoorParkingMethod, type DoorParkingOption } from '@shared/parking';
import {
  saveSnapshot, getLocalEvent, searchLocal, enqueueOp, getPendingOps,
  markOpSynced, clearSyncedOps, pendingOpsCount, correctedNow, countCheckedInPersonas, getLocalParking,
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

/** Un cobro de estacionamiento hecho desde este celular (se guarda aparte del
 * historial de accesos, con su estado de envío al servidor). */
type ParkingRecord = DoorParkingCharge & {
  opId: string;
  ticketCode: string;
  name: string;
  at: string;
  /** Por qué el servidor lo rechazó (solo si `status === 'rechazado'`). */
  note?: string;
  /** El anfitrión ya vio el aviso de rechazo. */
  seen?: boolean;
};

type SyncOp =
  | { type: 'checkin'; opId: string; ticketCode: string; clientAt: string }
  | { type: 'parking_paid'; opId: string; ticketCode: string; paymentMethod: DoorParkingMethod; ticketTypeId?: number; clientAt: string };

type ParkingInfo = { options: DoorParkingOption[]; venueFeePerCarClp: number };

const METHOD_LABEL: Record<DoorParkingMethod, string> = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito' };
const money = (n: number | null) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-CL')}`);

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

function parkingKey(eventId: number) {
  return `puerta_parking:${eventId}`;
}
function loadParking(eventId: number): ParkingRecord[] {
  try { return JSON.parse(localStorage.getItem(parkingKey(eventId)) || '[]'); } catch { return []; }
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
  const [parkingInfo, setParkingInfo] = useState<ParkingInfo | null>(null);
  const [parkingRecords, setParkingRecords] = useState<ParkingRecord[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const recentRef = useRef<{ code: string; until: number }>({ code: '', until: 0 });
  const eventIdRef = useRef<number | null>(null);

  useWakeLock();

  const { data: remoteEvent } = trpc.puerta.activeEvent.useQuery();
  const snapshotQuery = trpc.puerta.snapshot.useQuery(
    { eventId: remoteEvent?.id ?? 0 },
    { enabled: !!remoteEvent, refetchInterval: 60_000 },
  );
  const syncMutation = trpc.puerta.sync.useMutation();
  const logout = trpc.puerta.logout.useMutation({ onSuccess: () => utils.puerta.me.invalidate() });

  const refreshCounts = useCallback(() => { countCheckedInPersonas().then(setCounts).catch(() => {}); }, []);

  useEffect(() => { getLocalEvent().then((e) => e && setLocalEvent(e)); getLocalParking().then(setParkingInfo); }, []);
  useEffect(() => {
    if (snapshotQuery.data) saveSnapshot(snapshotQuery.data).then(() => { setLocalEvent(snapshotQuery.data!.event); refreshCounts(); getLocalParking().then(setParkingInfo); });
  }, [snapshotQuery.data, refreshCounts]);
  useEffect(() => { refreshCounts(); }, [refreshCounts]);
  useEffect(() => {
    eventIdRef.current = localEvent?.id ?? null;
    if (localEvent) { setHistory(loadHistory(localEvent.id)); setParkingRecords(loadParking(localEvent.id)); }
  }, [localEvent?.id]);

  // Cambia un cobro de estacionamiento (estado de envío, rechazo, visto) y lo
  // guarda en el celular.
  const patchParking = useCallback((opId: string, patch: Partial<ParkingRecord>) => {
    setParkingRecords((prev) => {
      const next = prev.map((r) => (r.opId === opId ? { ...r, ...patch } : r));
      const id = eventIdRef.current;
      if (id != null) { try { localStorage.setItem(parkingKey(id), JSON.stringify(next)); } catch { /* sin storage */ } }
      return next;
    });
  }, []);

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

  // Vaciado de la cola. La puerta manda los check-in Y los cobros de
  // estacionamiento (la caja excluye estos últimos a propósito: son
  // exclusivos de la puerta). Sin esto el cobro quedaba "por enviar" para
  // siempre y nunca llegaba al registro de estacionamientos.
  const syncRef = useRef(syncMutation);
  syncRef.current = syncMutation;
  const syncingRef = useRef(false);
  useEffect(() => {
    const run = async () => {
      if (!isOnline || !localEvent) return;
      // Un solo envío a la vez: cada cambio de estado de la mutación
      // reinicia este efecto y lanzaba otro envío mientras el anterior seguía
      // en vuelo (el servidor es idempotente por opId, pero era trabajo de más).
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
      const ops = (await getPendingOps()).filter((o) => o.op.type === 'checkin' || o.op.type === 'parking_paid');
      if (ops.length === 0) return;
      try {
        const batch = ops.slice(0, 50);
        const results = await syncRef.current.mutateAsync({
          eventId: localEvent.id,
          ops: batch.map((o) => o.op as SyncOp),
        });
        for (const [opId, res] of Object.entries(results)) {
          await markOpSynced(opId, res.result, res.conflictNote);
          const sent = batch.find((o) => o.opId === opId)?.op;
          const failed = res.result === 'rejected' || res.result === 'conflict';
          if (sent?.type === 'parking_paid') {
            // Un cobro que el servidor no registró NO se puede perder de vista:
            // queda marcado y el banner rojo sigue hasta que el anfitrión lo vea.
            if (failed) {
              patchParking(opId, { status: 'rechazado', note: res.conflictNote, seen: false });
              playTone('error');
              vibrateAlert([300, 120, 300]);
            } else {
              patchParking(opId, { status: 'ok' });
            }
          } else if (res.result === 'conflict') {
            toast.warning(res.conflictNote || 'Conflicto al sincronizar');
          }
        }
        await clearSyncedOps();
        refreshPending();
      } catch {
        // Sin red real -- se reintenta en el próximo tick.
      }
      } finally {
        syncingRef.current = false;
      }
    };
    const id = setInterval(run, 5000);
    run();
    return () => clearInterval(id);
  }, [isOnline, localEvent, refreshPending, patchParking]);

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
  // Efectivo: el anfitrión recibe la plata física. Débito/crédito: se cobra
  // con la máquina. En los tres casos queda registrado con el medio de pago
  // y pasa al registro de estacionamientos (descuento del local) al sincronizar.
  const cobrarEstacionamiento = async (f: Ficha, opcion: DoorParkingOption | null, metodo: DoorParkingMethod): Promise<ParkingRecord> => {
    const opId = newOpId();
    const at = (await correctedNow()).toISOString();
    await enqueueOp({ opId, type: 'parking_paid', ticketCode: f.ticketCode, paymentMethod: metodo, ticketTypeId: opcion?.ticketTypeId, clientAt: at });
    const record: ParkingRecord = {
      opId, ticketCode: f.ticketCode, name: f.attendees[0]?.name || f.buyerName || f.ticketCode,
      method: metodo, optionName: opcion?.name, amount: opcion?.priceClp ?? null, status: 'pendiente', at,
    };
    setParkingRecords((prev) => {
      const next = [record, ...prev];
      const id = eventIdRef.current;
      if (id != null) { try { localStorage.setItem(parkingKey(id), JSON.stringify(next)); } catch { /* sin storage */ } }
      return next;
    });
    refreshPending();
    setFicha((prev) => (prev && prev.ticketCode === f.ticketCode)
      ? { ...prev, extras: [...prev.extras, { typeName: opcion?.name ?? 'Estacionamiento', status: 'used' }] }
      : prev);
    return record;
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

  const unseenRejected = parkingRecords.filter((r) => r.status === 'rechazado' && !r.seen).length;

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

        {unseenRejected > 0 && (
          <button
            onClick={() => setReviewing(true)}
            className="flex w-full items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-left text-sm font-bold text-white shadow-[0_0_24px_-6px_rgba(239,68,68,0.9)] active:scale-[0.99]"
          >
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              {unseenRejected === 1 ? '1 cobro de estacionamiento NO se registró' : `${unseenRejected} cobros de estacionamiento NO se registraron`} — tocar para revisar
            </span>
          </button>
        )}
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

        {tab === 'ingresos' && <IngresosPanel history={history} pendingIds={pendingIds} parking={parkingRecords} venueFee={parkingInfo?.venueFeePerCarClp ?? 3000} />}

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
          parkingInfo={parkingInfo}
          onCobrarEstacionamiento={(opcion, metodo) => cobrarEstacionamiento(ficha, opcion, metodo)}
        />
      )}

      {reviewing && (
        <RechazadosPanel
          records={parkingRecords.filter((r) => r.status === 'rechazado' && !r.seen)}
          onSeen={(opId) => patchParking(opId, { seen: true })}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
}

/* --- Ficha de verificación ------------------------------------------------ */

function FichaVerificacion({ ficha, onAceptar, onCerrar, parkingInfo, onCobrarEstacionamiento }: {
  ficha: Ficha;
  onAceptar: () => void;
  onCerrar: () => void;
  parkingInfo: ParkingInfo | null;
  onCobrarEstacionamiento: (opcion: DoorParkingOption | null, metodo: DoorParkingMethod) => Promise<ParkingRecord>;
}) {
  const personas = personasForTicket(ficha.groupSize, ficha.accesoSlug);
  const puedeEntrar = ficha.status === 'valid';
  const [cobrandoAbierto, setCobrandoAbierto] = useState(false);

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
            <div className="admin-tile mb-3 rounded-2xl p-4">
              <p className="mb-1 text-xs uppercase tracking-widest text-white/50">Estacionamiento</p>
              <p className="mb-3 text-base font-semibold text-white/80">🅿️ Sin estacionamiento pagado</p>
              <button
                onClick={() => setCobrandoAbierto(true)}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground active:scale-[0.99]"
              >
                <Car className="h-5 w-5" /> Cobrar estacionamiento{parkingInfo && parkingInfo.options.length > 0 ? ` · ${parkingInfo.options.map((o) => money(o.priceClp)).join(' / ')}` : ''}
              </button>
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

      {cobrandoAbierto && (
        <ParkingSheet
          nombre={ficha.attendees[0]?.name || ficha.buyerName}
          options={parkingInfo?.options ?? null}
          onCobrar={onCobrarEstacionamiento}
          onClose={() => setCobrandoAbierto(false)}
        />
      )}
    </div>
  );
}

/* --- Hoja de cobro de estacionamiento -------------------------------------- */

/** Cobro de estacionamiento a quien llegó sin él pagado: monto a la vista,
 * medio de pago (efectivo en mano, o débito/crédito con la máquina) y un
 * botón final de confirmar -- un toque suelto nunca cobra. Al confirmar
 * queda registrado con su medio de pago y pasa al registro de
 * estacionamientos (de ahí sale lo que le corresponde al local). */
function ParkingSheet({ nombre, options, onCobrar, onClose }: {
  nombre: string;
  /** Estacionamientos del evento (normal y VIP). `null` si el celular todavía
   * no los bajó: se cobra el estacionamiento estándar sin monto a la vista. */
  options: DoorParkingOption[] | null;
  onCobrar: (opcion: DoorParkingOption | null, metodo: DoorParkingMethod) => Promise<ParkingRecord>;
  onClose: () => void;
}) {
  const unavailable = !!options && options.length === 0;
  // Con una sola opción no se pregunta: queda elegida de entrada.
  const [opcion, setOpcion] = useState<DoorParkingOption | null>(options && options.length === 1 ? options[0] : null);
  const [metodo, setMetodo] = useState<DoorParkingMethod | null>(null);
  const [recibido, setRecibido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recibo, setRecibo] = useState<{ record: ParkingRecord; recibido: number | null } | null>(null);

  const price = opcion?.priceClp ?? null;
  const debeElegir = !!options && options.length > 1;
  const frase = options ? doorParkingScript(options) : '';
  const recibidoNum = recibido ? parseInt(recibido, 10) : null;
  const vuelto = metodo === 'efectivo' && recibidoNum != null ? cashChange(recibidoNum, price) : null;
  const faltaPlata = metodo === 'efectivo' && recibidoNum != null && price != null && recibidoNum < price;
  const puedeConfirmar = !!metodo && !unavailable && !enviando && !faltaPlata && (!debeElegir || !!opcion);

  const confirmar = async () => {
    if (!metodo) return;
    setEnviando(true);
    try {
      const record = await onCobrar(opcion, metodo);
      setRecibo({ record, recibido: metodo === 'efectivo' ? recibidoNum : null });
      playTone('ok');
      vibrateAlert(60);
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo registrar el cobro -- intenta de nuevo.', { duration: 8000 });
      setEnviando(false);
    }
  };

  // Recibo en pantalla: se le muestra al cliente y queda claro lo cobrado.
  if (recibo) {
    const r = recibo.record;
    const cambio = r.method === 'efectivo' && recibo.recibido != null ? cashChange(recibo.recibido, r.amount) : null;
    return (
      <div role="dialog" aria-label="Estacionamiento cobrado" className="fixed inset-0 z-[60] flex flex-col bg-[#0b0612] bg-gradient-to-b from-emerald-600/45 to-transparent p-5">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center text-center">
          <span className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-emerald-400 text-black"><Check className="h-12 w-12" /></span>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">{r.optionName ?? 'Estacionamiento'} cobrado</h1>
          <p className="mt-3 font-heading text-6xl font-extrabold tabular-nums">{money(r.amount)}</p>
          <p className="mt-3 text-xl font-semibold text-white/90">{METHOD_LABEL[r.method]}</p>
          <p className="mt-1 text-base text-white/70">{r.name}</p>
          {cambio != null && cambio > 0 && (
            <div className="admin-tile mt-6 rounded-2xl px-6 py-3">
              <p className="text-xs uppercase tracking-widest text-white/50">Devuelve de vuelto</p>
              <p className="font-heading text-3xl font-bold tabular-nums text-amber-300">{money(cambio)}</p>
            </div>
          )}
        </div>
        <div className="mx-auto w-full max-w-lg pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button onClick={onClose} className="h-16 w-full rounded-full bg-emerald-500 text-lg font-bold text-black active:scale-[0.99]">Listo</button>
        </div>
      </div>
    );
  }

  const opciones: { value: DoorParkingMethod; label: string; sub: string; Icon: typeof Banknote }[] = [
    { value: 'efectivo', label: 'Efectivo', sub: 'Recibes la plata en mano', Icon: Banknote },
    { value: 'debito', label: 'Débito', sub: 'Con la máquina', Icon: CreditCard },
    { value: 'credito', label: 'Crédito', sub: 'Con la máquina', Icon: CreditCard },
  ];
  const atajos = price != null ? Array.from(new Set([price, 10000, 20000].filter((n) => n >= price))) : [];

  return (
    <div role="dialog" aria-label="Cobrar estacionamiento" className="fixed inset-0 z-[60] flex flex-col bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-auto max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-[#140c1f] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-white/50">Cobrar estacionamiento</p>
              {nombre && <p className="truncate text-sm text-white/70">{nombre}</p>}
              {opcion && <p className="mt-1 font-heading text-5xl font-extrabold leading-tight tabular-nums">{money(opcion.priceClp)}</p>}
            </div>
            <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 active:bg-white/10" aria-label="Cerrar"><X className="h-6 w-6" /></button>
          </div>

          {unavailable && (
            <p className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/12 p-3 text-sm text-red-200">
              Este evento no tiene un producto "Estacionamiento" configurado, así que no se puede cobrar acá. Avisa a un admin.
            </p>
          )}

          {/* La frase exacta que el anfitrión le dice al cliente. */}
          {frase && (
            <div className="mb-4 rounded-2xl border border-primary/40 bg-primary/10 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Dile al cliente</p>
              <p className="text-xl font-semibold leading-snug">“{frase}”</p>
            </div>
          )}

          {debeElegir && options && (
            <>
              <p className="mb-2 text-xs uppercase tracking-widest text-white/50">¿Cuál estacionamiento quiere?</p>
              <div className="mb-4 grid gap-2">
                {options.map((o) => (
                  <button
                    key={o.ticketTypeId}
                    onClick={() => setOpcion(o)}
                    aria-pressed={opcion?.ticketTypeId === o.ticketTypeId}
                    className={`flex min-h-[4.5rem] items-center gap-3 rounded-2xl border px-4 py-3 text-left active:scale-[0.99] ${opcion?.ticketTypeId === o.ticketTypeId ? (o.isVip ? 'border-amber-300/70 bg-amber-300/15' : 'border-primary/60 bg-primary/20') : 'border-white/10 bg-white/5'}`}
                  >
                    <span className="text-2xl">{o.isVip ? '⭐' : '🅿️'}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-lg font-bold ${o.isVip ? 'text-amber-300' : ''}`}>{o.name}</span>
                    </span>
                    <span className="font-heading text-2xl font-extrabold tabular-nums">{money(o.priceClp)}</span>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${opcion?.ticketTypeId === o.ticketTypeId ? 'border-primary bg-primary text-primary-foreground' : 'border-white/30'}`}>
                      {opcion?.ticketTypeId === o.ticketTypeId && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="mb-2 text-xs uppercase tracking-widest text-white/50">¿Cómo paga?</p>
          <div className="mb-4 grid gap-2">
            {opciones.map(({ value, label, sub, Icon }) => (
              <button
                key={value}
                onClick={() => setMetodo(value)}
                aria-pressed={metodo === value}
                className={`flex h-16 items-center gap-3 rounded-2xl border px-4 text-left active:scale-[0.99] ${metodo === value ? 'border-primary/60 bg-primary/20' : 'border-white/10 bg-white/5'}`}
              >
                <Icon className="h-6 w-6 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{label}</span>
                  <span className="block text-xs text-white/60">{sub}</span>
                </span>
                <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${metodo === value ? 'border-primary bg-primary text-primary-foreground' : 'border-white/30'}`}>
                  {metodo === value && <Check className="h-4 w-4" />}
                </span>
              </button>
            ))}
          </div>

          {metodo === 'efectivo' && (
            <div className="admin-tile mb-4 rounded-2xl p-4">
              <p className="mb-2 text-xs uppercase tracking-widest text-white/50">¿Cuánto te entrega? (para el vuelto)</p>
              <input
                value={recibido}
                onChange={(e) => setRecibido(e.target.value.replace(/\D/g, '').slice(0, 7))}
                inputMode="numeric"
                placeholder={price != null ? `Exacto ${money(price)}` : 'Monto recibido'}
                aria-label="Monto recibido en efectivo"
                className="h-14 w-full rounded-2xl bg-white/10 px-4 text-center text-2xl font-bold tabular-nums text-white placeholder:text-base placeholder:font-normal placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
              {atajos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {atajos.slice(0, 3).map((n) => (
                    <button key={n} onClick={() => setRecibido(String(n))} className="admin-tile h-11 rounded-xl text-sm font-semibold active:scale-95">{money(n)}</button>
                  ))}
                </div>
              )}
              {faltaPlata && <p className="mt-3 text-center text-sm font-semibold text-red-300">Falta {money((price ?? 0) - (recibidoNum ?? 0))}</p>}
              {vuelto != null && recibidoNum != null && (
                <p className="mt-3 text-center text-lg">Vuelto: <span className="font-heading text-2xl font-bold tabular-nums text-amber-300">{money(vuelto)}</span></p>
              )}
            </div>
          )}

          {(metodo === 'debito' || metodo === 'credito') && (
            <p className="mb-4 rounded-2xl border border-sky-400/30 bg-sky-400/10 p-3 text-sm text-sky-100">
              Cobra <span className="font-bold">{money(price)}</span> en la máquina. Cuando salga <span className="font-bold">aprobado</span>, confirma acá.
            </p>
          )}

          <button
            onClick={confirmar}
            disabled={!puedeConfirmar}
            className="h-16 w-full rounded-full bg-emerald-500 text-lg font-bold text-black shadow-[0_0_24px_-6px_rgba(16,185,129,0.9)] active:scale-[0.99] disabled:opacity-35 disabled:shadow-none"
          >
            {enviando ? 'Registrando…'
              : debeElegir && !opcion ? 'Elige el estacionamiento'
              : !metodo ? 'Elige cómo paga'
              : metodo === 'efectivo' ? `Recibí el efectivo — confirmar ${money(price)}`
              : `Ya cobré en la máquina — confirmar ${money(price)}`}
          </button>
          <button onClick={onClose} className="admin-tile mt-2.5 h-12 w-full rounded-full text-sm font-semibold text-white/80 active:scale-[0.99]">Cancelar, no cobrar</button>
        </div>
      </div>
    </div>
  );
}

/* --- Cobros de estacionamiento que el servidor no registró ------------------- */

function RechazadosPanel({ records, onSeen, onClose }: {
  records: ParkingRecord[];
  onSeen: (opId: string) => void;
  onClose: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Cobros no registrados" className="fixed inset-0 z-[60] flex flex-col bg-[#0b0612] bg-gradient-to-b from-red-700/45 to-transparent">
      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overscroll-contain p-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <AlertTriangle className="mb-2 h-10 w-10 text-red-300" />
            <h1 className="font-heading text-3xl font-extrabold leading-tight text-red-100">Cobros que NO se registraron</h1>
            <p className="mt-2 text-sm text-white/80">
              El cliente ya pagó, pero el sistema no lo tiene anotado. Avisa a un admin con estos datos para corregirlo a mano.
            </p>
          </div>
          <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 active:bg-white/10" aria-label="Cerrar"><X className="h-6 w-6" /></button>
        </div>

        {records.length === 0 ? (
          <p className="py-10 text-center text-white/70">Ya viste todos los avisos.</p>
        ) : records.map((r) => (
          <div key={r.opId} className="admin-tile mb-3 rounded-2xl p-4">
            <p className="text-lg font-bold">{r.name}</p>
            <p className="font-mono text-xs text-white/50">{r.ticketCode}</p>
            <p className="mt-1 text-base">{r.optionName ? `${r.optionName} · ` : ''}{METHOD_LABEL[r.method]} · <span className="font-bold tabular-nums">{money(r.amount)}</span> · {new Date(r.at).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })}</p>
            <p className="mt-2 rounded-xl bg-red-500/15 p-2.5 text-sm text-red-100">{r.note || 'El servidor no lo registró.'}</p>
            <button onClick={() => onSeen(r.opId)} className="mt-3 h-12 w-full rounded-full bg-white/12 text-sm font-bold active:scale-[0.99]">Lo vi · avisaré a un admin</button>
          </div>
        ))}
      </div>
      <div className="mx-auto w-full max-w-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button onClick={onClose} className="admin-tile h-14 w-full rounded-full font-semibold active:scale-[0.99]">Cerrar</button>
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

function IngresosPanel({ history, pendingIds, parking, venueFee }: {
  history: HistoryEntry[];
  pendingIds: Set<string>;
  parking: ParkingRecord[];
  venueFee: number;
}) {
  const total = history.reduce((n, h) => n + h.personas, 0);
  const resumen = summarizeDoorParking(parking, venueFee);
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain pb-3">
        {/* Lo cobrado en estacionamiento desde este celular: el efectivo es
            la plata física a entregar al cierre; lo del local es lo que sale
            del registro de estacionamientos (por auto cobrado). */}
        <div className="admin-glass-panel admin-glass-panel-sm space-y-3 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/60"><Car className="h-4 w-4" /> Estacionamiento · este celular</p>
          <div className="flex items-end justify-between">
            <p className="text-base"><span className="font-heading text-3xl font-extrabold tabular-nums">{resumen.cars}</span> {resumen.cars === 1 ? 'auto cobrado' : 'autos cobrados'}</p>
            <p className="font-heading text-2xl font-bold tabular-nums">{money(resumen.total)}</p>
          </div>
          {resumen.byOption.length > 1 && (
            <div className="space-y-1">
              {resumen.byOption.map((o) => (
                <div key={o.name} className="flex items-center justify-between text-sm">
                  <span className="text-white/80">{/vip/i.test(o.name) ? '⭐' : '🅿️'} {o.name} · {o.count} {o.count === 1 ? 'auto' : 'autos'}</span>
                  <span className="font-semibold tabular-nums">{money(o.total)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            {(['efectivo', 'debito', 'credito'] as const).map((m) => (
              <div key={m} className="rounded-xl bg-white/5 px-2 py-2">
                <p className="text-[11px] text-white/60">{METHOD_LABEL[m]}</p>
                <p className="text-sm font-bold tabular-nums">{money(resumen.byMethod[m].total)}</p>
                <p className="text-[11px] text-white/50">{resumen.byMethod[m].count} {resumen.byMethod[m].count === 1 ? 'auto' : 'autos'}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-emerald-500/15 px-3 py-2.5">
            <span className="text-sm text-emerald-100">Efectivo a entregar</span>
            <span className="font-heading text-xl font-bold tabular-nums text-emerald-300">{money(resumen.cashToHandOver)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-white/70">
            <span>Del local ({resumen.cars} × {money(venueFee)})</span>
            <span className="font-semibold tabular-nums text-white/90">{money(resumen.venueShare)}</span>
          </div>
          {resumen.rejected > 0 && <p className="text-xs font-semibold text-red-300">{resumen.rejected} {resumen.rejected === 1 ? 'cobro no se registró y no está contado' : 'cobros no se registraron y no están contados'}.</p>}
        </div>

        {parking.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-white/60">Cobros de estacionamiento</p>
            {parking.map((r) => (
              <div key={r.opId} className={`admin-tile flex items-center gap-3 rounded-2xl px-3 py-3 ${r.status === 'rechazado' ? '!border-red-500/50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{r.name}</p>
                  <p className="truncate text-xs text-white/60">{r.optionName ? `${r.optionName} · ` : ''}{METHOD_LABEL[r.method]} · {money(r.amount)}</p>
                  {r.status === 'rechazado' && <p className="mt-0.5 text-xs text-red-300">{r.note || 'No se registró'}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums text-white/80">{hora(r.at)}</p>
                  <p className={`text-[11px] ${r.status === 'ok' ? 'text-emerald-300' : r.status === 'pendiente' ? 'text-amber-300' : 'text-red-300'}`}>
                    {r.status === 'ok' ? '✓ registrado' : r.status === 'pendiente' ? '⏳ por enviar' : '⚠ no registrado'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="pt-1 text-xs text-white/60">
          Accesos desde este celular: <span className="font-semibold text-white/80">{history.length}</span> · <span className="font-semibold text-white/80">{total}</span> {total === 1 ? 'persona' : 'personas'}
        </p>
        {history.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">Todavía no has dado ningún acceso desde este celular.</p>
        ) : history.map((h) => {
          const synced = !pendingIds.has(h.opId);
          return (
            <div key={h.opId} className="admin-tile flex items-center gap-3 rounded-2xl px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{h.names.join(' · ') || h.ticketCode}</p>
                <p className="truncate text-xs text-white/60">{h.typeName} · {h.personas} {h.personas === 1 ? 'persona' : 'personas'}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm tabular-nums text-white/80">{hora(h.at)}</p>
                <p className={`text-[11px] ${synced ? 'text-emerald-300' : 'text-amber-300'}`}>{synced ? '✓ enviado' : '⏳ por enviar'}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
