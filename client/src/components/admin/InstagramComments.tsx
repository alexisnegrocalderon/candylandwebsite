import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle, Check, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/admin/EmptyState';
import { formatChileDateTime } from '@shared/chileDate';

/* Comentarios públicos del Instagram: la IA deja un borrador y NADA sale sin
 * que el dueño lo apruebe (server/instagramComments.ts). */

const FILTERS = [
  { value: 'pending', label: 'Por aprobar' },
  { value: 'sent', label: 'Respondidos' },
  { value: 'hidden', label: 'Spam oculto' },
  { value: 'discarded', label: 'Descartados' },
  { value: 'failed', label: 'Con error' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const CATEGORY_LABEL: Record<string, string> = {
  spam: 'Spam', emoji: 'Solo emojis', praise: 'Elogio', question: 'Pregunta', sensitive: 'Delicado', other: 'Comentario',
};

/** Qué botón acompaña al DM, en palabras simples. */
function buttonLabel(choice: string | null): string {
  if (!choice || choice === 'buy') return '(con botón a las entradas)';
  if (choice.startsWith('page:')) return `(con botón a ${choice.slice(5)})`;
  return '(sin botón)';
}

const onError = (error: unknown) => {
  toast.error(error instanceof Error ? error.message : 'No se pudo completar la acción.');
};

export function InstagramComments({ focusId = null }: { focusId?: number | null }) {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<Filter | 'all'>('pending');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [dmEdits, setDmEdits] = useState<Record<number, string>>({});
  const { data: config } = trpc.instagram.getConfig.useQuery();
  const { data: comments, isLoading } = trpc.instagramComments.list.useQuery({ status: filter });
  const refresh = () => { void utils.instagramComments.list.invalidate(); void utils.instagramComments.pendingCount.invalidate(); };
  const settings = trpc.instagramComments.setSettings.useMutation({
    onSuccess: () => { void utils.instagram.getConfig.invalidate(); toast.success('Guardado'); },
    onError,
  });
  const approve = trpc.instagramComments.approve.useMutation({
    onSuccess: (r) => { toast.success(r.dmSent ? 'Publicado y mensaje enviado' : 'Publicado'); refresh(); },
    onError: (e) => { onError(e); refresh(); },
  });
  const discard = trpc.instagramComments.discard.useMutation({ onSuccess: refresh, onError });

  // Llegó desde el aviso de un comentario: lo busca, lo muestra y lo resalta.
  const [highlight, setHighlight] = useState<number | null>(null);
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!focusId || !comments || handled.current === focusId) return;
    if (!comments.some((c) => c.id === focusId)) {
      if (filter !== 'all') setFilter('all');
      return;
    }
    handled.current = focusId;
    setHighlight(focusId);
    document.getElementById(`ig-comment-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => setHighlight(null), 4000);
  }, [focusId, comments, filter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Respuestas a comentarios</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La IA escribe un borrador por cada comentario y tú decides: publicas, editas o descartas. Nada sale solo.
            Si un comentario calza con una palabra de Automatizaciones, se manda esa campaña y no aparece aquí.
          </p>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ig-comments-enabled">Preparar borradores de comentarios</Label>
            <Switch id="ig-comments-enabled" checked={config?.commentsEnabled ?? false} disabled={!config || settings.isPending}
              onCheckedChange={(commentsEnabled) => settings.mutate({ commentsEnabled, hideSpam: config?.hideSpam ?? true })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ig-comments-spam">Ocultar el spam evidente</Label>
            <Switch id="ig-comments-spam" checked={config?.hideSpam ?? true} disabled={!config || settings.isPending}
              onCheckedChange={(hideSpam) => settings.mutate({ commentsEnabled: config?.commentsEnabled ?? false, hideSpam })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'} onClick={() => setFilter(f.value)}>{f.label}</Button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando...</p>
        : !comments || comments.length === 0 ? <EmptyState icon={MessageCircle} title="Sin comentarios aquí" description="Cuando lleguen, aparecerán con un borrador para aprobar." />
        : comments.map((c) => {
          const value = edits[c.id] ?? c.finalReply ?? c.draftReply ?? '';
          const pending = c.status === 'pending' || c.status === 'failed';
          return (
            <Card key={c.id} id={`ig-comment-${c.id}`} className={highlight === c.id ? 'ring-2 ring-primary transition-shadow' : 'transition-shadow'}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{c.username ? `@${c.username}` : 'Instagram'} · {CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <span>{formatChileDateTime(c.createdAt)}</span>
                </div>
                {c.post && (
                  <a href={c.post.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-muted/50 p-1.5 text-xs text-muted-foreground">
                    {c.post.thumbnail ? <img src={c.post.thumbnail} alt="" className="h-9 w-9 rounded-md object-cover" loading="lazy" /> : null}
                    <span className="truncate">En: {c.post.caption || 'tu publicación'}</span>
                  </a>
                )}
                <p className="text-sm whitespace-pre-wrap">"{c.text}"</p>
                {c.error ? <p className="text-xs text-destructive">{c.error}</p> : null}
                {pending ? (
                  <>
                    <Textarea value={value} rows={2} placeholder={c.category === 'sensitive' ? 'Tema delicado: escribe tú la respuesta' : 'Escribe la respuesta'}
                      onChange={(e) => setEdits({ ...edits, [c.id]: e.target.value })} />
                    {c.draftDm ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Mensaje privado {buttonLabel(c.dmButton)}</p>
                        <Textarea value={dmEdits[c.id] ?? c.draftDm} rows={3}
                          onChange={(e) => setDmEdits({ ...dmEdits, [c.id]: e.target.value })} />
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <Button className="flex-1 min-h-11" disabled={!value.trim() || approve.isPending} onClick={() => approve.mutate({ id: c.id, reply: value, ...(c.draftDm ? { dm: dmEdits[c.id] ?? c.draftDm } : {}) })}>
                        <Check className="w-4 h-4 mr-1" /> Publicar
                      </Button>
                      <Button variant="outline" className="min-h-11" disabled={discard.isPending} onClick={() => discard.mutate({ id: c.id })}>
                        <X className="w-4 h-4 mr-1" /> Descartar
                      </Button>
                    </div>
                  </>
                ) : c.finalReply ? <p className="text-sm rounded bg-muted p-2">Respondiste: {c.finalReply}</p> : null}
              </CardContent>
            </Card>
          );
        })}
    </div>
  );
}
