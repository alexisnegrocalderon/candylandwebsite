import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
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

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function SalesHistory({ eventId, registerId, isOnline, compact = false }: {
  eventId: number;
  registerId: number | null;
  isOnline: boolean;
  /** Versión acotada bajo la grilla de "Nueva venta"; la completa ocupa la pantalla. */
  compact?: boolean;
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
    { getNextPageParam: (last) => last.nextCursor ?? undefined, refetchInterval: 15_000 },
  );
  const sales = query.data?.pages.flatMap((p) => p.sales) ?? [];
  const filtering = !!debouncedSearch || !!method || status !== 'all';

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  };

  return (
    <div className={`flex flex-col bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden ${compact ? 'shrink-0 max-h-72' : 'h-full min-h-0'}`}>
      <div className="shrink-0 px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-wide text-white/50 flex-1">{compact ? 'Ventas de la noche' : 'Historial de ventas'}</p>
          {!isOnline && <span className="text-[11px] text-amber-300">Sin señal: puede estar desactualizado</span>}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, n° orden, producto o cajera"
            className="pl-9 h-10 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40" aria-label="Limpiar búsqueda">
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
            <thead className="sticky top-0 bg-[#150d13]">
              <tr className="text-left text-white/40 text-xs">
                <th className="px-3 py-1.5 font-medium">Hora</th>
                <th className="px-3 py-1.5 font-medium">Cliente</th>
                <th className="px-3 py-1.5 font-medium">Cobró</th>
                <th className="px-3 py-1.5 font-medium hidden md:table-cell">Productos</th>
                <th className="px-3 py-1.5 font-medium">Método</th>
                <th className="px-3 py-1.5 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const voided = s.status === 'refunded';
                return (
                  <tr key={s.id} onClick={() => setOpenOrder(s.orderNumber)} className={`border-t border-white/5 cursor-pointer active:bg-white/10 ${voided ? 'text-white/40' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-white/60">{timeOf(s.createdAt)}</td>
                    <td className="px-3 py-2 max-w-[150px]">
                      <p className={`truncate ${voided ? 'line-through' : ''}`}>{s.buyerName}</p>
                      <p className="truncate text-[11px] font-mono text-white/40">{s.orderNumber}</p>
                    </td>
                    <td className="px-3 py-2 truncate max-w-[110px]">{s.operatorName}</td>
                    <td className="px-3 py-2 hidden md:table-cell max-w-[220px] truncate text-white/60">{s.items.join(', ')}</td>
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
        {query.isFetchingNextPage && <p className="px-4 py-2 text-xs text-white/40">Cargando más…</p>}
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

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-[#150d13] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 text-white" onClick={(e) => e.stopPropagation()}>
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
                <span className={sale.status === 'refunded' ? 'line-through text-white/40' : ''}>{money(sale.total)}</span>
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
                  className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30" maxLength={300} />
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Clave de admin"
                  autoComplete="off" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/30"
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
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 min-w-0">
      <p className="text-[11px] text-white/40">{label}</p>
      <div className="truncate">{value}</div>
    </div>
  );
}
