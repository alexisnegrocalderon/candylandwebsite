import { useEffect, useState } from 'react';
import { useDebounced } from '@/hooks/useDebounced';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatChileDateTime } from '@shared/chileDate';
import { correctedNow } from './db';

/* Historial de ventas de la noche (pedido explícito del dueño): todas las
 * ventas con scroll, buscables por cliente / n° de orden / email / producto /
 * cajera, con el detalle de cada una y la opción de anularla SOLO con la
 * clave de admin. Lee del servidor: una venta encolada sin señal aparece acá
 * recién cuando sincroniza (el contador de pendientes del header lo avisa). */

type Method = 'efectivo' | 'debito' | 'credito' | 'qr' | 'saldo';
type StatusFilter = 'all' | 'approved' | 'refunded';

export const METHOD_META: Record<Method, { label: string; badgeClass: string }> = {
  efectivo: { label: 'Efectivo', badgeClass: 'bg-emerald-500/15 text-emerald-300' },
  debito: { label: 'Débito', badgeClass: 'bg-sky-500/15 text-sky-300' },
  credito: { label: 'Crédito', badgeClass: 'bg-sky-500/15 text-sky-300' },
  qr: { label: 'QR', badgeClass: 'bg-violet-500/15 text-violet-300' },
  saldo: { label: 'Saldo', badgeClass: 'bg-amber-500/15 text-amber-300' },
};

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const timeOf = (d: Date | string) => new Date(d).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });

