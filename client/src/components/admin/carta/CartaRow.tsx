import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, Copy, MoreHorizontal, Pencil, RotateCcw, Trash2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { useDemoProps } from '@/lib/demoMode';
import { marginOf, marginTone, remaining, stockLevel, textoAviso, type CartaProduct } from '@shared/carta';
import { categoryMeta } from './constants';

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export type CartaRowProduct = CartaProduct;

/** Fila compacta de un producto: ícono, nombre, precio y stock editables en el
 * lugar, margen y un menú ⋯ con el resto. En celular la fila tiene dos líneas
 * (nombre arriba, precio/stock abajo) para que nada se pise. */
export function CartaRow({ p, selectionMode, selected, onSelect, onEdit, onDuplicate, onToggleSoldOut, onMove, canUp, canDown, onPatch, onDelete, onReceta }: {
  p: CartaRowProduct;
  selectionMode: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleSoldOut: () => void;
  onMove: (dir: 'up' | 'down') => void;
  canUp: boolean;
  canDown: boolean;
  onPatch: (patch: { price?: number; totalStock?: number }) => void;
  onDelete: (adminPassword: string) => Promise<void>;
  /** Abre la receta del trago (para cambiar un insumo que falta). */
  onReceta?: () => void;
}) {
  const demo = useDemoProps();
  const meta = categoryMeta(p.category);
  const color = p.color || (meta.color as string);
  const level = stockLevel(p);
  const byInsumos = p.portions != null;
  const margin = marginOf(p.price, p.costPrice);
  const tone = margin ? marginTone(margin) : null;

  // Precio: se toca y se edita en el lugar.
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const commitPrice = () => {
    setEditingPrice(false);
    const next = Math.round(Number(priceDraft));
    if (Number.isFinite(next) && next > 0 && next !== Number(p.price)) onPatch({ price: next });
  };

  // Stock: botones − / + con guardado diferido (varios toques seguidos = 1 guardado).
  const [left, setLeft] = useState(remaining(p));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const sold = Number(p.soldCount);
  useEffect(() => { if (!dirty.current) setLeft(remaining(p)); }, [p.totalStock, p.soldCount]);
  const bump = (delta: number) => {
    dirty.current = true;
    setLeft((v) => {
      const next = v + delta;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { dirty.current = false; onPatch({ totalStock: Math.max(0, sold + next) }); }, 600);
      return next;
    });
  };

  const [delOpen, setDelOpen] = useState(false);
  const soldout = p.status === 'soldout';

  return (
    <div className={`rounded-2xl border bg-card/60 px-3 py-2.5 ${selected ? 'border-primary' : 'border-border'} ${soldout ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-3">
        {selectionMode && <Checkbox checked={selected} onCheckedChange={(v) => onSelect(!!v)} aria-label={`Seleccionar ${p.name}`} />}
        <button type="button" onClick={selectionMode ? () => onSelect(!selected) : onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" style={{ backgroundColor: color + '22' }}>
            {p.emoji || meta.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold">{p.name}</span>
              {soldout && <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-500">Agotado</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {[Number(p.toKitchen) === 1 && '👨‍🍳 Cocina', p.status === 'hidden' && 'Oculto', p.groupName?.trim()].filter(Boolean).join(' · ') || '\u00a0'}
            </span>
          </span>
        </button>
        {!selectionMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Más acciones de ${p.name}`}><MoreHorizontal className="h-5 w-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onEdit}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate} disabled={!!demo.disabled}><Copy className="mr-2 h-4 w-4" /> Duplicar</DropdownMenuItem>
              <DropdownMenuItem onSelect={onToggleSoldOut} disabled={!!demo.disabled}>
                {soldout ? <><RotateCcw className="mr-2 h-4 w-4" /> Reponer</> : <><Ban className="mr-2 h-4 w-4" /> Marcar agotado</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onMove('up')} disabled={!canUp || !!demo.disabled}><ArrowUp className="mr-2 h-4 w-4" /> Subir</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove('down')} disabled={!canDown || !!demo.disabled}><ArrowDown className="mr-2 h-4 w-4" /> Bajar</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => setDelOpen(true), 0)} disabled={!!demo.disabled} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${selectionMode ? 'pl-[4.5rem]' : 'pl-[3.25rem]'}`}>
        {editingPrice ? (
          <Input
            autoFocus
            type="number"
            inputMode="numeric"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => { if (e.key === 'Enter') commitPrice(); if (e.key === 'Escape') setEditingPrice(false); }}
            className="h-8 w-24"
            aria-label={`Precio de ${p.name}`}
          />
        ) : (
          <button
            type="button"
            disabled={!!demo.disabled}
            onClick={() => { setPriceDraft(String(Number(p.price))); setEditingPrice(true); }}
            className="rounded-lg bg-muted px-2 py-1 text-sm font-semibold tabular-nums hover:bg-muted/70"
            title="Toca para cambiar el precio"
          >
            {money(Number(p.price))}
          </button>
        )}

        <span className="inline-flex items-center gap-1" aria-label={`Stock de ${p.name}`} title={byInsumos ? 'Porciones según el stock de insumos (Stock de barra)' : undefined}>
          {!byInsumos && <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={!!demo.disabled} onClick={() => bump(-1)} aria-label="Una porción menos"><Minus className="h-3.5 w-3.5" /></Button>}
          <span className={`min-w-[3.5rem] text-center text-xs tabular-nums ${level === 'sin_stock' || level === 'agotado' ? 'font-semibold text-red-500' : level === 'bajo' ? 'font-semibold text-amber-500' : 'text-muted-foreground'}`}>
            {left <= 0 ? 'Sin stock' : `Quedan ${left}`}{byInsumos && <span className="ml-1 font-normal text-muted-foreground">· insumos</span>}
          </span>
          {!byInsumos && <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={!!demo.disabled} onClick={() => bump(1)} aria-label="Una porción más"><Plus className="h-3.5 w-3.5" /></Button>}
        </span>

        {margin ? (
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone === 'ok' ? 'bg-emerald-500/15 text-emerald-500' : tone === 'low' ? 'bg-amber-500/15 text-amber-500' : 'bg-red-500/15 text-red-500'}`}>
            {tone === 'negative' ? 'Pierde ' : 'Margen '}{margin.pct}%
          </span>
        ) : (
          <button type="button" onClick={onEdit} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/70">Sin costo</button>
        )}
        {p.sinReceta && <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-500" title="Sin receta: las porciones no salen del stock de insumos. Agrégala en Stock de barra → Recetas.">Sin receta</span>}
      </div>

      {p.aviso && p.aviso.estado !== 'ok' && (
        <div className={`mt-2 flex flex-wrap items-center gap-1.5 text-xs ${p.aviso.estado === 'agotado' ? 'text-red-500' : 'text-amber-500'}`} role="status">
          <span className="font-semibold">{p.aviso.estado === 'agotado' ? '⛔' : '⚠️'} {textoAviso(p.aviso)}</span>
          {p.aviso.estado === 'agotado' && p.aviso.sugerencias.map((s) => (
            <button key={s.insumoId} type="button" onClick={onReceta} title="Cambiar el insumo en la receta" className="rounded-full border border-border bg-muted px-2 py-0.5 text-foreground hover:bg-muted/70">
              Cambiar por {s.name} · alcanza para {s.drinks}
            </button>
          ))}
          {onReceta && <button type="button" onClick={onReceta} className="rounded-full border border-border px-2 py-0.5 text-foreground hover:bg-muted">Cambiar receta</button>}
        </div>
      )}
      {p.aviso && p.aviso.estado === 'ok' && byInsumos && <p className="mt-1 text-xs text-muted-foreground">{textoAviso(p.aviso)}</p>}

      <ConfirmDeleteButton
        open={delOpen}
        onOpenChange={setDelOpen}
        description={`Vas a eliminar "${p.name}" de la carta.`}
        onConfirm={onDelete}
        className="hidden"
      />
    </div>
  );
}
