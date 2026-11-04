import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, FileText, MessageCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Inventario en PDF (infografía): stock por grupo, lo usado en el evento, lo que falta comprar y lo valorizado.
 * El link arma el PDF en el momento con lo que haya en la base, así siempre sale actualizado. */
export function InventarioPdfDialog({ events, defaultEventId, open, onClose }: {
  events: { id: number; title: string }[];
  defaultEventId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [eventId, setEventId] = useState<number | null>(defaultEventId);
  const [personas, setPersonas] = useState('');
  const [path, setPath] = useState<string | null>(null);
  const link = trpc.insumos.inventarioLink.useMutation({ onError: (e) => toast.error(e.message) });

  useEffect(() => { if (open) setEventId((cur) => cur ?? defaultEventId); }, [open, defaultEventId]);
  // Cada cambio de evento o de personas prepara un link nuevo (con una pausa mientras escribes).
  useEffect(() => {
    if (!open || !eventId) { setPath(null); return; }
    setPath(null);
    const id = window.setTimeout(() => {
      link.mutateAsync({ eventId, personas: Math.max(0, Math.floor(Number(personas) || 0)) }).then((r) => setPath(r.path)).catch(() => {});
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId, personas]);

  const url = path ? `${window.location.origin}${path}` : null;
  const titulo = events.find((e) => e.id === eventId)?.title ?? '';
  const mensaje = url ? `📦 Inventario · ${titulo}\nStock actual, lo que usamos y lo que falta comprar:\n${url}` : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">📦 Inventario en PDF</DialogTitle>
          <DialogDescription>
            Un PDF gráfico con el stock de cada insumo y su nivel, lo que usamos en el evento, lo que falta comprar y cuánto vale todo.
            Se arma al abrirlo con lo que hay en este momento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Evento (para lo que usamos y lo que falta comprar)</Label>
            <Select value={eventId ? String(eventId) : ''} onValueChange={(v) => setEventId(Number(v))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Elige un evento" /></SelectTrigger>
              <SelectContent>{events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-personas">Personas esperadas</Label>
            <Input id="inv-personas" type="number" inputMode="numeric" min={0} value={personas} onChange={(e) => setPersonas(e.target.value)} placeholder="Vacío = las que tienen entrada" className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">Sirve para calcular lo que falta comprar.</p>
          </div>
          <Button type="button" className="h-12 w-full text-base" disabled={!url} onClick={() => url && window.open(url, '_blank', 'noopener')}>
            <FileText className="mr-2 h-5 w-5" /> {url ? 'Abrir el inventario (PDF)' : eventId ? 'Preparando el link…' : 'Elige un evento'}
          </Button>
          <Button type="button" variant="outline" className="h-12 w-full text-base" disabled={!url}
            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener')}>
            <MessageCircle className="mr-2 h-5 w-5" /> Mandar por WhatsApp
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={!url}
            onClick={() => { if (url) navigator.clipboard.writeText(url).then(() => toast.success('Link copiado')).catch(() => toast.error('No se pudo copiar')); }}>
            <Copy className="mr-2 h-4 w-4" /> Copiar link
          </Button>
          <p className="text-center text-xs text-muted-foreground">El link funciona sin clave por 7 días y siempre muestra el inventario al momento de abrirlo.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