function MethodBadge({ method }: { method: string | null }) {
  const meta = METHOD_META[method as Method];
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${meta?.badgeClass ?? 'bg-white/10 text-white/60'}`}>{meta?.label ?? method ?? '—'}</span>;
}

export function SalesHistory({ eventId, registerId, isOnline, compact = false, heightClass }: {
  eventId: number;
  registerId: number | null;
  isOnline: boolean;
  /** Versión acotada bajo la grilla de "Nueva venta"; la completa ocupa la pantalla. */
  compact?: boolean;
  /** Reemplaza el alto de la versión `compact` (por defecto `shrink-0 max-h-72`). */
  heightClass?: string;
}) {
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<Method | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search.trim(), 300);

  const query = trpc.caja.salesHistory.useInfiniteQuery(
    {
      eventId,
      search: debouncedSearch || undefined,
      paymentMethod: method ?? undefined,
      status: status === 'all' ? undefined : status,
      limit: compact ? 20 : 40,
    },
    // Lo propio se refresca al sincronizar (CajaHome invalida la consulta);
    // el intervalo solo trae lo de las OTRAS cajas, así que alcanza con
    // menos frecuencia que los 15 s de antes (y menos aún en la lista chica).
    { getNextPageParam: (last) => last.nextCursor ?? undefined, refetchInterval: compact ? 60_000 : 30_000 },
  );
  const sales = query.data?.pages.flatMap((p) => p.sales) ?? [];
  const filtering = !!debouncedSearch || !!method || status !== 'all';
  // En el visor chico (columna angosta junto al carrito) la lista de productos
  // de cada venta no cabe: solo se muestra si hay ancho de sobra.
  const productsCol = compact ? 'hidden min-[1100px]:table-cell' : 'hidden md:table-cell';

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  };

  return (
    <div className={`flex flex-col admin-clay admin-clay-sm rounded-2xl overflow-hidden ${compact ? (heightClass ?? 'shrink-0 max-h-72') : 'h-full min-h-0'}`}>
      <div className="shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-wide text-white/50 flex-1">{compact ? 'Ventas de la noche' : 'Historial de ventas'}</p>
          {!isOnline && <span className="text-[11px] text-amber-300">Sin señal: puede estar desactualizado</span>}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, n° orden, producto o cajera"
            className="pl-9 h-10 bg-white/5 border-white/10 text-white placeholder:text-white/50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/60" aria-label="Limpiar búsqueda">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(['all', 'approved', 'refunded'] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap border ${status === s ? 'bg-primary/20 border-primary/40 text-primary' : 'border-white/10 text-white/60'}`}>
              {s === 'all' ? 'Todas' : s === 'approved' ? 'Cobradas' : 'Anuladas'}
            </button>
          ))}
          <span className="w-px bg-white/10 mx-1" />
          {(Object.keys(METHOD_META) as Method[]).map((m) => (
            <button key={m} onClick={() => setMethod(method === m ? null : m)}
              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap border ${method === m ? 'bg-primary/20 border-primary/40 text-primary' : 'border-white/10 text-white/60'}`}>
              {METHOD_META[m].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto overscroll-contain" onScroll={onScroll}>
        {query.isLoading && <p className="px-4 py-3 text-sm text-white/50">Cargando…</p>}
        {query.isError && <p className="px-4 py-3 text-sm text-amber-300">No se pudo cargar (¿sin conexión?).</p>}
        {!query.isLoading && sales.length === 0 && !query.isError && (
          <p className="px-4 py-3 text-sm text-white/50">{filtering ? 'Nada coincide con la búsqueda.' : 'Todavía no hay ventas esta noche.'}</p>
        )}
        {sales.length > 0 && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--admin-surface-solid)]">
              <tr className="text-left text-white/60 text-xs">
                <th className="px-3 py-1.5 font-medium">Hora</th>
                <th className="px-3 py-1.5 font-medium">Cliente</th>
                <th className="px-3 py-1.5 font-medium">Cobró</th>
                <th className={`px-3 py-1.5 font-medium ${productsCol}`}>Productos</th>
                <th className="px-3 py-1.5 font-medium">Método</th>
                <th className="px-3 py-1.5 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const voided = s.status === 'refunded';
                return (
                  <tr key={s.id} onClick={() => setOpenOrder(s.orderNumber)} className={`border-t border-white/5 cursor-pointer active:bg-white/10 ${voided ? 'text-white/60' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-white/60">{timeOf(s.createdAt)}</td>
                    <td className="px-3 py-2 max-w-[150px]">
                      <p className={`truncate ${voided ? 'line-through' : ''}`}>{s.buyerName}</p>
                      <p className="truncate text-[11px] font-mono text-white/60">{s.orderNumber}</p>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[110px]">{s.operatorName}</td>
                    <td className={`px-3 py-2 ${productsCol} max-w-[220px] truncate text-white/60`}>{s.items.join(', ')}</td>
                    <td className="px-3 py-2"><MethodBadge method={s.paymentMethod} /></td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      {voided ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 font-medium mr-1">Anulada</span> : null}
                      <span className={voided ? 'line-through' : ''}>{money(s.total)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {query.isFetchingNextPage && <p className="px-4 py-2 text-xs text-white/60">Cargando más…</p>}
      </div>

      {openOrder && (
        <SaleDetailModal eventId={eventId} registerId={registerId} isOnline={isOnline} orderNumber={openOrder} onClose={() => setOpenOrder(null)} />
      )}
    </div>
  );
}

function SaleDetailModal({ eventId, registerId, isOnline, orderNumber, onClose }: {
  eventId: number; registerId: number | null; isOnline: boolean; orderNumber: string; onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: sale, isLoading, isError } = trpc.caja.saleDetail.useQuery({ eventId, orderNumber });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  // Un opId por intento de anulación abierto: reintentar tras un corte de
  // red no anula dos veces (applyOp es idempotente por opId).
  const [opId] = useState(() => crypto.randomUUID());

  const voidSale = trpc.caja.voidSale.useMutation({
    onSuccess: (res) => {
      setPassword('');
      if (res.result !== 'applied') {
        toast.error(res.conflictNote ?? 'No se pudo anular');
        return;
      }
      const method = res.order?.paymentMethod;
      toast.success(
        method === 'efectivo' ? 'Venta anulada. Devuelve el efectivo al cliente.'
          : method === 'saldo' ? 'Venta anulada. El saldo ya volvió a la tarjeta del cliente.'
          : 'Venta anulada. Haz la reversa/devolución en la máquina.',
        { duration: 8000 },
      );
      utils.caja.salesHistory.invalidate();
      utils.caja.saleDetail.invalidate({ eventId, orderNumber });
      utils.caja.dashboard.invalidate({ eventId });
      setVoiding(false);
    },
    onError: (e) => { setPassword(''); toast.error(e.message); },
  });

  const submitVoid = async () => {
    if (reason.trim().length < 5) { toast.error('Escribe el motivo (mínimo 5 letras)'); return; }
    if (!password) { toast.error('Falta la clave de admin'); return; }
    voidSale.mutate({
      opId, eventId, orderNumber, reason: reason.trim(), adminPassword: password,
      registerId: registerId ?? undefined, clientAt: (await correctedNow()).toISOString(),
    });
  };

  // En un portal al <body>: el visor de ventas tiene vidrio (`backdrop-filter`)
  // y `overflow-hidden`, y un `fixed` dentro de un ancestro con backdrop-filter
  // se posiciona contra ESE ancestro, no contra la pantalla -- la ficha quedaba
  // recortada dentro de la cajita del visor.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain admin-glass-sheet rounded-t-3xl sm:rounded-3xl p-5 space-y-4 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm text-white/50">{orderNumber}</p>
            <p className="text-xl font-bold truncate">{sale?.buyerName ?? '…'}</p>
          </div>
          <button onClick={onClose} className="p-2 -m-2 text-white/50" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {isLoading && <p className="text-white/50 text-sm">Cargando…</p>}
        {isError && <p className="text-amber-300 text-sm">No se pudo cargar el detalle (¿sin conexión?).</p>}

        {sale && (
          <>
            {sale.void && (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-3 text-sm">
                <p className="font-semibold text-red-300">Anulada · {formatChileDateTime(sale.void.at)}</p>
                <p className="text-white/70">Motivo: {sale.void.reason}</p>
                <p className="text-white/50 text-xs">Sesión abierta al anular: {sale.void.byOperatorName}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Hora" value={formatChileDateTime(sale.createdAt)} />
              <Info label="Cobró" value={`${sale.operatorName}${sale.registerName ? ` · ${sale.registerName}` : ''}`} />
              <Info label="Método" value={<MethodBadge method={sale.paymentMethod} />} />
              <Info label="Cliente" value={sale.buyerEmail ?? 'Sin email asociado'} />
              {sale.kitchenTicketNumber && <Info label="Comanda" value={sale.kitchenTicketNumber} />}
              {sale.lockerTag && <Info label="Percha" value={sale.lockerTag} />}
            </div>

            <div className="rounded-2xl border border-white/10 divide-y divide-white/5 text-sm">
              {sale.items.map((i, idx) => (
                <div key={idx} className="flex justify-between px-3 py-2">
                  <span>{i.quantity}× {i.name}</span>
                  <span className="text-white/70">{money(i.totalPrice)}</span>
                </div>
              ))}
              {sale.discount > 0 && (
                <div className="flex justify-between px-3 py-2 text-emerald-300">
                  <span>Descuento{sale.discountCode ? ` (${sale.discountCode})` : ''} / Playcoins</span>
                  <span>−{money(sale.discount)}</span>
                </div>
              )}
              <div className="flex justify-between px-3 py-2 font-bold text-base">
                <span>Total</span>
                <span className={sale.status === 'refunded' ? 'line-through text-white/60' : ''}>{money(sale.total)}</span>
              </div>
            </div>

            {sale.stockWarnings.length > 0 && (
              <p className="text-xs text-amber-300">Se vendió sin stock en el inventario: {sale.stockWarnings.map((w: any) => w.name).join(', ')}</p>
            )}

            {sale.status === 'approved' && !voiding && (
              <Button variant="outline" className="w-full h-11 border-red-500/40 text-red-300 hover:bg-red-500/10 bg-transparent" disabled={!isOnline}
                onClick={() => setVoiding(true)}>
                {isOnline ? 'Anular venta' : 'Anular venta (requiere conexión)'}
              </Button>
            )}

            {voiding && (
              <div className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-3">
                <p className="text-sm font-semibold text-red-300">Anular {money(sale.total)} — requiere clave de admin</p>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (ej: cobro duplicado, cliente se arrepintió)"
                  className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/50" maxLength={300} />
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Clave de admin"
                  autoComplete="off" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/50"
                  onKeyDown={(e) => { if (e.key === 'Enter') submitVoid(); }} />
                <p className="text-xs text-white/50">
                  Se devuelven stock, Playcoins, saldo y código de descuento. La plata cobrada en máquina o efectivo hay que devolverla a mano. Queda registrado y se avisa al dueño.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1 h-11" onClick={() => { setVoiding(false); setPassword(''); }}>Cancelar</Button>
                  <Button className="flex-1 h-11 bg-red-600 hover:bg-red-500 text-white" disabled={voidSale.isPending} onClick={submitVoid}>
                    {voidSale.isPending ? 'Anulando…' : 'Confirmar anulación'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Tira plegable de "Ventas de la noche" para la pantalla de Nueva venta en
 * tablet (vertical y horizontal): cerrada es una barra con la última venta;
 * abierta muestra el visor completo (buscador, filtros, detalle) hasta casi la
 * mitad de la pantalla, así no le quita espacio fijo a los productos. */
export function SalesStrip({ eventId, registerId, isOnline }: { eventId: number; registerId: number | null; isOnline: boolean }) {
  const [open, setOpen] = useState(false);
  const last = trpc.caja.salesHistory.useQuery({ eventId, limit: 1 }, { enabled: !open, refetchInterval: 60_000 });
  const lastSale = last.data?.sales?.[0];

  if (open) {
    return (
      <div className="shrink-0 space-y-2">
        <button type="button" onClick={() => setOpen(false)} className="admin-glass-panel flex w-full items-center gap-2 px-4 py-2 text-left text-xs uppercase tracking-wide text-white/70">
          <ChevronDown className="h-4 w-4" />
          <span className="flex-1">Ventas de la noche</span>
          <span className="normal-case tracking-normal text-white/60">Cerrar</span>
        </button>
        <SalesHistory compact eventId={eventId} registerId={registerId} isOnline={isOnline} heightClass="shrink-0 h-[min(45dvh,26rem)]" />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className="admin-glass-panel flex w-full shrink-0 items-center gap-3 px-4 py-3 text-left">
      <ChevronUp className="h-4 w-4 shrink-0 text-white/60" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs uppercase tracking-wide text-white/50">Ventas de la noche</span>
        <span className="block truncate text-sm">
          {lastSale
            ? <>{timeOf(lastSale.createdAt)} · {lastSale.buyerName} · <span className="font-semibold">{money(lastSale.total)}</span></>
            : last.isError ? 'No se pudo cargar (¿sin conexión?)' : last.isLoading ? 'Cargando…' : 'Todavía no hay ventas esta noche'}
        </span>
      </span>
      {lastSale && <MethodBadge method={lastSale.paymentMethod} />}
      <span className="shrink-0 text-xs text-white/60">Ver todas</span>
    </button>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl admin-clay admin-clay-sm px-3 py-2 min-w-0">
      <p className="text-[11px] text-white/60">{label}</p>
      <div className="truncate">{value}</div>
    </div>
  );
}
