import { ShoppingCart, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { EmptyState } from '@/components/admin/EmptyState';
import { ComprasTab } from './ComprasTab';

/** «Compra de la fiesta»: para un evento que NO usa el stock de Playroom (ej. PLAYMORE, donde la barra la maneja la otra
 * productora). La lista parte desde cero: dice todo lo que hay que comprar para la gente de la fiesta, sin mirar ni tocar el
 * inventario de Playroom, que queda intacto para el próximo evento. */
export function CompraFiestaView() {
  const { eventId, events } = useTonightEvent();
  const event = ((events ?? []) as any[]).find((e) => e.id === eventId);
  const estado = trpc.insumos.estado.useQuery({ eventId: eventId! }, { enabled: !!eventId, staleTime: 30_000 });
  const data = estado.data?.ready ? estado.data : null;

  if (!eventId) return <EmptyState icon={ShoppingCart} title="Elige un evento arriba." />;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl">Compra de la fiesta</h2>
        <p className="text-sm text-muted-foreground">{event?.title ?? 'Evento'} · lista de compras desde cero</p>
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
        <p className="text-base leading-relaxed">
          Esta fiesta <strong>no usa el stock de Playroom</strong>. La lista dice <strong>todo lo que hay que comprar</strong> y tu inventario de Playroom no se mira ni se toca:
          queda intacto para el próximo evento. Se calcula con la carta y el consumo de las últimas fiestas de Playroom.
        </p>
      </div>
      {estado.isLoading && <p className="text-sm text-muted-foreground">Calculando…</p>}
      {!estado.isLoading && !data && <EmptyState icon={ShoppingCart} title="El stock de barra todavía no está activado." />}
      {data && <ComprasTab eventId={eventId} data={data} />}
    </div>
  );
}
