import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  saveSnapshot, getLocalEvent, searchLocal, getLocalAttendee, getLocalCatalog,
  enqueueOp, pendingOpsCount, getPendingOps, markOpSynced, clearSyncedOps, correctedNow,
  type CajaAttendee, type CajaCatalogItem, type QueuedOp,
} from './db';

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

/** Apertura de turno (§10.2.1, §14 Fase 5): elegir la caja física antes de
 * entrar -- opcional (se puede seguir sin caja asignada si todavía no hay
 * ninguna creada en /admin, o si no hay red para cargarlas). */
function ShiftGate({ operator }: { operator: { operatorId: number; name: string; role: string } }) {
  const { data: registersList } = trpc.caja.listRegisters.useQuery();
  const { data: event } = trpc.caja.activeEvent.useQuery();
  const shiftOpen = trpc.caja.shiftOpen.useMutation();
  const [registerId, setRegisterId] = useState<number | null | undefined>(() => {
    const saved = sessionStorage.getItem('caja_register_id');
    return saved ? Number(saved) : undefined;
  });

  const choose = async (id: number | null) => {
    setRegisterId(id);
    if (id !== null) sessionStorage.setItem('caja_register_id', String(id));
    else sessionStorage.removeItem('caja_register_id');
    if (event) shiftOpen.mutate({ opId: newOpId(), eventId: event.id, registerId: id ?? undefined, clientAt: (await correctedNow()).toISOString() });
  };

  if (registerId !== undefined) {
    return <CajaHome operator={operator} registerId={registerId} onCloseShift={() => setRegisterId(undefined)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#150d13] via-[#0d0810] to-[#150d13] text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-bold">Hola, {operator.name} 👋</h1>
      <p className="text-white/60 text-sm">Elige tu caja para este turno</p>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {(registersList ?? []).map((r: any) => (
          <button key={r.id} onClick={() => choose(r.id)} className="h-20 rounded-3xl bg-white/[0.04] backdrop-blur-sm border border-white/10 text-lg font-semibold active:scale-95 transition-transform hover:border-primary/40">
            {r.name}
          </button>
        ))}
      </div>
      <button onClick={() => choose(null)} className="text-white/50 text-sm underline">Continuar sin caja asignada</button>
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
  const [query, setQuery] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [results, setResults] = useState<CajaAttendee[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [sheetVersion, setSheetVersion] = useState(0); // fuerza refresco de la ficha tras un canje local

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
    if (q.length < 2) { setResults([]); return; }
    searchLocal(q).then(setResults);
  }, [query, sheetVersion]);

  const doRedeem = async (displayCode: string) => {
    await enqueueOp({ opId: newOpId(), type: 'redeem', displayCode, clientAt: (await correctedNow()).toISOString() });
    toast.success('Código canjeado ✅');
    refreshPending();
    setSheetVersion((v) => v + 1);
    runSync();
  };

  const redeemManual = () => {
    if (!manualCode.trim()) return;
    doRedeem(manualCode.trim());
    setManualCode('');
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
              const summary = await shiftClose.mutateAsync({ opId: newOpId(), eventId: localEvent.id, registerId: registerId ?? undefined, clientAt: (await correctedNow()).toISOString() });
              toast.success(`Turno cerrado: ${summary?.salesCount ?? 0} ventas ($${(summary?.salesTotal ?? 0).toLocaleString('es-CL')}), ${summary?.redeemsCount ?? 0} canjes.`);
              onCloseShift();
              logout.mutate();
            }}
          >
            Cerrar turno
          </Button>
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto">
        {view === 'menu' && (
          <div className="space-y-6">
            <div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, email o teléfono…"
                className="h-14 text-base bg-white/[0.04] backdrop-blur-sm border-white/10 text-white placeholder:text-white/50"
              />
              {query.trim().length >= 2 && (
                <div className="mt-2 space-y-2">
                  {results.length === 0 && <p className="text-white/50 text-sm px-1">Sin resultados.</p>}
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
          <CustomerSheet
            key={sheetVersion}
            orderId={selectedOrderId}
            onRedeem={doRedeem}
            canVoid={isSupervisor}
            onVoid={async (displayCode, reason) => voidCode.mutate({ opId: newOpId(), eventId: localEvent.id, registerId: registerId ?? undefined, displayCode, reason, clientAt: (await correctedNow()).toISOString() })}
            voiding={voidCode.isPending}
          />
        )}

        {view === 'conflicts' && <ConflictQueue eventId={localEvent.id} />}

        {view === 'sale' && (
          <NewSale
            onSale={async (items, paymentMethod) => {
              await enqueueOp({ opId: newOpId(), type: 'sale', items, paymentMethod, clientAt: (await correctedNow()).toISOString() });
              toast.success('Venta registrada ✅');
              refreshPending();
              runSync();
              setView('menu');
            }}
          />
        )}

        {view === 'dashboard' && <CajaDashboard eventId={localEvent.id} />}
      </main>
    </div>
  );
}

function statusBadge(status: string) {
  if (status === 'used') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-white/60">Canjeado</span>;
  if (status === 'cancelled') return <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-300">Anulado</span>;
  return <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_-4px_rgba(16,185,129,0.7)]">Pendiente</span>;
}

