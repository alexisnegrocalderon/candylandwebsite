import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, MessageCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Dosier de barra en PDF: se descarga, o se manda el link al grupo de WhatsApp del staff (vence en 7 días). */
export function DosierPdfDialog({ eventId, eventTitle, open, onClose }: { eventId: number; eventTitle: string; open: boolean; onClose: () => void }) {
  const link = trpc.insumos.dosierLink.useMutation({ onError: (e) => toast.error(e.message) });
  const [url, setUrl] = useState<string | null>(null);
  const [expires, setExpires] = useState<Date | null>(null);

  useEffect(() => {
    if (!open) { setUrl(null); return; }
    link.mutateAsync({ eventId }).then((r) => { setUrl(`${window.location.origin}${r.path}`); setExpires(new Date(r.expiresAt)); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId]);

  const vence = expires ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(expires) : '';
  const mensaje = url ? `📘 Dosier de barra · ${eventTitle}\nTodas las preparaciones, cantidades y vasos:\n${url}` : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">📘 Dosier de barra</DialogTitle>
          <DialogDescription>
            Portada Playroom, guía de vasos y jigger, una ficha por trago con su vaso dibujado, los ingredientes, la preparación y la foto, y una tabla resumen para pegar en la barra. Sale de las recetas de hoy: si cambias una receta, vuelve a descargarlo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button type="button" className="h-12 w-full text-base" disabled={!url} onClick={() => url && window.open(url, '_blank', 'noopener')}>
            <Download className="mr-2 h-5 w-5" /> {url ? 'Ver y descargar el PDF' : 'Preparando el link…'}
          </Button>
          <Button type="button" variant="outline" className="h-12 w-full text-base" disabled={!url}
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener')}>
            <MessageCircle className="mr-2 h-5 w-5" /> Mandar por WhatsApp al staff
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={!url}
            onClick={() => { if (url) navigator.clipboard.writeText(url).then(() => toast.success('Link copiado')).catch(() => toast.error('No se pudo copiar')); }}>
            <Copy className="mr-2 h-4 w-4" /> Copiar link
          </Button>
          {vence && <p className="text-center text-xs text-muted-foreground">El link funciona sin clave hasta el {vence}. Después se pide uno nuevo aquí.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
