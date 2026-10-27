import '@/admin.css';
import { useDarkGlassDocument } from '@/components/admin/shell/AdminShell';
import { OPERATOR_ROLE_LABELS } from '@shared/cajaRoles';
import { openedFromApp, preselectedOperatorId } from '@/lib/staffLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHideSplashWhenSettled } from '@/lib/splash';
import { toast } from 'sonner';
import { Camera, Check, Delete, X, ShoppingCart, Search, LayoutDashboard, AlertTriangle, LogOut, Receipt, Wine, BookOpen } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrScanner } from '@/components/QrScanner';
import { isPayQr, parseTicketCodeFromQr } from '@shared/qr';
import {
  saveSnapshot, getLocalEvent, searchLocal, searchStaffCompsLocal, searchInsideAttendeesLocal, getLocalAttendee, getLocalCatalog,
  enqueueOp, pendingOpsCount, getPendingOps, markOpSynced, markOpRejected, getRejectedOps, discardOp, clearSyncedOps, correctedNow,
  nextKitchenTicketNumber, nextLockerTagNumber, getLocalBarra,
  type CajaAttendee, type CajaBarra, type CajaCatalogItem, type CajaStaffComp, type QueuedOp,
} from './db';
import { nivelInsumo, tragosDisponibles, tragosPorInsumo } from '@shared/insumos';
import { BarraCount } from './BarraCount';
import { BarraStock } from './BarraStock';
import { BarraDosier } from './BarraDosier';
import { forgetOffline, useOfflineFallback } from './offlineGate';
import { canRedeem, clampRedeemAmount, PLAYCOINS_MIN_REDEEM_BALANCE } from '@shared/playcoins';
import { formatChileDateTime } from '@shared/chileDate';
import { getFavoriteIds, toggleFavorite } from './favorites';
import { SalesHistory, SalesStrip } from './SalesHistory';
import { RejectedOps } from './RejectedOps';
import { ExtrasGroups } from './ExtrasGroups';
import { undoSecondsLeft } from '@shared/cajaExtras';

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

type View = 'menu' | 'sheet' | 'sale' | 'history' | 'stock' | 'dosier' | 'dashboard' | 'conflicts' | 'rejected';

/** Marco de toda la caja con el mismo vidrio oscuro del panel: tema en
 * <html> (diálogos y selects en portal también), fondo de planetas y barra
 * de estado oscura. Cada pantalla de abajo es `fixed inset-0` y transparente
 * para que se vea este fondo. */
function CajaFrame({ children }: { children: React.ReactNode }) {
  useDarkGlassDocument();
  // El splash de apertura se va cuando ya no queda nada "cargando" adentro.
  const contentRef = useRef<HTMLDivElement>(null);
  useHideSplashWhenSettled(contentRef);
  return (
    <div data-admin-theme="dark-glass" className="admin-shell caja-shell dark">
      <div className="admin-backdrop" aria-hidden="true" />
      <div ref={contentRef} className="contents">{children}</div>
    </div>
  );
}

export default function CajaApp() {
  return (
    <CajaFrame>
      <CajaGate />
    </CajaFrame>
  );
}

function CajaGate() {
  // Fuera del indice de Google: robots.txt solo lo pide, noindex lo asegura.
  useSeo({ title: 'Caja — Mansion Playroom', description: '', path: '/caja', noindex: true });

  // Registro manual del service worker (solo en build de producción -- en
  // dev vite-plugin-pwa no genera un SW real). Scope acotado a /caja para
  // no tocar el resto del sitio (checkout con Mercado Pago, admin).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {});
  }, []);

  const deviceQuery = trpc.caja.deviceStatus.useQuery();
  const { data: deviceStatus, waiting: loadingDevice } = useOfflineFallback('device', deviceQuery);

  if (loadingDevice) {
    return (
      <div className="fixed inset-0 overscroll-none bg-transparent flex items-center justify-center">
        <div data-splash-wait className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Sin señal y sin nada guardado (tablet que nunca entró): no se puede
  // enrolar ni loguear offline, así que se explica en vez de mostrar el
  // formulario de enrolamiento como si la tablet no estuviera activada.
  if (!deviceStatus) return <OfflineFirstRun />;
  if (!deviceStatus.enrolled) return <DeviceEnroll />;
  return <OperatorGate />;
}

function OfflineFirstRun() {
  return (
    <div className="fixed inset-0 overscroll-none bg-transparent text-white flex flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">Sin conexión</h1>
      <p className="text-white/70 text-sm max-w-xs">La primera vez la caja necesita internet para activarse y entrar. Después funciona aunque se corte la señal.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-2 text-sm underline text-white/80">Reintentar</button>
    </div>
  );
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
    <div className="fixed inset-0 overscroll-none bg-transparent text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-bold">Enrolar este dispositivo</h1>
      <p className="text-white/60 text-sm text-center max-w-xs">Pide el código de enrolamiento a un administrador (Panel Admin → Caja → Dispositivos).</p>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="XXXX-XXXX"
        className="h-14 text-center text-lg font-mono max-w-xs"
      />
      <Button className="w-full max-w-xs h-12 bg-primary hover:bg-primary/90" disabled={!code.trim() || enroll.isPending} onClick={() => enroll.mutate({ code: code.trim() })}>
        {enroll.isPending ? 'Enrolando…' : 'Enrolar dispositivo'}
      </Button>
    </div>
  );
}

