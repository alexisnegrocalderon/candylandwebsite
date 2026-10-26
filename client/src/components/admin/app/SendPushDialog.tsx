import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WriteButton } from '@/components/admin/WriteButton';
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from '@shared/pushText';

/** Notificación a una sola persona (sección App): queda en Notificaciones → Historial. */
export function SendPushDialog({ open, onClose, email, name }: { open: boolean; onClose: () => void; email: string | null; name?: string | null }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/cuenta');
  useEffect(() => { if (open) { setTitle(''); setBody(''); setUrl('/cuenta'); } }, [open]);
  const devices = trpc.customerPush.devicesFor.useQuery({ email: email ?? '' }, { enabled: open && !!email });
  const send = trpc.customerPush.sendToCustomer.useMutation({
    onSuccess: (r) => { toast.success(r.sent ? `Aviso enviado a ${r.sent} ${r.sent === 1 ? 'teléfono' : 'teléfonos'}` : 'Aviso en cola'); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const active = devices.data?.active ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar notificación</DialogTitle>
          <DialogDescription>
            Para <b>{name || email}</b>. {devices.isLoading ? 'Revisando sus teléfonos…' : active > 0
              ? `Tiene los avisos activados en ${active} ${active === 1 ? 'teléfono' : 'teléfonos'}.`
              : 'No tiene los avisos activados: no le va a llegar.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Título</Label>
            <Input value={title} maxLength={PUSH_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="🎉 Te esperamos el sábado" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mensaje</Label>
            <Textarea rows={3} value={body} maxLength={PUSH_BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder="Escribe el mensaje…" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Al tocarla abre</Label>
            <select value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="/cuenta">Mi cuenta (cupones, PlayCard, entradas)</option>
              <option value="/">El inicio del sitio</option>
              <option value="/eventos">Los eventos</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <WriteButton disabled={!email || active === 0 || !title.trim() || !body.trim() || send.isPending}
            onClick={() => send.mutate({ email: email!, title: title.trim(), body: body.trim(), url })}>
            {send.isPending ? 'Enviando…' : 'Enviar ahora'}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
