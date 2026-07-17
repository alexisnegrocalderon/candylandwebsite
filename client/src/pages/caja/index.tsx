import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  saveSnapshot, getLocalEvent, searchLocal, getLocalAttendee, getLocalCatalog,
  enqueueOp, pendingOpsCount, getPendingOps, markOpSynced, clearSyncedOps,
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

type View = 'menu' | 'sheet' | 'sale' | 'dashboard';

export default function CajaApp() {
  const { data: operator, isLoading } = trpc.caja.me.useQuery();

  // Registro manual del service worker (solo en build de producción -- en
  // dev vite-plugin-pwa no genera un SW real). Scope acotado a /caja/ para
  // no tocar el resto del sitio (checkout con Mercado Pago, admin).
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {});
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!operator) return <PinLogin />;
  return <CajaHome operator={operator} />;
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
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Mansion Playroom · Caja</h1>
        <p className="text-neutral-400 text-sm -mt-6">Toca tu nombre</p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          {(operators ?? []).map((op) => (
            <button
              key={op.id}
              onClick={() => setSelected({ id: op.id, name: op.name })}
              className="h-20 rounded-2xl bg-neutral-900 border border-neutral-800 text-lg font-semibold active:scale-95 transition-transform"
            >
              {op.name}
            </button>
          ))}
          {operators && operators.length === 0 && (
            <p className="col-span-2 text-center text-neutral-500 text-sm">
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
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-6 p-6">
      <button onClick={() => { setSelected(null); setPin(''); }} className="text-neutral-500 text-sm">← Cambiar de operador</button>
      <h1 className="text-xl font-bold">{selected.name}</h1>
      <div className="flex gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 ${i < digits.length ? 'bg-pink-500 border-pink-500' : 'border-neutral-700'}`} />
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
            className={`h-16 rounded-2xl text-xl font-semibold active:scale-95 transition-transform ${k ? 'bg-neutral-900 border border-neutral-800' : 'invisible'}`}
          >
            {k}
          </button>
        ))}
      </div>
      <Button className="w-full max-w-xs h-14 text-base bg-pink-500 hover:bg-pink-600" disabled={pin.length < 4 || login.isPending} onClick={() => submit(pin)}>
        {login.isPending ? 'Entrando…' : 'Entrar'}
      </Button>
    </div>
  );
}

/** "✓ sincronizado" / "⏳ N pendientes" / "⚠ sin conexión" (§6.3). */
function SyncBadge({ online, pending }: { online: boolean; pending: number }) {
  if (!online) return <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-300">⚠ sin conexión</span>;
  if (pending > 0) return <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300">⏳ {pending} pendiente{pending > 1 ? 's' : ''}</span>;
  return <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-300">✓ sincronizado</span>;
}

