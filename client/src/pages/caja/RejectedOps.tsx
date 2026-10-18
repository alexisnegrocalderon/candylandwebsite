import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatChileTime } from '@shared/chileDate';
import { cajaDB, discardOp, enqueueOp, getRejectedOps, type CajaCatalogItem, type CajaOpRecord } from './db';

/* Ventas que el servidor rechazó al sincronizar (ej. el catálogo de la
 * tablet estaba desactualizado). Antes desaparecían de la cola con un aviso
 * de 15 s; ahora quedan acá hasta que la cajera las reintenta o las
 * descarta, porque una venta rechazada NUNCA entró al sistema y el cuadre
 * del turno queda corto por ese monto. */

const METHOD_LABEL: Record<string, string> = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR' };

function newOpId(): string {
  return crypto.randomUUID();
}

export function RejectedOps({ eventId, onChanged }: { eventId: number; onChanged: () => void }) {
  const [rows, setRows] = useState<CajaOpRecord[]>([]);
  const [catalog, setCatalog] = useState<Map<number, CajaCatalogItem>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setRows(await getRejectedOps());
    const items = await cajaDB.catalog.toArray();
    setCatalog(new Map(items.map((i) => [i.id, i])));
  };
  useEffect(() => { load(); }, []);

  // Reintentar = la misma venta con un opId nuevo contra el evento actual:
  // el servidor recalcula precios con el catálogo vigente.
  const retry = async (rec: CajaOpRecord) => {
    if (rec.op.type !== 'sale') return;
    setBusy(rec.opId);
    try {
      await enqueueOp({ ...rec.op, opId: newOpId() }, eventId);
      await discardOp(rec.opId);
      toast.success('Venta reenviada -- se sincroniza en segundos');
      await load();
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const discard = async (rec: CajaOpRecord) => {
    if (!window.confirm('¿Descartar esta venta? No va a quedar registrada en ningún lado.')) return;
    await discardOp(rec.opId);
    await load();
    onChanged();
  };

  if (rows.length === 0) {
    return (
      <div className="admin-clay mx-auto max-w-lg p-8 text-center">
        <p className="text-muted-foreground">No hay ventas por rehacer. Todo quedó sincronizado.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="admin-clay flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--admin-warning-text)]" />
        <p className="text-sm text-muted-foreground">
          Estas ventas <b className="text-foreground">no entraron al sistema</b>. Si ya cobraste, reintenta; si la venta no se hizo, descártala.
        </p>
      </div>
      {rows.map((rec) => {
        const op = rec.op;
        const items = op.type === 'sale' ? op.items : [];
        const total = items.reduce((sum, it) => sum + (catalog.get(it.ticketTypeId)?.price ?? 0) * it.quantity, 0);
        return (
          <section key={rec.opId} className="admin-clay p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {op.type === 'sale' ? `Venta · ${METHOD_LABEL[op.paymentMethod] ?? op.paymentMethod}` : op.type}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{formatChileTime(new Date(rec.createdAt))}</span>
                </p>
                <ul className="mt-1 text-sm text-muted-foreground">
                  {items.map((it) => (
                    <li key={it.ticketTypeId}>{it.quantity} × {catalog.get(it.ticketTypeId)?.name ?? `Producto #${it.ticketTypeId}`}</li>
                  ))}
                </ul>
                {rec.conflictNote && <p className="mt-2 text-xs text-[var(--admin-danger-text)]">Motivo: {rec.conflictNote}</p>}
              </div>
              {total > 0 && <p className="shrink-0 text-lg font-bold tabular-nums">${total.toLocaleString('es-CL')}</p>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => discard(rec)}>
                <Trash2 className="mr-2 h-4 w-4" /> Descartar
              </Button>
              <Button className="h-11 rounded-xl" disabled={op.type !== 'sale' || busy === rec.opId} onClick={() => retry(rec)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reintentar
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
