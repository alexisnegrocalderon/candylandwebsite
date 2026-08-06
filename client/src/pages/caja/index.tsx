import '@/admin.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrScanner } from '@/components/QrScanner';
import { parseTicketCodeFromQr } from '@shared/qr';
import {
  saveSnapshot, getLocalEvent, searchLocal, searchGiftsLocal, searchStaffCompsLocal, searchInsideAttendeesLocal, getLocalAttendee, getLocalCatalog,
  enqueueOp, pendingOpsCount, getPendingOps, markOpSynced, clearSyncedOps, correctedNow,
  nextKitchenTicketNumber, nextLockerTagNumber,
  type CajaAttendee, type CajaCatalogItem, type CajaGift, type CajaStaffComp, type QueuedOp,
} from './db';
import { canRedeem, clampRedeemAmount, PLAYCOINS_MIN_REDEEM_BALANCE } from '@shared/playcoins';
import { formatChileDateTime } from '@shared/chileDate';
import { getFavoriteIds, toggleFavorite } from './favorites';

/* Módulo /caja (docs/ARQUITECTURA-CAJA.md Fase 3) -- offline-first: la
 * búsqueda, la ficha y el catálogo se leen siempre de IndexedDB (Dexie), no
 * de la red; los canjes/ventas se encolan localmente y se sincronizan en
 * segundo plano (§6-§7). El servidor sigue siendo la fuente de verdad --
 * esto es solo una caché operativa con cola de escritura. Pantalla táctil
 * oscura, sin el navbar público (ver App.tsx). Todo en un solo archivo a
 * propósito: son 4 pantallas chicas que comparten un único estado de
 * navegación local. */

function newOpId() {
  return crypto.randomUUID();
}

type View = 'menu' | 'sheet' | 'sale' | 'dashboard' | 'conflicts';

export default function CajaApp() {
  // Fuera del indice de Google: robots.txt solo lo pide, noindex lo asegura.
  useSeo({ title: 'Caja — Mansion Playroom', description: '', path: '/caja', noindex: true });

  // Registro manual del service worker (solo en build de producción -- en
  // dev vite-plugin-pwa no genera un SW real). Scope acotado a /caja/ para
  // no tocar el resto del sitio (checkout con Mercado Pago, admin).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {});
  }, []);

  const { data: deviceStatus, isLoading: loadingDevice } = trpc.caja.deviceStatus.useQuery();

  if (loadingDevice) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!deviceStatus?.enrolled) return <DeviceEnroll />;
  return <OperatorGate />;
}

/** Enrolamiento de dispositivo (pedido explícito del usuario): sin esto ni
 * siquiera se llega a la pantalla de PIN. El código lo genera un admin
 * desde /admin → Caja → Dispositivos, una vez por tablet. */