function OperatorGate() {
  const meQuery = trpc.caja.me.useQuery();
  const { data: operator, waiting: isLoading } = useOfflineFallback('me', meQuery);

  if (isLoading) {
    return (
      <div className="fixed inset-0 overscroll-none bg-transparent flex items-center justify-center">
        <div data-splash-wait className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
  const { data: registersList } = useOfflineFallback('registers', trpc.caja.listRegisters.useQuery());
  const { data: event } = useOfflineFallback('event', trpc.caja.activeEvent.useQuery());
  const shiftOpen = trpc.caja.shiftOpen.useMutation();
  // En localStorage (no sessionStorage): la PWA de la tablet se reinicia
  // cuando queda bloqueada un rato, y sin señal no hay forma de volver a
  // preguntar al servidor qué caja era. Se borra al cerrar el turno.
  const [registerId, setRegisterId] = useState<number | null | undefined>(() => {
    const saved = localStorage.getItem('caja_register_id');
    return saved === null ? undefined : saved === 'none' ? null : Number(saved);
  });
  const [shiftStarted, setShiftStarted] = useState(() => localStorage.getItem('caja_shift_opened') === '1');

  // El servidor manda: si ya hay un turno abierto para esta caja, se entra a
  // vender sin volver a pedir el efectivo inicial, aunque `localStorage`
  // esté vacío (la PWA se reinició, se cerró la pestaña, la tablet estuvo
  // bloqueada). `localStorage` queda solo como caché optimista para que la
  // pantalla no parpadee y para funcionar sin conexión.
  // Mismo evento que shiftOpen/shiftClose (el de activeEvent, que fuera de
  // horario es el de pruebas): antes miraba el evento real y en modo prueba
  // nunca encontraba el turno.
  const shiftQuery = trpc.caja.currentShift.useQuery(
    { eventId: event?.id, registerId: registerId ?? undefined },
    { enabled: registerId !== undefined && !!event, refetchOnWindowFocus: true },
  );
  const serverShift = shiftQuery.data;
  const shiftLoading = shiftQuery.isLoading && shiftQuery.fetchStatus !== 'paused';
  useEffect(() => {
    if (serverShift && !shiftStarted) {
      localStorage.setItem('caja_shift_opened', '1');
      setShiftStarted(true);
    }
  }, [serverShift, shiftStarted]);

  const chooseRegister = (id: number | null) => {
    setRegisterId(id);
    localStorage.setItem('caja_register_id', id === null ? 'none' : String(id));
  };
  const forgetRegister = () => {
    localStorage.removeItem('caja_register_id');
    localStorage.removeItem('caja_shift_opened');
    setRegisterId(undefined);
  };

  const openWithCash = async (openingCash: number) => {
    if (!event) return;
    try {
      const opened = await shiftOpen.mutateAsync({
        opId: newOpId(), eventId: event.id, registerId: registerId ?? undefined,
        openingCash, clientAt: (await correctedNow()).toISOString(),
      });
      // Si el turno ya estaba abierto, el monto recién contado NO se aplica
      // (el fondo del turno es el original). Antes esto pasaba en silencio y
      // la cajera quedaba creyendo que había redeclarado la caja.
      if (opened.alreadyOpen) {
        toast.info(
          `Ya había un turno abierto en esta caja con fondo de $${opened.openingCash.toLocaleString('es-CL')}. ` +
          'Se mantiene ese fondo -- el conteo que acabas de hacer no lo reemplaza.',
          { duration: 10000 },
        );
      }
      // Turno nuevo: lo primero es el conteo de barra (CajaHome lo muestra una vez).
      if (!opened.alreadyOpen) localStorage.setItem(BARRA_APERTURA_PENDING, '1');
      localStorage.setItem('caja_shift_opened', '1');
      setShiftStarted(true);
    } catch (err: any) {
      // Sin esto el turno fallaba en silencio y la cajera seguía en la
      // pantalla de conteo sin entender por qué no pasaba nada.
      toast.error(err?.message ?? 'No se pudo abrir el turno. Revisa la conexión e intenta de nuevo.', { duration: 8000 });
    }
  };

  // Mientras se pregunta al servidor no se muestra el contador de
  // denominaciones: si hay turno abierto, pedirlo sería el bug de nuevo.
  if (registerId !== undefined && !shiftStarted && shiftLoading) {
    return (
      <div className="fixed inset-0 overscroll-none bg-transparent text-white flex items-center justify-center">
        <p className="text-white/60 text-sm">Revisando si hay un turno abierto…</p>
      </div>
    );
  }

  if (registerId !== undefined && shiftStarted) {
    return (
      <CajaHome
        operator={operator}
        registerId={registerId}
        onCloseShift={() => {
          // Turno cerrado: la próxima persona elige su caja de nuevo (antes
          // heredaba la caja anterior e iba directo a su conteo de fondo).
          forgetRegister();
          setShiftStarted(false);
        }}
      />
    );
  }

  if (registerId !== undefined) {
    return (
      <OpeningCashPrompt
        loading={shiftOpen.isPending}
        onSubmit={openWithCash}
        onBack={forgetRegister}
      />
    );
  }

  return (
    <div className="fixed inset-0 overscroll-none bg-transparent text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-bold">Hola, {operator.name} 👋</h1>
      <p className="text-white/60 text-sm">Elige tu caja para este turno</p>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {(registersList ?? []).map((r: any) => (
          <button key={r.id} onClick={() => chooseRegister(r.id)} className="h-20 rounded-3xl admin-clay admin-clay-sm text-lg font-semibold active:scale-95 transition-transform hover:border-primary/40">
            {r.name}
          </button>
        ))}
      </div>
      {/* Con cajas configuradas, "sin caja asignada" es un pie de bug: ese
       * turno se lleva las ventas de TODAS las cajas al cuadrar (el cierre
       * filtra por `registerId`), así que el arqueo de las otras cajas queda
       * corto. Solo se ofrece si el evento no tiene ninguna caja cargada. */}
      {(registersList ?? []).length === 0 && (
        <button onClick={() => chooseRegister(null)} className="text-white/50 text-sm underline">Continuar sin caja asignada</button>
      )}
    </div>
  );
}

/** "Falta el conteo de barra de inicio de este turno" -- se marca al abrir un
 * turno nuevo y se borra al contar o saltarlo (sobrevive a un refresh). */
const BARRA_APERTURA_PENDING = 'caja_barra_apertura_pendiente';

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

  // Fondo propio y opaco: al cerrar turno este contador se abre ENCIMA de
  // la caja, y transparente se leía lo de atrás.
  return (
    <div className="fixed inset-0 z-20 overscroll-none bg-[#0b0612]/95 backdrop-blur-xl text-white flex flex-col items-center justify-center gap-6 p-6">
      <button onClick={back} className="text-white/60 text-sm self-start">← Volver</button>
      <p className="text-white/60 text-xs uppercase tracking-wide">Paso {step + 1} de {DENOMINATIONS.length}</p>
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
        className="w-full max-w-xs h-16 text-center text-2xl font-bold rounded-3xl admin-clay admin-clay-sm text-white placeholder:text-white/50 focus:outline-none focus:border-primary/40"
      />
      <div className="w-full max-w-xs p-3 rounded-2xl admin-clay admin-clay-sm flex justify-between text-sm">
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
      <div className="w-full max-w-sm admin-glass-sheet rounded-3xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold">Cuadre de caja</h2>
          <p className="text-white/60 text-sm mt-1">Efectivo contado: <b>${countedCash.toLocaleString('es-CL')}</b>. Ahora anota los totales de los vouchers de las máquinas.</p>
        </div>

        {/* El voucher del POS solo cubre desde el último cierre de lote de la
         * máquina. Si el lote se cerró durante la noche (varias máquinas lo
         * hacen solas de madrugada), el comprobante del final trae únicamente
         * una parte y el cuadre muestra un faltante enorme que no es plata
         * perdida. Avisarlo acá es más barato que descubrirlo al otro día. */}
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <p className="text-amber-200/90 text-xs leading-relaxed">
            Fíjate que el voucher sea el del <b>cierre de lote completo</b> de la noche. Si la máquina cerró
            lote antes (varias lo hacen solas de madrugada), ese comprobante trae solo una parte y el cuadre
            va a marcar un faltante que no existe. Si hay más de un comprobante, súmalos.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide">💳 Total débito (voucher máquina)</label>
            <input
              type="number" inputMode="numeric" min={0} value={debit} onChange={(e) => setDebit(e.target.value)}
              placeholder="$0" autoFocus
              className="w-full h-14 mt-1 text-center text-xl font-bold rounded-2xl admin-clay admin-clay-sm text-white placeholder:text-white/50 focus:outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide">💳 Total crédito (voucher máquina)</label>
            <input
              type="number" inputMode="numeric" min={0} value={credit} onChange={(e) => setCredit(e.target.value)}
              placeholder="$0"
              className="w-full h-14 mt-1 text-center text-xl font-bold rounded-2xl admin-clay admin-clay-sm text-white placeholder:text-white/50 focus:outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide">📲 Total QR / transferencia (app del banco)</label>
            <input
              type="number" inputMode="numeric" min={0} value={qr} onChange={(e) => setQr(e.target.value)}
              placeholder="$0"
              className="w-full h-14 mt-1 text-center text-xl font-bold rounded-2xl admin-clay admin-clay-sm text-white placeholder:text-white/50 focus:outline-none focus:border-primary/40"
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
  // Desde la sección «Staff» de la App: el nombre ya viene elegido (igual se pide el PIN).
  const preselect = useRef(preselectedOperatorId());
  useEffect(() => {
    const id = preselect.current;
    const op = id ? operators?.find((o) => o.id === id) : undefined;
    if (op) { preselect.current = null; setSelected({ id: op.id, name: op.name }); }
  }, [operators]);

  if (!selected) {
    return (
      <div className="fixed inset-0 overscroll-none bg-transparent text-white flex flex-col items-center justify-center gap-8 p-6">
        {openedFromApp() && <a href="/cuenta?tab=perfil" className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white/80">← Volver a mi cuenta</a>}
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-14 w-14 object-contain" />
          <h1 className="font-heading text-2xl tracking-tight"><span className="admin-brand-text">MANSION PLAYROOM</span> · Caja</h1>
          <p className="text-white/70 text-sm">Toca tu nombre</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          {(operators ?? []).map((op) => (
            <button
              key={op.id}
              onClick={() => setSelected({ id: op.id, name: op.name })}
              className="admin-tile flex h-20 flex-col items-center justify-center rounded-3xl text-lg font-semibold active:scale-95 transition-transform"
            >
              {op.name}
              <span className="text-xs font-normal text-white/60">{OPERATOR_ROLE_LABELS[op.role] ?? op.role}</span>
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
    <div className="fixed inset-0 overscroll-none bg-transparent text-white flex flex-col items-center justify-center gap-6 p-6">
      {openedFromApp() && <a href="/cuenta?tab=perfil" className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white/80">← Volver a mi cuenta</a>}
      <button onClick={() => { setSelected(null); setPin(''); }} className="text-white/50 text-sm">← Cambiar de operador</button>
      <h1 className="text-xl font-bold">{selected.name}</h1>
      <div className="flex gap-3" role="status" aria-label={`${digits.length} de 6 dígitos ingresados`}>
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
              // Con 6 dígitos entra solo. Con 4 o 5 se usa "Entrar": probar
              // a ciegas al 4º dígito gastaría intentos del bloqueo por PIN.
              if (next.length === 6) submit(next);
            }}
            aria-label={k === '⌫' ? 'Borrar último dígito' : k || undefined}
            className={`h-16 rounded-full text-xl font-semibold active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary ${k ? 'admin-tile' : 'invisible'}`}
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
  const logout = trpc.caja.logout.useMutation({ onSuccess: () => { forgetOffline('me'); utils.caja.me.invalidate(); } });
  const snapshotQuery = trpc.caja.snapshot.useQuery({ eventId: remoteEvent?.id ?? 0 }, { enabled: !!remoteEvent, refetchInterval: 60_000 });
  const syncMutation = trpc.caja.sync.useMutation();
  const shiftClose = trpc.caja.shiftClose.useMutation();
  // Pago con saldo prepagado (pedido explícito del dueño): a diferencia de
  // todo lo demás en esta pantalla, NUNCA se encola offline -- exige
  // conexión siempre, así que llama caja.sale directo en vez de enqueueOp.
  const saleWithSaldoMutation = trpc.caja.sale.useMutation();

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
  const [staffCompResults, setStaffCompResults] = useState<CajaStaffComp[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [sheetVersion, setSheetVersion] = useState(0); // fuerza refresco de la ficha tras un canje local
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Conteo de barra: al abrir un turno nuevo y antes del cuadre de cierre.
  const [barraCount, setBarraCount] = useState<'apertura' | 'cierre' | null>(() => (localStorage.getItem(BARRA_APERTURA_PENDING) === '1' ? 'apertura' : null));
  const finishBarraCount = useCallback(() => {
    if (barraCount === 'apertura') localStorage.removeItem(BARRA_APERTURA_PENDING);
    if (barraCount === 'cierre') setShowCloseForm(true);
    setBarraCount(null);
  }, [barraCount]);

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
  //
  // Todo lo que cambia entre renders va por refs: antes `runSync` dependía
  // de `syncMutation` (un objeto nuevo en cada render), así que cada tecla
  // en el buscador re-creaba el intervalo y volvía a leer IndexedDB.
  const syncingRef = useRef(false);
  const invalidateHistory = () => { utils.caja.salesHistory.invalidate(); };
  const syncLatest = useRef({ isOnline, localEvent, registerId, mutateAsync: syncMutation.mutateAsync, refreshPending, invalidateHistory });
  syncLatest.current = { isOnline, localEvent, registerId, mutateAsync: syncMutation.mutateAsync, refreshPending, invalidateHistory };
  const [rejectedCount, setRejectedCount] = useState(0);
  const refreshRejected = useCallback(() => { getRejectedOps().then((r) => setRejectedCount(r.length)); }, []);
  useEffect(() => { refreshRejected(); }, [refreshRejected]);

  const runSync = useCallback(async () => {
    const { isOnline: online, localEvent: ev, registerId: reg, mutateAsync, refreshPending: refresh } = syncLatest.current;
    if (syncingRef.current || !online || !ev) return;
    // La cola es compartida con /puerta (mismo IndexedDB, distinto origen de
    // operaciones) -- 'parking_paid' es exclusivo de la puerta, así que
    // /caja lo deja pasar de largo en vez de mandarlo a un endpoint que no
    // lo entiende. Se sincroniza igual, solo que desde /puerta.
    const opsToSync = (await getPendingOps()).filter((o) => o.op.type !== 'parking_paid');
    if (opsToSync.length === 0) return;
    syncingRef.current = true;
    try {
      // Cada op se aplica contra el evento en que se hizo (real o de
      // pruebas), aunque la tablet haya cambiado de evento entremedio.
      const byEvent = new Map<number, typeof opsToSync>();
      for (const o of opsToSync) {
        const id = o.eventId ?? ev.id;
        byEvent.set(id, [...(byEvent.get(id) ?? []), o]);
      }
      let rejected = 0;
      for (const [eventId, group] of Array.from(byEvent)) {
        const results = await mutateAsync({
          eventId, registerId: reg ?? undefined,
          ops: group.slice(0, 50).map((o) => o.op) as Exclude<QueuedOp, { type: 'parking_paid' }>[],
        });
        for (const [opId, res] of Object.entries(results)) {
          if (res.result === 'rejected') {
            // 'rejected' = la venta NUNCA se aplicó en el servidor (ej.
            // catálogo desactualizado). Antes se borraba de la cola con un
            // aviso que se iba solo; ahora queda en "Por rehacer".
            await markOpRejected(opId, res.conflictNote);
            rejected++;
            continue;
          }
          await markOpSynced(opId, res.result, res.conflictNote);
          if (res.result === 'conflict') toast.warning(`Conflicto al sincronizar: ${res.conflictNote || 'revisar con supervisor'}`);
        }
      }
      if (rejected > 0) {
        toast.error(`${rejected === 1 ? 'Una operación fue rechazada' : `${rejected} operaciones fueron rechazadas`} al sincronizar -- revísalas en "Por rehacer".`, { duration: 10000 });
      }
      await clearSyncedOps();
      refresh();
      refreshRejected();
      setSheetVersion((v) => v + 1);
      // El historial ya no se refresca solo cada 15 s: se actualiza cuando
      // de verdad entró algo nuevo.
      syncLatest.current.invalidateHistory();
    } catch {
      // Sin red real (aunque navigator.onLine diga que sí) o error del servidor -- se reintenta en el próximo tick.
    } finally {
      syncingRef.current = false;
    }
  }, [refreshRejected]);

  useEffect(() => {
    const interval = setInterval(runSync, 5000);
    return () => clearInterval(interval);
  }, [runSync]);
  useEffect(() => { if (isOnline) runSync(); }, [isOnline, runSync]);

  // Búsqueda 100% local (funciona offline, <50ms). Con una pausa de 150 ms
  // al escribir: sin ella recorría todos los asistentes en cada letra, y en
  // una tablet lenta con cientos de entradas se notaba al tipear.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setStaffCompResults([]); return; }
    let cancelled = false;
    const id = window.setTimeout(() => {
      searchLocal(q).then((r) => { if (!cancelled) setResults(r); });
      // Consumos gratis de staff: tampoco pertenecen a una orden con asistentes.
      searchStaffCompsLocal(q).then((cs) => { if (!cancelled) setStaffCompResults(cs.filter((c) => c.status !== 'used')); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [query, sheetVersion]);

  // Freno al doble toque: cada toque generaba un opId nuevo y el segundo
  // terminaba como conflicto en el servidor. Mientras un código se está
  // procesando, los toques repetidos sobre ese mismo código se ignoran.
  const inFlight = useRef(new Set<string>());
  const once = async (key: string, fn: () => Promise<void>) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try { await fn(); } finally { window.setTimeout(() => inFlight.current.delete(key), 1500); }
  };

  const doRedeem = (displayCode: string) => once(`redeem:${displayCode.toUpperCase()}`, async () => {
    await enqueueOp({ opId: newOpId(), type: 'redeem', displayCode, clientAt: (await correctedNow()).toISOString() }, localEvent?.id);
    toast.success('Código canjeado ✅');
    refreshPending();
    setSheetVersion((v) => v + 1);
    runSync();
  });

  // Cobrar varios códigos de un mismo producto («3 × Trago»): cada uno es su propio canje, con su opId. Queda 60 s para
  // deshacerlo (también sin señal: el deshacer va por la misma cola, en orden).
  const [undo, setUndo] = useState<{ codes: string[]; label: string; at: number } | null>(null);
  const [undoNow, setUndoNow] = useState(() => Date.now());
  useEffect(() => {
    if (!undo) return;
    const t = window.setInterval(() => {
      setUndoNow(Date.now());
      if (undoSecondsLeft(undo.at, Date.now()) === 0) setUndo(null);
    }, 500);
    return () => window.clearInterval(t);
  }, [undo]);

  const doRedeemMany = (codes: string[], label: string) => once(`redeem-many:${codes.join(',').toUpperCase()}`, async () => {
    if (codes.length === 0) return;
    const at = (await correctedNow()).toISOString();
    for (const displayCode of codes) await enqueueOp({ opId: newOpId(), type: 'redeem', displayCode, clientAt: at }, localEvent?.id);
    toast.success(`${label} canjeado${codes.length > 1 ? 's' : ''} ✅`);
    setUndoNow(Date.now());
    setUndo({ codes, label, at: Date.now() });
    refreshPending();
    setSheetVersion((v) => v + 1);
    runSync();
  });

  const doUndo = () => {
    const u = undo;
    if (!u) return;
    setUndo(null);
    void once(`undo:${u.at}`, async () => {
      const at = (await correctedNow()).toISOString();
      for (const displayCode of u.codes) await enqueueOp({ opId: newOpId(), type: 'undo_redeem', displayCode, clientAt: at }, localEvent?.id);
      toast.success(`${u.label}: canje deshecho`);
      refreshPending();
      setSheetVersion((v) => v + 1);
      runSync();
    });
  };

  // Marcar la entrada en la puerta. Va por la misma cola offline que el
  // canje, así que la fila avanza aunque la tablet esté sin señal.
  const doCheckIn = (ticketCode: string) => once(`checkin:${ticketCode.toUpperCase()}`, async () => {
    await enqueueOp({ opId: newOpId(), type: 'checkin', ticketCode, clientAt: (await correctedNow()).toISOString() }, localEvent?.id);
    toast.success('Entrada marcada ✅');
    refreshPending();
    setSheetVersion((v) => v + 1);
    runSync();
  });

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
      <div className="fixed inset-0 overscroll-none bg-transparent text-white flex items-center justify-center p-6 text-center">
        <p className="text-white/60">{isOnline ? 'Cargando evento…' : 'Sin conexión y sin datos guardados todavía. Conéctate una vez para descargar el evento.'}</p>
      </div>
    );
  }

  const onCerrarTurno = async () => {
    // Protocolo de pendientes (§13, riesgo 2): no cerrar turno con ops sin
    // sincronizar -- se resuelve en la UI, no en el servidor.
    const stillPending = await pendingOpsCount();
    if (stillPending > 0) { toast.error(`Todavía hay ${stillPending} operación${stillPending > 1 ? 'es' : ''} sin sincronizar. Espera a que termine.`); return; }
    // Una venta rechazada nunca entró al servidor: si se cierra igual, el
    // cuadre queda corto por ese monto. Se avisa antes de contar la caja.
    const rejectedNow = (await getRejectedOps()).length;
    if (rejectedNow > 0 && !window.confirm(`Hay ${rejectedNow} venta${rejectedNow > 1 ? 's' : ''} rechazada${rejectedNow > 1 ? 's' : ''} sin rehacer: no están en el sistema y el cuadre va a quedar corto. ¿Cerrar igual?`)) {
      setView('rejected');
      return;
    }
    // Primero el conteo de barra (si el evento no usa insumos, se salta solo).
    setBarraCount('cierre');
  };

  // `fixed inset-0` (no `min-h-screen`) a propósito en TODAS las pantallas de
  // /caja: saca la pantalla del flujo normal del documento, así el body de
  // atrás nunca tiene por qué ser más alto que el viewport y no hay rebote
  // (rubber-band) al arrastrar en iOS/iPadOS -- pedido explícito del dueño,
  // la pantalla debe quedar fija sin ningún movimiento. `overscroll-none`
  // en la pantalla y `overscroll-contain` en cada zona con scroll interno
  // (grilla, ventas recientes, carrito) evitan que ESAS regiones encadenen
  // el rebote hacia afuera al llegar a su propio borde.
  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none bg-transparent text-white flex flex-col">
      <header className="shrink-0 z-10 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <div className="admin-glass-panel admin-glass-panel-sm flex items-center gap-3 px-4 py-2.5">
          <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-lg leading-tight">{localEvent.title}</p>
            <p className="truncate text-xs text-white/60">{operator.name} · {OPERATOR_ROLE_LABELS[operator.role] ?? operator.role}</p>
          </div>
          <SyncBadge online={isOnline} pending={pending} />
        </div>
      </header>

      {/* Fuera del horario real del evento, el servidor cambia solo a un
          evento de pruebas permanente (ver caja.activeEvent) para que estas
          ventas nunca contaminen el dashboard/P&L real -- este banner es
          para que nadie piense que está vendiendo de verdad. */}
      {localEvent.slug === 'pruebas-caja' && (
        <div className="shrink-0 z-10 bg-amber-500 text-black text-xs font-bold text-center py-1.5 px-4">
          🧪 Modo prueba -- estas ventas NO son reales
        </div>
      )}
      {rejectedCount > 0 && view !== 'rejected' && (
        <button type="button" onClick={() => setView('rejected')}
          className="shrink-0 z-10 bg-red-500/90 text-white text-sm font-bold text-center py-2 px-4">
          ⚠️ {rejectedCount === 1 ? '1 venta' : `${rejectedCount} ventas`} por rehacer -- tocar para revisar
        </button>
      )}

      {scanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
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

      {barraCount && (
        <BarraCount eventId={localEvent.id} registerId={registerId} kind={barraCount} canSkip={isSupervisor} onDone={finishBarraCount} onSkip={finishBarraCount} />
      )}

      {showCloseForm && (
        <ShiftCloseForm
          loading={shiftClose.isPending}
          onCancel={() => setShowCloseForm(false)}
          onSubmit={async (counts) => {
            // Sin try/catch, un cierre que fallaba (sin señal, turno ya
            // cerrado desde otra tablet) dejaba el formulario colgado sin
            // ningún aviso: la cajera se iba creyendo que había cerrado.
            try {
              const report = await shiftClose.mutateAsync({
                opId: newOpId(), eventId: localEvent.id, registerId: registerId ?? undefined,
                ...counts, clientAt: (await correctedNow()).toISOString(),
              });
              const cuadra = Math.abs(report.cashDiff) < 1 && Math.abs(report.debitDiff) < 1 && Math.abs(report.creditDiff) < 1 && Math.abs(report.qrDiff) < 1;
              toast.success(cuadra ? '✅ Turno cerrado — la caja cuadra perfecto' : '⚠️ Turno cerrado — revisa el correo, hay diferencias en el cuadre');
              if (!report.emailSent) {
                toast.warning('No se pudo enviar el PDF de cierre por correo — revisa con el admin antes de irte.');
              }
              onCloseShift();
              logout.mutate();
            } catch (err: any) {
              toast.error(
                err?.message ?? 'No se pudo cerrar el turno. El turno sigue abierto -- revisa la conexión e intenta de nuevo.',
                { duration: 10000 },
              );
            }
          }}
        />
      )}

      <div className="flex-1 flex flex-col-reverse min-h-0 md:flex-row">
        <CajaSidebar view={view} setView={setView} setSelectedOrderId={setSelectedOrderId} isSupervisor={isSupervisor} onCerrarTurno={onCerrarTurno} closingTurno={shiftClose.isPending} />

        {/* "Nueva venta" (view === 'sale') usa el ancho completo -- el resto de
            las vistas son listas/formularios angostos que se mantienen
            centrados con su propio max-w-lg, en vez de angostar todo por igual. */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 pt-1 md:p-4">
        {view === 'menu' && (
          <div className="max-w-lg mx-auto space-y-6">
            <div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, email o teléfono…"
                className="h-14 text-base"
              />
              {query.trim().length >= 2 && (
                <div className="mt-2 space-y-2">
                  {results.length === 0 && staffCompResults.length === 0 && <p className="text-white/50 text-sm px-1">Sin resultados.</p>}
                  {results.map((r) => (
                    <button
                      key={r.orderId}
                      onClick={() => { setSelectedOrderId(r.orderId); setView('sheet'); }}
                      className="w-full text-left p-4 rounded-2xl admin-clay admin-clay-sm active:scale-[0.99] transition-transform"
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
                className="h-12 font-mono"
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
              <button onClick={() => setView('dashboard')} className="h-24 rounded-3xl admin-clay admin-clay-sm font-semibold active:scale-95 transition-transform">
                📊 Resumen
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
              onRedeemMany={doRedeemMany}
              onCheckIn={doCheckIn}
              canVoid={isSupervisor}
              onVoid={async (displayCode, reason) => voidCode.mutate({ opId: newOpId(), eventId: localEvent.id, registerId: registerId ?? undefined, displayCode, reason, clientAt: (await correctedNow()).toISOString() })}
              voiding={voidCode.isPending}
            />
          </div>
        )}

        {undo && undoSecondsLeft(undo.at, undoNow) > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl bg-zinc-900/95 px-4 py-3 shadow-2xl ring-1 ring-white/15 backdrop-blur">
              <p className="min-w-0 truncate text-sm">✅ {undo.label} canjeado{undo.codes.length > 1 ? 's' : ''}</p>
              <Button className="h-9 shrink-0 bg-white/15 hover:bg-white/25 text-white" onClick={doUndo}>Deshacer · {undoSecondsLeft(undo.at, undoNow)} s</Button>
            </div>
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
            catalogVersion={snapshotQuery.dataUpdatedAt}
            isOnline={isOnline}
            onSale={async (items, paymentMethod, buyerEmail, redeemPlaycoins, discountCode, lockerTag, lockerCustomerName, kitchenTicketNumber, customerName, cardPin, payToken) => {
              const opId = newOpId();
              const clientAt = (await correctedNow()).toISOString();
              if (paymentMethod === 'saldo') {
                // Saldo exige conexión siempre (decisión explícita del
                // dueño): nunca se encola, se llama directo -- si falla
                // (sin señal, PIN incorrecto, saldo insuficiente), el error
                // se propaga tal cual a runConfirm/toast, sin quedar
                // registrado en ningún lado (ni ops ni orders).
                await saleWithSaldoMutation.mutateAsync({
                  opId, eventId: localEvent.id, registerId: registerId ?? undefined,
                  items, paymentMethod, buyerEmail, cardPin, payToken,
                  discountCode, lockerTag, lockerCustomerName, kitchenTicketNumber, customerName, clientAt,
                });
              } else {
                await enqueueOp({
                  opId, type: 'sale', items, paymentMethod, buyerEmail, redeemPlaycoins,
                  discountCode, lockerTag, lockerCustomerName, kitchenTicketNumber, customerName, clientAt,
                }, localEvent.id);
              }
              const confirms: typeof postSaleConfirms = [];
              if (kitchenTicketNumber) confirms.push({ kind: 'kitchen', number: kitchenTicketNumber, name: customerName || kitchenTicketNumber, offline: !isOnline });
              if (lockerTag) confirms.push({ kind: 'locker', number: lockerTag, name: lockerCustomerName || lockerTag, offline: !isOnline });
              // Sin comanda/percha, NewSale muestra su propia confirmación grande.
              if (confirms.length > 0) setPostSaleConfirms(confirms);
              refreshPending();
              runSync();
              // La cajera se queda en "Nueva venta" lista para la próxima (con
              // la confirmación grande encima): volver al menú entre cada
              // venta era fricción en un local de alto volumen.
            }}
          />
        )}

        {view === 'rejected' && (
          <RejectedOps eventId={localEvent.id} onChanged={() => { refreshRejected(); refreshPending(); runSync(); }} />
        )}

        {view === 'history' && (
          <div className="max-w-4xl mx-auto h-full">
            <SalesHistory eventId={localEvent.id} registerId={registerId} isOnline={isOnline} />
          </div>
        )}

        {view === 'stock' && (
          <div className="max-w-lg mx-auto">
            <BarraStock version={snapshotQuery.dataUpdatedAt} eventId={localEvent.id} isOnline={isOnline} />
          </div>
        )}

        {view === 'dosier' && (
          <div className="max-w-3xl mx-auto">
            <BarraDosier version={snapshotQuery.dataUpdatedAt} eventId={localEvent.id} isOnline={isOnline} />
          </div>
        )}

        {view === 'dashboard' && (
          <div className="max-w-lg mx-auto">
            <CajaDashboard eventId={localEvent.id} />
          </div>
        )}
        </main>
      </div>

      {postSaleConfirms.length > 0 && (() => {
        const c = postSaleConfirms[0];
        const isKitchen = c.kind === 'kitchen';
        return (
          <div className="fixed inset-0 z-30 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-sm admin-glass-sheet rounded-3xl p-6 text-center space-y-4">
              <p className="text-sm text-white/60 uppercase tracking-wide">{isKitchen ? 'Nombre del pedido' : '🧥 Percha asignada'}</p>
              <p className="font-heading font-extrabold text-5xl tracking-tight text-primary">{isKitchen ? c.name : c.number}</p>
              <p className="text-xs text-white/60 font-mono">{isKitchen ? `Comanda ${c.number}` : c.name}</p>
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

/** Franja de navegación entre las 4 secciones de /caja -- antes se llegaba a
 * cada una desde botones grandes en `view === 'menu'` y se volvía con "←
 * Volver" en el header; ahora queda siempre visible a la izquierda, mismo
 * criterio que el dashboard de referencia que pidió el dueño. */
function CajaSidebar({ view, setView, setSelectedOrderId, isSupervisor, onCerrarTurno, closingTurno }: {
  view: View;
  setView: (v: View) => void;
  setSelectedOrderId: (id: number | null) => void;
  isSupervisor: boolean;
  onCerrarTurno: () => void;
  closingTurno: boolean;
}) {
  const go = (v: View) => { setSelectedOrderId(null); setView(v); };
  const items: { view: View; label: string; short?: string; icon: typeof ShoppingCart }[] = [
    { view: 'sale', label: 'Nueva venta', short: 'Vender', icon: ShoppingCart },
    { view: 'menu', label: 'Buscar', icon: Search },
    { view: 'history', label: 'Ventas', icon: Receipt },
    { view: 'stock', label: 'Stock', icon: Wine },
    { view: 'dosier', label: 'Dosier', icon: BookOpen },
    { view: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
    ...(isSupervisor ? [{ view: 'conflicts' as View, label: 'Conflictos', icon: AlertTriangle }] : []),
  ];
  // La ficha de un cliente (view === 'sheet') se llega desde una búsqueda o
  // un escaneo, no es un destino propio del sidebar -- se resalta "Buscar"
  // mientras se está ahí, para que el ícono activo nunca quede "apagado".
  const activeView = view === 'sheet' ? 'menu' : view;
  // Celular: barra inferior de vidrio (como el panel). Tablet: columna
  // lateral con etiquetas. Mismo "pill" luminoso para lo activo.
  return (
    <nav aria-label="Secciones de la caja" className="shrink-0 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 md:px-0 md:pb-3 md:pl-3 md:pt-0">
      <div className="admin-glass-panel flex items-stretch justify-around gap-1 px-1 py-1.5 md:h-full md:w-20 md:flex-col md:justify-start md:px-1.5 md:py-3">
        {items.map((it) => {
          const Icon = it.icon;
          const active = activeView === it.view;
          return (
            <button
              key={it.view}
              type="button"
              onClick={() => go(it.view)}
              aria-current={active ? 'page' : undefined}
              aria-label={it.label}
              className={`admin-tabbar-item flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 md:flex-none ${active ? 'admin-tabbar-item-active' : ''}`}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate text-[11px] font-medium leading-none md:hidden">{it.short ?? it.label}</span>
              <span className="hidden max-w-full text-center text-[11px] font-medium leading-tight md:inline">{it.label}</span>
            </button>
          );
        })}
        <div className="hidden md:block md:flex-1" />
        <button
          type="button"
          onClick={onCerrarTurno}
          disabled={closingTurno}
          className="admin-tabbar-item admin-nav-item-danger flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 disabled:opacity-40 md:flex-none"
          aria-label="Cerrar turno"
        >
          <LogOut className="h-5 w-5" />
          <span className="max-w-full truncate text-[11px] font-medium leading-none md:whitespace-normal md:text-center md:leading-tight"><span className="md:hidden">Cerrar</span><span className="hidden md:inline">Cerrar turno</span></span>
        </button>
      </div>
    </nav>
  );
}

function statusBadge(status: string, kind: 'acceso' | 'extra' = 'extra') {
  if (status === 'used') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-white/60">{kind === 'acceso' ? 'Entró' : 'Canjeado'}</span>;
  if (status === 'cancelled') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-300">Anulado</span>;
  return <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_-4px_rgba(16,185,129,0.7)]">Pendiente</span>;
}

function CustomerSheet({ orderId, onRedeemMany, onCheckIn, canVoid, onVoid, voiding }: {
  orderId: number;
  onRedeemMany: (codes: string[], label: string) => void;
  onCheckIn: (ticketCode: string) => void;
  canVoid: boolean;
  onVoid: (displayCode: string, reason: string) => void;
  voiding: boolean;
}) {
  const [sheet, setSheet] = useState<CajaAttendee | null | undefined>(undefined);
  useEffect(() => { getLocalAttendee(orderId).then((a) => setSheet(a ?? null)); }, [orderId]);

  if (sheet === undefined) return <p className="text-white/50">Cargando…</p>;
  if (sheet === null) return <p className="text-white/50">No se encontró la orden.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{sheet.buyerName}</h2>
        <p className="text-sm text-white/50">{sheet.buyerEmail}{sheet.buyerPhone ? ` · ${sheet.buyerPhone}` : ''}</p>
        <p className="text-xs text-white/60 mt-1">Orden {sheet.orderNumber}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Acceso</p>
        <div className="space-y-2">
          {sheet.access.length === 0 && <p className="text-sm text-white/60">Sin accesos en esta orden.</p>}
          {sheet.access.map((a, i) => (
            <div key={i} className="p-3 rounded-2xl admin-clay admin-clay-sm flex items-center justify-between gap-3">
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
          <ExtrasGroups extras={sheet.extras} canVoid={canVoid} voiding={voiding} onRedeemMany={onRedeemMany} onVoid={onVoid} />
        </div>
      )}
    </div>
  );
}

// Mismo agrupado que el admin (Dashboard.tsx CARTA_CATEGORIES): la cajera ve
// las mismas categorías con las que se cargó la carta. `extra` son los
// addons que TAMBIÉN se venden en la web (estacionamiento, covers).
const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  consumo: { label: 'Tragos y comida', emoji: '🍹', color: '#f472b6' },
  locker: { label: 'Guardarropía', emoji: '🧥', color: '#818cf8' },
  merch: { label: 'Merch', emoji: '🎁', color: '#fbbf24' },
  extra: { label: 'Extras', emoji: '🎫', color: '#34d399' },
};

function NewSale({ eventId, registerId, catalogVersion, isOnline, onSale }: {
  eventId: number;
  registerId: number | null;
  // Cambia cada vez que llega un snapshot nuevo del servidor (60s) --
  // dispara la relectura del catálogo desde IndexedDB sin depender de que
  // la cajera navegue fuera de "Nueva venta" (donde puede quedarse todo el
  // turno). Sin esto, un producto marcado "agotado" desde /cocina no se
  // veía acá hasta un refresh manual del navegador.
  catalogVersion: number;
  // Pago con saldo (pedido explícito del dueño): exige conexión siempre, así
  // que ese botón se deshabilita sin señal -- el resto de los medios de pago
  // no lo necesitan, se encolan igual offline.
  isOnline: boolean;
  onSale: (
    items: { ticketTypeId: number; quantity: number; opciones?: string[] }[],
    paymentMethod: 'efectivo' | 'debito' | 'credito' | 'qr' | 'saldo',
    buyerEmail?: string,
    redeemPlaycoins?: number,
    discountCode?: string,
    lockerTag?: string,
    lockerCustomerName?: string,
    kitchenTicketNumber?: string,
    customerName?: string,
    cardPin?: string,
    payToken?: string,
  ) => void | Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CajaCatalogItem[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  // Tragos con opciones (con qué bebida va…): cuántos van de cada elección, para descontar el insumo correcto.
  const [combos, setCombos] = useState<Record<number, Record<string, number>>>({});
  const [picking, setPicking] = useState<CajaCatalogItem | null>(null);
  const [pickSel, setPickSel] = useState<Record<string, string>>({});
  // Arranca con el último medio usado en ESTA tablet (en barra se repite
  // casi siempre el mismo); 'saldo' nunca, porque exige datos del cliente.
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'debito' | 'credito' | 'qr' | 'saldo'>(() => {
    const last = localStorage.getItem('caja_last_payment');
    return last === 'efectivo' || last === 'debito' || last === 'credito' || last === 'qr' ? last : 'debito';
  });
  useEffect(() => { if (paymentMethod !== 'saldo') localStorage.setItem('caja_last_payment', paymentMethod); }, [paymentMethod]);
  // Celular/tablet vertical: el carrito es una hoja que se abre desde la
  // barra de total; en horizontal ancho queda fijo al costado.
  const [cartOpen, setCartOpen] = useState(false);
  // Confirmación grande de la venta recién registrada (sin comanda/percha,
  // que tienen su propia pantalla con el número).
  const [lastSale, setLastSale] = useState<{ total: number; method: string; change: number | null } | null>(null);
  useEffect(() => {
    if (!lastSale) return;
    const id = window.setTimeout(() => setLastSale(null), 2200);
    return () => window.clearTimeout(id);
  }, [lastSale]);
  // Venta en curso: bloquea el botón de confirmar hasta que la venta quedó
  // encolada, para que un doble toque no registre la misma venta dos veces.
  const [confirming, setConfirming] = useState(false);
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
  const [infoProduct, setInfoProduct] = useState<{ product: CajaCatalogItem; x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const pressPos = useRef({ x: 0, y: 0 });
  const LONG_PRESS_MS = 450;

  const startLongPress = (p: CajaCatalogItem, e: React.PointerEvent) => {
    if (!p.description) return; // nada que mostrar -- no interceptar el tap
    longPressed.current = false;
    pressPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setInfoProduct({ product: p, ...pressPos.current });
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    // El popup es solo mientras se mantiene presionado -- se cierra solo al
    // soltar, sin necesidad de un botón aparte.
    setInfoProduct(null);
  };

  // Popup fijo a un costado del dedo (no encima -- el dedo lo taparía), con
  // el lado y la posición recortados contra los bordes de la pantalla para
  // que nunca quede cortado, sin necesitar lógica por columna de la grilla.
  const INFO_POPUP_WIDTH = 280;
  const INFO_POPUP_MAX_HEIGHT = 240;
  const INFO_POPUP_MARGIN = 12;
  const clampPopupPosition = (x: number, y: number) => {
    const fitsRight = x + INFO_POPUP_MARGIN + INFO_POPUP_WIDTH < window.innerWidth;
    const left = fitsRight
      ? x + INFO_POPUP_MARGIN
      : Math.max(INFO_POPUP_MARGIN, x - INFO_POPUP_MARGIN - INFO_POPUP_WIDTH);
    const top = Math.min(
      Math.max(y - INFO_POPUP_MAX_HEIGHT / 2, INFO_POPUP_MARGIN),
      window.innerHeight - INFO_POPUP_MAX_HEIGHT - INFO_POPUP_MARGIN
    );
    return { left, top };
  };

  // Playcoins (pedido explícito del usuario): paso opcional/omisible para
  // que la venta también gane puntos, y para canjear puntos ya ganados.
  const [showEmailStep, setShowEmailStep] = useState(false);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  // PIN de la tarjeta -- solo hace falta cuando paymentMethod === 'saldo'.
  const [cardPin, setCardPin] = useState('');
  // QR de «Pagar en caja» de la app del socio: reemplaza al PIN (vence en 2 min, un solo uso).
  const [payToken, setPayToken] = useState<string | null>(null);
  const resolvePayToken = trpc.caja.resolvePayToken.useMutation();
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

  // Clientes registrados que aún no entran (búsqueda por nombre, correo, RUT o teléfono): solo con señal.
  const [registeredResults, setRegisteredResults] = useState<{ email: string; fullName: string | null; playcoins: number }[]>([]);
  useEffect(() => {
    const q = customerSearch.trim();
    if (q.length < 3 || !isOnline) { setRegisteredResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      utils.caja.findCustomer.fetch({ query: q }).then((r) => { if (!cancelled) setRegisteredResults(r); }).catch(() => { if (!cancelled) setRegisteredResults([]); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerSearch, isOnline, utils]);

  const pickRegistered = (c: { email: string; fullName: string | null; playcoins: number }) => {
    setPayToken(null);
    setBuyerEmail(c.email);
    setAssociatedName(c.fullName ?? c.email);
    setShowEmailStep(true);
    setBalance(c.playcoins);
    setRedeemInput('');
    setCustomerSearch('');
    setCustomerSearchResults([]);
    setRegisteredResults([]);
  };

  const pickCustomer = (a: CajaAttendee) => {
    setPayToken(null);
    setBuyerEmail(a.buyerEmail);
    setAssociatedName(a.buyerName);
    setShowEmailStep(true);
    setBalance(null);
    setRedeemInput('');
    setCustomerSearch('');
    setCustomerSearchResults([]);
  };

  // Promo relámpago aplicada (única forma de descuento en caja): solo vista
  // previa, el monto real lo recalcula el servidor al aplicar la venta.
  const [discountResult, setDiscountResult] = useState<{ valid: boolean; message?: string; discount?: any } | null>(null);
  // Promo relámpago: mismo ritmo que el catálogo (60s, ver `caja.snapshot`
  // más arriba) para que la insignia aparezca/desaparezca sola.
  const { data: flashPromo } = trpc.flashPromo.active.useQuery({ eventId }, { refetchInterval: 60_000 });
  const flashPromoActive = !!flashPromo && new Date(flashPromo.expiresAt) > new Date();

  // Si el carrito tiene algún producto en promo relámpago, se aplica sola.
  useEffect(() => {
    if (!flashPromoActive) return;
    const hasFlashItem = Object.entries(cart).some(([id, qty]) => qty > 0 && flashPromo!.ticketTypeIds.includes(Number(id)));
    if (hasFlashItem && discountResult?.discount?.code !== flashPromo!.code) {
      setDiscountResult({ valid: true, discount: { code: flashPromo!.code, discountType: flashPromo!.discountType, discountValue: flashPromo!.discountValue } });
    } else if (!hasFlashItem && discountResult?.discount?.code === flashPromo?.code) {
      setDiscountResult(null);
    }
  }, [cart, flashPromoActive, flashPromo]);

  // Guardarropía: el número de la percha lo genera la propia tablet al
  // confirmar (nextLockerTagNumber) -- acá solo se pide el nombre del
  // cliente, para poder ubicar la prenda por nombre en vez de por número.
  const [lockerCustomerName, setLockerCustomerName] = useState('');

  // Nombre que ve cocina en pantalla en vez del número de comanda (pedido
  // explícito del dueño: el número es difícil de memorizar para ir a buscarlo).
  const [customerName, setCustomerName] = useState('');

  // Stock de la barra por insumos (ver `barraLeft` más abajo).
  const [barra, setBarra] = useState<CajaBarra | null>(null);
  useEffect(() => {
    getLocalCatalog().then((c) => {
      const sorted = [...c].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      setCatalog(sorted);
      if (sorted.length > 0) setTab((prev) => prev ?? (sorted[0].groupName || sorted[0].category));
    });
    getLocalBarra().then(setBarra);
  }, [catalogVersion]);

  // Stock de la barra por insumos: un trago con receta muestra cuántos quedan
  // según el insumo que se acaba primero (no su stock por unidades).
  const barraLeft = useMemo(() => {
    const byProduct = new Map<number, { drinks: number; low: boolean }>();
    if (!barra) return { byProduct, alerts: [] as { name: string; drinks: number }[] };
    const stock = new Map(barra.insumos.map((i) => [i.id, i.stock]));
    const alertOf = new Map(barra.insumos.map((i) => [i.id, i.alertDrinks]));
    for (const p of catalog) {
      const left = tragosDisponibles(barra.recetas.filter((r) => r.ticketTypeId === p.id), stock);
      if (left) byProduct.set(p.id, { drinks: left.drinks, low: left.drinks < (alertOf.get(left.limitingInsumoId) ?? 0) });
    }
    const alerts = barra.insumos
      .map((i) => ({ name: i.name, drinks: tragosPorInsumo(i.id, i.stock, barra.recetas), alertDrinks: i.alertDrinks }))
      .filter((i): i is { name: string; drinks: number; alertDrinks: number } => i.drinks !== null && ['agotado', 'bajo'].includes(nivelInsumo(i.drinks, i.alertDrinks)))
      .sort((a, b) => a.drinks - b.drinks);
    return { byProduct, alerts };
  }, [barra, catalog]);

  const total = catalog.reduce((sum, p) => sum + p.price * (cart[p.id] || 0), 0);
  const cartLines = catalog.filter((p) => (cart[p.id] || 0) > 0);
  const hasItems = cartLines.length > 0;
  const lockerLines = cartLines.filter((p) => p.category === 'locker');
  const lockerQty = lockerLines.reduce((sum, p) => sum + (cart[p.id] || 0), 0);
  const needsLockerTag = lockerQty > 0;
  const tooManyLockers = lockerQty > 1;
  const hasKitchenItems = cartLines.some((p) => p.toKitchen);

  const addPlain = (id: number) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  // Un trago con opciones pregunta primero cuál (con qué bebida va, qué variante).
  const add = (id: number) => {
    const p = catalog.find((x) => x.id === id);
    if (p?.opciones?.length) { setPickSel({}); setPicking(p); return; }
    addPlain(id);
  };
  const remove = (id: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
  const addCombo = (id: number, key: string) => {
    setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
    setCombos((m) => ({ ...m, [id]: { ...m[id], [key]: (m[id]?.[key] || 0) + 1 } }));
  };
  const removeCombo = (id: number, key: string) => {
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
    setCombos((m) => ({ ...m, [id]: { ...m[id], [key]: Math.max(0, (m[id]?.[key] || 0) - 1) } }));
  };
  const comboLabel = (p: CajaCatalogItem, key: string) => key.split('|').map((cid) => p.opciones?.flatMap((g) => g.choices).find((c) => c.id === cid)?.label).filter(Boolean).join(' + ');
  const onToggleFavorite = (id: number) => setFavorites(toggleFavorite(id));

  // Pestañas por sección (groupName), con la categoría como respaldo para
  // productos sin sección asignada -- así nunca desaparecen de la grilla.
  // "Favoritos" va primero, solo si la cajera ya marcó al menos uno.
  const sectionTabs = Array.from(new Set(catalog.map((p) => p.groupName || p.category)));
  const tabs = favorites.length > 0 ? [FAVORITES_TAB, ...sectionTabs] : sectionTabs;
  // Un grupo (ej. "Tragos") no tiene color propio -- se tiñe el círculo con
  // el color de SU categoría padre (consumo/locker/merch/extra), tomando el
  // primer producto de ese grupo para saber a qué categoría pertenece.
  const tabColor = (t: string) => {
    if (t === FAVORITES_TAB) return '#fbbf24';
    const item = catalog.find((p) => (p.groupName || p.category) === t);
    return CATEGORY_META[item?.category ?? '']?.color ?? '#f472b6';
  };
  const productsInTab = useMemo(() => (tab === FAVORITES_TAB
    ? catalog.filter((p) => favorites.includes(p.id))
    : catalog.filter((p) => (p.groupName || p.category) === tab)), [catalog, favorites, tab]);

  // La grilla solo se redibuja cuando cambia algo que muestra (productos,
  // cantidades, favoritos, promo). Escribir el nombre del cliente o el
  // código de descuento ya no redibuja todas las tarjetas. Los handlers usan
  // refs y setters de estado, así que no importa que sean de otro render.
  const productGrid = useMemo(() => (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 min-[900px]:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
              {productsInTab.map((p) => {
                const byInsumo = barraLeft.byProduct.get(p.id);
                const left = byInsumo ? byInsumo.drinks : p.totalStock - p.soldCount;
                const noStock = left <= 0;
                const isFavorite = favorites.includes(p.id);
                // Botón de emergencia de cocina (o el admin): bloqueo REAL, a
                // diferencia del aviso suave de "Sin stock" de arriba (que
                // avisa pero deja vender igual, por discrepancias normales de
                // inventario -- ver server/caja/sale.ts).
                const soldOut = p.status === 'soldout';
                const isFlashPromo = flashPromoActive && flashPromo!.ticketTypeIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    disabled={soldOut && !editingFavorites}
                    onClick={() => {
                      if (longPressed.current) { longPressed.current = false; return; }
                      editingFavorites ? onToggleFavorite(p.id) : add(p.id);
                    }}
                    onPointerDown={(e) => startLongPress(p, e)}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                    className="relative select-none rounded-3xl p-4 min-h-[88px] text-left border active:scale-95 transition-transform backdrop-blur-sm disabled:active:scale-100"
                    style={{
                      backgroundColor: (p.color || '#f472b6') + '14', borderColor: (p.color || '#f472b6') + '50', boxShadow: `0 0 20px -10px ${p.color || '#f472b6'}`,
                      WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation',
                      filter: soldOut ? 'grayscale(1)' : undefined,
                    }}
                  >
                    {soldOut && (
                      <div className="absolute inset-0 z-10 overflow-hidden rounded-3xl pointer-events-none">
                        <div className="absolute left-[-15%] right-[-15%] top-1/2 -translate-y-1/2 -rotate-[10deg] bg-red-600 text-white text-[11px] font-extrabold uppercase tracking-widest text-center py-1 shadow-lg">
                          Agotado
                        </div>
                      </div>
                    )}
                    {editingFavorites && (
                      <span className={`absolute top-2 right-2 text-lg leading-none ${isFavorite ? '' : 'opacity-30'}`}>
                        {isFavorite ? '⭐' : '☆'}
                      </span>
                    )}
                    {isFlashPromo && !soldOut && (
                      <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-black px-2 py-0.5 rounded-full">
                        🔥 Promo Flash
                      </span>
                    )}
                    {!editingFavorites && !soldOut && noStock && (
                      <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide bg-red-500/90 text-white px-2 py-0.5 rounded-full">
                        Sin stock
                      </span>
                    )}
                    {!editingFavorites && !soldOut && !noStock && byInsumo && !(cart[p.id] > 0) && (
                      <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${byInsumo.low ? 'bg-amber-500/90 text-black' : 'bg-white/10 text-white/60'}`}>
                        quedan ~{left}
                      </span>
                    )}
                    {p.description && (
                      <span className="absolute bottom-2 right-2 text-[10px] text-white/50" aria-hidden>ⓘ</span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-3xl leading-none">{p.emoji || CATEGORY_META[p.category]?.emoji || '🛍️'}</span>
                      <div className="min-w-0">
                        <p className="font-semibold break-words">{p.name}</p>
                        <p className="text-sm text-white/60">${p.price.toLocaleString('es-CL')}</p>
                      </div>
                    </div>
                    {!editingFavorites && cart[p.id] > 0 && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold grid place-items-center">
                        {cart[p.id]}
                      </span>
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [productsInTab, cart, favorites, editingFavorites, flashPromoActive, flashPromo, tab, barraLeft]);

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
    if (paymentMethod === 'saldo') {
      if (!isOnline) { toast.error('Pagar con saldo necesita conexión'); return; }
      if (!buyerEmail.trim()) { toast.error('Falta el email de la tarjeta'); return; }
      if (!payToken && !/^\d{4}$/.test(cardPin)) { toast.error('El PIN de la tarjeta tiene que tener 4 dígitos'); return; }
    }
    if (paymentMethod === 'debito' || paymentMethod === 'credito') { setPaymentStep('card'); return; }
    if (paymentMethod === 'efectivo') { setCashGiven(''); setPaymentStep('cash'); return; }
    confirm();
  };

  const confirm = async () => {
    // Guarda contra el doble toque. El POS de tarjetas es una máquina
    // APARTE: la tablet solo REGISTRA lo que ya se cobró ahí. Sin esta
    // guarda, dos toques (o uno solo en una tablet lenta, porque el modal
    // seguía abierto durante los await de abajo) generaban DOS ventas con
    // opId distinto -- `applyOp` no las deduplica porque son ops distintas
    // -- contra UN solo cobro real en el POS. Cada repetición infla el
    // esperado del cierre sin que haya entrado un peso más.
    await confirmWith(paymentMethod);
  };

  /** Confirma fijando el medio de pago del mismo click. No alcanza con
   * `setPaymentMethod(m)` y después `confirm()`: el estado todavía no se
   * actualizó cuando corre el handler, así que la venta se guardaría con el
   * medio anterior -- justo el error que dejó la noche entera anotada como
   * débito. */
  const confirmWith = async (method: 'efectivo' | 'debito' | 'credito' | 'qr' | 'saldo') => {
    if (confirming) return;
    setConfirming(true);
    try {
      await runConfirm(method);
    } finally {
      setConfirming(false);
    }
  };

  const runConfirm = async (method: 'efectivo' | 'debito' | 'credito' | 'qr' | 'saldo' = paymentMethod) => {
    // Un trago con opciones sale en una línea por elección (cada una descuenta su insumo).
    const cartItems = Object.entries(cart).filter(([, q]) => q > 0).flatMap(([ticketTypeId, quantity]) => {
      const byCombo = Object.entries(combos[Number(ticketTypeId)] ?? {}).filter(([, q]) => q > 0);
      return byCombo.length > 0
        ? byCombo.map(([key, q]) => ({ ticketTypeId: Number(ticketTypeId), quantity: q, opciones: key.split('|') }))
        : [{ ticketTypeId: Number(ticketTypeId), quantity }];
    });
    // Pagando con saldo no se combina con canje de Playcoins -- no se
    // mezclan los dos saldos en una misma venta (decisión explícita del
    // dueño).
    const redeemAmount = method !== 'saldo' && balance != null ? clampRedeemAmount(Number(redeemInput || 0), Math.min(balance, total)) : 0;
    // El número de comanda/percha se genera ACÁ, en la tablet, antes de
    // encolar la venta -- así funciona sin señal (ver nextKitchenTicketNumber
    // / nextLockerTagNumber).
    const kitchenTicketNumber = hasKitchenItems ? await nextKitchenTicketNumber() : undefined;
    const lockerTag = needsLockerTag ? await nextLockerTagNumber() : undefined;
    // `onSale` encola la venta en IndexedDB (o, si es saldo, llama al
    // servidor directo -- ver CajaHome). Antes se llamaba sin `await` y el
    // carrito se vaciaba igual: si fallaba, la venta desaparecía de la
    // pantalla sin quedar registrada en ningún lado. Ahora el carrito solo
    // se limpia cuando la venta quedó realmente registrada.
    try {
      await onSale(
        cartItems, method, buyerEmail.trim() || undefined, redeemAmount || undefined,
        discountResult?.valid ? discountResult.discount.code : undefined,
        lockerTag,
        needsLockerTag ? lockerCustomerName.trim() : undefined,
        kitchenTicketNumber,
        hasKitchenItems ? customerName.trim() : undefined,
        method === 'saldo' && !payToken ? cardPin : undefined,
        payToken ?? undefined,
      );
    } catch (err: any) {
      toast.error(
        err?.message ?? 'No se pudo registrar la venta. El carrito queda como está -- intenta de nuevo.',
        { duration: 10000 },
      );
      return;
    }
    if (!kitchenTicketNumber && !lockerTag) {
      const given = Number(cashGiven || 0);
      setLastSale({ total, method, change: method === 'efectivo' && given >= total ? given - total : null });
    }
    // El stock local de insumos ya se descontó al encolar: se relee para el "quedan ~N".
    getLocalBarra().then(setBarra);
    setCartOpen(false);
    setCart({});
    setCombos({});
    setBuyerEmail('');
    setBalance(null);
    setRedeemInput('');
    setCardPin('');
    setPayToken(null);
    setShowEmailStep(false);
    setAssociatedName(null);
    setCustomerSearch('');
    setCustomerSearchResults([]);
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
    setScanningCustomer(false);
    if (isPayQr(raw)) {
      // QR de pago de la app: identifica al cliente y autoriza su saldo sin PIN.
      if (!isOnline) { toast.error('Pagar con la app necesita conexión'); return; }
      try {
        const r = await resolvePayToken.mutateAsync({ eventId, token: raw.trim() });
        setBuyerEmail(r.email);
        setAssociatedName(r.name ?? r.email);
        setShowEmailStep(true);
        setBalance(r.playcoins);
        setRedeemInput('');
        setPayToken(raw.trim());
        toast.success(`Autorizado por la app ✓ · Saldo $${r.prepaidBalance.toLocaleString('es-CL')}`);
      } catch (err: any) {
        toast.error(err?.message ?? 'No se pudo leer el QR de pago');
      }
      return;
    }
    const code = parseTicketCodeFromQr(raw);
    if (!code) return;
    const found = await searchLocal(code);
    const attendee = found[0];
    if (!attendee) { toast.error('No encontramos ese código.'); return; }
    setPayToken(null);
    setBuyerEmail(attendee.buyerEmail);
    setAssociatedName(attendee.buyerName);
    setShowEmailStep(true);
    setBalance(null);
    setRedeemInput('');
  };

  const pickGroups = picking?.opciones ?? [];
  const pickDone = pickGroups.length > 0 && pickGroups.every((g) => pickSel[g.id]);
  const confirmPick = (sel: Record<string, string>) => {
    if (!picking) return;
    addCombo(picking.id, pickGroups.map((g) => sel[g.id]).filter(Boolean).sort().join('|'));
    setPicking(null);
  };

  return (
    <div className="h-full flex flex-col gap-5">
      {picking && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={() => setPicking(null)}>
          <div role="dialog" aria-label={`Elegir opción de ${picking.name}`} onClick={(e) => e.stopPropagation()}
            className="admin-glass-sheet w-full max-w-lg space-y-4 rounded-3xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{picking.emoji || '🍹'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold">{picking.name}</p>
                <p className="text-sm text-white/60">${picking.price.toLocaleString('es-CL')}</p>
              </div>
              <button type="button" onClick={() => setPicking(null)} aria-label="Cancelar" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            {pickGroups.map((g) => (
              <div key={g.id}>
                <p className="mb-2 text-sm font-semibold text-white/80">{g.label}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.choices.map((c) => (
                    <button key={c.id} type="button" aria-pressed={pickSel[g.id] === c.id}
                      onClick={() => (pickGroups.length === 1 ? confirmPick({ [g.id]: c.id }) : setPickSel((m) => ({ ...m, [g.id]: c.id })))}
                      className={`min-h-[3.5rem] rounded-2xl border-2 px-3 py-2 text-base font-semibold active:scale-95 ${pickSel[g.id] === c.id ? 'border-primary bg-primary/20' : 'border-white/15 bg-white/5'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {pickGroups.length > 1 && (
              <button type="button" disabled={!pickDone} onClick={() => confirmPick(pickSel)} className="h-12 w-full rounded-2xl bg-primary text-base font-bold text-white disabled:opacity-40">Agregar</button>
            )}
          </div>
        </div>
      )}
      <div className="shrink-0 flex items-center justify-between gap-3">
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
        <p className="shrink-0 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          Toca los productos que más vendes para agregarlos a "⭐ Favoritos" -- mientras este modo esté activo, tocar un producto no lo agrega a la venta.
        </p>
      )}

      {catalog.length === 0 ? (
        <p className="text-white/50 text-sm">Todavía no hay productos cargados para este evento. Se cargan desde Admin → Carta de la Fiesta.</p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-5 md:flex-row">
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-5">
            {/* Categorías como círculos, en fila -- con scroll horizontal si no caben. */}
            <div className="shrink-0 flex gap-4 overflow-x-auto pb-1">
              {tabs.map((t) => {
                const meta = t === FAVORITES_TAB ? { label: 'Favoritos', emoji: '⭐' } : (CATEGORY_META[t] ?? { label: t, emoji: '🛍️' });
                const active = tab === t;
                const color = tabColor(t);
                return (
                  <button key={t} onClick={() => setTab(t)} className="flex flex-col items-center gap-1 shrink-0 w-16">
                    <span
                      className="w-14 h-14 rounded-full grid place-items-center text-2xl transition-all"
                      style={{ backgroundColor: color + (active ? '33' : '18'), boxShadow: active ? `0 0 0 2px ${color}` : undefined }}
                    >
                      {meta.emoji}
                    </span>
                    <span className={`text-[11px] font-medium text-center leading-tight truncate w-full ${active ? 'text-white' : 'text-white/50'}`}>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            {barraLeft.alerts.length > 0 && (
              <div className="shrink-0 flex gap-2 overflow-x-auto pb-2 -mt-1" role="status">
                {barraLeft.alerts.map((a) => (
                  <span key={a.name} className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${a.drinks <= 0 ? 'bg-red-500/20 text-red-200' : 'bg-amber-500/20 text-amber-200'}`}>
                    {a.drinks <= 0 ? `⛔ ${a.name}: se acabó` : `⚠️ ${a.name}: ~${a.drinks} tragos`}
                  </span>
                ))}
              </div>
            )}

            {/* Grilla de productos -- tocar suma una unidad; el stepper +/- ahora vive en el carrito, no acá (ver panel derecho). Ocupa TODO el espacio restante de la columna, con scroll propio si no caben todos, en vez de empujar "Ventas recientes" fuera de la pantalla. */}
            {productGrid}

            {/* Ventas de la noche (pedido explícito del dueño): con nombre del cliente, quién cobró, buscador y scroll propio; tocar una fila abre el detalle y la anulación con clave admin. Alto acotado: nunca empuja el resto de la pantalla. */}
            <div className="hidden md:block">
              <SalesStrip eventId={eventId} registerId={registerId} isOnline={isOnline} />
            </div>

            {/* Barra de total (solo celular): abre el carrito. Desde tablet el carrito va fijo a la derecha. */}
            <div className="shrink-0 md:hidden">
              <button type="button" onClick={() => setCartOpen(true)} disabled={!hasItems}
                className="admin-glass-panel flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <ShoppingCart className="h-5 w-5" />
                  {hasItems && <span className="admin-badge absolute -right-1.5 -top-1.5">{cartLines.reduce((n, p) => n + cart[p.id], 0)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-white/60">{hasItems ? 'Total' : 'Toca un producto para agregarlo'}</span>
                  <span className="block text-2xl font-bold tabular-nums">${total.toLocaleString('es-CL')}</span>
                </span>
                {hasItems && <span className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Cobrar</span>}
              </button>
            </div>
          </div>

          {cartOpen && (
            <div className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setCartOpen(false)} aria-hidden="true" />
          )}

          {/* Panel de carrito persistente al costado -- antes era una barra pegada abajo, ahora siempre visible mientras se arma la venta. */}
          {/* `max-h-[48vh] lg:max-h-none` -- por debajo de `lg:` este panel
              apila DEBAJO de la grilla (`flex-col` en el contenedor padre,
              ver arriba), y sin tope de alto su contenido natural (cliente,
              métodos de pago, carrito, descuento, total, botón de cobro,
              ~500-600px) se comía casi toda la pantalla en un celular --
              dejaba la grilla de productos reducida a una fila visible. Con
              el tope, el panel scrollea internamente (ya tenía
              `overflow-y-auto`) y la grilla recupera la mitad de la
              pantalla. `lg:` en adelante (tablet en horizontal/desktop) usa
              `self-stretch` de siempre, sin cambios. */}
          <aside aria-label="Carrito" className={`${cartOpen ? 'fixed inset-x-0 bottom-0 z-30 flex max-h-[88dvh] rounded-t-3xl admin-glass-sheet pb-[max(env(safe-area-inset-bottom),1rem)]' : 'hidden'} flex-col overflow-y-auto overscroll-contain p-4 space-y-4 md:static md:z-auto md:flex md:max-h-none md:w-72 min-[820px]:w-80 min-[900px]:w-96 md:shrink-0 md:self-stretch md:rounded-3xl md:pb-4 caja-cart-panel`}>
            <div className="flex items-center justify-between md:hidden">
              <p className="font-heading text-lg">Carrito</p>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Cerrar carrito" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            {/* Tarjeta de cliente: lo que el carrito necesite en este momento -- guardarropía/cocina (si aplica) y Playcoins. */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 space-y-3">
              <p className="text-xs uppercase tracking-wide text-white/45">Cliente</p>

              {/* Guardarropía: el número de la percha lo asigna el sistema
                  solo, correlativo -- acá solo se pide el nombre del cliente. */}
              {needsLockerTag && (
                <div className="space-y-1">
                  <label className="text-xs text-white/50">🧥 ¿A nombre de quién? (guardarropía)</label>
                  <Input
                    value={lockerCustomerName}
                    onChange={(e) => setLockerCustomerName(e.target.value)}
                    placeholder="Nombre de la persona"
                    className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/60"
                  />
                  <p className="text-xs text-white/60">El número de percha se asigna solo al confirmar.</p>
                  {tooManyLockers && <p className="text-xs text-red-400">Cobra los abrigos de a uno para poder asignar un número a cada uno.</p>}
                </div>
              )}

              {/* Nombre para cocina (pedido explícito del dueño): un número
                  de comanda es difícil de memorizar para ir a buscarlo, un nombre no. */}
              {hasKitchenItems && (
                <div className="space-y-1">
                  <label className="text-xs text-white/50">🍽️ ¿A nombre de quién?</label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Cualquier nombre, para que cocina lo llame"
                    className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/60"
                  />
                </div>
              )}

              {!showEmailStep ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="🔍 Buscar cliente: nombre, correo, RUT o teléfono"
                      className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/60"
                    />
                    {customerSearchResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-[var(--admin-surface-solid)] border border-white/15 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                        {customerSearchResults.map((a) => (
                          <button
                            key={a.orderId}
                            onClick={() => pickCustomer(a)}
                            className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 border-b border-white/5 last:border-0"
                          >
                            <span className="font-medium">{a.buyerName}</span>
                            <span className="block text-xs text-white/60">{a.buyerEmail}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {registeredResults.length > 0 && (
                      <div className="mt-1 w-full bg-[var(--admin-surface-solid)] border border-white/15 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                        <p className="px-3 pt-2 text-[11px] uppercase tracking-wide text-white/50">Clientes registrados</p>
                        {registeredResults.map((c) => (
                          <button key={c.email} onClick={() => pickRegistered(c)}
                            className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 border-b border-white/5 last:border-0">
                            <span className="font-medium">{c.fullName ?? c.email}</span>
                            <span className="block text-xs text-white/60">{c.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {customerSearch.trim() && customerSearchResults.length === 0 && registeredResults.length === 0 && (
                      <p className="text-xs text-white/60 mt-1">Nadie coincide con "{customerSearch.trim()}"{isOnline ? '' : ' (sin señal: solo se busca entre quienes ya entraron)'}.</p>
                    )}
                  </div>
                  <button
                    onClick={() => setScanningCustomer(true)}
                    className="w-full rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-left"
                  >
                    <span className="block text-sm font-semibold text-emerald-300">📷 Escanear QR «Pagar» de la app</span>
                    <span className="block text-xs text-white/60">Pídele que lo abra en su celular: la compra queda en su historial y gana Playcoins.</span>
                  </button>
                  <button onClick={() => setShowEmailStep(true)} className="text-xs text-white/50 underline">
                    + Registrar email
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {associatedName && <p className="text-xs text-white/50">Asociado a: <b className="text-white/80">{associatedName}</b></p>}
                  <Input
                    value={buyerEmail}
                    onChange={(e) => { setBuyerEmail(e.target.value); setBalance(null); setRedeemInput(''); setAssociatedName(null); setPayToken(null); }}
                    placeholder="email@cliente.cl"
                    className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/60"
                  />
                  {payToken && <p className="text-xs font-semibold text-emerald-300">✓ Autorizado por la app: cobra con saldo sin PIN</p>}
                  {paymentMethod === 'saldo' && !payToken && (
                    <Input
                      type="tel" inputMode="numeric" maxLength={4}
                      value={cardPin}
                      onChange={(e) => setCardPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="PIN de la tarjeta (4 dígitos)"
                      className="h-10 bg-white/10 border-white/15 text-white placeholder:text-white/60 tracking-[0.3em] text-center"
                    />
                  )}
                  <div className="flex items-center gap-3">
                    <Button size="sm" variant="outline" className="border-white/15 text-white" disabled={!buyerEmail.trim() || checkingBalance} onClick={checkBalance}>
                      {checkingBalance ? 'Consultando…' : 'Consultar saldo'}
                    </Button>
                    {paymentMethod !== 'saldo' && (
                      <button
                        onClick={() => { setShowEmailStep(false); setBuyerEmail(''); setBalance(null); setRedeemInput(''); setAssociatedName(null); setPayToken(null); }}
                        className="text-xs text-white/60 underline"
                      >
                        Omitir
                      </button>
                    )}
                  </div>
                  {balance != null && (
                    canRedeem(balance) ? (
                      <div>
                        <p className="text-xs text-white/50">Saldo: {balance} Playcoins (${balance.toLocaleString('es-CL')})</p>
                        <Input
                          type="number" inputMode="numeric" min={0} max={Math.min(balance, total)}
                          value={redeemInput} onChange={(e) => setRedeemInput(e.target.value)}
                          placeholder="Canjear cuántos Playcoins"
                          className="h-9 mt-1 bg-white/10 border-white/15 text-white placeholder:text-white/60"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-white/60">Saldo: {balance} Playcoins (mínimo {PLAYCOINS_MIN_REDEEM_BALANCE} para canjear)</p>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Método de pago -- mismo lugar visual que las pestañas Delivery/Dine In/Takeaway de la referencia.
                'saldo' (pedido explícito del dueño) exige conexión siempre -- deshabilitado sin señal. */}
            <div className="grid grid-cols-5 gap-2">
              {(['efectivo', 'debito', 'credito', 'qr', 'saldo'] as const).map((m) => (
                <button
                  key={m}
                  disabled={m === 'saldo' && !isOnline}
                  onClick={() => { setPaymentMethod(m); if (m === 'saldo') setShowEmailStep(true); }}
                  aria-pressed={paymentMethod === m}
                  className={`admin-tab h-12 rounded-xl text-xs font-semibold capitalize disabled:opacity-30 ${paymentMethod === m ? 'admin-tab-active' : ''}`}
                >
                  {m === 'qr' ? '📲 QR' : m === 'saldo' ? '💳 Saldo' : m === 'efectivo' ? '💵 Efectivo' : m === 'debito' ? 'Débito' : 'Crédito'}
                </button>
              ))}
            </div>
            {paymentMethod === 'saldo' && !isOnline && (
              <p className="text-xs text-amber-400 -mt-1">Sin conexión no se puede cobrar con saldo -- elige otro medio de pago.</p>
            )}

            {/* Líneas del carrito -- el stepper +/- vive acá, ya no en la tarjeta del producto. */}
            <div className="space-y-1.5 flex-1 min-h-24 overflow-y-auto overscroll-contain">
              {hasItems ? cartLines.flatMap((p): (CajaCatalogItem | { p: CajaCatalogItem; key: string; q: number })[] => {
                const rows = Object.entries(combos[p.id] ?? {}).filter(([, q]) => q > 0);
                if (rows.length === 0) return [p];
                return rows.map(([key, q]) => ({ p, key, q }));
              }).map((row) => { if ('key' in row) return (
                <div key={`${row.p.id}:${row.key}`} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{row.p.emoji ? `${row.p.emoji} ` : ''}{row.p.name}</p>
                    <p className="text-xs text-amber-300 truncate">con {comboLabel(row.p, row.key)} · ${(row.p.price * row.q).toLocaleString('es-CL')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => removeCombo(row.p.id, row.key)} aria-label={`Quitar un ${row.p.name} con ${comboLabel(row.p, row.key)}`} className="admin-tile w-11 h-11 rounded-full text-xl leading-none">−</button>
                    <span className="font-bold w-6 text-center tabular-nums">{row.q}</span>
                    <button onClick={() => addCombo(row.p.id, row.key)} aria-label={`Agregar otro ${row.p.name} con ${comboLabel(row.p, row.key)}`} className="admin-tile w-11 h-11 rounded-full text-xl leading-none">+</button>
                  </div>
                </div>
              ); const p = row; return (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{p.emoji ? `${p.emoji} ` : ''}{p.name}</p>
                    <p className="text-xs text-white/60">${(p.price * cart[p.id]).toLocaleString('es-CL')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => remove(p.id)} aria-label={`Quitar un ${p.name}`} className="admin-tile w-11 h-11 rounded-full text-xl leading-none">−</button>
                    <span className="font-bold w-6 text-center tabular-nums">{cart[p.id]}</span>
                    <button onClick={() => add(p.id)} aria-label={`Agregar un ${p.name}`} className="admin-tile w-11 h-11 rounded-full text-xl leading-none">+</button>
                  </div>
                </div>
              ); }) : (
                <p className="text-sm text-white/60 text-center py-3">Carrito vacío -- toca un producto para agregarlo.</p>
              )}
            </div>

            {/* En caja no hay códigos de descuento: solo la promo relámpago, que
                se aplica sola cuando el carrito trae esos productos (el
                servidor la revalida al cobrar). */}
            {discountResult?.valid && discountResult.discount?.code === flashPromo?.code && (
              <p className="text-xs text-amber-400">
                🔥 Promo Flash aplicada automáticamente: {discountResult.discount.discountValue}% -- no hace falta código.
              </p>
            )}

            <div className="flex justify-between text-lg font-bold border-t border-white/10 pt-3">
              <span>Total</span>
              <span>${total.toLocaleString('es-CL')}</span>
            </div>

            <Button
              className="w-full h-14 rounded-2xl text-base font-bold"
              disabled={!hasItems || tooManyLockers || (paymentMethod === 'saldo' && !isOnline) || (confirming && paymentMethod === 'saldo')}
              onClick={startCheckout}
            >
              {paymentMethod === 'efectivo' ? 'Cobrar en efectivo'
                : paymentMethod === 'qr' ? 'Cobrado en terminal — Confirmar'
                : paymentMethod === 'saldo' ? (confirming ? 'Cobrando…' : 'Cobrar con saldo')
                : 'Cobrar con máquina'}
            </Button>
          </aside>
        </div>
      )}

      {paymentStep === 'card' && (
        <div className="fixed inset-0 z-30 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm admin-glass-sheet rounded-3xl p-6 text-center space-y-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Cobrar con máquina</p>
            <p className="font-heading font-extrabold text-5xl">${total.toLocaleString('es-CL')}</p>
            <p className="text-white/60 text-sm">Pasa la tarjeta en el POS y espera la aprobación.</p>
            {/* La noche de Candyland cerró con CERO ventas anotadas como
             * crédito y $200.500 de crédito en el voucher de la máquina: el
             * selector venía en "débito" por defecto y nadie lo movió nunca.
             * Por eso acá no se confirma con un botón genérico -- se elige
             * el tipo de tarjeta en el mismo momento en que se ve en el POS,
             * que es el único instante en que la cajera realmente lo sabe. */}
            <p className="text-white/60 text-xs">¿Con qué pagó? Tiene que calzar con el voucher.</p>
            <div className="grid grid-cols-2 gap-2">
              {(['debito', 'credito'] as const).map((m) => (
                <Button
                  key={m}
                  className={`h-14 text-base font-semibold ${paymentMethod === m ? 'bg-primary hover:bg-primary/90' : 'bg-white/[0.06] hover:bg-white/[0.12] text-white'}`}
                  disabled={confirming}
                  onClick={() => { setPaymentMethod(m); confirmWith(m); }}
                >
                  {confirming && paymentMethod === m ? 'Registrando…' : m === 'debito' ? 'Débito' : 'Crédito'}
                </Button>
              ))}
            </div>
            <Button variant="outline" className="w-full h-11 border-white/15 text-white/70" disabled={confirming} onClick={() => setPaymentStep(null)}>
              Cancelar y volver
            </Button>
          </div>
        </div>
      )}

      {paymentStep === 'cash' && (
        <CashPayment
          total={total}
          value={cashGiven}
          onChange={setCashGiven}
          confirming={confirming}
          onConfirm={confirm}
          onCancel={() => setPaymentStep(null)}
        />
      )}

      {lastSale && (
        <button type="button" onClick={() => setLastSale(null)}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" aria-live="polite">
          <span className="admin-glass-sheet flex w-full max-w-sm flex-col items-center gap-2 rounded-3xl p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--admin-success-bg)] text-[var(--admin-success-text)] shadow-[0_0_40px_rgba(34,197,94,0.35)]">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <span className="mt-2 text-sm text-white/70">Venta registrada · {PAYMENT_LABEL[lastSale.method] ?? lastSale.method}</span>
            <span className="text-5xl font-bold tracking-tight tabular-nums">${lastSale.total.toLocaleString('es-CL')}</span>
            {lastSale.change !== null && lastSale.change > 0 && (
              <span className="mt-1 rounded-full bg-white/10 px-4 py-1.5 text-lg">Vuelto <b className="tabular-nums">${lastSale.change.toLocaleString('es-CL')}</b></span>
            )}
            {!isOnline && <span className="text-xs text-amber-300">Sin señal: se sincroniza solo al volver la conexión.</span>}
          </span>
        </button>
      )}

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

      {infoProduct && (() => {
        const { left, top } = clampPopupPosition(infoProduct.x, infoProduct.y);
        return (
          <div
            className="fixed z-40 max-w-[85vw] rounded-2xl bg-black/85 backdrop-blur-lg border border-white/20 shadow-2xl p-4 overflow-y-auto pointer-events-none"
            style={{ left, top, width: INFO_POPUP_WIDTH, maxHeight: INFO_POPUP_MAX_HEIGHT }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-2xl leading-none">{infoProduct.product.emoji || CATEGORY_META[infoProduct.product.category]?.emoji || '🛍️'}</span>
              <p className="text-white font-heading font-bold text-base leading-tight">{infoProduct.product.name}</p>
            </div>
            <p className="text-white/90 text-sm leading-snug whitespace-pre-wrap">{infoProduct.product.description}</p>
          </div>
        );
      })()}
    </div>
  );
}

const PAYMENT_LABEL: Record<string, string> = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR', saldo: 'Saldo' };

/** Cobro en efectivo con teclado propio (no `type=number`: en tablet abre
 * un teclado distinto según el sistema y deja escribir signos). Billetes
 * rápidos arriba de lo que se cobra, y el vuelto en grande. */
function CashPayment({ total, value, onChange, confirming, onConfirm, onCancel }: {
  total: number; value: string; onChange: (v: string) => void; confirming: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const given = Number(value || 0);
  const enough = value !== '' && given >= total;
  // Billetes que alcanzan para pagar (los primeros 3), además de "Exacto".
  const quick = [5000, 10000, 20000, 30000, 40000, 50000].filter((b) => b > total).slice(0, 3);
  const press = (k: string) => {
    if (k === 'del') { onChange(value.slice(0, -1)); return; }
    const next = (value + k).replace(/^0+/, '');
    if (next.length <= 7) onChange(next);
  };
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-label="Cobro en efectivo">
      <div className="admin-glass-sheet w-full max-w-sm space-y-4 rounded-t-3xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] sm:rounded-3xl">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-widest text-white/60">Cobro en efectivo</p>
          <p className="text-2xl font-bold tabular-nums">${total.toLocaleString('es-CL')}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-4 text-center">
          <p className="text-xs text-white/60">Entregó</p>
          <p className="text-4xl font-bold tabular-nums">{value ? `$${given.toLocaleString('es-CL')}` : <span className="text-white/40">$0</span>}</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${value === '' ? 'text-white/40' : enough ? 'text-[var(--admin-success-text)]' : 'text-[var(--admin-danger-text)]'}`}>
            {value === '' ? 'Ingresa lo que entregó' : enough ? `Vuelto $${(given - total).toLocaleString('es-CL')}` : `Falta $${(total - given).toLocaleString('es-CL')}`}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={() => onChange(String(total))} className="admin-tab h-11 rounded-xl text-sm font-semibold">Exacto</button>
          {quick.map((b) => (
            <button key={b} type="button" onClick={() => onChange(String(b))} className="admin-tab h-11 rounded-xl text-sm font-semibold tabular-nums">${b / 1000}k</button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map((k) => (
            <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? 'Borrar' : k}
              className="admin-tile flex h-14 items-center justify-center rounded-2xl text-xl font-semibold active:scale-95">
              {k === 'del' ? <Delete className="h-5 w-5" /> : k}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12 rounded-2xl" onClick={onCancel} disabled={confirming}>Volver</Button>
          <Button className="h-12 rounded-2xl font-bold" disabled={!enough || confirming} onClick={onConfirm}>
            {confirming ? 'Registrando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CajaDashboard({ eventId }: { eventId: number }) {
  // Se actualiza solo cada 30 s mientras está abierto (antes había que salir
  // y volver a entrar para ver números nuevos).
  const { data, dataUpdatedAt, isFetching } = trpc.caja.dashboard.useQuery({ eventId }, { refetchInterval: 30_000 });
  if (!data) return <p className="text-white/60">Cargando… (requiere conexión)</p>;

  const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
  const kclp = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : clp(n));
  const hours: { hour: number; total: number; count: number }[] = (data as any).salesByHour ?? [];
  const maxHour = Math.max(1, ...hours.map((h) => h.total));
  const occupancy = data.expectedCount > 0 ? Math.min(1, data.insideCount / data.expectedCount) : 0;
  const maxQty = Math.max(1, ...data.topProducts.map((p: any) => p.quantity));
  const updated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-xl">Resumen del turno</h2>
        <p className="text-xs text-white/60">{isFetching ? 'Actualizando…' : `Actualizado ${updated}`}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="admin-clay p-4">
          <p className="text-xs text-white/60">Ventas en caja</p>
          <p className="text-2xl font-bold tabular-nums">{clp(data.totalSales)}</p>
        </div>
        <div className="admin-clay p-4">
          <p className="text-xs text-white/60">Ventas</p>
          <p className="text-2xl font-bold tabular-nums">{data.salesCount}</p>
        </div>
        <div className="admin-clay col-span-2 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-white/60">Personas adentro ahora</p>
            <p className="text-xs text-white/60 tabular-nums">{Math.round(occupancy * 100)}% del esperado</p>
          </div>
          <p className="text-3xl font-bold tabular-nums">
            {data.insideCount}
            <span className="text-base font-normal text-white/60"> / {data.expectedCount}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${occupancy * 100}%` }} />
          </div>
        </div>
      </div>

      {hours.length > 0 && (
        <section className="admin-clay p-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-white/60">Ventas por hora</p>
          <div className="flex h-36 items-end gap-2" role="img" aria-label={`Ventas por hora: ${hours.map((h) => `${h.hour}:00 ${clp(h.total)}`).join(', ')}`}>
            {hours.map((h) => (
              <div key={h.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] font-semibold tabular-nums text-white/80">{kclp(h.total)}</span>
                <div className="w-full max-w-12 rounded-t-lg bg-primary/80" style={{ height: `${Math.max(4, (h.total / maxHour) * 100)}%` }} title={`${h.count} ventas`} />
                <span className="text-[11px] tabular-nums text-white/60">{String(h.hour).padStart(2, '0')}h</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="admin-clay flex items-center justify-between p-4">
        <p className="text-sm text-white/70">Extras canjeados (total evento)</p>
        <p className="text-2xl font-bold tabular-nums">{data.redeemedCount}</p>
      </div>

      {data.topProducts.length > 0 && (
        <section className="admin-clay p-4">
          <p className="mb-3 text-xs uppercase tracking-wide text-white/60">Más vendidos</p>
          <div className="space-y-2.5">
            {data.topProducts.map((p: any) => (
              <div key={p.name}>
                <div className="flex justify-between text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="font-semibold tabular-nums">{p.quantity}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(p.quantity / maxQty) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.recentSales.length > 0 && (
        <section className="admin-clay divide-y divide-white/10 p-0">
          <p className="px-4 pb-2 pt-4 text-xs uppercase tracking-wide text-white/60">Últimas ventas</p>
          {data.recentSales.map((s: any) => (
            <div key={s.orderNumber} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="font-mono text-white/70">{s.orderNumber}</span>
              <span className="font-semibold tabular-nums">{clp(s.total)}</span>
            </div>
          ))}
        </section>
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
          <div key={c.opId} className="p-4 rounded-2xl admin-clay admin-clay-sm !border-amber-400/40">
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
