import { useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WriteButton } from '@/components/admin/WriteButton';
import { describirBotellas, formatCantidad, insumoSizes } from '@shared/insumos';
import { SizeCounts } from './SizeCounts';
import { LEVEL_STYLE, type BarraData, type BarraInsumo } from './types';
import type { InsumoFormValue } from './InsumoDialog';

type Action = { kind: 'compra' | 'merma' | 'fijar'; insumo: BarraInsumo } | null;

const ACTION_TEXT = {
  compra: { title: 'Registrar compra', help: 'Se suma al stock.', button: 'Sumar' },
  merma: { title: 'Registrar merma', help: 'Botella rota, derrame, cortesía sin registrar… Se resta del stock.', button: 'Restar' },
  fijar: { title: 'Fijar stock', help: 'Deja el stock exactamente en lo que pongas (queda como ajuste en el historial).', button: 'Fijar' },
} as const;

export function StockTab({ eventId, data, onEdit, onChanged }: {
  eventId: number;
  data: BarraData;
  onEdit: (v: Omit<InsumoFormValue, 'initialBySize' | 'initialLoose'>) => void;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<Action>(null);
  const setActive = trpc.insumos.setActive.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });

  const counts = {
    total: data.insumos.length,
    agotados: data.insumos.filter((i) => i.level === 'agotado').length,
    bajos: data.insumos.filter((i) => i.level === 'bajo').length,
    sinReceta: data.productos.filter((p) => p.receta.length === 0).length,
  };
  const sorted = [...data.insumos].sort((a, b) => {
    const rank = { agotado: 0, bajo: 1, ok: 2, sin_uso: 3 } as const;
    return rank[a.level] - rank[b.level] || (a.drinks ?? 1e9) - (b.drinks ?? 1e9) || a.name.localeCompare(b.name);
  });

  if (data.insumos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Todavía no hay insumos. Crea el primero con «+ Insumo» (ej. Ron, 750 ml por botella) y después arma las recetas de cada trago.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {[
          { label: 'Insumos', value: counts.total, warn: false },
          { label: 'Agotados', value: counts.agotados, warn: counts.agotados > 0 },
          { label: 'Queda poco', value: counts.bajos, warn: counts.bajos > 0 },
          { label: 'Tragos sin receta', value: counts.sinReceta, warn: counts.sinReceta > 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card/60 px-2 py-1.5 sm:px-3 sm:py-2">
            <span className={`block text-base font-semibold tabular-nums sm:text-lg ${s.warn ? 'text-amber-500' : ''}`}>{s.value}</span>
            <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">{s.label}</span>
          </div>
        ))}
      </div>

      <ul className="space-y-2">
        {sorted.map((i) => {
          const style = LEVEL_STYLE[i.level];
          const pct = i.reference && i.reference > 0 ? Math.round((i.stock / i.reference) * 100) : null;
          return (
            <li key={i.id} className="rounded-2xl border border-border bg-card/60 p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{i.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.className}`}>{style.label}</span>
                  </div>
                  <p className="mt-0.5 text-sm tabular-nums">
                    {formatCantidad(i.stock, i)}
                    {i.drinks !== null && <span className="text-muted-foreground"> · alcanza para ~{i.drinks} tragos</span>}
                    {pct !== null && <span className="text-muted-foreground"> · {pct} % de la apertura</span>}
                  </p>
                  {i.usedBy.length > 0 && <p className="mt-0.5 truncate text-xs text-muted-foreground">Lo usan: {i.usedBy.join(', ')}</p>}
                  {pct !== null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className={`h-full rounded-full ${i.level === 'agotado' ? 'bg-red-500' : i.level === 'bajo' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  )}
                </div>
                <WriteButton size="sm" variant="outline" onClick={() => setAction({ kind: 'compra', insumo: i })}>+ Compra</WriteButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Más acciones de ${i.name}`}><MoreHorizontal className="h-5 w-5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setAction({ kind: 'merma', insumo: i })}>Registrar merma</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAction({ kind: 'fijar', insumo: i })}>Fijar stock</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onEdit({
                      id: i.id, name: i.name, unit: i.unit, containerSize: i.containerSize, containerLabel: i.containerLabel, sizes: insumoSizes(i),
                      costPerContainer: i.costPerContainer ?? null, alertDrinks: i.alertDrinks,
                    })}>Editar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => { if (window.confirm(`¿Archivar ${i.name}? Deja de aparecer en el stock y en el conteo de la barra.`)) setActive.mutate({ id: i.id, active: false }); }}>
                      Archivar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>

      <MovimientoDialog eventId={eventId} action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); onChanged(); }} />
    </div>
  );
}

function MovimientoDialog({ eventId, action, onClose, onDone }: { eventId: number; action: Action; onClose: () => void; onDone: () => void }) {
  const [bySize, setBySize] = useState<Record<number, number>>({});
  const [loose, setLoose] = useState('');
  const [note, setNote] = useState('');
  const movimiento = trpc.insumos.movimiento.useMutation();
  const setStock = trpc.insumos.setStock.useMutation();
  const reset = () => { setBySize({}); setLoose(''); setNote(''); };
  if (!action) return <Dialog open={false} />;
  const { insumo, kind } = action;
  const text = ACTION_TEXT[kind];
  const sizes = insumoSizes(insumo);
  const bottles = sizes.map((size) => ({ size, count: bySize[size] ?? 0 }));
  const amount = bottles.reduce((s, b) => s + b.size * b.count, 0) + (Number(loose) || 0);
  // Cada botella queda anotada con su tamaño en la nota del movimiento.
  const detail = [describirBotellas(bottles, insumo.unit), Number(loose) > 0 ? `+ ${loose} ${insumo.unit}` : ''].filter(Boolean).join(' ');
  const fullNote = [detail, note.trim()].filter(Boolean).join(' · ') || undefined;
  const busy = movimiento.isPending || setStock.isPending;

  const submit = async () => {
    try {
      if (kind === 'fijar') await setStock.mutateAsync({ insumoId: insumo.id, target: amount, eventId, note: fullNote });
      else {
        if (amount <= 0) { toast.error('Pon una cantidad'); return; }
        await movimiento.mutateAsync({ insumoId: insumo.id, kind, amount, eventId, note: fullNote });
      }
      toast.success(`${insumo.name}: listo`);
      reset();
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{text.title}: {insumo.name}</DialogTitle>
          <DialogDescription>{text.help} Hoy hay {formatCantidad(insumo.stock, insumo)}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{insumo.containerSize > 1 ? `Cuántas ${insumo.containerLabel}s de cada tamaño` : 'Cantidad'}</Label>
            <div className="mt-1">
              <SizeCounts sizes={sizes} unit={insumo.unit} value={bySize} onChange={setBySize} idPrefix="mov" />
            </div>
          </div>
          {insumo.containerSize > 1 && (
            <div>
              <Label htmlFor="mov-l">+ suelto ({insumo.unit})</Label>
              <Input id="mov-l" type="number" inputMode="numeric" min={0} value={loose} onChange={(e) => setLoose(e.target.value)} placeholder="0" />
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="mov-n">Nota (opcional)</Label>
          <Input id="mov-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'compra' ? 'Proveedor, boleta…' : ''} />
        </div>
        <p className="text-sm text-muted-foreground">= {formatCantidad(amount, insumo)}</p>
        <DialogFooter>
          <WriteButton disabled={busy} onClick={submit}>{busy ? 'Guardando…' : text.button}</WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
