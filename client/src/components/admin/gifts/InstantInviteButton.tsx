import { useState } from 'react';
import { toast } from 'sonner';
import { Download, QrCode, Share2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WriteButton } from '@/components/admin/WriteButton';

/** Botón "Invitación especial instantánea" (pedido explícito del usuario):
 * cero datos salvo la cantidad de personas -- para un invitado que llega a
 * la puerta sin QR. El QR queda listo al instante para mandar por WhatsApp. */
export function InstantInviteButton({ eventSlug, className = 'flex-1 interactive' }: { eventSlug: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState(1);
  const [result, setResult] = useState<{ ticketCode: string; qrImageUrl: string; personas: number } | null>(null);

  const create = trpc.orders.createInstantInvite.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.message || 'No se pudo generar la invitación.'),
  });

  const reset = () => { setPersonas(1); setResult(null); };

  const shareUrl = result ? `${result.qrImageUrl}` : '';

  const compartir = async () => {
    if (!result) return;
    try {
      const res = await fetch(result.qrImageUrl);
      const blob = await res.blob();
      const file = new File([blob], `invitacion-${result.ticketCode}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Invitación especial', text: `Invitación especial para ${result.personas} persona${result.personas === 1 ? '' : 's'}` });
        return;
      }
    } catch {
      // Sin soporte de compartir archivos -- se usa el botón de descarga.
    }
    toast.info('Tu navegador no soporta compartir la imagen directo -- descárgala y compártela desde tus fotos.');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          <QrCode className="w-4 h-4 mr-2" /> Invitación especial instantánea
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitación especial instantánea</DialogTitle>
        </DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Sin ningún dato más -- solo cuántas personas van a entrar con este QR. Al anfitrión en la puerta le va a aparecer "Invitación Especial" con esta cantidad.</p>
            <div className="space-y-2">
              <Label>¿Cuántas personas son?</Label>
              <Input type="number" min={1} max={20} value={personas} onChange={(e) => setPersonas(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="w-24" />
            </div>
            <WriteButton className="w-full interactive" disabled={create.isPending} onClick={() => create.mutate({ eventSlug, personas })}>
              {create.isPending ? 'Generando…' : 'Generar QR'}
            </WriteButton>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Acceso para {result.personas} {result.personas === 1 ? 'persona' : 'personas'}. Envíalo por WhatsApp -- se ocupa igual que cualquier otra entrada.</p>
            <img src={result.qrImageUrl} alt="QR de invitación especial" className="mx-auto w-56 h-56 rounded-xl border border-border/50" />
            <div className="flex gap-2">
              <Button type="button" className="flex-1 interactive" onClick={compartir}>
                <Share2 className="w-4 h-4 mr-2" /> Compartir por WhatsApp
              </Button>
              <a href={shareUrl} download={`invitacion-${result.ticketCode}.png`} className="flex-1">
                <Button type="button" variant="outline" className="w-full interactive">
                  <Download className="w-4 h-4 mr-2" /> Descargar
                </Button>
              </a>
            </div>
            <Button type="button" variant="ghost" className="w-full" onClick={reset}>Crear otra</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

