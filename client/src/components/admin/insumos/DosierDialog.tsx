import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import { formatPorcion, glassInfo } from '@shared/insumos';
import { DOSIER_INSUMOS } from '@shared/dosier';

const unitOf = (key: string) => DOSIER_INSUMOS.find((d) => d.key === key)?.unit ?? 'ml';
const nameOf = (key: string) => DOSIER_INSUMOS.find((d) => d.key === key)?.name ?? key;

/** Carga del dosier del aniversario. Cada preparación del dosier (Aperol Spritz, Piscolón…) es la base de
 * uno o más productos de la Carta: aquí eliges a cuáles se copia, y cada producto queda con su receta propia. */
export function DosierDialog({ eventId, open, onClose, onDone }: { eventId: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const [reemplazar, setReemplazar] = useState(false);
  const [cargarStock, setCargarStock] = useState(true);
  // Preparación → productos de la Carta elegidos. Parte de lo que sugiere el servidor por nombre.
  const [asign, setAsign] = useState<Record<string, number[]> | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const plan = trpc.insumos.dosierPlan.useQuery({ eventId }, { enabled: open });
  const data = plan.data;

  useEffect(() => {
    if (data && asign === null) setAsign(Object.fromEntries(data.recetas.map((r) => [r.product, r.sugeridos])));
  }, [data, asign]);
  useEffect(() => { if (!open) { setAsign(null); setPicking(null); setSearch(''); } }, [open]);

  const apply = trpc.insumos.dosierApply.useMutation({
    onSuccess: (r) => {
      toast.success(`Dosier cargado: ${r.recetasCargadas} recetas, ${r.insumosCreados} insumos nuevos${r.stockCargado ? `, stock de ${r.stockCargado}` : ''}${r.recetasYaTenian ? ` (${r.recetasYaTenian} ya tenían receta y se dejaron)` : ''}`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const productById = useMemo(() => new Map((data?.productos ?? []).map((p) => [p.id, p])), [data]);
  const ownerOf = (productId: number) => Object.entries(asign ?? {}).find(([, ids]) => ids.includes(productId))?.[0] ?? null;
  const totalAssigned = Object.values(asign ?? {}).reduce((s, ids) => s + ids.length, 0);
  const stockCount = data?.insumos.filter((i) => i.loadStock).length ?? 0;
  const newInsumos = data?.insumos.filter((i) => i.action === 'crear').length ?? 0;

  // Un producto va a una sola preparación: elegirlo aquí lo saca de donde estaba.
  const toggle = (recipe: string, productId: number) => setAsign((a) => {
    const next: Record<string, number[]> = Object.fromEntries(Object.entries(a ?? {}).map(([k, ids]) => [k, ids.filter((id) => id !== productId)]));
    const had = (a?.[recipe] ?? []).includes(productId);
    next[recipe] = had ? next[recipe] : [...(next[recipe] ?? []), productId];
    return next;
  });
  const remove = (recipe: string, productId: number) => setAsign((a) => ({ ...(a ?? {}), [recipe]: (a?.[recipe] ?? []).filter((id) => id !== productId) }));

  const q = search.trim().toLowerCase();
  const pickList = (data?.productos ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));

  const section = (kind: 'preparacion' | 'tal_cual') => (data?.recetas ?? []).filter((r) => r.kind === kind).map((r) => {
    const chosen = asign?.[r.product] ?? [];
    return (
      <li key={r.product} className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {r.product}{' '}
              <span className="font-normal text-muted-foreground">
                · {r.kind === 'tal_cual' ? '1 por venta' : `${glassInfo(r.glass)?.label.toLowerCase()}${r.glassAssumed ? ' (supuesto)' : ''}`}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {r.lines.map((l) => `${nameOf(l.insumo)} ${formatPorcion(l.amount, unitOf(l.insumo))}${l.estimated ? ' (estimado)' : ''}`).join(' · ')}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setPicking(picking === r.product ? null : r.product); setSearch(''); }}>
            {picking === r.product ? 'Listo' : 'Elegir'}
          </Button>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chosen.length === 0 && <span className="text-xs text-amber-500">Sin productos: no se carga esta receta.</span>}
          {chosen.map((id) => {
            const p = productById.get(id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium">
                {p?.name ?? `#${id}`}{p?.tieneReceta && <span className="text-muted-foreground"> · ya tiene receta</span>}
                <button type="button" aria-label={`Quitar ${p?.name ?? ''}`} onClick={() => remove(r.product, id)}><X className="h-3 w-3" /></button>
              </span>
            );
          })}
        </div>

        {picking === r.product && (
          <div className="mt-2 space-y-2 rounded-xl border border-border bg-background/60 p-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en la Carta…" autoFocus />
            <ul className="max-h-52 space-y-0.5 overflow-y-auto">
              {pickList.map((p) => {
                const owner = ownerOf(p.id);
                const here = owner === r.product;
                return (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                      <input type="checkbox" className="h-4 w-4" checked={here} onChange={() => (here ? remove(r.product, p.id) : toggle(r.product, p.id))} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {owner && !here ? `en ${owner}` : p.tieneReceta ? 'ya tiene receta' : p.groupName ?? ''}
                      </span>
                    </label>
                  </li>
                );
              })}
              {pickList.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Nada con ese nombre en la Carta.</li>}
            </ul>
          </div>
        )}
      </li>
    );
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar el dosier del aniversario</DialogTitle>
          <DialogDescription>
            Las preparaciones del dosier son la base de los tragos de la Carta, no productos aparte. Elige a qué productos se aplica cada una y cada producto queda con su receta propia, editable.
            Los insumos y el stock de la barra se cargan aparte de la Carta.
          </DialogDescription>
        </DialogHeader>

        {!data && <p className="text-sm text-muted-foreground">Revisando la carta…</p>}
        {data && (
          <div className="space-y-4">
            <section>
              <h3 className="mb-1 text-sm font-semibold">Preparaciones de la carta</h3>
              <ul className="space-y-1.5">{section('preparacion')}</ul>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold">Se venden tal cual (cada venta gasta 1 unidad del inventario)</h3>
              <ul className="space-y-1.5">{section('tal_cual')}</ul>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold">Inventario de la barra ({newInsumos} insumos nuevos de {data.insumos.length})</h3>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {data.insumos.map((i) => (
                  <li key={i.key} className="flex justify-between gap-2">
                    <span className="truncate">{i.name}{i.action === 'existe' ? ' ✓' : ''}</span>
                    <span className="shrink-0 tabular-nums">{i.stock ? `${i.loadStock ? '' : '(ya en uso) '}${formatPorcion(i.stock.amount, unitOf(i.key))}` : 'sin stock'}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={cargarStock} onChange={(e) => setCargarStock(e.target.checked)} />
                <span>Cargar el stock actual de la barra ({stockCount} insumos). Solo a los que no tienen movimientos: nunca pisa un stock en uso.</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
                <span>Reemplazar las recetas que esos productos ya tienen cargadas.</span>
              </label>
            </section>

            <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
              <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Revisa antes de cargar</h3>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {data.supuestos.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </section>
          </div>
        )}

        <DialogFooter className="items-center gap-3">
          <span className="text-xs text-muted-foreground">{totalAssigned} productos de la Carta con receta nueva</span>
          <WriteButton
            disabled={!data || !asign || apply.isPending}
            onClick={() => apply.mutate({
              eventId, reemplazarRecetas: reemplazar, cargarStock,
              asignaciones: Object.entries(asign ?? {}).map(([receta, productIds]) => ({ receta, productIds })),
            })}
          >
            {apply.isPending ? 'Cargando…' : 'Cargar dosier'}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
