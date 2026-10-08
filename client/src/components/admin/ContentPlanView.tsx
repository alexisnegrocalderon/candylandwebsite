import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Sparkles, AlertTriangle, Loader2, Copy, Palette } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatChileDate, formatChileDateTime } from '@shared/chileDate';
import { normalizeContentPlan, type ContentGoal, type ContentPiece, type ContentPlan } from '@shared/contentPlan';
import { designFromPiece } from '@shared/contentStudio';
import { openInStudio } from '@/components/admin/studio/handoff';

/* Plan de contenido para Instagram (server/contentPlanner.ts): el calendario
 * de publicaciones hasta el próximo evento, con el texto listo para copiar.
 * No publica nada. El servidor no guarda el plan: se recuerda el último de
 * cada evento en ESTE navegador, para que no se pierda al recargar. */

const STORAGE_PREFIX = 'admin-content-plan-';

const GOAL_LABEL: Record<ContentGoal, { label: string; className: string }> = {
  awareness: { label: 'Que nos conozcan', className: 'bg-sky-500/10 text-sky-600' },
  confianza: { label: 'Dar confianza', className: 'bg-violet-500/10 text-violet-600' },
  interaccion: { label: 'Que participen', className: 'bg-pink-500/10 text-pink-600' },
  urgencia: { label: 'Urgencia real', className: 'bg-amber-500/10 text-amber-600' },
  conversion: { label: 'Empujar a comprar', className: 'bg-emerald-500/10 text-emerald-600' },
};

const FORMAT_LABEL = { post: 'Post', reel: 'Reel', historia: 'Historia', carrusel: 'Carrusel' } as const;

function loadPlan(eventId: number): ContentPlan | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${eventId}`);
    return raw ? normalizeContentPlan(JSON.parse(raw)) : null;
  } catch {
    return null; // sin localStorage o contenido roto: se parte de cero
  }
}

function savePlan(plan: ContentPlan) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${plan.eventId}`, JSON.stringify(plan));
  } catch { /* sin localStorage: el plan igual se ve en esta sesión */ }
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  } catch {
    toast.error('No se pudo copiar. Mantén apretado el texto para copiarlo a mano.');
  }
}

