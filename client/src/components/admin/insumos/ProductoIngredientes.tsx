import { trpc } from '@/lib/trpc';
import { RecetaVisual } from './RecetaVisual';

/** Los insumos que descuenta UN producto de la Carta (licor base, mezcladores, vaso), editables desde su ficha. */
export function ProductoIngredientes({ eventId, productId, registerSave }: { eventId: number; productId: number; registerSave?: (save: (() => Promise<unknown>) | null) => void }) {
  const utils = trpc.useUtils();
  const schema = trpc.insumos.schema.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const ready = schema.data?.ready ?? true;
  const estado = trpc.insumos.estado.useQuery({ eventId }, { enabled: ready });
  const data = estado.data?.ready ? estado.data : null;
  const producto = data?.productos.find((p) => p.id === productId);

  if (!ready) return <p className="text-sm text-muted-foreground">Falta activar el stock de barra: entra a Eventos → Stock de Barra y aprieta «Activar ahora».</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Cargando insumos…</p>;
  if (data.insumos.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay insumos: créalos en Eventos → Stock de Barra (o con «Cargar dosier»).</p>;
  if (!producto) return <p className="text-sm text-muted-foreground">Este producto no descuenta insumos (solo los tragos y la comida de la carta).</p>;

  return (
    <div className="space-y-2">
      <RecetaVisual key={`${producto.id}:${producto.glass}:${producto.receta.length}`} producto={producto} data={data} registerSave={registerSave} onSaved={() => { utils.insumos.estado.invalidate(); utils.insumos.proyeccion.invalidate(); }} />
      <p className="text-xs text-muted-foreground">
        Cada venta de este producto en /caja descuenta estos insumos solos. Si dos tragos usan el mismo licor, descuentan de la misma botella.
      </p>
    </div>
  );
}
