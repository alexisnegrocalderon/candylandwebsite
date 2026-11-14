import { useState } from 'react';
import { CheckCircle2, Eye, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatChileDateTime } from '@shared/chileDate';
import type { CrossCheckItem } from '@shared/crossCheck';

/** Un cross check esperando: qué va a pasar, en letra grande, y dos botones grandes: «Reportar» (sale) o «Descartar». */
export function CrossCheckCard({ item, compact = false }: { item: CrossCheckItem; compact?: boolean }) {
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([utils.crossCheck.list.invalidate(), utils.adminBadges.invalidate(), utils.pilot.invalidate()]);
  const report = trpc.crossCheck.report.useMutation({
    onSuccess: (r) => {
      if (r.status === 'done') toast.success(r.result ?? 'Listo');
      else toast.error(r.result ?? 'No se pudo hacer');
      refresh();
    },
    onError: (e) => { toast.error(e.message); refresh(); },
  });
  const discard = trpc.crossCheck.discard.useMutation({ onSuccess: () => { toast('Descartado'); refresh(); }, onError: (e) => toast.error(e.message) });
  const busy = report.isPending || discard.isPending;
  const isMail = item.kind === 'outreach' || item.kind.startsWith('private-members:');
  const [previewOpen, setPreviewOpen] = useState(false);
  const preview = trpc.crossCheck.preview.useQuery({ id: item.id }, { enabled: isMail && previewOpen, staleTime: 60_000 });
  return (
    <>
    <article className={`rounded-2xl border border-white/10 bg-white/5 ${compact ? 'p-3.5' : 'p-4 md:p-5'}`}>
      <h4 className={`font-heading leading-snug ${compact ? 'text-base' : 'text-lg'}`}>{item.title}</h4>
      <p className="mt-1.5 text-sm leading-relaxed text-white/80">{item.summary}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Pedido {formatChileDateTime(item.createdAt)}{item.expiresAt ? ` · vale hasta ${formatChileDateTime(item.expiresAt)}` : ''}
      </p>
      {isMail && (
        <button type="button" onClick={() => setPreviewOpen(true)} className="admin-tab mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold">
          <Eye className="h-5 w-5" /> Ver el correo completo
        </button>
      )}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button type="button" disabled={busy} onClick={() => report.mutate({ id: item.id })}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-60">
          {report.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Reportar
        </button>
        <button type="button" disabled={busy} onClick={() => discard.mutate({ id: item.id })} aria-label="Descartar"
          className="admin-tab flex h-12 items-center justify-center gap-1.5 rounded-2xl px-4 text-sm font-medium disabled:opacity-60">
          <X className="h-4 w-4" /> Descartar
        </button>
      </div>
    </article>
      {isMail && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-xl flex-col gap-3 p-4">
            <DialogHeader>
              <DialogTitle className="text-lg">El correo, tal como sale</DialogTitle>
              <DialogDescription className="text-sm">
                {preview.data ? <>Para <strong>{preview.data.to}</strong> · las respuestas llegan a <strong>{preview.data.replyTo}</strong><br />Asunto: {preview.data.subject}</> : 'Cargando…'}
              </DialogDescription>
            </DialogHeader>
            {preview.data?.recipients && (
              <details className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
                <summary className="cursor-pointer font-medium">Ver los {preview.data.recipients.length} correos</summary>
                <p className="mt-1.5 break-words">{preview.data.recipients.join(' · ')}</p>
              </details>
            )}
            {preview.data && <iframe title="Vista previa del correo" sandbox="" srcDoc={preview.data.html} className="h-[62dvh] w-full rounded-xl border border-white/10 bg-black" />}
            {preview.isError && <p className="text-sm text-red-300">No se pudo cargar el correo.</p>}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

