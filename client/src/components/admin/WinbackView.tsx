import { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, AlertTriangle, Loader2, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatChileDate } from '@shared/chileDate';
import { winbackDaysToSend, type WinbackSegmentKey } from '@shared/winback';

/* Reactivación de clientes (server/winback.ts): los grupos de gente que ya
 * compró alguna fiesta, un correo redactado por la IA para cada uno (editable)
 * y la campaña en la cola del mailing. Redactar no manda nada; crear la
 * campaña sí la deja en la cola, que sale de a poco bajo el tope diario. */

type Draft = {
  subject: string;
  preheader?: string;
  headline: string;
  paragraphs: string[];
  ctaText?: string;
  highlightLabel?: string;
  highlightValue?: string;
};

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

export function WinbackView() {
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const upcoming = (eventsData ?? []).filter((e: any) => new Date(e.eventDate).getTime() > Date.now() && e.status === 'published');
  const [selected, setSelected] = useState<number | null>(null);
  const targetEventId = selected ?? undefined;
  const query = trpc.winback.overview.useQuery({ targetEventId }, { retry: false });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><Users className="w-6 h-6" /> Reactivar clientes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Agrupa a quienes ya compraron alguna fiesta y te deja un correo distinto para cada grupo, escrito por la IA con los datos reales del próximo evento.
          Tú lo revisas y lo editas antes de crear nada.
        </p>
      </div>

      {upcoming.length > 1 && (
        <div className="space-y-1.5">
          <Label>Invitarlos a</Label>
          <Select value={selected != null ? String(selected) : String(query.data?.event.id ?? '')} onValueChange={(v) => setSelected(Number(v))}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Elige un evento" /></SelectTrigger>
            <SelectContent>
              {upcoming.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileDate(e.eventDate)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {query.isError ? (
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
          <CardContent className="space-y-3 pt-6 text-sm">
            <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No se pudieron armar los grupos</p>
            <p className="text-muted-foreground break-words">{query.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? 'Reintentando...' : 'Reintentar'}
            </Button>
          </CardContent>
        </Card>
      ) : !query.data ? (
        <p className="text-sm text-muted-foreground">Armando los grupos...</p>
      ) : (
        <>
          <p className="text-sm">
            Próximo evento: <strong>{query.data.event.title}</strong> · {formatChileDate(query.data.event.eventDate)}
            {query.data.latestPastEvent && <> · última fiesta: <strong>{query.data.latestPastEvent}</strong></>}
          </p>
          <p className="text-xs text-muted-foreground">
            {query.data.alreadyBought} {query.data.alreadyBought === 1 ? 'persona ya compró' : 'personas ya compraron'} este evento y quedan fuera de todos los grupos.
            Cada persona está en un solo grupo, para no escribirle dos veces.
          </p>
          <div className="space-y-4">
            {query.data.segments.map((segment) => (
              <SegmentCard
                key={segment.key}
                segment={segment}
                targetEventId={query.data.event.id}
                eventTitle={query.data.event.title}
                dailyCap={query.data.dailyCap}
                onCreated={() => query.refetch()}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SegmentCard(props: {
  segment: { key: WinbackSegmentKey; label: string; description: string; count: number };
  targetEventId: number;
  eventTitle: string;
  dailyCap: number;
  onCreated: () => void;
}) {
  const { segment, targetEventId, eventTitle, dailyCap } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [created, setCreated] = useState<{ recipients: number; days: number } | null>(null);

  const redact = trpc.winback.draft.useMutation({
    onSuccess: (content) => { setDraft(content as Draft); setPreviewHtml(null); },
    onError,
  });
  const preview = trpc.mailing.renderPreview.useMutation({ onSuccess: (r) => setPreviewHtml(r.html), onError });
  const create = trpc.winback.createCampaign.useMutation({
    onSuccess: (r) => {
      setCreated({ recipients: r.recipients, days: r.days });
      toast.success('Campaña creada: queda en la cola del mailing.');
      props.onCreated();
    },
    onError,
  });

  const days = winbackDaysToSend(segment.count, dailyCap);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>{segment.label}</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold text-primary">{segment.count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{segment.description}</p>

        {created ? (
          <p className="text-sm rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
            ✅ Campaña creada para {created.recipients} personas. Sale de a poco (hasta {dailyCap} correos automáticos por día entre todas las campañas): unos {created.days} {created.days === 1 ? 'día' : 'días'}.
            Puedes seguirla o cancelarla en <strong>Historial de Mailing</strong>.
          </p>
        ) : segment.count === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie en este grupo por ahora.</p>
        ) : !draft ? (
          <WriteButton variant="outline" onClick={() => redact.mutate({ segmentKey: segment.key, targetEventId })} disabled={redact.isPending}>
            {redact.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redactando...</> : <><Sparkles className="w-4 h-4 mr-2" /> Redactar el correo con IA</>}
          </WriteButton>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Asunto</Label>
              <Input value={draft.subject} maxLength={90} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Título dentro del correo</Label>
              <Input value={draft.headline} maxLength={80} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
            </div>
            {draft.paragraphs.map((p, i) => (
              <div key={i} className="space-y-1.5">
                <Label>Párrafo {i + 1}</Label>
                <Textarea rows={3} maxLength={500} value={p} onChange={(e) => setDraft({ ...draft, paragraphs: draft.paragraphs.map((x, j) => (j === i ? e.target.value : x)) })} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Texto del botón</Label>
              <Input value={draft.ctaText ?? ''} maxLength={40} onChange={(e) => setDraft({ ...draft, ctaText: e.target.value })} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={preview.isPending}
                onClick={() => preview.mutate({ content: draft, ctaUrl: 'https://mansionplayroom.cl', sampleName: 'Camila', eventSections: { banner: false, details: false, mission300: false, venueGrid: false } })}
              >
                {preview.isPending ? 'Armando...' : 'Ver cómo queda'}
              </Button>
              <Button variant="ghost" onClick={() => redact.mutate({ segmentKey: segment.key, targetEventId })} disabled={redact.isPending}>
                {redact.isPending ? 'Redactando...' : 'Redactar de nuevo'}
              </Button>
            </div>
            {previewHtml && <iframe title={`Vista previa ${segment.label}`} srcDoc={previewHtml} className="h-96 w-full rounded-xl border border-border/50 bg-white" />}

            <div className="rounded-xl border p-3 space-y-2">
              <p className="text-sm">
                Al crearla, <strong>{segment.count} personas</strong> entran a la cola del mailing. Sale de a poco (~{days} {days === 1 ? 'día' : 'días'}) y quien compre {eventTitle} mientras espera se saltea solo.
              </p>
              <WriteButton
                disabled={create.isPending || draft.paragraphs.some((p) => p.trim().length < 4) || draft.subject.trim().length < 4 || draft.headline.trim().length < 4}
                onClick={() => {
                  if (window.confirm(`¿Crear la campaña "${segment.label}" para ${segment.count} personas? Son correos a clientes reales.`)) {
                    create.mutate({ segmentKey: segment.key, targetEventId, content: draft });
                  }
                }}
              >
                {create.isPending ? 'Creando...' : `Crear campaña para ${segment.count} personas`}
              </WriteButton>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
