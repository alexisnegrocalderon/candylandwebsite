import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, ChevronDown, Clapperboard, Copy, Loader2, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Textarea } from '@/components/ui/textarea';
import { formatChileDate, formatChileDateTime } from '@shared/chileDate';
import type { ContentGoal, ContentPiece } from '@shared/contentPlan';
import { MOTION_STYLE_LABEL, MOTION_TEMPLATE_LABEL } from '@shared/motionSpec';

/* El plan de contenido, dentro del Estudio: calendario de publicaciones hasta
 * el evento (server/contentPlanner.ts), guardado en el servidor. Cada pieza
 * que puede ser video trae su plantilla y estilo sugeridos, y «Crear video»
 * la manda directo a la IA del Estudio. */

const GOAL: Record<ContentGoal, { label: string; className: string }> = {
  awareness: { label: 'Que nos conozcan', className: 'bg-sky-500/10 text-sky-700' },
  confianza: { label: 'Dar confianza', className: 'bg-violet-500/10 text-violet-700' },
  interaccion: { label: 'Que participen', className: 'bg-pink-500/10 text-pink-700' },
  urgencia: { label: 'Urgencia real', className: 'bg-amber-500/10 text-amber-700' },
  conversion: { label: 'Empujar a comprar', className: 'bg-emerald-500/10 text-emerald-700' },
};
const FORMAT = { post: 'Post', reel: 'Reel', historia: 'Historia', carrusel: 'Carrusel' } as const;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado.');
  } catch {
    toast.error('No se pudo copiar.');
  }
}

export function PlanPanel({ eventId, onCreateVideo, busy }: { eventId: number | null; onCreateVideo: (piece: ContentPiece) => void; busy: boolean }) {
  const utils = trpc.useUtils();
  const [focus, setFocus] = useState('');
  const { data: plan, isLoading } = trpc.contentPlan.get.useQuery({ eventId }, { enabled: eventId != null });
  const generate = trpc.contentPlan.generate.useMutation({
    onSuccess: () => { utils.contentPlan.get.invalidate(); toast.success('Plan listo.'); },
    onError: (e) => toast.error(e.message),
  });

  if (eventId == null) return <p className="text-sm text-muted-foreground">Elige un evento para planificar.</p>;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea rows={2} maxLength={500} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="¿Algo en particular? Ej: 2 desafíos tipo quiz, algo para los que ya vinieron…" />
        <WriteButton className="w-full" disabled={generate.isPending} onClick={() => generate.mutate({ targetEventId: eventId, focus: focus.trim() || undefined })}>
          {generate.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Armando el plan (~1 min)…</> : <><Sparkles className="mr-2 h-4 w-4" /> {plan ? 'Generar de nuevo' : 'Generar el plan'}</>}
        </WriteButton>
        {plan && <p className="text-[11px] text-muted-foreground">Guardado · {formatChileDateTime(plan.generatedAt)}</p>}
      </div>

      {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />}
      {plan && (
        <>
          <p className="rounded-xl bg-muted/50 p-3 text-sm">{plan.summary}</p>
          <ol className="space-y-2">
            {plan.pieces.map((p, i) => <PieceRow key={`${p.date}-${i}`} piece={p} onCreateVideo={onCreateVideo} busy={busy} />)}
          </ol>
        </>
      )}
    </div>
  );
}

function PieceRow({ piece, onCreateVideo, busy }: { piece: ContentPiece; onCreateVideo: (p: ContentPiece) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const goal = GOAL[piece.goal];
  return (
    <li className="rounded-xl border bg-card p-3">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-medium capitalize">{formatChileDate(`${piece.date}T15:00:00Z`, { withWeekday: true })}</span>
            <span className="rounded-full bg-muted px-1.5">{FORMAT[piece.format]} · {piece.time}</span>
            <span className={`rounded-full px-1.5 ${goal.className}`}>{goal.label}</span>
          </div>
          <p className="mt-1 text-sm font-medium leading-snug">{piece.hook}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm">
          {piece.slides.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 text-xs">{piece.slides.map((s, k) => <li key={k}>{s}</li>)}</ol>
          )}
          <p className="whitespace-pre-wrap text-xs">{piece.caption}</p>
          {piece.interaction && <p className="rounded-lg bg-pink-500/5 p-2 text-xs"><b>Qué pedir:</b> {piece.interaction}</p>}
          {piece.visual && <p className="rounded-lg bg-muted/50 p-2 text-xs"><b>Qué grabar:</b> {piece.visual}</p>}
          {piece.hashtags.length > 0 && <p className="text-xs text-muted-foreground">{piece.hashtags.join(' ')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => copyText([piece.caption, piece.hashtags.join(' ')].filter(Boolean).join('\n\n'))}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Copiar texto
            </Button>
            {piece.format !== 'carrusel' && (
              <WriteButton size="sm" disabled={busy} onClick={() => onCreateVideo(piece)}>
                <Clapperboard className="mr-1 h-3.5 w-3.5" /> Crear video
                {piece.motion && <span className="ml-1 opacity-70">· {MOTION_TEMPLATE_LABEL[piece.motion.template]} / {MOTION_STYLE_LABEL[piece.motion.style]}</span>}
              </WriteButton>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
