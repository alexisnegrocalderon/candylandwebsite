import { useState } from 'react';
import { CheckCircle2, Clock, Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SignaturePad } from '@/components/contract/SignaturePad';
import { formatChileDateTime } from '@shared/chileDate';

/** «Firma de la Producción»: cada productor firma una sola vez con el dedo y solo la suya (Alexis en el admin, Gino en el
 * panel de socio). Se estampa en cada contrato de DJ al enviarlo; sin las dos firmas no se puede enviar. */
export function ProducerSignatureCard() {
  const { data, refetch } = trpc.djContract.mySignature.useQuery();
  const [open, setOpen] = useState(false);
  const [drawn, setDrawn] = useState('');
  const save = trpc.djContract.saveMySignature.useMutation({
    onSuccess: () => { toast.success('Firma guardada'); setOpen(false); setDrawn(''); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const mine = data?.signatures.find((s) => s.key === data.who);
  const other = data?.signatures.find((s) => s.key !== data.who);

  return (
    <section className="admin-clay p-4 md:p-5">
      <h2 className="font-heading text-xl">Firma de la Producción</h2>
      <p className="mt-1 text-sm text-muted-foreground">Firma una sola vez con el dedo. Se estampa en cada contrato de DJ al enviarlo, con fecha y hora. Cada productor firma la suya; hacen falta las dos para poder enviar.</p>
      {mine && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="font-semibold">{mine.name} <span className="text-xs font-normal text-muted-foreground">(tú)</span></p>
          <p className="text-xs text-muted-foreground">{mine.role}{mine.signedAt ? ` · firmaste ${formatChileDateTime(mine.signedAt)}` : ' · todavía sin firma'}</p>
          {mine.image && <div className="mt-2 grid h-16 place-items-center rounded-xl bg-[#f6f1e4]"><img src={mine.image} alt={`Firma de ${mine.name}`} className="max-h-14 max-w-full object-contain" /></div>}
          <button type="button" onClick={() => { setDrawn(''); setOpen(true); }} className="admin-tab mt-2 flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold"><Pencil className="h-4 w-4" /> {mine.signed ? 'Firmar de nuevo' : 'Firmar ahora'}</button>
        </div>
      )}
      {other && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          {other.signed ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Clock className="h-4 w-4 text-amber-300" />}
          {other.name}: {other.signed ? 'ya firmó' : 'falta que firme desde su panel'}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-md flex-col gap-3 p-4">
          <DialogHeader>
            <DialogTitle className="text-lg">Tu firma</DialogTitle>
            <DialogDescription className="text-sm">Dibújala con el dedo. Se guarda y se usa en los contratos que se envíen desde ahora.</DialogDescription>
          </DialogHeader>
          {open && <SignaturePad onChange={setDrawn} />}
          <button type="button" disabled={!drawn || save.isPending} onClick={() => save.mutate({ signature: drawn })} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-base font-semibold text-white disabled:opacity-50">
            {save.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Guardar mi firma
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
