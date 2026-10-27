import { toast } from 'sonner';
import { EyeOff, Eye } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TIPOS_PRODUCTO, type TipoProducto } from '@shared/insumos';
import { RecetaVisual } from './RecetaVisual';
import type { BarraData, BarraProducto } from './types';

/** Qué tipo de producto parece ser, para marcar la opción elegida. */
function tipoActual(p: BarraProducto): TipoProducto {
  if (!p.sinInsumos) return 'trago';
  if (p.category === 'merch' || /merch/i.test(p.groupName ?? '')) return 'merch';
  if (/cigarr/i.test(p.groupName ?? '')) return 'cigarros';
  if (/comida/i.test(p.groupName ?? '')) return 'comida';
  return 'otro';
}

/** Ventana grande y centrada para armar la receta de un trago (no un panel lateral). Arriba se elige qué es el producto:
 * si se vende solo (cigarros, merch, comida…) no pide insumos. También permite quitarlo de la carta. */
export function RecetaDialog({ producto, data, onClose, onSaved, onChanged }: {
  producto: BarraProducto | null; data: BarraData; onClose: () => void; onSaved: () => void; onChanged: () => void;
}) {
  const setTipo = trpc.insumos.setTipoProducto.useMutation({
    onSuccess: () => { toast.success('Tipo guardado'); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const setOculto = trpc.insumos.setProductoOculto.useMutation({
    onSuccess: (_r, v) => { toast.success(v.oculto ? 'Quitado de la carta (se puede volver a poner)' : 'De vuelta en la carta'); onChanged(); if (v.oculto) onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const actual = producto ? tipoActual(producto) : 'trago';
  const elegir = (t: TipoProducto) => {
    if (!producto || t === actual) return;
    if (t !== 'trago' && producto.receta.length > 0 && !window.confirm(`«${producto.name}» ya tiene receta. Si lo pasas a ${TIPOS_PRODUCTO.find((x) => x.id === t)!.label.toLowerCase()} se borra su receta. ¿Seguir?`)) return;
    setTipo.mutate({ ticketTypeId: producto.id, tipo: t });
  };

  return (
    <Dialog open={!!producto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-xl"><span className="text-2xl leading-none">{producto?.emoji || '🍸'}</span>{producto?.name}</DialogTitle>
          <DialogDescription>{producto?.sinInsumos ? 'Este producto se vende solo: no lleva insumos.' : 'Elige el vaso, suma los ingredientes y listo: cada venta descuenta estos insumos sola.'}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pt-4 pb-4">
          {producto && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">¿Qué es este producto?</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Tipo de producto">
                {TIPOS_PRODUCTO.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={actual === t.id} disabled={setTipo.isPending} onClick={() => elegir(t.id)}
                    className={`rounded-2xl border-2 px-2 py-3 text-center transition active:scale-95 ${actual === t.id ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
                    <span className="block text-3xl leading-none">{t.emoji}</span>
                    <span className="mt-1 block text-sm font-semibold">{t.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{TIPOS_PRODUCTO.find((t) => t.id === actual)?.help} Cigarros, merch y comida quedan agrupados en su propia sección.</p>
            </section>
          )}

          {producto && !producto.sinInsumos && <RecetaVisual key={producto.id} producto={producto} data={data} wide onCancel={onClose} onSaved={onSaved} />}

          {producto && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="button" variant="outline" disabled={setOculto.isPending} onClick={() => setOculto.mutate({ ticketTypeId: producto.id, oculto: !producto.oculto })}>
                {producto.oculto ? <><Eye className="mr-2 h-4 w-4" /> Volver a poner en la carta</> : <><EyeOff className="mr-2 h-4 w-4" /> Ya no va / está repetido: quitar de la carta</>}
              </Button>
              <p className="text-xs text-muted-foreground">Queda oculto (no sale en /caja) y conserva sus ventas. Para borrarlo del todo, usa la Carta.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
