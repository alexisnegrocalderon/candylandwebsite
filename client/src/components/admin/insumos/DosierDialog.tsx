import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Plus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import { formatPorcion, glassInfo } from '@shared/insumos';
import { DOSIER_INSUMOS } from '@shared/dosier';

const unitOf = (key: string) => DOSIER_INSUMOS.find((d) => d.key === key)?.unit ?? 'ml';
const nameOf = (key: string) => DOSIER_INSUMOS.find((d) => d.key === key)?.name ?? key;
const firstWord = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0] ?? '';

/** Carga del dosier del aniversario en un solo botón: crea los insumos, el stock de partida y la receta de cada
 * trago de la Carta (ya sugiero a cuáles aplica cada preparación). Lo que se puede revisar o cambiar queda plegado. */
export function DosierDialog({ eventId, open, onClose, onDone }: { eventId: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [reemplazar, setReemplazar] = useState(false);
  const [cargarStock, setCargarStock] = useState(true);
  // Preparación → productos de la Carta elegidos. Parte de lo que sugiere el servidor por nombre.
  const [asign, setAsign] = useState<Record<string, number[]> | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const plan = trpc.insumos.dosierPlan.useQuery({ eventId }, { enabled: open });
  const data = plan.data;

  // Al abrir (y cada vez que aparece un producto nuevo) se completa lo que esté sin elegir con lo sugerido.
  useEffect(() => {
    if (!data) return;
    setAsign((prev) => {
      const next: Record<string, number[]> = { ...(prev ?? {}) };
      let changed = prev === null;
      for (const r of data.recetas) {
        if ((next[r.product] ?? []).length === 0 && r.sugeridos.length > 0) { next[r.product] = r.sugeridos; changed = true; }
        else if (next[r.product] === undefined) { next[r.product] = []; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [data]);
  useEffect(() => { if (!open) { setAsign(null); setPicking(null); setSearch(''); setPrices({}); } }, [open]);

  const apply = trpc.insumos.dosierApply.useMutation({
    onSuccess: (r) => {
      toast.success(`Listo: ${r.recetasCargadas} recetas, ${r.insumosCreados} insumos nuevos${r.stockCargado ? ` y stock de ${r.stockCargado}` : ''}${r.recetasYaTenian ? ` (${r.recetasYaTenian} ya tenían receta y se dejaron)` : ''}`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const create = trpc.events.createTicketType.useMutation({
    onSuccess: () => { utils.insumos.dosierPlan.invalidate(); utils.events.listTicketTypes.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const productById = useMemo(() => new Map((data?.productos ?? []).map((p) => [p.id, p])), [data]);
  const ownerOf = (productId: number) => Object.entries(asign ?? {}).find(([, ids]) => ids.includes(productId))?.[0] ?? null;
  const totalAssigned = Object.values(asign ?? {}).reduce((s, ids) => s + ids.length, 0);
  const stockCount = data?.insumos.filter((i) => i.loadStock).length ?? 0;
  const newInsumos = data?.insumos.filter((i) => i.action === 'crear').length ?? 0;
  const faltan = (data?.recetas ?? []).filter((r) => r.kind === 'preparacion' && (asign?.[r.product] ?? []).length === 0);
  const commonSection = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of data?.productos ?? []) if (p.groupName) count.set(p.groupName, (count.get(p.groupName) ?? 0) + 1);
    return Array.from(count).sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [data]);

  // Un producto va a una sola preparación: elegirlo aquí lo saca de donde estaba.
  const toggle = (recipe: string, productId: number) => setAsign((a) => {
    const next: Record<string, number[]> = Object.fromEntries(Object.entries(a ?? {}).map(([k, ids]) => [k, ids.filter((id) => id !== productId)]));
    next[recipe] = [...(next[recipe] ?? []), productId];
    return next;
  });
  const remove = (recipe: string, productId: number) => setAsign((a) => ({ ...(a ?? {}), [recipe]: (a?.[recipe] ?? []).filter((id) => id !== productId) }));

  // Precio sugerido para un trago nuevo: el de otro producto de la Carta que empieza igual (ej. «Mojito»).
  const priceHint = (name: string) => data?.productos.find((p) => p.price && firstWord(p.name) === firstWord(name))?.price ?? null;
  const createProduct = async (name: string) => {
    const price = Number(prices[name] ?? priceHint(name) ?? 0);
    if (!(price > 0)) { toast.error(`Pon el precio de ${name}`); return; }
    const similar = data?.productos.find((p) => firstWord(p.name) === firstWord(name));
    await create.mutateAsync({ eventId, name, category: 'consumo', price, totalStock: 9999, groupName: similar?.groupName ?? commonSection ?? undefined, emoji: '🍹' });
    toast.success(`${name} creado en la Carta`);
  };

  const q = search.trim().toLowerCase();
  const pickList = (data?.productos ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));

  const recipeCard = (r: NonNullable<typeof data>['recetas'][number]) => {
    const chosen = asign?.[r.product] ?? [];
    return (
      <li key={r.product} className="rounded-xl border border-border bg-card/60 px-3 py-2 text-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {r.product}{' '}
              <span className="font-normal text-muted-foreground">· {r.kind === 'tal_cual' ? '1 por venta' : `${glassInfo(r.glass)?.label.toLowerCase()}${r.glassAssumed ? ' (supuesto)' : ''}`}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {r.lines.map((l) => `${nameOf(l.insumo)} ${formatPorcion(l.amount, unitOf(l.insumo)).replace(/ \(.*\)$/, '')}${l.estimated ? ' (estimado)' : ''}`).join(' · ')}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setPicking(picking === r.product ? null : r.product); setSearch(''); }}>
            {picking === r.product ? 'Listo' : 'Cambiar'}
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
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                      <input type="checkbox" className="h-5 w-5" checked={here} onChange={() => (here ? remove(r.product, p.id) : toggle(r.product, p.id))} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{owner && !here ? `en ${owner}` : p.tieneReceta ? 'ya tiene receta' : p.groupName ?? ''}</span>
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
  };

  const detail = 'rounded-2xl border border-border bg-card/40 px-4 py-3 [&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:text-sm [&_summary]:font-semibold';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-xl">Cargar el dosier del aniversario</DialogTitle>
          <DialogDescription>Las recetas, las porciones y el stock de la barra ya están armados: se cargan de una vez y después todo se edita tocando.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          {!data && <p className="text-sm text-muted-foreground">Revisando la Carta…</p>}
          {data && (
            <>
              {/* Resumen: lo que va a pasar */}
              <section className="grid grid-cols-3 gap-2 text-center">
                {[
                  { n: totalAssigned, l: 'tragos de la Carta con receta' },
                  { n: newInsumos, l: 'insumos nuevos' },
                  { n: cargarStock ? stockCount : 0, l: 'insumos con stock de partida' },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl border border-border bg-card/60 p-3">
                    <p className="text-2xl font-bold tabular-nums">{s.n}</p>
                    <p className="text-xs text-muted-foreground">{s.l}</p>
                  </div>
                ))}
              </section>

              {/* Tragos que aún no están en la Carta: se crean tocando */}
              {faltan.length > 0 && (
                <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
                  <h3 className="flex items-center gap-1 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Faltan {faltan.length} tragos en la Carta</h3>
                  <p className="mb-2 text-xs text-muted-foreground">Créalos aquí con su precio y quedan con su receta. O sáltalos si no los vas a vender: se cargan los demás igual.</p>
                  <ul className="space-y-1.5">
                    {faltan.map((r) => (
                      <li key={r.product} className="flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{r.product}</span>
                        <div className="relative w-28 shrink-0">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                          <Input type="number" inputMode="numeric" min={0} className="h-10 pl-6" placeholder="precio" aria-label={`Precio de ${r.product}`}
                            value={prices[r.product] ?? (priceHint(r.product) ? String(priceHint(r.product)) : '')} onChange={(e) => setPrices((p) => ({ ...p, [r.product]: e.target.value }))} />
                        </div>
                        <WriteButton size="sm" variant="outline" disabled={create.isPending} onClick={() => createProduct(r.product)}><Plus className="mr-1 h-4 w-4" /> Crear</WriteButton>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <details className={detail}>
                <summary>Revisar a qué productos de la Carta se aplica cada preparación</summary>
                <p className="mb-2 mt-1 text-xs text-muted-foreground">Ya lo sugerí por el nombre. Cambia solo lo que no calce; cada producto queda con su propia receta, editable.</p>
                <p className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preparaciones</p>
                <ul className="space-y-1.5">{data.recetas.filter((r) => r.kind === 'preparacion').map(recipeCard)}</ul>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Se venden tal cual (1 unidad por venta)</p>
                <ul className="space-y-1.5">{data.recetas.filter((r) => r.kind === 'tal_cual').map(recipeCard)}</ul>
              </details>

              <details className={detail}>
                <summary>Inventario de la barra ({data.insumos.length} insumos, {newInsumos} nuevos)</summary>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {data.insumos.map((i) => (
                    <li key={i.key} className="flex justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1 truncate">{i.action === 'existe' && <Check className="h-3 w-3 shrink-0 text-emerald-500" />}{i.name}</span>
                      <span className="shrink-0 tabular-nums">{i.stock ? `${i.loadStock ? '' : '(ya en uso) '}${formatPorcion(i.stock.amount, unitOf(i.key)).replace(/ \(.*\)$/, '')}` : 'sin stock'}</span>
                    </li>
                  ))}
                </ul>
              </details>

              <details className={detail}>
                <summary>Supuestos para confirmar ({data.supuestos.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {data.supuestos.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </details>

              <details className={detail}>
                <summary>Opciones</summary>
                <div className="mt-2 space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 h-5 w-5" checked={cargarStock} onChange={(e) => setCargarStock(e.target.checked)} />
                    <span>Cargar el stock actual de la barra. Solo a los insumos sin movimientos: nunca pisa un stock en uso.</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 h-5 w-5" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
                    <span>Reemplazar las recetas que esos productos ya tienen cargadas.</span>
                  </label>
                </div>
              </details>
            </>
          )}
        </div>

        <div className="border-t border-border bg-background px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <WriteButton className="h-14 w-full text-base"
            disabled={!data || !asign || apply.isPending}
            onClick={() => apply.mutate({
              eventId, reemplazarRecetas: reemplazar, cargarStock,
              asignaciones: Object.entries(asign ?? {}).map(([receta, productIds]) => ({ receta, productIds })),
            })}>
            {apply.isPending ? 'Cargando…' : `Cargar todo${data ? ` (${totalAssigned} recetas${cargarStock && stockCount ? ` y stock de ${stockCount} insumos` : ''})` : ''}`}
          </WriteButton>
          {data && data.recetas.some((r) => (asign?.[r.product] ?? []).some((id) => productById.get(id)?.tieneReceta)) && !reemplazar && (
            <p className="mt-2 text-center text-xs text-muted-foreground">Los productos que ya tienen receta se dejan como están (activa «Reemplazar» en Opciones para pisarlas).</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
