import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Unir esta ficha con otra de la misma persona (compró con dos correos): esta ficha se conserva y suma todo
 * lo de la otra; la otra se borra y su correo queda como alias. */
export function MergeCustomerDialog({ open, onClose, keepId, keepEmail, onMerged }: { open: boolean; onClose: () => void; keepId: number; keepEmail: string; onMerged: () => void }) {
  const [q, setQ] = useState('');
  const [fromId, setFromId] = useState<number | null>(null);
  useEffect(() => { if (open) { setQ(''); setFromId(null); } }, [open]);

  const found = trpc.customers.page.useQuery({ search: q.trim(), page: 0, pageSize: 10 }, { enabled: open && q.trim().length >= 3 && fromId === null });
  const options = (found.data?.rows ?? []).filter((r: any) => r.id !== keepId);
  const preview = trpc.customers.mergePreview.useQuery({ keepId, fromId: fromId ?? 0 }, { enabled: open && fromId !== null });
  const utils = trpc.useUtils();
  const merge = trpc.customers.merge.useMutation({
    onSuccess: (r) => {
      toast.success(`Fichas unidas: ahora tiene ${r.playcoins} Playcoins y ${clp(r.prepaid)} de saldo`);
      utils.customers.invalidate();
      onMerged(); onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const p = preview.data;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Unir con otra ficha</DialogTitle>
          <DialogDescription>
            Para cuando la misma persona compró con dos correos. Esta ficha ({keepEmail}) se conserva y suma todo lo de la otra; la otra se borra.
          </DialogDescription>
        </DialogHeader>

        {fromId === null ? (
          <div className="space-y-2">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar la ficha repetida: nombre, correo, RUT o teléfono" />
            {q.trim().length >= 3 && found.isFetched && options.length === 0 && <p className="text-xs text-muted-foreground">No encontré a nadie.</p>}
            <div className="space-y-1">
              {options.map((r: any) => (
                <button key={r.id} type="button" onClick={() => setFromId(r.id)} className="w-full rounded-xl border border-border bg-card/60 px-3 py-2 text-left text-sm hover:bg-muted/40">
                  <span className="block font-medium">{r.fullName || '(sin nombre)'}</span>
                  <span className="block text-xs text-muted-foreground">{r.email} · {r.totalOrders} compras</span>
                </button>
              ))}
            </div>
          </div>
        ) : preview.isLoading || !p ? (
          <p className="text-sm text-muted-foreground">{preview.isError ? preview.error.message : 'Revisando…'}</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
              <div className="rounded-xl border border-border p-2"><p className="font-semibold">Se borra</p><p className="break-all">{p.from.name || p.from.email}</p><p className="break-all text-muted-foreground">{p.from.email}</p></div>
              <span>→</span>
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-2"><p className="font-semibold">Se conserva</p><p className="break-all">{p.keep.name || p.keep.email}</p><p className="break-all text-muted-foreground">{p.keep.email}</p></div>
            </div>
            <ul className="space-y-1 rounded-xl bg-muted/40 p-3 text-xs">
              <li>Compras: {p.keep.orders} + {p.from.orders} = <b>{p.after.orders}</b></li>
              <li>Playcoins: {p.keep.playcoins} + {p.from.playcoins} = <b>{p.after.playcoins}</b></li>
              <li>Saldo PlayCard: {clp(p.keep.prepaid)} + {clp(p.from.prepaid)} = <b>{clp(p.after.prepaid)}</b></li>
              <li>Se mueven: {p.moves.orders} órdenes, {p.moves.coupons} cupones, {p.moves.devices} teléfonos con la app, {p.moves.passkeys} Face ID</li>
              {p.pinConflict && <li className="text-amber-500">Las dos tienen PIN de tarjeta: se queda el de esta ficha.</li>}
            </ul>
            <p className="text-xs text-muted-foreground">Quien entre a «Mi cuenta» con el correo de la ficha borrada llegará a esta ficha. Esta acción no se puede deshacer.</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {fromId !== null && <button type="button" onClick={() => setFromId(null)} className="text-sm underline">Elegir otra</button>}
          <WriteButton disabled={!p || merge.isPending} onClick={() => fromId !== null && merge.mutate({ keepId, fromId })}>
            {merge.isPending ? 'Uniendo…' : 'Unir fichas'}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
