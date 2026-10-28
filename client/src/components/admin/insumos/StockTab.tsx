import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, MoreHorizontal } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WriteButton } from '@/components/admin/WriteButton';
import { describirBotellas, formatCantidad, insumoSizes, stockCsv, stockTexto } from '@shared/insumos';
import { ContarStock } from './ContarStock';
import { SizeCounts } from './SizeCounts';
import { UsoDialog } from './UsoDialog';
import { LEVEL_STYLE, type BarraData, type BarraInsumo } from './types';
import type { InsumoFormValue } from './InsumoDialog';

type Action = { kind: 'compra' | 'merma'; insumo: BarraInsumo } | null;

const ACTION_TEXT = {
  compra: { title: 'Registrar compra', help: 'Se suma al stock.', button: 'Sumar' },
  merma: { title: 'Registrar merma', help: 'Botella rota, derrame, cortesía sin registrar… Se resta del stock.', button: 'Restar' },
} as const;

export function StockTab({ eventId, data, onEdit, onChanged }: {
  eventId: number;
  data: BarraData;
  onEdit: (v: Omit<InsumoFormValue, 'initialBySize' | 'initialLoose'>) => void;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<Action>(null);
  // Vista por botella base: el insumo cuyos tragos se están editando.
  const [uso, setUso] = useState<BarraInsumo | null>(null);
  const [contar, setContar] = useState<BarraInsumo | null>(null);
  const setActive = trpc.insumos.setActive.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });

  const counts = {
    total: data.insumos.length,
    agotados: data.insumos.filter((i) => i.level === 'agotado').length,
    bajos: data.insumos.filter((i) => i.level === 'bajo').length,
    sinReceta: data.productos.filter((p) => p.receta.length === 0 && !p.sinInsumos && !p.oculto).length,
  };
  const sorted = [...data.insumos].sort((a, b) => {
    const rank = { agotado: 0, bajo: 1, ok: 2, sin_uso: 3 } as const;
    return rank[a.level] - rank[b.level] || (a.drinks ?? 1e9) - (b.drinks ?? 1e9) || a.name.localeCompare(b.name);
  });

  // Qué reponer: lo agotado o bajo y lo que se usa en la carta pero nunca se compró, con los tragos que afecta.
  const reponer = sorted
    .filter((i) => i.usedBy.length > 0 && (i.level === 'agotado' || i.level === 'bajo' || i.sinComprar))
    .map((i) => ({ i, motivo: i.sinComprar ? 'sin comprar' : i.level === 'agotado' ? 'se acabó' : `alcanza para ~${i.drinks ?? 0} tragos` }));

  const filas = data.insumos.map((i) => ({ ...i, drinks: i.drinks, level: i.level }));
  const copyText = async () => {
    try { await navigator.clipboard.writeText(stockTexto(filas, `Stock de barra · ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })}`)); toast.success('Stock copiado: pégalo en WhatsApp'); }
    catch { toast.error('No se pudo copiar'); }
  };
  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([stockCsv(filas)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `stock-barra-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (data.insumos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Todavía no hay insumos. Lo más rápido es «Cargar dosier» (arriba): deja los insumos, el stock y las recetas listos de una vez. También puedes crear uno con «+ Insumo».
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

      {reponer.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3" role="status">
          <p className="text-sm font-semibold text-amber-500">Qué reponer ({reponer.length})</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {reponer.map(({ i, motivo }) => (
              <li key={i.id}><span className="font-semibold">{i.name}</span> · {motivo}<span className="text-muted-foreground"> — afecta: {i.usedBy.slice(0, 4).join(', ')}{i.usedBy.length > 4 ? '…' : ''}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={copyText}><Copy className="mr-1 h-4 w-4" /> WhatsApp</Button>
        <Button variant="outline" size="sm" onClick={downloadCsv}><Download className="mr-1 h-4 w-4" /> Excel</Button>
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
                  <button type="button" onClick={() => setUso(i)} className="mt-0.5 block max-w-full truncate text-left text-xs text-muted-foreground underline-offset-2 hover:underline">
                    {i.usedBy.length > 0 ? `Lo usan (${i.usedBy.length}): ${i.usedBy.join(', ')}` : 'Ningún trago lo usa todavía'} · editar
                  </button>
                  {pct !== null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className={`h-full rounded-full ${i.level === 'agotado' ? 'bg-red-500' : i.level === 'bajo' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                    </div>
                  )}
                </div>
                <WriteButton size="sm" onClick={() => setContar(i)}>Contar</WriteButton>
                <WriteButton size="sm" variant="outline" onClick={() => setAction({ kind: 'compra', insumo: i })}>+ Compra</WriteButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Más acciones de ${i.name}`}><MoreHorizontal className="h-5 w-5" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setUso(i)}>Tragos que lo usan</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAction({ kind: 'merma', insumo: i })}>Registrar merma</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setContar(i)}>Contar stock real</DropdownMenuItem>
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

      <UsoDialog eventId={eventId} insumo={uso} data={data} onClose={() => setUso(null)} onSaved={() => { setUso(null); onChanged(); }} />
      <ContarStock eventId={eventId} insumo={contar} onClose={() => setContar(null)} onDone={() => { setContar(null); onChanged(); }} />
      <MovimientoDialog eventId={eventId} action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); onChanged(); }} />
    </div>
  );
}

function MovimientoDialog({ eventId, action, onClose, onDone }: { eventId: number; action: Action; onClose: () => void; onDone: () => void }) {
  const [bySize, setBySize] = useState<Record<number, number>>({});
  const [loose, setLoose] = useState('');
  const [note, setNote] = useState('');
  const movimiento = trpc.insumos.movimiento.useMutation();
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
  const busy = movimiento.isPending;

  const submit = async () => {
    try {
      if (amount <= 0) { toast.error('Pon una cantidad'); return; }
      await movimiento.mutateAsync({ insumoId: insumo.id, kind, amount, eventId, note: fullNote });
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
