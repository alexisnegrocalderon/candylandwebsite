import { useState } from 'react';
import { toast } from 'sonner';
import { Star, Send, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatChileDate, formatChileDateTime } from '@shared/chileDate';
import { SURVEY_MIN_RESPONSES_FOR_ANALYSIS } from '@shared/eventSurvey';

/* Encuesta post-fiesta (server/eventSurvey.ts): quién asistió y todavía no
 * contestó, cuántos respondieron, la nota, los comentarios SIN nombre ni
 * correo y el análisis de la IA. El envío automático es por fiesta y
 * arranca apagado: son correos a clientes reales. */

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

export function EventSurveyView() {
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  // Por defecto la fiesta más reciente que ya pasó (o la más cercana si
  // todavía no pasó ninguna): la encuesta es de una fiesta ya hecha.
  const now = Date.now();
  const defaultEvent = events.find((e: any) => new Date(e.eventDate).getTime() <= now) ?? events[0];
  const eventId = selected ?? defaultEvent?.id ?? null;
  const event = events.find((e: any) => e.id === eventId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><Star className="w-6 h-6" /> Encuestas post-fiesta</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Al día siguiente, quienes asistieron (entrada escaneada en la puerta) reciben un correo con 3 preguntas. Las respuestas se ven sin nombre ni correo.
        </p>
      </div>

      {events.length > 0 && (
        <Select value={eventId != null ? String(eventId) : undefined} onValueChange={(v) => setSelected(Number(v))}>
          <SelectTrigger className="max-w-sm"><SelectValue placeholder="Elige una fiesta" /></SelectTrigger>
          <SelectContent>
            {events.map((e: any) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileDate(e.eventDate)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {eventId != null && event && <SurveyPanel eventId={eventId} eventTitle={event.title} />}
    </div>
  );
}

function SurveyPanel({ eventId, eventTitle }: { eventId: number; eventTitle: string }) {
  const utils = trpc.useUtils();
  const query = trpc.eventSurvey.panel.useQuery({ eventId });
  const refresh = () => utils.eventSurvey.panel.invalidate({ eventId });

  const sendNow = trpc.eventSurvey.sendNow.useMutation({
    onSuccess: (r) => {
      refresh();
      toast.success(
        r.sent === 0 && r.failed === 0
          ? 'No había encuestas pendientes por mandar.'
          : `Mandadas: ${r.sent}${r.failed > 0 ? ` · fallaron ${r.failed}` : ''}${r.pending > 0 ? (r.capReached ? ` · quedan ${r.pending}: se alcanzó el cupo diario de correos, el resto sale mañana` : ` · quedan ${r.pending} (vuelve a tocar el botón)`) : ''}.`,
      );
    },
    onError,
  });
  const sendTest = trpc.eventSurvey.sendTest.useMutation({
    onSuccess: (r) => (r.success ? toast.success('Te mandé una prueba al correo del admin.') : toast.error('No se pudo mandar la prueba (¿falta la clave de correo?).')),
    onError,
  });
  const setAuto = trpc.eventSurvey.setAuto.useMutation({ onSuccess: refresh, onError });
  const analyze = trpc.eventSurvey.analyze.useMutation({
    onSuccess: () => { refresh(); toast.success('Análisis listo.'); },
    onError,
  });

  if (query.isError) {
    return (
      <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No se pudo cargar la encuesta</p>
          <p className="text-muted-foreground break-words">{query.error.message}</p>
          <p className="text-muted-foreground">Si dice que una tabla no existe, falta correr la migración 0073 en TiDB.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? 'Reintentando...' : 'Reintentar'}
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!query.data) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  const d = query.data;
  const maxBar = Math.max(1, ...d.stats.distribution);
  const analysisStale = d.analysis != null && d.stats.responses > d.analysis.basedOnResponses;
  const canAnalyze = d.stats.responses >= SURVEY_MIN_RESPONSES_FOR_ANALYSIS;

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Enviar automáticamente a esta fiesta</p>
              <p className="text-sm text-muted-foreground">
                Desde el mediodía del día siguiente, hasta 6 días después, entre 12:00 y 20:00. Respeta el cupo diario de correos automáticos (el mismo del mailing): si una fiesta es grande, sale en varios días. Solo a quienes asistieron y tienen correo real. Una sola vez por persona.
              </p>
            </div>
            <Switch checked={d.autoSend} disabled={setAuto.isPending} onCheckedChange={(enabled) => setAuto.mutate({ eventId, enabled })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <WriteButton variant="outline" onClick={() => sendTest.mutate({ eventId })} disabled={sendTest.isPending}>
              {sendTest.isPending ? 'Mandando...' : 'Mandarme una prueba'}
            </WriteButton>
            <WriteButton
              onClick={() => {
                if (window.confirm(`¿Mandar la encuesta de ${eventTitle} a quienes asistieron? Es un correo a clientes reales (un lote de 40 por vez).`)) {
                  sendNow.mutate({ eventId });
                }
              }}
              disabled={sendNow.isPending}
            >
              {sendNow.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mandando...</> : <><Send className="w-4 h-4 mr-2" /> Mandar ahora a quienes asistieron</>}
            </WriteButton>
          </div>
          <p className="text-xs text-muted-foreground">
            "Mandar ahora" prepara a todos los que asistieron a {eventTitle} y manda un lote de 40; si quedan pendientes, vuelve a tocarlo.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border p-3">
          <p className="text-xs text-muted-foreground">Invitaciones</p>
          <p className="text-2xl font-semibold">{d.invited}</p>
          <p className="text-xs text-muted-foreground">{d.sent} enviadas · {d.pending} pendientes</p>
        </div>
        <div className="rounded-2xl border p-3">
          <p className="text-xs text-muted-foreground">Respuestas</p>
          <p className="text-2xl font-semibold">{d.stats.responses}</p>
          <p className="text-xs text-muted-foreground">{d.sent > 0 ? `${Math.round((d.stats.responses / d.sent) * 100)}% de las enviadas` : '—'}</p>
        </div>
        <div className="rounded-2xl border p-3">
          <p className="text-xs text-muted-foreground">Nota promedio</p>
          <p className="text-2xl font-semibold">{d.stats.average != null ? `${d.stats.average} ★` : '—'}</p>
        </div>
        <div className="rounded-2xl border p-3 col-span-2 sm:col-span-1">
          <p className="mb-1 text-xs text-muted-foreground">Cómo se repartió</p>
          {[5, 4, 3, 2, 1].map((star) => (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-3">{star}</span>
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(d.stats.distribution[star - 1] / maxBar) * 100}%` }} />
              </div>
              <span className="w-5 text-right text-muted-foreground">{d.stats.distribution[star - 1]}</span>
            </div>
          ))}
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="w-4 h-4" /> Análisis de la IA</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {d.analysis ? (
            <>
              <p className="text-xs text-muted-foreground">
                {formatChileDateTime(d.analysis.generatedAt)} · con {d.analysis.basedOnResponses} respuestas
                {analysisStale && <span className="text-amber-600"> · llegaron más respuestas, genéralo de nuevo</span>}
              </p>
              <p className="text-sm">{d.analysis.summary}</p>
              <AnalysisList title="Lo que más les gustó" items={d.analysis.praised} />
              <AnalysisList title="Quejas que se repiten" items={d.analysis.complaints} />
              <AnalysisList title="Para mejorar la próxima" items={d.analysis.improvements} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {canAnalyze ? 'Todavía no hay análisis.' : `Con ${SURVEY_MIN_RESPONSES_FOR_ANALYSIS} respuestas o más puedes pedirle a la IA que las resuma.`}
            </p>
          )}
          <WriteButton variant="outline" onClick={() => analyze.mutate({ eventId })} disabled={!canAnalyze || analyze.isPending}>
            {analyze.isPending ? 'Analizando (puede tardar un minuto)...' : d.analysis ? 'Generar de nuevo' : 'Analizar con IA'}
          </WriteButton>
        </CardContent>
      </Card>

      {d.comments.length > 0 && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardHeader><CardTitle className="text-base">Comentarios ({d.comments.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {d.comments.map((c, i) => (
              <div key={i} className="rounded-2xl border p-3 space-y-1.5 text-sm">
                <p className="text-xs text-muted-foreground">{'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)} · {formatChileDateTime(c.respondedAt)}</p>
                {c.liked && <p><span className="font-medium">Le gustó:</span> {c.liked}</p>}
                {c.improve && <p><span className="font-medium">Mejoraría:</span> {c.improve}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}