function DeviceEnroll() {
  const utils = trpc.useUtils();
  const [code, setCode] = useState('');
  const enroll = trpc.caja.enrollDevice.useMutation({
    onSuccess: () => { toast.success('Dispositivo enrolado ✅'); utils.caja.deviceStatus.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-bold">Enrolar este dispositivo</h1>
      <p className="text-white/60 text-sm text-center max-w-xs">Pide el código de enrolamiento a un administrador (Panel Admin → Caja → Dispositivos).</p>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="XXXX-XXXX"
        className="h-14 text-center text-lg font-mono bg-white/[0.04] backdrop-blur-sm border-white/10 text-white placeholder:text-white/40 max-w-xs"
      />
      <Button className="w-full max-w-xs h-12 bg-primary hover:bg-primary/90" disabled={!code.trim() || enroll.isPending} onClick={() => enroll.mutate({ code: code.trim() })}>
        {enroll.isPending ? 'Enrolando…' : 'Enrolar dispositivo'}
      </Button>
    </div>
  );
}

function OperatorGate() {
  const { data: operator, isLoading } = trpc.caja.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!operator) return <PinLogin />;
  return <ShiftGate operator={operator} />;
}

/** Apertura de turno (§10.2.1, §14 Fase 5): elegir la caja física, declarar
 * el efectivo inicial (cuadre de caja, pedido explícito del usuario) y
 * recién ahí abrir el turno. `caja_shift_opened` distingue "recién elegí
 * caja, todavía no declaré el efectivo" de "esto es un refresh de página en
 * medio de un turno que ya se abrió" -- en ese segundo caso no hay que
 * volver a pedir el efectivo inicial. */
function ShiftGate({ operator }: { operator: { operatorId: number; name: string; role: string } }) {
  const { data: registersList } = trpc.caja.listRegisters.useQuery();
  const { data: event } = trpc.caja.activeEvent.useQuery();
  const shiftOpen = trpc.caja.shiftOpen.useMutation();
  const [registerId, setRegisterId] = useState<number | null | undefined>(() => {
    const saved = sessionStorage.getItem('caja_register_id');
    return saved ? Number(saved) : undefined;
  });
  const [shiftStarted, setShiftStarted] = useState(() => sessionStorage.getItem('caja_shift_opened') === '1');

  const chooseRegister = (id: number | null) => {
    setRegisterId(id);
    if (id !== null) sessionStorage.setItem('caja_register_id', String(id));
    else sessionStorage.removeItem('caja_register_id');
  };

  const openWithCash = async (openingCash: number) => {
    if (!event) return;
    await shiftOpen.mutateAsync({
      opId: newOpId(), eventId: event.id, registerId: registerId ?? undefined,
      openingCash, clientAt: (await correctedNow()).toISOString(),
    });
    sessionStorage.setItem('caja_shift_opened', '1');
    setShiftStarted(true);
  };

  if (registerId !== undefined && shiftStarted) {
    return (
      <CajaHome
        operator={operator}
        registerId={registerId}
        onCloseShift={() => {
          sessionStorage.removeItem('caja_shift_opened');
          setShiftStarted(false);
          setRegisterId(undefined);
        }}
      />
    );
  }

  if (registerId !== undefined) {
    return (
      <OpeningCashPrompt
        loading={shiftOpen.isPending}
        onSubmit={openWithCash}
        onBack={() => { sessionStorage.removeItem('caja_register_id'); setRegisterId(undefined); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-bold">Hola, {operator.name} 👋</h1>
      <p className="text-white/60 text-sm">Elige tu caja para este turno</p>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {(registersList ?? []).map((r: any) => (
          <button key={r.id} onClick={() => chooseRegister(r.id)} className="h-20 rounded-3xl bg-white/[0.04] backdrop-blur-sm border border-white/10 text-lg font-semibold active:scale-95 transition-transform hover:border-primary/40">
            {r.name}
          </button>
        ))}
      </div>
      <button onClick={() => chooseRegister(null)} className="text-white/50 text-sm underline">Continuar sin caja asignada</button>
    </div>
  );
}

/** Efectivo inicial del turno (cuadre de caja): se pide antes de vender
 * nada, para poder restarlo automáticamente del conteo final al cerrar. */
/** Denominaciones de efectivo chileno para el conteo paso a paso (pedido
 * explícito del usuario: contar de a una denominación es mucho más rápido y
 * confiable que estimar un monto total a ojo). */
const DENOMINATIONS = [
  { value: 10, label: 'Moneda de $10' },
  { value: 50, label: 'Moneda de $50' },
  { value: 100, label: 'Moneda de $100' },
  { value: 500, label: 'Moneda de $500' },
  { value: 1000, label: 'Billete de $1.000' },
  { value: 2000, label: 'Billete de $2.000' },
  { value: 5000, label: 'Billete de $5.000' },
  { value: 10000, label: 'Billete de $10.000' },
  { value: 20000, label: 'Billete de $20.000' },
] as const;

/** Contador de efectivo por denominación (pedido explícito del usuario): un
 * paso por denominación en vez de un solo campo de "monto total", con
 * "Volver" en cada paso para corregir sin perder la cuenta ya hecha.
 * `initialQuantities` permite reingresar sin perder lo ya contado (usado por
 * ShiftCloseForm al volver desde la pantalla de débito/crédito). */
function DenominationCounter({ initialQuantities, onComplete, onExit, finalLabel = 'Siguiente', finalLoading = false }: {
  initialQuantities?: Record<number, number>;
  onComplete: (total: number, breakdown: Record<number, number>) => void;
  onExit: () => void;
  finalLabel?: string;
  finalLoading?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [quantities, setQuantities] = useState<Record<number, number>>(initialQuantities ?? {});
  const denom = DENOMINATIONS[step];
  const isLast = step === DENOMINATIONS.length - 1;
  const total = DENOMINATIONS.reduce((sum, d) => sum + d.value * (quantities[d.value] ?? 0), 0);

  const setQty = (v: string) => {
    const n = v.trim() === '' ? 0 : Number(v);
    setQuantities((q) => ({ ...q, [denom.value]: Number.isFinite(n) && n >= 0 ? n : 0 }));
  };

  const next = () => {
    if (isLast) onComplete(total, quantities);
    else setStep((s) => s + 1);
  };
  const back = () => {
    if (step === 0) onExit();
    else setStep((s) => s - 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white flex flex-col items-center justify-center gap-6 p-6">
      <button onClick={back} className="text-white/50 text-sm self-start">← Volver</button>
      <p className="text-white/40 text-xs uppercase tracking-wide">Paso {step + 1} de {DENOMINATIONS.length}</p>
      <h1 className="text-xl font-bold text-center">{denom.label}</h1>
      <p className="text-white/60 text-sm">¿Cuántas hay?</p>
      <input
        key={denom.value}
        type="number"
        inputMode="numeric"
        min={0}
        value={quantities[denom.value] ?? ''}
        onChange={(e) => setQty(e.target.value)}
        placeholder="0"
        autoFocus
        className="w-full max-w-xs h-16 text-center text-2xl font-bold rounded-3xl bg-white/[0.04] backdrop-blur-sm border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
      />
      <div className="w-full max-w-xs p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex justify-between text-sm">
        <span className="text-white/50">Total acumulado</span>
        <span className="font-bold">${total.toLocaleString('es-CL')}</span>
      </div>
      <Button
        className="w-full max-w-xs h-14 text-base bg-primary hover:bg-primary/90"
        disabled={finalLoading}
        onClick={next}
      >
        {isLast ? (finalLoading ? 'Procesando…' : finalLabel) : 'Siguiente'}
      </Button>
    </div>
  );
}

function OpeningCashPrompt({ onSubmit, loading, onBack }: { onSubmit: (cash: number) => void; loading: boolean; onBack: () => void }) {
  return (
    <DenominationCounter
      onExit={onBack}
      onComplete={(total) => onSubmit(total)}
      finalLabel="Abrir turno"
      finalLoading={loading}
    />
  );
}

/** Cuadre de caja al cerrar turno (pedido explícito del usuario): pide el
 * efectivo TOTAL contado (no la diferencia -- el servidor resta el efectivo
 * inicial solo), contado de a una denominación, más los totales de débito y
 * crédito de los vouchers de las máquinas. El servidor compara contra las
 * ventas registradas y manda el informe final por correo. */
function ShiftCloseForm({ onSubmit, onCancel, loading }: {
  onSubmit: (counts: { countedCash: number; countedDebit: number; countedCredit: number; countedQr: number }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [phase, setPhase] = useState<'cash' | 'review'>('cash');
  const [cashQuantities, setCashQuantities] = useState<Record<number, number>>({});
  const [countedCash, setCountedCash] = useState(0);
  const [debit, setDebit] = useState('');
  const [credit, setCredit] = useState('');
  const [qr, setQr] = useState('');

  if (phase === 'cash') {
    return (
      <DenominationCounter
        initialQuantities={cashQuantities}
        onExit={onCancel}
        onComplete={(total, breakdown) => {
          setCountedCash(total);
          setCashQuantities(breakdown);
          setPhase('review');
        }}
        finalLabel="Siguiente"
      />
    );
  }

  const parse = (v: string) => (v.trim() === '' ? 0 : Number(v));
  const valid = [debit, credit, qr].every((v) => v.trim() === '' || Number.isFinite(Number(v)));

  return (
    <div className="fixed inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#150d13] border border-white/10 rounded-3xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold">Cuadre de caja</h2>
          <p className="text-white/60 text-sm mt-1">Efectivo contado: <b>${countedCash.toLocaleString('es-CL')}</b>. Ahora anota los totales de los vouchers de las máquinas.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide">💳 Total débito (voucher máquina)</label>
            <input
              type="number" inputMode="numeric" min={0} value={debit} onChange={(e) => setDebit(e.target.value)}
              placeholder="$0" autoFocus
              className="w-full h-14 mt-1 text-center text-xl font-bold rounded-2xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide">💳 Total crédito (voucher máquina)</label>
            <input
              type="number" inputMode="numeric" min={0} value={credit} onChange={(e) => setCredit(e.target.value)}
              placeholder="$0"
              className="w-full h-14 mt-1 text-center text-xl font-bold rounded-2xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide">📲 Total QR / transferencia (app del banco)</label>
            <input
              type="number" inputMode="numeric" min={0} value={qr} onChange={(e) => setQr(e.target.value)}
              placeholder="$0"
              className="w-full h-14 mt-1 text-center text-xl font-bold rounded-2xl bg-white/[0.04] border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-white/15 text-white" disabled={loading} onClick={() => setPhase('cash')}>
            ← Volver a contar efectivo
          </Button>
          <Button
            className="flex-1 bg-primary hover:bg-primary/90"
            disabled={!valid || loading}
            onClick={() => onSubmit({ countedCash, countedDebit: parse(debit), countedCredit: parse(credit), countedQr: parse(qr) })}
          >
            {loading ? 'Cerrando…' : 'Cerrar turno'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PinLogin() {
  const utils = trpc.useUtils();
  const { data: operators } = trpc.caja.listOperators.useQuery();
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const login = trpc.caja.login.useMutation({
    onSuccess: () => { utils.caja.me.invalidate(); },
    onError: (e) => { toast.error(e.message); setPin(''); },
  });

  if (!selected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white flex flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Mansion Playroom · Caja</h1>
        <p className="text-white/60 text-sm -mt-6">Toca tu nombre</p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          {(operators ?? []).map((op) => (
            <button
              key={op.id}
              onClick={() => setSelected({ id: op.id, name: op.name })}
              className="h-20 rounded-3xl bg-white/[0.04] backdrop-blur-sm border border-white/10 text-lg font-semibold active:scale-95 transition-transform hover:border-primary/40"
            >
              {op.name}
            </button>
          ))}
          {operators && operators.length === 0 && (
            <p className="col-span-2 text-center text-white/50 text-sm">
              No hay operadores creados todavía. Créalos desde /admin → Operadores.
            </p>
          )}
        </div>
      </div>
    );
  }

  const digits = pin.split('');
  const submit = (finalPin: string) => login.mutate({ operatorId: selected.id, pin: finalPin });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white flex flex-col items-center justify-center gap-6 p-6">
      <button onClick={() => { setSelected(null); setPin(''); }} className="text-white/50 text-sm">← Cambiar de operador</button>
      <h1 className="text-xl font-bold">{selected.name}</h1>
      <div className="flex gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < digits.length ? 'bg-primary border-primary shadow-[0_0_10px_-2px_var(--color-primary)]' : 'border-white/15'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          <button
            key={i}
            disabled={!k || login.isPending}
            onClick={() => {
              if (k === '⌫') { setPin((p) => p.slice(0, -1)); return; }
              if (!k) return;
              const next = (pin + k).slice(0, 6);
              setPin(next);
            }}
            className={`h-16 rounded-full text-xl font-semibold active:scale-95 transition-transform ${k ? 'bg-white/[0.04] backdrop-blur-sm border border-white/10' : 'invisible'}`}
          >
            {k}
          </button>
        ))}
      </div>
      <Button className="w-full max-w-xs h-14 text-base bg-primary hover:bg-primary/90" disabled={pin.length < 4 || login.isPending} onClick={() => submit(pin)}>
        {login.isPending ? 'Entrando…' : 'Entrar'}
      </Button>
    </div>
  );
}

/** "✓ sincronizado" / "⏳ N pendientes" / "⚠ sin conexión" (§6.3). */
function SyncBadge({ online, pending }: { online: boolean; pending: number }) {
  if (!online) return <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 shadow-[0_0_14px_-4px_rgba(239,68,68,0.7)]">⚠ sin conexión</span>;
  if (pending > 0) return <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 shadow-[0_0_14px_-4px_rgba(245,158,11,0.7)]">⏳ {pending} pendiente{pending > 1 ? 's' : ''}</span>;
  return <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 shadow-[0_0_14px_-4px_rgba(16,185,129,0.7)]">✓ sincronizado</span>;
}

function CajaHome({ operator, registerId, onCloseShift }: { operator: { operatorId: number; name: string; role: string }; registerId: number | null; onCloseShift: () => void }) {
  const utils = trpc.useUtils();
  const { data: remoteEvent } = trpc.caja.activeEvent.useQuery();
  const logout = trpc.caja.logout.useMutation({ onSuccess: () => utils.caja.me.invalidate() });
  const snapshotQuery = trpc.caja.snapshot.useQuery({ eventId: remoteEvent?.id ?? 0 }, { enabled: !!remoteEvent, refetchInterval: 60_000 });
  const syncMutation = trpc.caja.sync.useMutation();
  const shiftClose = trpc.caja.shiftClose.useMutation();

  const [localEvent, setLocalEvent] = useState<{ id: number; title: string; slug: string } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [view, setView] = useState<View>('menu');
  // Confirmación de comanda/percha: el número gigante que la cajera dicta --
  // si la venta se encoló sin señal, avisa que cocina/guardarropía todavía
  // no lo ve. Cola en vez de un solo valor porque una misma venta puede
  // tener comida Y guardarropía a la vez -- se muestran una atrás de otra.
  const [postSaleConfirms, setPostSaleConfirms] = useState<{ kind: 'kitchen' | 'locker'; number: string; name: string; offline: boolean }[]>([]);
  const [query, setQuery] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [results, setResults] = useState<CajaAttendee[]>([]);
  const [giftResults, setGiftResults] = useState<CajaGift[]>([]);
  const [staffCompResults, setStaffCompResults] = useState<CajaStaffComp[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [sheetVersion, setSheetVersion] = useState(0); // fuerza refresco de la ficha tras un canje local
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [scanning, setScanning] = useState(false);

  const refreshPending = useCallback(() => { pendingOpsCount().then(setPending); }, []);

  // Al cargar: usa el evento guardado localmente (offline-first) mientras
  // llega la respuesta de red, que también refresca el snapshot completo.
  useEffect(() => { getLocalEvent().then((e) => e && setLocalEvent(e)); refreshPending(); }, [refreshPending]);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
    if (snapshotQuery.data) {
      saveSnapshot(snapshotQuery.data).then(() => setLocalEvent(snapshotQuery.data!.event));
    }
  }, [snapshotQuery.data]);

  // Cola de sincronización: cada 5s, si hay conexión y ops pendientes,
  // manda un lote al servidor (§7) -- idempotente, reintentable sin límite.
  const syncingRef = useRef(false);
  const runSync = useCallback(async () => {
    if (syncingRef.current || !isOnline || !localEvent) return;
    const opsToSync = await getPendingOps();
    if (opsToSync.length === 0) return;
    syncingRef.current = true;
    try {
      const results = await syncMutation.mutateAsync({ eventId: localEvent.id, registerId: registerId ?? undefined, ops: opsToSync.slice(0, 50).map((o) => o.op) as QueuedOp[] });
      for (const [opId, res] of Object.entries(results)) {
        await markOpSynced(opId, res.result, res.conflictNote);
        if (res.result === 'conflict') toast.warning(`Conflicto al sincronizar: ${res.conflictNote || 'revisar con supervisor'}`);
      }
      await clearSyncedOps();
      refreshPending();
      setSheetVersion((v) => v + 1);
    } catch {
      // Sin red real (aunque navigator.onLine diga que sí) o error del servidor -- se reintenta en el próximo tick.
    } finally {
      syncingRef.current = false;
    }
  }, [isOnline, localEvent, syncMutation, refreshPending, registerId]);

  useEffect(() => {
    const interval = setInterval(runSync, 5000);
    if (isOnline) runSync();
    return () => clearInterval(interval);
  }, [runSync, isOnline]);

  // Búsqueda 100% local (funciona offline, <50ms).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setGiftResults([]); setStaffCompResults([]); return; }
    searchLocal(q).then(setResults);
    // Los tragos invitados se buscan aparte: no pertenecen a una orden de
    // esta noche (pueden venir de la fiesta anterior).
    searchGiftsLocal(q).then((gs) => setGiftResults(gs.filter((g) => g.status !== 'used')));
    // Consumos gratis de staff: tampoco pertenecen a una orden con asistentes.
    searchStaffCompsLocal(q).then((cs) => setStaffCompResults(cs.filter((c) => c.status !== 'used')));
  }, [query, sheetVersion]);

  const doRedeem = async (displayCode: string) => {
    await enqueueOp({ opId: newOpId(), type: 'redeem', displayCode, clientAt: (await correctedNow()).toISOString() });
    toast.success('Código canjeado ✅');
    refreshPending();
    setSheetVersion((v) => v + 1);
    runSync();
  };

  // Marcar la entrada en la puerta. Va por la misma cola offline que el
  // canje, así que la fila avanza aunque la tablet esté sin señal.
  const doCheckIn = async (ticketCode: string) => {
    await enqueueOp({ opId: newOpId(), type: 'checkin', ticketCode, clientAt: (await correctedNow()).toISOString() });
    toast.success('Entrada marcada ✅');
    refreshPending();
    setSheetVersion((v) => v + 1);
    runSync();
  };

  const redeemManual = () => {
    if (!manualCode.trim()) return;
    doRedeem(manualCode.trim());
    setManualCode('');
  };

  // Escanear el QR de la entrada es un atajo para llegar a la ficha más
  // rápido que teclear el nombre -- el canje en sí sigue pasando por el
  // botón "Canjear" de cada extra, ya validado por el servidor.
  const handleScan = async (raw: string) => {
    const code = parseTicketCodeFromQr(raw);
    if (!code) return;
    setScanning(false);
    const found = await searchLocal(code);
    const attendee = found[0];
    if (!attendee) { toast.error('No encontramos ese código.'); return; }
    setSelectedOrderId(attendee.orderId);
    setView('sheet');
  };

  const isSupervisor = operator.role === 'supervisor' || operator.role === 'admin';

  const voidCode = trpc.caja.voidCode.useMutation({
    onError: (e) => toast.error(e.message),
    onSuccess: (res) => {
      if (res.result === 'applied') { toast.success('Código anulado'); setSheetVersion((v) => v + 1); }
      else toast.error(res.conflictNote || 'No se pudo anular');
    },
  });

  if (!localEvent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white flex items-center justify-center p-6 text-center">
        <p className="text-white/60">{isOnline ? 'Cargando evento…' : 'Sin conexión y sin datos guardados todavía. Conéctate una vez para descargar el evento.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white">
      <header className="sticky top-0 z-10 bg-[#150d13]/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold leading-tight">{localEvent.title}</p>
          <p className="text-xs text-white/50">{operator.name} · {operator.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge online={isOnline} pending={pending} />
          {view !== 'menu' && (
            <Button variant="outline" size="sm" className="border-white/15 text-white" onClick={() => { setView('menu'); setSelectedOrderId(null); }}>
              ← Volver
            </Button>
          )}
          <Button
            variant="outline" size="sm" className="border-white/15 text-white"
            disabled={shiftClose.isPending}
            onClick={async () => {
              // Protocolo de pendientes (§13, riesgo 2): no cerrar turno con
              // ops sin sincronizar -- se resuelve en la UI, no en el servidor.
              const stillPending = await pendingOpsCount();
              if (stillPending > 0) { toast.error(`Todavía hay ${stillPending} operación${stillPending > 1 ? 'es' : ''} sin sincronizar. Espera a que termine.`); return; }
              setShowCloseForm(true);
            }}
          >
            Cerrar turno
          </Button>
        </div>
      </header>

      {scanning && (
        <div className="fixed inset-0 z-50 bg-[#0d0810] flex flex-col">
          <div className="flex items-center justify-between p-4 shrink-0">
            <p className="font-semibold">Escanea el QR de la entrada</p>
            <button onClick={() => setScanning(false)} className="p-2 text-white/50" aria-label="Cerrar"><X className="w-6 h-6" /></button>
          </div>
          <QrScanner onDecode={handleScan} className="flex-1">
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="w-56 h-56 rounded-3xl border-2 border-primary/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
            </div>
          </QrScanner>
          <p className="p-4 text-center text-sm text-white/50 shrink-0">
            Sirve el mismo código de la entrada -- abre la ficha para cobrar el extra.
          </p>
        </div>
      )}

      {showCloseForm && (
        <ShiftCloseForm
          loading={shiftClose.isPending}
          onCancel={() => setShowCloseForm(false)}
          onSubmit={async (counts) => {
            const report = await shiftClose.mutateAsync({
              opId: newOpId(), eventId: localEvent.id, registerId: registerId ?? undefined,
              ...counts, clientAt: (await correctedNow()).toISOString(),
            });
            const cuadra = Math.abs(report.cashDiff) < 1 && Math.abs(report.debitDiff) < 1 && Math.abs(report.creditDiff) < 1 && Math.abs(report.qrDiff) < 1;
            toast.success(cuadra ? '✅ Turno cerrado — la caja cuadra perfecto' : '⚠️ Turno cerrado — revisa el correo, hay diferencias en el cuadre');
            onCloseShift();
            logout.mutate();
          }}
        />
      )}

      {/* "Nueva venta" (view === 'sale') usa el ancho completo -- el resto de
          las vistas son listas/formularios angostos que se mantienen
          centrados con su propio max-w-lg, en vez de angostar todo por igual. */}
      <main className="p-4">
        {view === 'menu' && (
          <div className="max-w-lg mx-auto space-y-6">
            <div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, email o teléfono…"
                className="h-14 text-base bg-white/[0.04] backdrop-blur-sm border-white/10 text-white placeholder:text-white/50"
              />
              {query.trim().length >= 2 && (
                <div className="mt-2 space-y-2">
                  {results.length === 0 && staffCompResults.length === 0 && <p className="text-white/50 text-sm px-1">Sin resultados.</p>}
                  {results.map((r) => (
                    <button
                      key={r.orderId}
                      onClick={() => { setSelectedOrderId(r.orderId); setView('sheet'); }}
                      className="w-full text-left p-4 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10 active:scale-[0.99] transition-transform"
                    >
                      <p className="font-semibold">{r.buyerName}</p>
                      <p className="text-sm text-white/50">{r.buyerEmail}{r.buyerPhone ? ` · ${r.buyerPhone}` : ''}</p>
                    </button>
                  ))}
                  {/* Consumos gratis invitados al staff (Accesos Manuales) --
                      no pertenecen a una orden con ficha, se canjean directo. */}
                  {staffCompResults.map((c) => (
                    <div
                      key={c.displayCode}
                      className="w-full p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold">🎁 {c.productName}</p>
                        <p className="text-sm text-white/50">Para {c.staffName} · {c.displayCode}</p>
                      </div>
                      <Button className="h-10 bg-primary hover:bg-primary/90 shrink-0" onClick={() => doRedeem(c.displayCode)}>
                        Canjear
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="Código de canje (PIS-XXXX-XXXX)"
                className="h-12 bg-white/[0.04] backdrop-blur-sm border-white/10 text-white placeholder:text-white/50 font-mono"
              />
              <Button className="h-12 bg-primary hover:bg-primary/90" disabled={!manualCode.trim()} onClick={redeemManual}>
                Canjear
              </Button>
              <Button
                variant="outline"
                className="h-12 border-white/15 text-white px-3"
                onClick={() => setScanning(true)}
                aria-label="Escanear código QR"
              >
                <Camera className="w-5 h-5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => setView('sale')} className="h-24 rounded-3xl bg-primary/10 border border-primary/30 text-primary font-semibold active:scale-95 transition-transform shadow-[0_0_24px_-8px_var(--color-primary)]">
                🛒 Nueva venta
              </button>
              <button onClick={() => setView('dashboard')} className="h-24 rounded-3xl bg-white/[0.04] backdrop-blur-sm border border-white/10 font-semibold active:scale-95 transition-transform">
                📊 Dashboard
              </button>
              {isSupervisor && (
                <button onClick={() => setView('conflicts')} className="h-24 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold active:scale-95 transition-transform col-span-2 shadow-[0_0_24px_-8px_rgba(245,158,11,0.6)]">
                  ⚠ Cola de conflictos
                </button>
              )}
            </div>
          </div>
        )}

        {view === 'sheet' && selectedOrderId && (
          <div className="max-w-lg mx-auto">
            <CustomerSheet
              key={sheetVersion}
              orderId={selectedOrderId}
              onRedeem={doRedeem}
              onCheckIn={doCheckIn}
              canVoid={isSupervisor}
              onVoid={async (displayCode, reason) => voidCode.mutate({ opId: newOpId(), eventId: localEvent.id, registerId: registerId ?? undefined, displayCode, reason, clientAt: (await correctedNow()).toISOString() })}
              voiding={voidCode.isPending}
            />
          </div>
        )}

        {view === 'conflicts' && (
          <div className="max-w-lg mx-auto">
            <ConflictQueue eventId={localEvent.id} />
          </div>
        )}

        {view === 'sale' && (
          <NewSale
            eventId={localEvent.id}
            registerId={registerId}
            onSale={async (items, paymentMethod, buyerEmail, redeemPlaycoins, discountCode, lockerTag, lockerCustomerName, kitchenTicketNumber, customerName) => {
              await enqueueOp({
                opId: newOpId(), type: 'sale', items, paymentMethod, buyerEmail, redeemPlaycoins,
                discountCode, lockerTag, lockerCustomerName, kitchenTicketNumber, customerName, clientAt: (await correctedNow()).toISOString(),
              });
              const confirms: typeof postSaleConfirms = [];
              if (kitchenTicketNumber) confirms.push({ kind: 'kitchen', number: kitchenTicketNumber, name: customerName || kitchenTicketNumber, offline: !isOnline });
              if (lockerTag) confirms.push({ kind: 'locker', number: lockerTag, name: lockerCustomerName || lockerTag, offline: !isOnline });
              if (confirms.length > 0) setPostSaleConfirms(confirms);
              else toast.success('Venta registrada ✅');
              refreshPending();
              runSync();
              // Con favoritos cargados, la cajera se queda directo en "Nueva
              // venta" lista para la próxima -- volver al menú entre cada
              // venta era fricción innecesaria en un local de alto volumen.
              // NewSale ya resetea su propio carrito/tab a Favoritos en su
              // confirm(); sin favoritos, se mantiene el comportamiento de
              // siempre (volver al menú).
              if (getFavoriteIds().length === 0) setView('menu');
            }}
          />
        )}

        {view === 'dashboard' && (
          <div className="max-w-lg mx-auto">
            <CajaDashboard eventId={localEvent.id} />
          </div>
        )}
      </main>

      {postSaleConfirms.length > 0 && (() => {
        const c = postSaleConfirms[0];
        const isKitchen = c.kind === 'kitchen';
        return (
          <div className="fixed inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-[#150d13] border border-white/10 rounded-3xl p-6 text-center space-y-4">
              <p className="text-sm text-white/60 uppercase tracking-wide">{isKitchen ? 'Nombre del pedido' : '🧥 Percha asignada'}</p>
              <p className="font-heading font-extrabold text-5xl tracking-tight text-primary">{isKitchen ? c.name : c.number}</p>
              <p className="text-xs text-white/40 font-mono">{isKitchen ? `Comanda ${c.number}` : c.name}</p>
              <p className="text-white/70">
                {isKitchen
                  ? 'Díctale su nombre a la persona -- lo va a necesitar para retirar en cocina.'
                  : 'Escribe este número en la percha física y guarda la prenda ahí -- queda asociado al nombre de la persona.'}
              </p>
              {c.offline && (
                <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  Sin señal ahora mismo: {isKitchen ? 'la cocina' : 'el sistema'} todavía no ve este pedido. Se va a sincronizar solo cuando vuelva la conexión.
                </p>
              )}
              <Button className="w-full h-12 bg-primary hover:bg-primary/90" onClick={() => setPostSaleConfirms((q) => q.slice(1))}>
                Listo
              </Button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function statusBadge(status: string, kind: 'acceso' | 'extra' = 'extra') {
  if (status === 'used') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-white/60">{kind === 'acceso' ? 'Entró' : 'Canjeado'}</span>;
  if (status === 'cancelled') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-300">Anulado</span>;
  return <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_-4px_rgba(16,185,129,0.7)]">Pendiente</span>;
}

function CustomerSheet({ orderId, onRedeem, onCheckIn, canVoid, onVoid, voiding }: {
  orderId: number;
  onRedeem: (code: string) => void;
  onCheckIn: (ticketCode: string) => void;
  canVoid: boolean;
  onVoid: (displayCode: string, reason: string) => void;
  voiding: boolean;
}) {
  const [sheet, setSheet] = useState<CajaAttendee | null | undefined>(undefined);
  const [voidingCode, setVoidingCode] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => { getLocalAttendee(orderId).then((a) => setSheet(a ?? null)); }, [orderId]);

  if (sheet === undefined) return <p className="text-white/50">Cargando…</p>;
  if (sheet === null) return <p className="text-white/50">No se encontró la orden.</p>;

  const confirmVoid = () => {
    if (!voidingCode || reason.trim().length < 3) return;
    onVoid(voidingCode, reason.trim());
    setVoidingCode(null);
    setReason('');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{sheet.buyerName}</h2>
        <p className="text-sm text-white/50">{sheet.buyerEmail}{sheet.buyerPhone ? ` · ${sheet.buyerPhone}` : ''}</p>
        <p className="text-xs text-white/40 mt-1">Orden {sheet.orderNumber}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Acceso</p>
        <div className="space-y-2">
          {sheet.access.length === 0 && <p className="text-sm text-white/40">Sin accesos en esta orden.</p>}
          {sheet.access.map((a, i) => (
            <div key={i} className="p-3 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.typeName}</p>
                <p className="text-xs text-white/50 font-mono truncate">{a.ticketCode}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.status === 'valid' && (
                  <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => onCheckIn(a.ticketCode)}>Marcar entrada</Button>
                )}
                {statusBadge(a.status, 'acceso')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {sheet.extras.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Extras</p>
          <div className="space-y-2">
            {sheet.extras.map((e, i) => (
              <div key={i} className="p-3 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{e.typeName}</p>
                    {e.displayCode && <p className="text-xs text-white/50 font-mono">{e.displayCode}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {e.status === 'valid' && (
                      <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => e.displayCode && onRedeem(e.displayCode)}>Canjear</Button>
                    )}
                    {statusBadge(e.status)}
                    {canVoid && e.status !== 'cancelled' && e.displayCode && (
                      <button className="text-xs text-red-400 underline" onClick={() => setVoidingCode(e.displayCode)}>Anular</button>
                    )}
                  </div>
                </div>
                {voidingCode === e.displayCode && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <Input
                      value={reason}
                      onChange={(ev) => setReason(ev.target.value)}
                      placeholder="Motivo de la anulación (obligatorio)"
                      className="h-9 text-sm bg-white/10 border-white/15 text-white"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" disabled={reason.trim().length < 3 || voiding} onClick={confirmVoid}>Confirmar anulación</Button>
                      <Button size="sm" variant="outline" className="border-white/15 text-white" onClick={() => { setVoidingCode(null); setReason(''); }}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mismo agrupado que el admin (Dashboard.tsx CARTA_CATEGORIES): la cajera ve
// las mismas categorías con las que se cargó la carta. `extra` son los
// addons que TAMBIÉN se venden en la web (estacionamiento, covers).
const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  consumo: { label: 'Tragos y comida', emoji: '🍹' },
  locker: { label: 'Guardarropía', emoji: '🧥' },
  merch: { label: 'Merch', emoji: '🎁' },
  extra: { label: 'Extras', emoji: '🎫' },
};

function NewSale({ eventId, registerId, onSale }: {
  eventId: number;
  registerId: number | null;
  onSale: (
    items: { ticketTypeId: number; quantity: number }[],
    paymentMethod: 'efectivo' | 'debito' | 'credito' | 'qr',
    buyerEmail?: string,
    redeemPlaycoins?: number,
    discountCode?: string,
    lockerTag?: string,
    lockerCustomerName?: string,
    kitchenTicketNumber?: string,
    customerName?: string,
  ) => void;
}) {
  const [catalog, setCatalog] = useState<CajaCatalogItem[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'debito' | 'credito' | 'qr'>('debito');
  // Pantalla intermedia antes de finalizar el cobro (pedido explícito del
  // dueño): con tarjeta hay que confirmar que la máquina aprobó el pago
  // antes de dar la venta por hecha; con efectivo hay que pedir el monto
  // entregado y mostrar el vuelto. QR sigue siendo instantáneo -- no pasa
  // por una máquina ni requiere vuelto.
  const [paymentStep, setPaymentStep] = useState<'card' | 'cash' | null>(null);
  const [cashGiven, setCashGiven] = useState('');
  const [tab, setTab] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<number[]>(() => getFavoriteIds());
  const [editingFavorites, setEditingFavorites] = useState(false);
  const FAVORITES_TAB = '__favoritos__';

  // Mantener presionada una tarjeta muestra sus ingredientes/sabores (pedido
  // explícito del dueño, para responder preguntas del cliente en el momento).
  // Reusa `description`, ya cargado desde la Carta de la Fiesta. `longPressed`
  // es un ref (no state) para no re-renderizar en cada pointerdown, y para
  // poder leerlo de forma síncrona en el onClick que dispara el navegador
  // justo después del pointerup y así no sumar el producto al carrito.
  const [infoProduct, setInfoProduct] = useState<CajaCatalogItem | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const LONG_PRESS_MS = 450;

  const startLongPress = (p: CajaCatalogItem) => {
    if (!p.description) return; // nada que mostrar -- no interceptar el tap
    longPressed.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setInfoProduct(p);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // Playcoins (pedido explícito del usuario): paso opcional/omisible para
  // que la venta también gane puntos, y para canjear puntos ya ganados.
  const [showEmailStep, setShowEmailStep] = useState(false);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [associatedName, setAssociatedName] = useState<string | null>(null);
  const [scanningCustomer, setScanningCustomer] = useState(false);
  // Buscador por nombre entre quienes YA ENTRARON a la fiesta -- para sumar
  // Playcoins sin depender de que el cliente traiga a mano el email o el QR
  // de su entrada (pedido explícito del dueño). Búsqueda local, sin red.
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<CajaAttendee[]>([]);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerSearchResults([]); return; }
    searchInsideAttendeesLocal(customerSearch).then(setCustomerSearchResults);
  }, [customerSearch]);

  const pickCustomer = (a: CajaAttendee) => {
    setBuyerEmail(a.buyerEmail);
    setAssociatedName(a.buyerName);
    setShowEmailStep(true);
    setBalance(null);
    setRedeemInput('');
    setCustomerSearch('');
    setCustomerSearchResults([]);
  };

  // Código de descuento (opcional): se PREVISUALIZA acá contra el mismo
  // endpoint que usa el checkout web, pero el monto real que se cobra lo
  // recalcula el servidor al aplicar la venta -- nunca se confía en este
  // preview para el cobro final.
  const [discountCode, setDiscountCode] = useState('');
  const [discountResult, setDiscountResult] = useState<{ valid: boolean; message?: string; discount?: any } | null>(null);
  const validateDiscount = trpc.orders.validateDiscount.useMutation();
  const applyDiscount = async () => {
    if (!discountCode.trim()) return;
    try {
      const r = await validateDiscount.mutateAsync({ code: discountCode.trim(), eventId });
      setDiscountResult(r);
      if (!r.valid) toast.error(r.message || 'Código no válido');
    } catch {
      setDiscountResult({ valid: false, message: 'No se pudo validar (¿sin conexión?)' });
    }
  };

  // Guardarropía: el número de la percha lo genera la propia tablet al
  // confirmar (nextLockerTagNumber) -- acá solo se pide el nombre del
  // cliente, para poder ubicar la prenda por nombre en vez de por número.
  const [lockerCustomerName, setLockerCustomerName] = useState('');

  // Nombre que ve cocina en pantalla en vez del número de comanda (pedido
  // explícito del dueño: el número es difícil de memorizar para ir a buscarlo).
  const [customerName, setCustomerName] = useState('');

  useEffect(() => {
    getLocalCatalog().then((c) => {
      const sorted = [...c].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      setCatalog(sorted);
      if (sorted.length > 0) setTab((prev) => prev ?? (sorted[0].groupName || sorted[0].category));
    });
  }, []);

  const total = catalog.reduce((sum, p) => sum + p.price * (cart[p.id] || 0), 0);
  const cartLines = catalog.filter((p) => (cart[p.id] || 0) > 0);
  const hasItems = cartLines.length > 0;
  const lockerLines = cartLines.filter((p) => p.category === 'locker');
  const lockerQty = lockerLines.reduce((sum, p) => sum + (cart[p.id] || 0), 0);
  const needsLockerTag = lockerQty > 0;
  const tooManyLockers = lockerQty > 1;
  const hasKitchenItems = cartLines.some((p) => p.toKitchen);

  const add = (id: number) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const remove = (id: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
  const onToggleFavorite = (id: number) => setFavorites(toggleFavorite(id));

  // Pestañas por sección (groupName), con la categoría como respaldo para
  // productos sin sección asignada -- así nunca desaparecen de la grilla.
  // "Favoritos" va primero, solo si la cajera ya marcó al menos uno.
  const sectionTabs = Array.from(new Set(catalog.map((p) => p.groupName || p.category)));
  const tabs = favorites.length > 0 ? [FAVORITES_TAB, ...sectionTabs] : sectionTabs;
  const productsInTab = tab === FAVORITES_TAB
    ? catalog.filter((p) => favorites.includes(p.id))
    : catalog.filter((p) => (p.groupName || p.category) === tab);

  const checkBalance = async () => {
    if (!buyerEmail.trim()) return;
    setCheckingBalance(true);
    try {
      const r = await utils.playcoins.getBalanceByEmail.fetch({ email: buyerEmail.trim() });
      setBalance(r?.playcoins ?? 0);
    } catch {
      toast.error('No se pudo consultar el saldo (¿sin conexión?)');
    } finally {
      setCheckingBalance(false);
    }
  };

  // Validaciones del carrito antes de mostrar la pantalla de cobro (tarjeta
  // o efectivo) -- si algo falta, ni siquiera se abre esa pantalla.
  const startCheckout = () => {
    if (tooManyLockers) { toast.error('Cobra los abrigos de a uno para poder asignar un número a cada uno'); return; }
    if (needsLockerTag && !lockerCustomerName.trim()) { toast.error('Falta el nombre del cliente para guardarropía'); return; }
    if (hasKitchenItems && !customerName.trim()) { toast.error('Falta el nombre para cocina'); return; }
    if (paymentMethod === 'debito' || paymentMethod === 'credito') { setPaymentStep('card'); return; }
    if (paymentMethod === 'efectivo') { setCashGiven(''); setPaymentStep('cash'); return; }
    confirm();
  };

  const confirm = async () => {
    const cartItems = Object.entries(cart).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId: Number(ticketTypeId), quantity }));
    const redeemAmount = balance != null ? clampRedeemAmount(Number(redeemInput || 0), Math.min(balance, total)) : 0;
    // El número de comanda/percha se genera ACÁ, en la tablet, antes de
    // encolar la venta -- así funciona sin señal (ver nextKitchenTicketNumber
    // / nextLockerTagNumber).
    const kitchenTicketNumber = hasKitchenItems ? await nextKitchenTicketNumber(registerId) : undefined;
    const lockerTag = needsLockerTag ? await nextLockerTagNumber(registerId) : undefined;
    onSale(
      cartItems, paymentMethod, buyerEmail.trim() || undefined, redeemAmount || undefined,
      discountResult?.valid ? discountCode.trim() : undefined,
      lockerTag,
      needsLockerTag ? lockerCustomerName.trim() : undefined,
      kitchenTicketNumber,
      hasKitchenItems ? customerName.trim() : undefined,
    );
    setCart({});
    setBuyerEmail('');
    setBalance(null);
    setRedeemInput('');
    setShowEmailStep(false);
    setAssociatedName(null);
    setCustomerSearch('');
    setCustomerSearchResults([]);
    setDiscountCode('');
    setDiscountResult(null);
    setLockerCustomerName('');
    setCustomerName('');
    setPaymentStep(null);
    setCashGiven('');
    // Pedido explícito del dueño: con favoritos cargados, la pantalla que se
    // abre después de cada venta es la de Favoritos -- lista para la
    // siguiente, sin volver a elegir sección cada vez.
    if (favorites.length > 0) setTab(FAVORITES_TAB);
  };

  const handleCustomerScan = async (raw: string) => {
    const code = parseTicketCodeFromQr(raw);
    setScanningCustomer(false);
    if (!code) return;
    const found = await searchLocal(code);
    const attendee = found[0];
    if (!attendee) { toast.error('No encontramos ese código.'); return; }
    setBuyerEmail(attendee.buyerEmail);
    setAssociatedName(attendee.buyerName);
    setShowEmailStep(true);
    setBalance(null);
    setRedeemInput('');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Nueva venta</h2>
        {catalog.length > 0 && (
          <button
            onClick={() => setEditingFavorites((v) => !v)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${editingFavorites ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/60'}`}
          >
            {editingFavorites ? '✓ Listo' : '★ Editar favoritos'}
          </button>
        )}
      </div>

      {editingFavorites && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          Toca los productos que más vendes para agregarlos a "⭐ Favoritos" -- mientras este modo esté activo, tocar un producto no lo agrega a la venta.
        </p>
      )}

      {catalog.length === 0 ? (
        <p className="text-white/50 text-sm">Todavía no hay productos cargados para este evento. Se cargan desde Admin → Carta de la Fiesta.</p>
      ) : (
        <div className="flex gap-4 items-start">
          {/* Categorías en columna, siempre visibles de un vistazo -- sin scroll horizontal. */}
          <div className="w-40 md:w-48 shrink-0 flex flex-col gap-2">
            {tabs.map((t) => {
              const meta = t === FAVORITES_TAB ? { label: 'Favoritos', emoji: '⭐' } : (CATEGORY_META[t] ?? { label: t, emoji: '🛍️' });
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-left px-4 py-2.5 rounded-2xl text-sm font-medium transition-colors ${tab === t ? 'bg-primary text-white' : 'bg-white/5 text-white/60'}`}
                >
                  {meta.emoji} {meta.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 flex-1 min-w-0">
            {productsInTab.map((p) => {
              const left = p.totalStock - p.soldCount;
              const noStock = left <= 0;
              const isFavorite = favorites.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    if (longPressed.current) { longPressed.current = false; return; }
                    editingFavorites ? onToggleFavorite(p.id) : add(p.id);
                  }}
                  onPointerDown={() => startLongPress(p)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  className="relative rounded-3xl p-4 min-h-[88px] text-left border active:scale-95 transition-transform backdrop-blur-sm"
                  style={{ backgroundColor: (p.color || '#f472b6') + '14', borderColor: (p.color || '#f472b6') + '50', boxShadow: `0 0 20px -10px ${p.color || '#f472b6'}` }}
                >
                  {editingFavorites && (
                    <span className={`absolute top-2 right-2 text-lg leading-none ${isFavorite ? '' : 'opacity-30'}`}>
                      {isFavorite ? '⭐' : '☆'}
                    </span>
                  )}
                  {!editingFavorites && noStock && (
                    <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide bg-red-500/90 text-white px-2 py-0.5 rounded-full">
                      Sin stock
                    </span>
                  )}
                  {p.description && (
                    <span className="absolute bottom-2 right-2 text-[10px] text-white/30" aria-hidden>ⓘ</span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-3xl leading-none">{p.emoji || CATEGORY_META[p.category]?.emoji || '🛍️'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{p.name}</p>
                      <p className="text-sm text-white/60">${p.price.toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                  {!editingFavorites && cart[p.id] > 0 && (
                    <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => remove(p.id)} className="w-7 h-7 rounded-full bg-white/10 text-white">−</button>
                      <span className="font-bold">{cart[p.id]}</span>
                      <button onClick={() => add(p.id)} className="w-7 h-7 rounded-full bg-white/10 text-white">+</button>
                    </div>
                  )}
                </button>
              );
            })}
            {productsInTab.length === 0 && (
              <p className="col-span-full text-white/50 text-sm">
                {tab === FAVORITES_TAB ? 'Todavía no marcaste ningún favorito.' : 'Nada cargado en esta sección todavía.'}
              </p>
            )}
          </div>
        </div>
      )}

      {hasItems && (
        <div className="sticky bottom-4 bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {cartLines.map((p) => (
              <div key={p.id} className="flex justify-between text-sm text-white/70">
                <span>{p.emoji ? `${p.emoji} ` : ''}{p.name} × {cart[p.id]}</span>
                <span>${(p.price * cart[p.id]).toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
          {/* Código de descuento -- solo vista previa, el servidor lo
              revalida al cobrar. Sin señal simplemente no se puede aplicar. */}
          <div className="space-y-1">
            <div className="flex gap-2">
              <Input
                value={discountCode}
                onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setDiscountResult(null); }}
                placeholder="Código de descuento (opcional)"
                className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/40"
              />
              <Button size="sm" variant="outline" className="border-white/15 text-white shrink-0" disabled={!discountCode.trim() || validateDiscount.isPending} onClick={applyDiscount}>
                {validateDiscount.isPending ? '…' : 'Aplicar'}
              </Button>
            </div>
            {discountResult?.valid && discountResult.discount && (
              <p className="text-xs text-green-400">✓ Descuento aplicado: {discountResult.discount.discountType === 'percentage' ? `${discountResult.discount.discountValue}%` : `$${Number(discountResult.discount.discountValue).toLocaleString('es-CL')}`}</p>
            )}
            {discountResult && !discountResult.valid && (
              <p className="text-xs text-red-400">{discountResult.message || 'Código no válido'}</p>
            )}
          </div>

          {/* Guardarropía: el número de la percha lo asigna el sistema solo,
              correlativo -- acá solo se pide el nombre del cliente. */}
          {needsLockerTag && (
            <div className="space-y-1">
              <label className="text-xs text-white/50 uppercase tracking-wide">🧥 ¿A nombre de quién? (guardarropía)</label>
              <Input
                value={lockerCustomerName}
                onChange={(e) => setLockerCustomerName(e.target.value)}
                placeholder="Nombre de la persona"
                className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/40"
              />
              <p className="text-xs text-white/40">El número de percha se asigna solo al confirmar.</p>
              {tooManyLockers && <p className="text-xs text-red-400">Cobra los abrigos de a uno para poder asignar un número a cada uno.</p>}
            </div>
          )}

          {/* Nombre para cocina (pedido explícito del dueño): un número de
              comanda es difícil de memorizar para ir a buscarlo, un nombre no. */}
          {hasKitchenItems && (
            <div className="space-y-1">
              <label className="text-xs text-white/50 uppercase tracking-wide">🍽️ ¿A nombre de quién?</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Cualquier nombre, para que cocina lo llame"
                className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/40"
              />
            </div>
          )}

          <div className="flex justify-between text-lg font-bold border-t border-white/10 pt-2">
            <span>Total</span>
            <span>${total.toLocaleString('es-CL')}</span>
          </div>

          {!showEmailStep ? (
            <div className="space-y-2">
              <div className="relative">
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="🔍 Buscar cliente por nombre (Playcoins)"
                  className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/40"
                />
                {customerSearchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-[#1a1017] border border-white/15 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                    {customerSearchResults.map((a) => (
                      <button
                        key={a.orderId}
                        onClick={() => pickCustomer(a)}
                        className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 border-b border-white/5 last:border-0"
                      >
                        <span className="font-medium">{a.buyerName}</span>
                        <span className="block text-xs text-white/40">{a.buyerEmail}</span>
                      </button>
                    ))}
                  </div>
                )}
                {customerSearch.trim() && customerSearchResults.length === 0 && (
                  <p className="text-xs text-white/40 mt-1">Nadie que ya haya entrado coincide con "{customerSearch.trim()}".</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => setShowEmailStep(true)} className="text-sm text-white/50 underline">
                  + Registrar email del cliente — opcional
                </button>
                <button onClick={() => setScanningCustomer(true)} className="text-sm text-white/50 underline">
                  📷 Asociar a un cliente
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {associatedName && <p className="text-xs text-white/50">Asociado a: <b className="text-white/80">{associatedName}</b></p>}
              <Input
                value={buyerEmail}
                onChange={(e) => { setBuyerEmail(e.target.value); setBalance(null); setRedeemInput(''); setAssociatedName(null); }}
                placeholder="email@cliente.cl"
                className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/40"
              />
              <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" className="border-white/15 text-white" disabled={!buyerEmail.trim() || checkingBalance} onClick={checkBalance}>
                  {checkingBalance ? 'Consultando…' : 'Consultar saldo'}
                </Button>
                <button
                  onClick={() => { setShowEmailStep(false); setBuyerEmail(''); setBalance(null); setRedeemInput(''); setAssociatedName(null); }}
                  className="text-xs text-white/40 underline"
                >
                  Omitir
                </button>
              </div>
              {balance != null && (
                canRedeem(balance) ? (
                  <div>
                    <p className="text-xs text-white/50">Saldo: {balance} Playcoins (${balance.toLocaleString('es-CL')})</p>
                    <Input
                      type="number" inputMode="numeric" min={0} max={Math.min(balance, total)}
                      value={redeemInput} onChange={(e) => setRedeemInput(e.target.value)}
                      placeholder="Canjear cuántos Playcoins"
                      className="h-9 mt-1 bg-white/10 border-white/15 text-white placeholder:text-white/40"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-white/40">Saldo: {balance} Playcoins (mínimo {PLAYCOINS_MIN_REDEEM_BALANCE} para canjear)</p>
                )
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            {(['efectivo', 'debito', 'credito', 'qr'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`h-10 rounded-lg text-xs font-medium capitalize ${paymentMethod === m ? 'bg-primary text-white' : 'bg-white/5 text-white/50'}`}
              >
                {m === 'qr' ? '📲 QR' : m}
              </button>
            ))}
          </div>
          <Button className="w-full h-12 bg-primary hover:bg-primary/90" disabled={tooManyLockers} onClick={startCheckout}>
            {paymentMethod === 'efectivo' ? 'Cobrar en efectivo' : paymentMethod === 'qr' ? 'Cobrado en terminal — Confirmar' : 'Cobrar con máquina'}
          </Button>
        </div>
      )}

      {paymentStep === 'card' && (
        <div className="fixed inset-0 z-30 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#150d13] border border-white/10 rounded-3xl p-6 text-center space-y-4">
            <p className="text-xs uppercase tracking-widest text-white/40">Cobrar con máquina</p>
            <p className="font-heading font-extrabold text-5xl">${total.toLocaleString('es-CL')}</p>
            <p className="text-white/60 text-sm">Pasa la tarjeta ({paymentMethod}) en el POS y espera la aprobación antes de confirmar.</p>
            <div className="space-y-2 pt-2">
              <Button className="w-full h-12 bg-primary hover:bg-primary/90" onClick={confirm}>
                Pago aprobado — Confirmar venta
              </Button>
              <Button variant="outline" className="w-full h-11 border-white/15 text-white/70" onClick={() => setPaymentStep(null)}>
                Cancelar y volver
              </Button>
            </div>
          </div>
        </div>
      )}

      {paymentStep === 'cash' && (() => {
        const given = Number(cashGiven || 0);
        const change = given - total;
        const validAmount = cashGiven.trim() !== '' && given >= total;
        return (
          <div className="fixed inset-0 z-30 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-[#150d13] border border-white/10 rounded-3xl p-6 text-center space-y-4">
              <p className="text-xs uppercase tracking-widest text-white/40">Cobro en efectivo</p>
              <p className="font-heading font-extrabold text-5xl">${total.toLocaleString('es-CL')}</p>
              <div className="text-left">
                <p className="text-xs text-white/50 mb-1">Monto entregado por el cliente</p>
                <Input
                  type="number" inputMode="numeric" autoFocus min={0}
                  value={cashGiven} onChange={(e) => setCashGiven(e.target.value)}
                  placeholder="$"
                  className="h-12 bg-white/10 border-white/15 text-white text-xl text-center"
                />
              </div>
              {cashGiven.trim() !== '' && (
                given < total ? (
                  <p className="text-red-400 text-sm">Falta ${(total - given).toLocaleString('es-CL')}</p>
                ) : (
                  <p className="text-white/80">Vuelto: <span className="font-bold text-2xl">${change.toLocaleString('es-CL')}</span></p>
                )
              )}
              <div className="space-y-2 pt-2">
                <Button className="w-full h-12 bg-primary hover:bg-primary/90" disabled={!validAmount} onClick={confirm}>
                  Confirmar venta
                </Button>
                <Button variant="outline" className="w-full h-11 border-white/15 text-white/70" onClick={() => setPaymentStep(null)}>
                  Cancelar y volver
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {scanningCustomer && (
        <div className="fixed inset-0 z-30 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 shrink-0">
            <p className="text-sm text-white/70">Escanea el QR de la entrada del cliente</p>
            <button onClick={() => setScanningCustomer(false)} className="p-2 text-white/50" aria-label="Cerrar"><X className="w-6 h-6" /></button>
          </div>
          <QrScanner onDecode={handleCustomerScan} className="flex-1">
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="w-56 h-56 rounded-3xl border-2 border-primary/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
            </div>
          </QrScanner>
        </div>
      )}

      {infoProduct && (
        <div className="fixed inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setInfoProduct(null)}>
          <div className="w-full max-w-sm bg-[#150d13] border border-white/10 rounded-3xl p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-4xl leading-none">{infoProduct.emoji || CATEGORY_META[infoProduct.category]?.emoji || '🛍️'}</span>
            <p className="font-heading font-bold text-2xl">{infoProduct.name}</p>
            <p className="text-white/70 whitespace-pre-wrap">{infoProduct.description}</p>
            <Button className="w-full h-11 bg-primary hover:bg-primary/90" onClick={() => setInfoProduct(null)}>Listo</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CajaDashboard({ eventId }: { eventId: number }) {
  const { data } = trpc.caja.dashboard.useQuery({ eventId });
  if (!data) return <p className="text-white/50">Cargando… (requiere conexión)</p>;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Dashboard de caja</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10">
          <p className="text-xs text-white/50">Ventas en caja</p>
          <p className="text-2xl font-bold">${data.totalSales.toLocaleString('es-CL')}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10">
          <p className="text-xs text-white/50"># Ventas</p>
          <p className="text-2xl font-bold">{data.salesCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/25 col-span-2">
          <p className="text-xs text-white/60">Personas adentro ahora</p>
          <p className="text-3xl font-bold">
            {data.insideCount}
            <span className="text-base font-normal text-white/40"> / {data.expectedCount}</span>
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10 col-span-2">
          <p className="text-xs text-white/50">Extras canjeados (total evento)</p>
          <p className="text-2xl font-bold">{data.redeemedCount}</p>
        </div>
      </div>

      {data.topProducts.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Top productos</p>
          <div className="space-y-2">
            {data.topProducts.map((p: any, i: number) => (
              <div key={i} className="flex justify-between p-3 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10 text-sm">
                <span>{p.name}</span>
                <span className="font-semibold">{p.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recentSales.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Últimas ventas</p>
          <div className="space-y-2">
            {data.recentSales.map((s: any, i: number) => (
              <div key={i} className="flex justify-between p-3 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10 text-sm">
                <span className="font-mono text-white/60">{s.orderNumber}</span>
                <span className="font-semibold">${s.total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConflictQueue({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data: conflicts, isLoading } = trpc.caja.conflictQueue.useQuery({ eventId });
  const resolve = trpc.caja.resolveConflict.useMutation({
    onSuccess: () => { toast.success('Marcado como revisado'); utils.caja.conflictQueue.invalidate({ eventId }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Cola de conflictos</h2>
      <p className="text-sm text-white/50">Códigos canjeados dos veces antes de sincronizar (§8) -- revisa con el equipo y marca como resuelto.</p>
      {isLoading && <p className="text-white/50">Cargando…</p>}
      {!isLoading && (conflicts ?? []).length === 0 && <p className="text-white/50 text-sm">Sin conflictos pendientes ✅</p>}
      <div className="space-y-2">
        {(conflicts ?? []).map((c: any) => (
          <div key={c.opId} className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-amber-500/30">
            <p className="font-mono text-sm">{c.displayCode}</p>
            <p className="text-xs text-white/50 mt-1">{c.operatorName} · {formatChileDateTime(c.serverAt)}</p>
            <p className="text-xs text-amber-300 mt-1">{c.conflictNote}</p>
            <Button
              size="sm"
              className="mt-2 h-8 bg-white/10 hover:bg-white/15"
              disabled={resolve.isPending}
              onClick={async () => resolve.mutate({ opId: crypto.randomUUID(), eventId, conflictOpId: c.opId, clientAt: (await correctedNow()).toISOString() })}
            >
              Marcar revisado
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
