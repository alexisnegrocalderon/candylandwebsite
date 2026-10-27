import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RecetaVisual } from './RecetaVisual';
import type { BarraData, BarraProducto } from './types';

/** Ventana grande y centrada para armar la receta de un trago (no un panel lateral). */
export function RecetaDialog({ producto, data, onClose, onSaved }: { producto: BarraProducto | null; data: BarraData; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={!!producto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-xl"><span className="text-2xl leading-none">{producto?.emoji || '🍸'}</span>{producto?.name}</DialogTitle>
          <DialogDescription>Elige el vaso, suma los ingredientes y listo: cada venta descuenta estos insumos sola.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4">
          {producto && <RecetaVisual key={producto.id} producto={producto} data={data} wide onCancel={onClose} onSaved={onSaved} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
