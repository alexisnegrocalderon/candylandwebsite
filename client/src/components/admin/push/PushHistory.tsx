import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { describeSegment, normalizeSegment } from '@shared/pushSegments';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Borrador', cls: 'bg-muted text-muted-foreground' },
  scheduled: { label: 'Programada', cls: 'bg-sky-500/15 text-sky-300' },
  testing: { label: 'Probando A/B', cls: 'bg-violet-500/15 text-violet-300' },
  sending: { label: 'Enviando', cls: 'bg-amber-500/15 text-amber-300' },
  sent: { label: 'Enviada', cls: 'bg-emerald-500/15 text-emerald-300' },
  cancelled: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground line-through' },
};
const KIND: Record<string, string> = {
  manual: '', recordatorio: 'Recordatorio', evento: 'Nuevo evento', preventa: 'Preventa', pocos_cupos: 'Pocos cupos', reactivacion: 'Reactivación',
  cumpleanos: 'Cumpleaños', gracias: 'Gracias', saldo: 'Saldo',
};

const fmt = (d: string | Date | null) => d ? new Date(d).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** Historial de campañas push (manuales y automáticas) con sus números en vivo. */
export function PushHistory({ onEdit }: { onEdit: (c: any) => void }) {
  const { data, refetch } = trpc.customerPush.campaigns.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: events } = trpc.events.listAll.useQuery();
  const cancel = trpc.customerPush.cancel.useMutation({ onSuccess: () => refetch() });
  const send = trpc.customerPush.send.useMutation({
    onSuccess: (r) => { toast.success(`${r.sentNow} enviados ahora${r.later ? `, ${r.later} más a su hora` : ''}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const list = (data ?? []) as any[];
  const names = {
    event: (id: number) => (events ?? []).find((e: any) => e.id === id)?.title,
    campaign: (id: number) => list.find((c) => c.id === id)?.title,
  };

  if (list.length === 0) return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no hay campañas. Arma la primera en «Enviar».</div>;
  return (
    <div className="space-y-2">
      {list.map((c) => {
        const st = STATUS[c.status] ?? STATUS.draft;
        const open = c.status === 'draft' || c.status === 'scheduled';
        const s = c.stats;
        const running = c.status === 'sending' || c.status === 'testing';
        const showNumbers = c.status === 'sent' || running;
        const a = s.variants.A, b = s.variants.B;
        return (
          <div key={c.id} className="rounded-2xl border border-border bg-card/60 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <button type="button" disabled={!open} onClick={() => onEdit(c)} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{c.title}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                  {KIND[c.kind] && <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">{KIND[c.kind]}</span>}
                  {c.abPercent > 0 && <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-300">A/B{c.abWinner ? ` · ganó ${c.abWinner}` : ''}</span>}
                  {c.smartHour === 1 && <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-300">Mejor hora</span>}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {describeSegment(normalizeSegment(c.segment), names)} · {c.status === 'sent' ? `enviada ${fmt(c.sentAt)}` : c.status === 'scheduled' ? `sale ${fmt(c.scheduledAt)}` : c.status === 'testing' ? `probando desde ${fmt(c.abTestAt)}` : `creada ${fmt(c.createdAt)}`}
                </p>
              </button>
              {showNumbers ? (
                <div className="flex shrink-0 gap-4 text-right text-xs">
                  <div><p className="text-base font-bold tabular-nums">{s.sent}</p><p className="text-muted-foreground">enviados{s.queued ? ` · ${s.queued} en cola` : ''}</p></div>
                  <div><p className="text-base font-bold tabular-nums">{s.clicks}</p><p className="text-muted-foreground">toques ({pct(s.clicks, s.sent)})</p></div>
                  <div><p className="text-base font-bold tabular-nums">{s.orders}</p><p className="text-muted-foreground">{s.orders ? `ventas · ${clp(s.revenue)}` : 'ventas'}</p></div>
                </div>
              ) : open && (
                <div className="flex shrink-0 justify-end gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => onEdit(c)}><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
                  <WriteButton size="sm" disabled={send.isPending} onClick={() => window.confirm('¿Enviar ahora?') && send.mutate({ id: c.id })}>Enviar ahora</WriteButton>
                  <WriteButton size="sm" variant="outline" onClick={() => window.confirm('¿Cancelar esta campaña? No se enviará.') && cancel.mutate({ id: c.id })}>Cancelar envío</WriteButton>
                </div>
              )}
            </div>
            {c.abPercent > 0 && showNumbers && (a || b) && (
              <div className="mt-2 grid gap-2 border-t border-border pt-2 text-xs sm:grid-cols-2">
                {([['A', c.title, a], ['B', c.titleB, b]] as const).map(([v, title, st2]) => (
                  <div key={v} className={`rounded-lg px-2.5 py-1.5 ${c.abWinner === v ? 'bg-emerald-500/10' : 'bg-muted/40'}`}>
                    <p className="truncate"><b>{v}</b> · {title}</p>
                    <p className="text-muted-foreground">{st2 ? `${st2.sent} enviados · ${st2.clicks} toques (${pct(st2.clicks, st2.sent)})` : 'sin envíos'}</p>
                  </div>
                ))}
              </div>
            )}
            {running && <div className="mt-2 flex justify-end"><WriteButton size="sm" variant="outline" onClick={() => window.confirm('Se detienen los envíos que faltan (lo ya enviado no se puede deshacer). ¿Cancelar?') && cancel.mutate({ id: c.id })}>Detener</WriteButton></div>}
          </div>
        );
      })}
    </div>
  );
}
