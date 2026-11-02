/* «Resultados» de la etapa Cierre: tres preguntas, tres pestañas (cuánto, qué y quién vendió). El evento es el
 * que se elige arriba del panel. Todo viene de una sola consulta (`cajaReports.results`). */
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/admin/TableSkeleton';
import { clp } from './shared';

type Tab = 'cuanto' | 'que' | 'quien';

const METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR / transferencia', saldo: 'Saldo PlayCard',
  mercadopago: 'Mercado Pago', 'sin medio': 'Sin medio',
};
const methodLabel = (m: string) => METHOD_LABEL[m] ?? m;

function Big({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card><CardContent className="pt-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-heading text-3xl mt-1">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </CardContent></Card>
  );
}

export function ResultadosView() {
  const { eventId } = useTonightEvent();
  const { data, isLoading } = trpc.cajaReports.results.useQuery({ eventId: eventId ?? 0 }, { enabled: eventId != null });
  const { data: openShifts } = trpc.cajaReports.openShifts.useQuery({ eventId: eventId ?? undefined }, { enabled: eventId != null });
  const [tab, setTab] = useState<Tab>('cuanto');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'units' | 'revenue'>('units');

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data?.products ?? []).filter((p) => !q || p.variants.some((v) => v.toLowerCase().includes(q)));
    return [...list].sort((a, b) => (sortBy === 'units' ? b.units - a.units : b.revenue - a.revenue));
  }, [data, search, sortBy]);

  if (eventId == null) return <p className="text-sm text-muted-foreground">Elige un evento arriba para ver sus resultados.</p>;
  if (isLoading || !data) return <TableSkeleton rows={4} />;

  const b = data.breakdown;
  const totalUnits = data.products.reduce((s, p) => s + p.units, 0);
  const voidedCount = data.byRegister.reduce((s, r) => s + r.voided, 0);
  const voidedTotal = data.byRegister.reduce((s, r) => s + r.voidedTotal, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl">Resultados de la noche</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Las ventas de todas las cajas y de la web, juntas.</p>
      </div>

      {(openShifts ?? []).length > 0 && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-300">Hay {(openShifts ?? []).length === 1 ? 'un turno de caja' : `${(openShifts ?? []).length} turnos de caja`} sin cerrar</p>
          <p className="text-muted-foreground mt-0.5">
            {(openShifts ?? []).map((s: any) => s.registerName).join(' · ')}. Sus ventas ya están sumadas acá, pero falta el cuadre del efectivo:
            se cierra a mano desde la tablet de esa caja (no se cierra solo).
          </p>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="cuanto">¿Cuánto vendí?</TabsTrigger>
          <TabsTrigger value="que">¿Qué vendí?</TabsTrigger>
          <TabsTrigger value="quien">¿Quién vendió?</TabsTrigger>
        </TabsList>

        <TabsContent value="cuanto" className="space-y-5 mt-4">
          {b ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Big label="Total vendido" value={clp(b.total)} />
                <Big label="Caja" value={clp(b.caja.total)} hint={`${b.caja.count} ventas`} />
                <Big label="Web" value={clp(b.web.total)} hint={`${b.web.count} compras`} />
                <Big label="Anulado en caja" value={clp(voidedTotal)} hint={`${voidedCount} ventas (no suman)`} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card><CardContent className="pt-5 space-y-2">
                  <p className="font-medium">Por caja</p>
                  {data.byRegister.length === 0 && <p className="text-sm text-muted-foreground">Sin ventas en caja.</p>}
                  {data.byRegister.map((r) => (
                    <div key={r.id ?? 'none'} className="flex justify-between text-sm border-b border-border/30 py-1.5">
                      <span>{r.name} <span className="text-muted-foreground">· {r.sales} ventas{r.voided > 0 ? ` · ${r.voided} anuladas` : ''}</span></span>
                      <span className="font-medium">{clp(r.total)}</span>
                    </div>
                  ))}
                </CardContent></Card>
                <Card><CardContent className="pt-5 space-y-2">
                  <p className="font-medium">Por medio de pago</p>
                  {[...b.caja.byMethod.map((m) => ({ ...m, from: 'Caja' })), ...b.web.byMethod.map((m) => ({ ...m, from: 'Web' }))].map((m) => (
                    <div key={`${m.from}-${m.method}`} className="flex justify-between text-sm border-b border-border/30 py-1.5">
                      <span>{methodLabel(m.method)} <span className="text-muted-foreground">· {m.from} · {m.count}</span></span>
                      <span className="font-medium">{clp(m.total)}</span>
                    </div>
                  ))}
                </CardContent></Card>
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">Sin ventas todavía.</p>}
        </TabsContent>

        <TabsContent value="que" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" className="w-56" />
            <Button size="sm" variant={sortBy === 'units' ? 'default' : 'outline'} onClick={() => setSortBy('units')}>Por unidades</Button>
            <Button size="sm" variant={sortBy === 'revenue' ? 'default' : 'outline'} onClick={() => setSortBy('revenue')}>Por ingresos</Button>
            <span className="text-sm text-muted-foreground ml-auto">{totalUnits.toLocaleString('es-CL')} unidades · {data.products.length} productos</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b border-border/50">
                <th className="py-2">Producto</th>
                {data.columns.map((c) => <th key={c.key} className="text-right">{c.label}</th>)}
                <th className="text-right">Total</th><th className="text-right">Ingresos</th>
              </tr></thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.key} className="border-b border-border/30">
                    <td className="py-2">
                      {p.name}
                      {p.variants.length > 1 && <span className="ml-2 text-xs text-amber-400" title={p.variants.join(' + ')}>juntó {p.variants.length} nombres</span>}
                    </td>
                    {data.columns.map((c) => <td key={c.key} className="text-right">{p.byColumn[c.key] ?? '—'}</td>)}
                    <td className="text-right font-semibold">{p.units}</td>
                    <td className="text-right">{clp(p.revenue)}</td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td className="py-4 text-center text-muted-foreground" colSpan={data.columns.length + 3}>Sin resultados.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Cuentan las ventas aprobadas. Los tragos canjeados con QR (regalos o prepagados) no son ventas y no aparecen acá.</p>
        </TabsContent>

        <TabsContent value="quien" className="space-y-4 mt-4">
          <Card><CardContent className="pt-5">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground border-b border-border/50">
                <th className="py-2">Quién</th><th className="text-right">Ventas</th><th className="text-right">Total</th><th className="text-right">Promedio</th><th className="text-right">Anuladas</th>
              </tr></thead>
              <tbody>
                {data.byOperator.map((o) => (
                  <tr key={o.id ?? 'none'} className="border-b border-border/30">
                    <td className="py-2">{o.name}</td>
                    <td className="text-right">{o.sales}</td>
                    <td className="text-right font-semibold">{clp(o.total)}</td>
                    <td className="text-right">{o.sales > 0 ? clp(Math.round(o.total / o.sales)) : '—'}</td>
                    <td className="text-right">{o.voided > 0 ? `${o.voided} · ${clp(o.voidedTotal)}` : '—'}</td>
                  </tr>
                ))}
                {data.byOperator.length === 0 && <tr><td className="py-4 text-center text-muted-foreground" colSpan={5}>Sin ventas en caja.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