function CustomerSheet({ orderId, onRedeem, canVoid, onVoid, voiding }: {
  orderId: number;
  onRedeem: (code: string) => void;
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
            <div key={i} className="p-3 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10 flex items-center justify-between">
              <span className="text-sm font-medium">{a.typeName}</span>
              {statusBadge(a.status)}
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

function NewSale({ onSale }: { onSale: (items: { ticketTypeId: number; quantity: number }[], paymentMethod: 'efectivo' | 'debito' | 'credito') => void }) {
  const [catalog, setCatalog] = useState<CajaCatalogItem[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'debito' | 'credito'>('debito');

  useEffect(() => { getLocalCatalog().then(setCatalog); }, []);

  const total = catalog.reduce((sum, p) => sum + p.price * (cart[p.id] || 0), 0);
  const hasItems = Object.values(cart).some((q) => q > 0);

  const add = (id: number) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const remove = (id: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));

  const confirm = () => {
    const cartItems = Object.entries(cart).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId: Number(ticketTypeId), quantity }));
    onSale(cartItems, paymentMethod);
    setCart({});
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Nueva venta</h2>
      <div className="grid grid-cols-2 gap-3">
        {catalog.map((p) => (
          <button
            key={p.id}
            onClick={() => add(p.id)}
            className="rounded-3xl p-4 text-left border active:scale-95 transition-transform backdrop-blur-sm"
            style={{ backgroundColor: (p.color || '#f472b6') + '14', borderColor: (p.color || '#f472b6') + '50', boxShadow: `0 0 20px -10px ${p.color || '#f472b6'}` }}
          >
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-white/60">${p.price.toLocaleString('es-CL')}</p>
            {cart[p.id] > 0 && (
              <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => remove(p.id)} className="w-7 h-7 rounded-full bg-white/10 text-white">−</button>
                <span className="font-bold">{cart[p.id]}</span>
                <button onClick={() => add(p.id)} className="w-7 h-7 rounded-full bg-white/10 text-white">+</button>
              </div>
            )}
          </button>
        ))}
        {catalog.length === 0 && <p className="col-span-2 text-white/50 text-sm">No hay productos "extra" activos para este evento.</p>}
      </div>

      {hasItems && (
        <div className="sticky bottom-4 bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>${total.toLocaleString('es-CL')}</span>
          </div>
          <div className="flex gap-2">
            {(['efectivo', 'debito', 'credito'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`flex-1 h-10 rounded-lg text-sm font-medium capitalize ${paymentMethod === m ? 'bg-primary text-white' : 'bg-white/5 text-white/50'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <Button className="w-full h-12 bg-primary hover:bg-primary/90" onClick={confirm}>
            Cobrado en terminal — Confirmar
          </Button>
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
        <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-sm border border-white/10 col-span-2">
          <p className="text-xs text-white/50">Códigos canjeados (total evento)</p>
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
            <p className="text-xs text-white/50 mt-1">{c.operatorName} · {new Date(c.serverAt).toLocaleString('es-CL')}</p>
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