function CajaHome({ operator }: { operator: { operatorId: number; name: string; role: string } }) {
  const utils = trpc.useUtils();
  const { data: remoteEvent } = trpc.caja.activeEvent.useQuery();
  const logout = trpc.caja.logout.useMutation({ onSuccess: () => utils.caja.me.invalidate() });
  const snapshotQuery = trpc.caja.snapshot.useQuery({ eventId: remoteEvent?.id ?? 0 }, { enabled: !!remoteEvent, refetchInterval: 60_000 });
  const syncMutation = trpc.caja.sync.useMutation();

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
      const results = await syncMutation.mutateAsync({ eventId: localEvent.id, ops: opsToSync.slice(0, 50).map((o) => o.op) as QueuedOp[] });
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
  }, [isOnline, localEvent, syncMutation, refreshPending]);

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
    await enqueueOp({ opId: newOpId(), type: 'redeem', displayCode, clientAt: new Date().toISOString() });
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

  if (!localEvent) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 text-center">
        <p className="text-neutral-400">{isOnline ? 'Cargando evento…' : 'Sin conexión y sin datos guardados todavía. Conéctate una vez para descargar el evento.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="sticky top-0 z-10 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold leading-tight">{localEvent.title}</p>
          <p className="text-xs text-neutral-500">{operator.name} · {operator.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge online={isOnline} pending={pending} />
          {view !== 'menu' && (
            <Button variant="outline" size="sm" className="border-neutral-700 text-white" onClick={() => { setView('menu'); setSelectedOrderId(null); }}>
              ← Volver
            </Button>
          )}
          <Button variant="outline" size="sm" className="border-neutral-700 text-white" onClick={() => logout.mutate()}>Salir</Button>
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
                className="h-14 text-base bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500"
              />
              {query.trim().length >= 2 && (
                <div className="mt-2 space-y-2">
                  {results.length === 0 && <p className="text-neutral-500 text-sm px-1">Sin resultados.</p>}
                  {results.map((r) => (
                    <button
                      key={r.orderId}
                      onClick={() => { setSelectedOrderId(r.orderId); setView('sheet'); }}
                      className="w-full text-left p-4 rounded-xl bg-neutral-900 border border-neutral-800 active:scale-[0.99] transition-transform"
                    >
                      <p className="font-semibold">{r.buyerName}</p>
                      <p className="text-sm text-neutral-500">{r.buyerEmail}{r.buyerPhone ? ` · ${r.buyerPhone}` : ''}</p>
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
                className="h-12 bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500 font-mono"
              />
              <Button className="h-12 bg-pink-500 hover:bg-pink-600" disabled={!manualCode.trim()} onClick={redeemManual}>
                Canjear
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => setView('sale')} className="h-24 rounded-2xl bg-pink-500/10 border border-pink-500/30 text-pink-300 font-semibold active:scale-95 transition-transform">
                🛒 Nueva venta
              </button>
              <button onClick={() => setView('dashboard')} className="h-24 rounded-2xl bg-neutral-900 border border-neutral-800 font-semibold active:scale-95 transition-transform">
                📊 Dashboard
              </button>
            </div>
          </div>
        )}

        {view === 'sheet' && selectedOrderId && (
          <CustomerSheet key={sheetVersion} orderId={selectedOrderId} onRedeem={doRedeem} />
        )}

        {view === 'sale' && (
          <NewSale
            onSale={async (items, paymentMethod) => {
              await enqueueOp({ opId: newOpId(), type: 'sale', items, paymentMethod, clientAt: new Date().toISOString() });
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
  if (status === 'used') return <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300">Canjeado</span>;
  if (status === 'cancelled') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">Anulado</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">Pendiente</span>;
}

function CustomerSheet({ orderId, onRedeem }: { orderId: number; onRedeem: (code: string) => void }) {
  const [sheet, setSheet] = useState<CajaAttendee | null | undefined>(undefined);

  useEffect(() => { getLocalAttendee(orderId).then((a) => setSheet(a ?? null)); }, [orderId]);

  if (sheet === undefined) return <p className="text-neutral-500">Cargando…</p>;
  if (sheet === null) return <p className="text-neutral-500">No se encontró la orden.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{sheet.buyerName}</h2>
        <p className="text-sm text-neutral-500">{sheet.buyerEmail}{sheet.buyerPhone ? ` · ${sheet.buyerPhone}` : ''}</p>
        <p className="text-xs text-neutral-600 mt-1">Orden {sheet.orderNumber}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Acceso</p>
        <div className="space-y-2">
          {sheet.access.length === 0 && <p className="text-sm text-neutral-600">Sin accesos en esta orden.</p>}
          {sheet.access.map((a, i) => (
            <div key={i} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between">
              <span className="text-sm font-medium">{a.typeName}</span>
              {statusBadge(a.status)}
            </div>
          ))}
        </div>
      </div>

      {sheet.extras.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Extras</p>
          <div className="space-y-2">
            {sheet.extras.map((e, i) => (
              <div key={i} className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{e.typeName}</p>
                  {e.displayCode && <p className="text-xs text-neutral-500 font-mono">{e.displayCode}</p>}
                </div>
                {e.status === 'valid' ? (
                  <Button size="sm" className="bg-pink-500 hover:bg-pink-600 h-8" onClick={() => e.displayCode && onRedeem(e.displayCode)}>Canjear</Button>
                ) : statusBadge(e.status)}
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
            className="rounded-2xl p-4 text-left border active:scale-95 transition-transform"
            style={{ backgroundColor: (p.color || '#f472b6') + '22', borderColor: (p.color || '#f472b6') + '55' }}
          >
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-neutral-400">${p.price.toLocaleString('es-CL')}</p>
            {cart[p.id] > 0 && (
              <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => remove(p.id)} className="w-7 h-7 rounded-full bg-neutral-800 text-white">−</button>
                <span className="font-bold">{cart[p.id]}</span>
                <button onClick={() => add(p.id)} className="w-7 h-7 rounded-full bg-neutral-800 text-white">+</button>
              </div>
            )}
          </button>
        ))}
        {catalog.length === 0 && <p className="col-span-2 text-neutral-500 text-sm">No hay productos "extra" activos para este evento.</p>}
      </div>

      {hasItems && (
        <div className="sticky bottom-4 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>${total.toLocaleString('es-CL')}</span>
          </div>
          <div className="flex gap-2">
            {(['efectivo', 'debito', 'credito'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`flex-1 h-10 rounded-lg text-sm font-medium capitalize ${paymentMethod === m ? 'bg-pink-500 text-white' : 'bg-neutral-800 text-neutral-400'}`}
              >
                {m}
              </button>
            ))}
          </div>
          <Button className="w-full h-12 bg-pink-500 hover:bg-pink-600" onClick={confirm}>
            Cobrado en terminal — Confirmar
          </Button>
        </div>
      )}
    </div>
  );
}

function CajaDashboard({ eventId }: { eventId: number }) {
  const { data } = trpc.caja.dashboard.useQuery({ eventId });
  if (!data) return <p className="text-neutral-500">Cargando… (requiere conexión)</p>;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Dashboard de caja</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800">
          <p className="text-xs text-neutral-500">Ventas en caja</p>
          <p className="text-2xl font-bold">${data.totalSales.toLocaleString('es-CL')}</p>
        </div>
        <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800">
          <p className="text-xs text-neutral-500"># Ventas</p>
          <p className="text-2xl font-bold">{data.salesCount}</p>
        </div>
        <div className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 col-span-2">
          <p className="text-xs text-neutral-500">Códigos canjeados (total evento)</p>
          <p className="text-2xl font-bold">{data.redeemedCount}</p>
        </div>
      </div>

      {data.topProducts.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Top productos</p>
          <div className="space-y-2">
            {data.topProducts.map((p: any, i: number) => (
              <div key={i} className="flex justify-between p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-sm">
                <span>{p.name}</span>
                <span className="font-semibold">{p.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recentSales.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Últimas ventas</p>
          <div className="space-y-2">
            {data.recentSales.map((s: any, i: number) => (
              <div key={i} className="flex justify-between p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-sm">
                <span className="font-mono text-neutral-400">{s.orderNumber}</span>
                <span className="font-semibold">${s.total.toLocaleString('es-CL')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