export function ContentPlanView() {
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const upcoming = (eventsData ?? []).filter((e: any) => new Date(e.eventDate).getTime() > Date.now() && e.status === 'published');
  const [selected, setSelected] = useState<number | null>(null);
  const eventId = selected ?? upcoming[0]?.id ?? null;
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [focus, setFocus] = useState('');

  useEffect(() => {
    setPlan(eventId != null ? loadPlan(eventId) : null);
  }, [eventId]);

  const generate = trpc.contentPlan.generate.useMutation({
    onSuccess: (result) => {
      const clean = normalizeContentPlan(result);
      if (clean) { setPlan(clean); savePlan(clean); toast.success('Plan listo.'); }
    },
    onError: (error) => toast.error(error.message),
  });

  // Agrupadas por día, en orden.
  const days: { date: string; pieces: ContentPiece[] }[] = [];
  for (const piece of plan?.pieces ?? []) {
    const last = days[days.length - 1];
    if (last && last.date === piece.date) last.pieces.push(piece);
    else days.push({ date: piece.date, pieces: [piece] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><CalendarDays className="w-6 h-6" /> Plan de contenido</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Un calendario de publicaciones de Instagram hasta el próximo evento, con el texto listo para copiar, qué grabar y a qué hora publicar.
          Usa los datos reales del evento y el tono del agente. No publica nada: es un borrador para ti.
        </p>
      </div>

      {upcoming.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 text-sm text-muted-foreground">No hay ningún evento publicado por venir.</CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 1 && (
            <div className="space-y-1.5">
              <Label>Planificar para</Label>
              <Select value={eventId != null ? String(eventId) : undefined} onValueChange={(v) => setSelected(Number(v))}>
                <SelectTrigger className="max-w-sm"><SelectValue placeholder="Elige un evento" /></SelectTrigger>
                <SelectContent>
                  {upcoming.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileDate(e.eventDate)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="content-focus">¿Algo en particular para este plan? <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              id="content-focus"
              rows={2}
              maxLength={500}
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Ej: 2 desafíos tipo quiz como el de '¿Sabes jugar en Playroom?', algo para los que ya vinieron, más contenido sobre primera vez…"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <WriteButton onClick={() => generate.mutate({ targetEventId: eventId ?? undefined, focus: focus.trim() || undefined })} disabled={generate.isPending || eventId == null}>
              {generate.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Armando el plan (puede tardar un minuto)...</>
                : <><Sparkles className="w-4 h-4 mr-2" /> {plan ? 'Generar de nuevo' : 'Generar el plan'}</>}
            </WriteButton>
            {plan && <span className="text-xs text-muted-foreground">Último: {formatChileDateTime(plan.generatedAt)} · queda guardado en este navegador</span>}
          </div>

          {plan && (
            <>
              <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
                <CardHeader><CardTitle className="text-base">{plan.eventTitle} · {plan.pieces.length} publicaciones</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm">{plan.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Del {formatChileDate(`${plan.from}T15:00:00Z`)} al {formatChileDate(`${plan.to}T15:00:00Z`)}. Las historias con palabra clave usan automatizaciones que ya tienes activas.
                  </p>
                </CardContent>
              </Card>

              {days.map((day) => (
                <div key={day.date} className="space-y-3">
                  <h3 className="font-medium capitalize">{formatChileDate(`${day.date}T15:00:00Z`, { withWeekday: true })}</h3>
                  {day.pieces.map((p, i) => <PieceCard key={`${day.date}-${i}`} piece={p} eventId={plan.eventId} />)}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

function PieceCard({ piece, eventId }: { piece: ContentPiece; eventId: number }) {
  const goal = GOAL_LABEL[piece.goal];
  const fullText = [piece.caption, piece.hashtags.join(' ')].filter(Boolean).join('\n\n');
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{FORMAT_LABEL[piece.format]}</span>
          <span className="rounded-full bg-muted px-2 py-0.5">{piece.time} hrs</span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${goal.className}`}>{goal.label}</span>
          {piece.keyword && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">Palabra clave: {piece.keyword}</span>}
        </div>
        <p className="font-medium">{piece.hook}</p>
        {piece.slides.length > 0 && (
          <ol className="space-y-1.5 rounded-xl border p-3 text-sm">
            {piece.slides.map((slide, i) => (
              <li key={i} className="flex gap-2"><span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">Lámina {i + 1}</span><span className="whitespace-pre-wrap">{slide}</span></li>
            ))}
          </ol>
        )}
        <p className="whitespace-pre-wrap text-sm">{piece.caption}</p>
        {piece.interaction && (
          <p className="rounded-xl bg-pink-500/5 p-3 text-sm"><span className="font-medium">Qué le pides a la gente:</span> {piece.interaction}</p>
        )}
        {piece.hashtags.length > 0 && <p className="text-sm text-muted-foreground">{piece.hashtags.join(' ')}</p>}
        {piece.visual && (
          <p className="rounded-xl bg-muted/40 p-3 text-sm"><span className="font-medium">Qué grabar:</span> {piece.visual}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => copyText(fullText, 'Texto')}>
            <Copy className="mr-2 h-4 w-4" /> Copiar el texto
          </Button>
          {piece.slides.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => copyText(piece.slides.map((slide, i) => `Lámina ${i + 1}: ${slide}`).join('\n\n'), 'Las láminas')}>
              <Copy className="mr-2 h-4 w-4" /> Copiar las láminas
            </Button>
          )}
          {/* Un reel se graba con el celular; acá solo se le puede hacer la portada. */}
          <Button variant="outline" size="sm" onClick={() => openInStudio(designFromPiece(piece, eventId))}>
            <Palette className="mr-2 h-4 w-4" /> {piece.format === 'reel' ? 'Portada en Estudio' : 'Abrir en Estudio'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
