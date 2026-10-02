import { toast } from 'sonner';
import { Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatChileDateTime } from '@shared/chileDate';
import type { SalesStrategyRecommendation } from '@shared/salesStrategy';

/* Director comercial IA (server/salesStrategist.ts): el último reporte de
 * estrategia de ventas del próximo evento, con botón para generarlo ya y el
 * interruptor del correo de los lunes. Los números los calcula el servidor;
 * la IA solo los interpreta y recomienda. */

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

const URGENCY: Record<SalesStrategyRecommendation['urgency'], { label: string; className: string }> = {
  alta: { label: 'Alta', className: 'bg-red-500/10 text-red-600' },
  media: { label: 'Media', className: 'bg-amber-500/10 text-amber-600' },
  baja: { label: 'Baja', className: 'bg-emerald-500/10 text-emerald-600' },
};

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export function SalesStrategyView() {
  const utils = trpc.useUtils();
  const query = trpc.salesStrategy.get.useQuery();
  const run = trpc.salesStrategy.run.useMutation({
    onSuccess: (result) => {
      if (result.ran) {
        utils.salesStrategy.get.invalidate();
        toast.success('Reporte listo.');
      } else {
        toast.info(`No se generó: ${result.reason ?? 'sin datos'}.`);
      }
    },
    onError,
  });
  const setWeekly = trpc.salesStrategy.setWeekly.useMutation({
    onSuccess: () => utils.salesStrategy.get.invalidate(),
    onError,
  });

  // Nunca una pantalla vacía en silencio (mismo criterio que la config del
  // agente de Instagram): si la consulta falla, se ve el error y se puede
  // reintentar.
  if (query.isError) {
    return (
      <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No se pudo cargar el Director comercial</p>
          <p className="text-muted-foreground break-words">{query.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? 'Reintentando...' : 'Reintentar'}
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!query.data) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  const { report, weeklyEnabled } = query.data;
  const n = report?.numbers;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><Sparkles className="w-6 h-6" /> Director comercial</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Compara las ventas del próximo evento con el anterior, proyecta cuántas entradas se van a vender y te dice qué hacer esta semana.
        </p>
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="flex items-start justify-between gap-4 pt-6">
          <div>
            <p className="font-medium">Correo los lunes a las 09:00</p>
            <p className="text-sm text-muted-foreground">Te llega el reporte solo, sin que tengas que entrar al panel.</p>
          </div>
          <Switch
            checked={weeklyEnabled}
            disabled={setWeekly.isPending}
            onCheckedChange={(enabled) => setWeekly.mutate({ enabled })}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <WriteButton onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analizando (puede tardar un minuto)...</>
            : <><Sparkles className="w-4 h-4 mr-2" /> {report ? 'Generar de nuevo' : 'Generar ahora'}</>}
        </WriteButton>
        {report && <span className="text-xs text-muted-foreground">Último: {formatChileDateTime(report.generatedAt)}</span>}
      </div>

      {!report || !n ? (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Todavía no hay reporte. Se genera solo los lunes, o puedes generarlo ahora.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardHeader>
              <CardTitle className="text-base">{report.eventTitle} · faltan {report.daysOut} días</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border p-3">
                  <p className="text-xs text-muted-foreground">Entradas vendidas</p>
                  <p className="text-2xl font-semibold">{n.unitsSold}</p>
                  <p className="text-xs text-muted-foreground">{clp(n.revenue)}</p>
                </div>
                <div className="rounded-2xl border p-3">
                  <p className="text-xs text-muted-foreground">Últimos 7 días</p>
                  <p className="text-2xl font-semibold">{n.unitsLast7}</p>
                  <p className="text-xs text-muted-foreground">antes: {n.unitsPrev7}</p>
                </div>
                <div className="rounded-2xl border p-3">
                  <p className="text-xs text-muted-foreground">Proyección al cierre</p>
                  <p className="text-2xl font-semibold">{n.projectedFinalUnits ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.projectionMethod === 'comparado' ? 'según el evento anterior' : n.projectionMethod === 'ritmo' ? 'solo por ritmo (conservadora)' : 'sin base todavía'}
                  </p>
                </div>
                <div className="rounded-2xl border p-3">
                  <p className="text-xs text-muted-foreground">Evento anterior</p>
                  <p className="text-2xl font-semibold">{n.previousEvent ? n.previousEvent.finalUnits : '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.previousEvent ? `a esta fecha llevaba ${n.previousEvent.unitsAtSameDaysOut}` : 'sin comparación'}
                  </p>
                </div>
              </div>
              <p className="text-sm">{report.summary}</p>
            </CardContent>
          </Card>

          {report.recommendations.length > 0 && (
            <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
              <CardHeader><CardTitle className="text-base">Qué hacer esta semana</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {report.recommendations.map((r, i) => (
                  <div key={i} className="rounded-2xl border p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{r.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${URGENCY[r.urgency].className}`}>
                        {URGENCY[r.urgency].label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.why}</p>
                    <p className="text-sm"><span className="font-medium">Cómo:</span> {r.action}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {report.risks.length > 0 && (
            <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Ojo con</CardTitle></CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {report.risks.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
