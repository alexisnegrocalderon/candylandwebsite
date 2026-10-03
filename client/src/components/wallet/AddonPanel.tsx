import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/* Agregar estacionamiento u otros extras a la compra desde la tarjeta digital.
 * El cliente se identifica con el ticketCode del link (la misma prueba de
 * posesión que usa "Cargar saldo"), elige el extra y la cantidad, y paga con el
 * link de Mercado Pago. El precio y la orden los resuelve el servidor: acá solo se
 * muestra. Cuando el pago se acredita, el extra aparece solo en "Incluye" de la
 * tarjeta. Estilos: clases `wcard-*` de Ticket.wallet.css. */

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

export function AddonPanel({ ticketCode }: { ticketCode: string }) {
  const { data, isLoading } = trpc.playcardTopup.getAddonOptions.useQuery({ ticketCode }, { retry: false });
  const createAddon = trpc.playcardTopup.createAddon.useMutation();

  const [typeId, setTypeId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!data || !data.available || data.options.length === 0) {
    return <p className="wcard-hint">Por ahora no hay extras para agregar a tu compra.</p>;
  }

  const selected = data.options.find((o) => o.ticketTypeId === typeId) ?? null;
  const total = selected ? selected.price * quantity : 0;

  const pick = (id: number) => { setTypeId(id); setQuantity(1); setError(''); };

  const pay = () => {
    if (!selected) { setError('Elige qué quieres agregar.'); return; }
    setError('');
    createAddon.mutate(
      { ticketCode, ticketTypeId: selected.ticketTypeId, quantity },
      {
        onSuccess: (res) => { setRedirecting(true); window.location.href = res.paymentUrl; },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <div>
      {data.pending.length > 0 && (
        <div className="mb-5">
          <p className="font-bold text-sm mb-2">Tienes un pago pendiente</p>
          {data.pending.map((a) => (
            <a key={a.id} href={a.paymentUrl} className="wcard-btn wcard-btn-primary wcard-btn-block mb-2">
              Continuar el pago de {a.name}{a.quantity > 1 ? ` x${a.quantity}` : ''} · {clp(a.amount)}
            </a>
          ))}
          <p className="wcard-hint" style={{ marginTop: 4 }}>Si ya pagaste, en unos segundos aparece en "Incluye".</p>
        </div>
      )}

      <p className="wcard-hint mb-3" style={{ marginTop: 0 }}>
        Agrégalo a tu compra de <strong style={{ color: 'var(--wcard-gold)' }}>{data.eventTitle}</strong>. Recibes su código para canjearlo.
      </p>

      <div className="space-y-2">
        {data.options.map((o) => (
          <button
            key={o.ticketTypeId}
            type="button"
            className="wcard-amount"
            aria-pressed={typeId === o.ticketTypeId}
            disabled={!!o.disabledReason}
            onClick={() => pick(o.ticketTypeId)}
            style={o.disabledReason ? { opacity: 0.5 } : undefined}
          >
            <span>
              {o.name} · {clp(o.price)}
              {o.disabledReason && <small>{o.disabledReason}</small>}
            </span>
            {typeId === o.ticketTypeId && <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--wcard-gold)' }} />}
          </button>
        ))}
      </div>

      {selected && selected.maxQuantity > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold">Cantidad</span>
          <div className="flex items-center gap-3">
            <button type="button" className="wcard-btn wcard-btn-ghost" style={{ height: 40, width: 40, padding: 0 }} aria-label="Menos" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}>−</button>
            <span className="font-bold w-6 text-center">{quantity}</span>
            <button type="button" className="wcard-btn wcard-btn-ghost" style={{ height: 40, width: 40, padding: 0 }} aria-label="Más" disabled={quantity >= selected.maxQuantity} onClick={() => setQuantity(quantity + 1)}>+</button>
          </div>
        </div>
      )}

      {selected && (
        <p className="mt-4 text-sm">Total: <strong style={{ color: 'var(--wcard-gold)' }}>{clp(total)}</strong></p>
      )}

      {error && <p className="wcard-error">{error}</p>}

      <button
        type="button"
        className="wcard-btn wcard-btn-primary wcard-btn-block mt-5"
        disabled={createAddon.isPending || redirecting || !selected}
        onClick={pay}
      >
        {createAddon.isPending || redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ir a pagar con Mercado Pago'}
      </button>
    </div>
  );
}
