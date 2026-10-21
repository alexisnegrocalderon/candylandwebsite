import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { WriteButton } from '@/components/admin/WriteButton';
import { describeSegment, normalizeSegment } from '@shared/pushSegments';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-muted text-muted-foreground' },
  scheduled: { label: 'Programada', cls: 'bg-sky-500/15 text-sky-300' },
  sending: { label: 'Enviando', cls: 'bg-amber-500/15 text-amber-300' },
  sent: { label: 'Enviada', cls: 'bg-emerald-500/15 text-emerald-300' },
  cancelled: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground line-through' },
};
const KIND: Record<string, string> = { manual: '', recordatorio: 'Recordatorio', evento: 'Nuevo evento', preventa: 'Preventa' };

const fmt = (d: string | Date | null) => d ? new Date(d).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** Historial de campañas push (manuales y automáticas) con sus números. */
export function PushHistory({ onEdit }: { onEdit: (c: any) => void }) {
  const { data, refetch } = trpc.customerPush.campaigns.useQuery();
  const { data: events } = trpc.events.listAll.useQuery();
  const cancel = trpc.customerPush.cancel.useMutation({ onSuccess: () => refetch() });
  const send = trpc.customerPush.send.useMutation({
    onSuccess: (r) => { toast.success(`Enviado a ${r.sent} de ${r.targeted} dispositivos`); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const eventName = (id: number) => (events ?? []).find((e: any) => e.id === id)?.title;
  const list = (data ?? []) as any[];

  if (list.length === 0) return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no hay campañas. Arma la primera en «Enviar».</div>;
  return (
    <div className="space-y-2">
      {list.map((c) => {
        const st = STATUS[c.status] ?? STATUS.draft;
        const open = c.status === 'draft' || c.status === 'scheduled';
        const ctr = c.sent ? Math.round((c.clicks / c.sent) * 100) : 0;
        return (
          <div key={c.id} className="rounded-2xl border border-border bg-card/60 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <button type="button" disabled={!open} onClick={() => onEdit(c)} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <p className="flex items-center gap-2">
                  <span className="truncate font-semibold">{c.title}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                  {KIND[c.kind] && <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">{KIND[c.kind]}</span>}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {describeSegment(normalizeSegment(c.segment), eventName)} · {c.status === 'sent' ? `enviada ${fmt(c.sentAt)}` : c.status === 'scheduled' ? `sale ${fmt(c.scheduledAt)}` : `creada ${fmt(c.createdAt)}`}
                </p>
              </button>
              {c.status === 'sent' ? (
                <div className="flex shrink-0 gap-4 text-right text-xs">
                  <div><p className="text-base font-bold tabular-nums">{c.sent}</p><p className="text-muted-foreground">enviados</p></div>
                  <div><p className="text-base font-bold tabular-nums">{c.clicks}</p><p className="text-muted-foreground">toques ({ctr}%)</p></div>
                  {c.failed > 0 && <div><p className="text-base font-bold tabular-nums text-amber-300">{c.failed}</p><p className="text-muted-foreground">fallidos</p></div>}
                </div>
              ) : open && (
                <div className="flex shrink-0 justify-end gap-1.5">
                  <WriteButton size="sm" disabled={send.isPending} onClick={() => window.confirm('¿Enviar ahora?') && send.mutate({ id: c.id })}>Enviar ahora</WriteButton>
                  <WriteButton size="sm" variant="outline" onClick={() => cancel.mutate({ id: c.id })}>Cancelar</WriteButton>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
