import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { clampQty, groupCajaExtras, groupSummary, pickCodes, redeemLabel, type CajaExtraItem } from '@shared/cajaExtras';

/* Los extras de la ficha del cliente, una fila por producto: «Trago · quedan 3 de 4», con un selector de cuántos cobrar.
 * Cada unidad sigue siendo un código propio; «Ver códigos» deja canjear (o anular, el supervisor) uno por uno. */

const badge = (cls: string, text: string) => <span className={`text-xs px-2.5 py-0.5 rounded-full ${cls}`}>{text}</span>;
const STATUS = {
  used: () => badge('bg-white/10 text-white/60', 'Canjeado'),
  cancelled: () => badge('bg-red-500/15 text-red-300', 'Anulado'),
  valid: () => badge('bg-emerald-500/15 text-emerald-300', 'Pendiente'),
} as const;

export function ExtrasGroups({ extras, canVoid, voiding, onRedeemMany, onVoid }: {
  extras: CajaExtraItem[];
  canVoid: boolean;
  voiding: boolean;
  onRedeemMany: (codes: string[], label: string) => void;
  onVoid: (displayCode: string, reason: string) => void;
}) {
  const groups = groupCajaExtras(extras);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [voidingCode, setVoidingCode] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const confirmVoid = () => {
    if (!voidingCode || reason.trim().length < 3) return;
    onVoid(voidingCode, reason.trim());
    setVoidingCode(null);
    setReason('');
  };

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const left = g.validCodes.length;
        const q = clampQty(qty[g.key] ?? 1, left);
        const codes = g.items.filter((e) => e.displayCode);
        const expanded = open === g.key;
        return (
          <div key={g.key} className="p-3 rounded-2xl admin-clay admin-clay-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{g.name}</p>
                <p className={`text-xs ${left > 0 ? 'text-emerald-300' : 'text-white/60'}`}>{groupSummary(g)}</p>
              </div>
              {left > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  {left > 1 && (
                    <div className="flex items-center rounded-full bg-white/10">
                      <button type="button" aria-label="Menos" disabled={q <= 1} onClick={() => setQty({ ...qty, [g.key]: q - 1 })} className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                      <span className="min-w-6 text-center text-base font-semibold tabular-nums">{q}</span>
                      <button type="button" aria-label="Más" disabled={q >= left} onClick={() => setQty({ ...qty, [g.key]: q + 1 })} className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                    </div>
                  )}
                  <Button className="bg-primary hover:bg-primary/90 h-9" onClick={() => { onRedeemMany(pickCodes(g, q), redeemLabel(g.name, q)); setQty({ ...qty, [g.key]: 1 }); }}>
                    {left > 1 ? `Cobrar ${q}` : 'Canjear'}
                  </Button>
                </div>
              )}
            </div>
            {left > 1 && (
              <button type="button" className="mt-2 text-xs text-white/60 underline" onClick={() => { setQty({ ...qty, [g.key]: left }); onRedeemMany(pickCodes(g, left), redeemLabel(g.name, left)); }}>
                Cobrar los {left}
              </button>
            )}
            {codes.length > 0 && (
              <button type="button" className="mt-2 ml-3 text-xs text-white/60 underline" onClick={() => setOpen(expanded ? null : g.key)}>
                {expanded ? 'Ocultar códigos' : 'Ver códigos'}
              </button>
            )}
            {expanded && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                {codes.map((e) => (
                  <div key={e.displayCode}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-white/60 font-mono truncate">{e.displayCode}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {e.status === 'valid' && <Button size="sm" className="bg-primary hover:bg-primary/90 h-8" onClick={() => onRedeemMany([e.displayCode!], redeemLabel(g.name, 1))}>Canjear</Button>}
                        {(STATUS[e.status as keyof typeof STATUS] ?? STATUS.valid)()}
                        {canVoid && e.status !== 'cancelled' && <button className="text-xs text-red-400 underline" onClick={() => setVoidingCode(e.displayCode)}>Anular</button>}
                      </div>
                    </div>
                    {voidingCode === e.displayCode && (
                      <div className="mt-2 space-y-2">
                        <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Motivo de la anulación (obligatorio)" className="h-9 text-sm bg-white/10 border-white/15 text-white" />
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={reason.trim().length < 3 || voiding} onClick={confirmVoid}>Confirmar anulación</Button>
                          <Button size="sm" variant="outline" className="border-white/15 text-white" onClick={() => { setVoidingCode(null); setReason(''); }}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
