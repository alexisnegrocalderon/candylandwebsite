import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import { esJiggerExacto, jiggersAMl, mlAJiggers } from '@shared/insumos';
import type { BarraData, BarraInsumo } from './types';

/** Vista por botella base: eliges un licor (o cualquier insumo) y marcas qué tragos de la Carta lo usan y cuánto
 * lleva cada uno. Guardar corrige las recetas de esos tragos y deja todo lo demás como estaba. */
export function UsoDialog({ eventId, insumo, data, onClose, onSaved }: { eventId: number; insumo: BarraInsumo | null; data: BarraData; onClose: () => void; onSaved: () => void }) {
  // Cantidad por trago: en jiggers (licores en ml) o en la unidad del insumo.
  const [jigger, setJigger] = useState(true);
  const [rows, setRows] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const isMl = insumo?.unit === 'ml';
  const inJigger = isMl && jigger;

  useEffect(() => {
    if (!insumo) return;
    const next: Record<number, string> = {};
    for (const p of data.productos) {
      const line = p.receta.find((r) => r.insumoId === insumo.id);
      if (line) next[p.id] = String(isMl && esJiggerExacto(line.amount) ? mlAJiggers(line.amount) : line.amount);
    }
    // Si alguna cantidad no es un jigger exacto, se muestra todo en ml para no redondear.
    const allJigger = data.productos.every((p) => { const l = p.receta.find((r) => r.insumoId === insumo.id); return !l || esJiggerExacto(l.amount); });
    setJigger(isMl && allJigger);
    if (isMl && !allJigger) for (const p of data.productos) { const l = p.receta.find((r) => r.insumoId === insumo.id); if (l) next[p.id] = String(l.amount); }
    setRows(next);
    setSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insumo?.id]);

  const save = trpc.insumos.setUso.useMutation({
    onSuccess: (r) => { toast.success(r.changed ? `${r.changed} ${r.changed === 1 ? 'receta actualizada' : 'recetas actualizadas'}` : 'Sin cambios'); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  // Cambiar entre jiggers y ml convierte lo que ya está escrito.
  const switchMode = (toJigger: boolean) => {
    setRows((r) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, v === '' ? v : String(toJigger ? mlAJiggers(Number(v)) : jiggersAMl(Number(v)))])));
    setJigger(toJigger);
  };

  const q = search.trim().toLowerCase();
  const list = useMemo(() => data.productos.filter((p) => !q || p.name.toLowerCase().includes(q)), [data.productos, q]);
  const toMl = (v: string) => (inJigger ? jiggersAMl(Number(v)) : Number(v));
  const chosen = Object.entries(rows).filter(([, v]) => Number(v) > 0);

  const submit = () => {
    if (!insumo) return;
    save.mutate({ eventId, insumoId: insumo.id, usos: chosen.map(([id, v]) => ({ ticketTypeId: Number(id), amount: toMl(v) })) });
  };

  return (
    <Dialog open={!!insumo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tragos que usan {insumo?.name}</DialogTitle>
          <DialogDescription>
            Marca cada trago que lleva este insumo y pon cuánto{isMl ? ' (en jiggers de 30 ml o en ml)' : ''}. Cada venta lo descuenta sola; lo demás de cada receta no se toca.
          </DialogDescription>
        </DialogHeader>

        {isMl && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Medir en</span>
            {([true, false] as const).map((j) => (
              <button key={String(j)} type="button" disabled={jigger === j} onClick={() => switchMode(j)}
                className={`rounded-full px-2.5 py-0.5 font-medium ${jigger === j ? 'bg-primary text-white' : 'bg-muted'}`}>
                {j ? 'jigger (30 ml)' : 'ml'}
              </button>
            ))}
          </div>
        )}

        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar un trago…" />
        <ul className="max-h-[45vh] space-y-1 overflow-y-auto">
          {list.map((p) => {
            const on = rows[p.id] !== undefined;
            return (
              <li key={p.id} className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-1.5">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" checked={on}
                    onChange={(e) => setRows((r) => { const next = { ...r }; if (e.target.checked) next[p.id] = inJigger ? '1' : ''; else delete next[p.id]; return next; })} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                </label>
                {on && (
                  <div className="relative w-28 shrink-0">
                    <Input type="number" inputMode="decimal" min={0} step={inJigger ? 0.25 : 1} value={rows[p.id]} autoFocus={rows[p.id] === ''}
                      onChange={(e) => setRows((r) => ({ ...r, [p.id]: e.target.value }))} placeholder="0" className="h-9 pr-14" aria-label={`Cantidad en ${p.name}`} />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{inJigger ? 'jigger' : insumo?.unit}</span>
                  </div>
                )}
                {on && Number(rows[p.id]) > 0 && inJigger && <span className="hidden w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block">{jiggersAMl(Number(rows[p.id]))} ml</span>}
              </li>
            );
          })}
          {list.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Nada con ese nombre en la Carta.</li>}
        </ul>

        <DialogFooter className="items-center gap-3">
          <span className="text-xs text-muted-foreground">{chosen.length} {chosen.length === 1 ? 'trago lo usa' : 'tragos lo usan'}</span>
          <WriteButton disabled={save.isPending} onClick={submit}>{save.isPending ? 'Guardando…' : 'Guardar'}</WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
