import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WriteButton } from '@/components/admin/WriteButton';
import { formatPorcion, glassInfo } from '@shared/insumos';
import { DOSIER_INSUMOS } from '@shared/dosier';

/** Carga del dosier del aniversario: muestra qué haría y recién ahí lo aplica. */
export function DosierDialog({ eventId, open, onClose, onDone }: { eventId: number; open: boolean; onClose: () => void; onDone: () => void }) {
  const [reemplazar, setReemplazar] = useState(false);
  const [cargarStock, setCargarStock] = useState(true);
  const plan = trpc.insumos.dosierPlan.useQuery({ eventId, reemplazarRecetas: reemplazar }, { enabled: open });
  const apply = trpc.insumos.dosierApply.useMutation({
    onSuccess: (r) => {
      toast.success(`Dosier cargado: ${r.recetasCargadas} recetas, ${r.insumosCreados} insumos nuevos${r.stockCargado ? `, stock de ${r.stockCargado}` : ''}`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const data = plan.data;
  const unitOf = (key: string) => DOSIER_INSUMOS.find((d) => d.key === key)?.unit ?? 'ml';
  const nameOf = (key: string) => DOSIER_INSUMOS.find((d) => d.key === key)?.name ?? key;
  const toLoad = data?.recetas.filter((r) => r.action === 'cargar').length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar el dosier del aniversario</DialogTitle>
          <DialogDescription>
            Crea los insumos, la receta de cada trago (oz pasadas a ml) y el stock con que parte la barra. Después todo se edita a mano. Se puede repetir sin duplicar nada.
          </DialogDescription>
        </DialogHeader>

        {!data && <p className="text-sm text-muted-foreground">Revisando la carta…</p>}
        {data && (
          <div className="space-y-4">
            <section>
              <h3 className="mb-1 text-sm font-semibold">Tragos ({toLoad} de {data.recetas.length} se cargan)</h3>
              <ul className="space-y-1 text-sm">
                {data.recetas.map((r) => (
                  <li key={r.product} className="rounded-xl border border-border bg-card/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.action === 'sin_producto' ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" /> : <Check className={`h-4 w-4 shrink-0 ${r.action === 'ya_tiene' ? 'text-muted-foreground' : 'text-emerald-500'}`} />}
                      <span className="flex-1 font-medium">{r.product} <span className="font-normal text-muted-foreground">· {glassInfo(r.glass)?.label.toLowerCase()}{r.glassAssumed ? ' (supuesto)' : ''}</span></span>
                      <span className="text-xs text-muted-foreground">
                        {r.action === 'cargar' ? 'se carga' : r.action === 'ya_tiene' ? 'ya tiene receta' : 'no está en la Carta'}
                      </span>
                    </div>
                    {r.action !== 'sin_producto' && (
                      <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                        {r.lines.map((l) => `${nameOf(l.insumo)} ${formatPorcion(l.amount, unitOf(l.insumo))}${l.estimated ? ' (estimado)' : ''}`).join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {data.recetas.some((r) => r.action === 'sin_producto') && (
                <p className="mt-2 text-xs text-amber-500">
                  Los que dicen «no está en la Carta» hay que crearlos primero en Eventos → Carta de la Fiesta (con el mismo nombre); después vuelve a cargar el dosier y solo se agregan esos.
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold">Insumos ({data.insumos.filter((i) => i.action === 'crear').length} nuevos de {data.insumos.length})</h3>
              <p className="text-xs text-muted-foreground">
                {data.insumos.map((i) => `${i.name}${i.action === 'existe' ? ' ✓' : ''}`).join(' · ')}
              </p>
            </section>

            <section className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={cargarStock} onChange={(e) => setCargarStock(e.target.checked)} />
                <span>Cargar el stock actual de la barra ({data.insumos.filter((i) => i.loadStock).length} insumos). Solo a los que no tienen movimientos: nunca pisa un stock en uso.</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
                <span>Reemplazar las recetas que ya tienes cargadas con las del dosier.</span>
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

        <DialogFooter>
          <WriteButton disabled={!data || apply.isPending || (toLoad === 0 && data.insumos.every((i) => i.action === 'existe' && !(cargarStock && i.loadStock)))}
            onClick={() => apply.mutate({ eventId, reemplazarRecetas: reemplazar, cargarStock })}>
            {apply.isPending ? 'Cargando…' : 'Cargar dosier'}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
