import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Wine } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaymentBrick } from '@/components/PaymentBrick';
import { MAX_GIFT_MESSAGE_LENGTH } from '@shared/party';
import { PmSheet, PM_CTA, tap } from '@/components/party/ui';

/* Invitar un trago. Tiene tres pasos y no uno porque la otra persona puede
 * rechazar, y nadie paga por un trago rechazado: invitas (gratis), te
 * responde, y recién ahí pagas. */

function clp(n: number) {
  return `$${n.toLocaleString('es-CL')}`;
}

/** Paso 1: elegir el trago y mandar la invitación. */
export function DrinkPicker({ ticketCode, targetProfileId, targetAlias, onClose, onSent }: {
  ticketCode: string;
  targetProfileId: number;
  targetAlias: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const drinks = trpc.party.listDrinks.useQuery({ ticketCode });
  const utils = trpc.useUtils();

  const send = trpc.party.sendGift.useMutation({
    onSuccess: () => {
      utils.party.myGifts.invalidate();
      toast.success(`Invitación enviada a ${targetAlias} 🍹`);
      onSent();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-title2 font-bold tracking-tight">Invítale un trago</h2>
      <p className="mb-5 mt-1 text-subhead text-white/70">A {targetAlias}. Si acepta, ahí recién pagas.</p>

      {drinks.isLoading && <p className="py-6 text-center text-subhead text-white/60">Cargando la barra…</p>}
      {drinks.data?.length === 0 && (
        <p className="py-6 text-center text-subhead text-white/60">Esta fiesta no tiene tragos cargados en la barra.</p>
      )}

      <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
        {drinks.data?.map((d) => (
          <button
            key={d.id}
            onClick={() => { tap(); setSelected(d.id); }}
            className={`flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition-colors ${
              selected === d.id ? 'border-pink-400/70 bg-pink-500/15' : 'border-white/12 bg-white/[0.04]'
            }`}
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${selected === d.id ? 'bg-pink-500' : 'bg-white/10'}`}>
              {selected === d.id ? <Check className="h-5 w-5" /> : <Wine className="h-5 w-5 text-amber-300" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold">{d.name}</span>
              {d.description && <span className="block truncate text-footnote text-white/60">{d.description}</span>}
            </span>
            <span className="shrink-0 text-body font-bold tabular-nums">{clp(d.price)}</span>
          </button>
        ))}
      </div>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={MAX_GIFT_MESSAGE_LENGTH}
        placeholder="Una nota, si quieres (opcional)"
        className="mb-4 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-body text-white placeholder:text-white/45 focus:border-pink-400/60 focus:outline-none"
      />

      <button
        disabled={!selected || send.isPending}
        onClick={() => selected && send.mutate({ ticketCode, targetProfileId, ticketTypeId: selected, message })}
        className={`h-14 w-full rounded-full text-headline ${PM_CTA} disabled:opacity-40`}
      >
        {send.isPending ? 'Enviando…' : 'Mandar la invitación'}
      </button>
      <p className="mt-3 text-center text-caption1 text-white/60">
        No se te cobra nada ahora. Solo pagas si acepta.
      </p>
    </Sheet>
  );
}

/** Bandeja de regalos: los que me invitaron y los que mandé. */
export function GiftInbox({ ticketCode, onClose }: { ticketCode: string; onClose: () => void }) {
  const gifts = trpc.party.myGifts.useQuery({ ticketCode }, { refetchInterval: 10_000 });
  const utils = trpc.useUtils();
  const [paying, setPaying] = useState<{ giftId: number; orderNumber: string; total: number } | null>(null);

  const refresh = () => utils.party.myGifts.invalidate();

  const respond = trpc.party.respondGift.useMutation({
    onSuccess: (res) => {
      refresh();
      toast.success(res.status === 'accepted' ? '¡Aceptado! Le avisamos para que lo pague 🍹' : 'Listo, lo rechazaste');
    },
    onError: (e) => toast.error(e.message),
  });

  const pay = trpc.party.payGift.useMutation({
    onSuccess: (res, vars) => setPaying({ giftId: vars.giftId, orderNumber: res.orderNumber, total: res.total }),
    onError: (e) => toast.error(e.message),
  });

  const received = gifts.data?.received ?? [];
  const sent = gifts.data?.sent ?? [];

  if (paying) {
    return (
      <Sheet onClose={() => setPaying(null)}>
        <h2 className="text-title2 font-bold tracking-tight">Paga el trago</h2>
        <p className="mb-5 mt-1 text-subhead text-white/70">{clp(paying.total)} · al precio de la barra, sin recargo</p>
        <PaymentBrick
          orderNumber={paying.orderNumber}
          amount={paying.total}
          containerId="mp-gift-brick"
          tone="dark"
          onResult={(status) => {
            if (status === 'approved') {
              toast.success('¡Pagado! Ya le llegó el código 🍹');
              refresh();
              setPaying(null);
            } else if (status === 'pending' || status === 'in_process') {
              toast.info('El pago quedó en revisión. Te avisamos apenas se confirme.');
              setPaying(null);
            }
          }}
          onError={(msg) => toast.error(msg)}
        />
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="mb-5 text-title2 font-bold tracking-tight">Tragos</h2>

      <p className="mb-2 text-footnote font-semibold uppercase tracking-wide text-white/60">Para ti</p>
      {received.length === 0 && <p className="mb-6 text-subhead text-white/60">Todavía no te invitaron nada.</p>}
      <div className="space-y-2 mb-6">
        {received.map((g) => (
          <div key={g.id} className="account-glass rounded-[20px] p-4">
            <div className="mb-1 flex items-start justify-between gap-3">
              <p className="text-body font-semibold">{g.drinkName}</p>
              <p className="shrink-0 text-footnote text-white/60">de {g.fromAlias}</p>
            </div>
            {g.message && <p className="mb-2 text-footnote italic text-white/70">«{g.message}»</p>}

            {g.status === 'invited' && (
              <div className="flex gap-2 mt-3">
                <button
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ ticketCode, giftId: g.id, accept: true })}
                  className={`h-11 flex-1 rounded-full text-subhead ${PM_CTA} disabled:opacity-40`}
                >
                  Aceptar
                </button>
                <button
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ ticketCode, giftId: g.id, accept: false })}
                  className="lg-pill h-11 rounded-full px-5 text-subhead font-semibold disabled:opacity-40"
                >
                  No, gracias
                </button>
              </div>
            )}

            {g.status === 'accepted' && <p className="mt-2 text-footnote text-white/65">Aceptado. Esperando que lo pague…</p>}
            {g.status === 'declined' && <p className="mt-2 text-footnote text-white/60">Lo rechazaste.</p>}
            {g.status === 'expired' && <p className="mt-2 text-footnote text-white/60">La invitación venció.</p>}
            {g.status === 'redeemed' && <p className="mt-2 text-footnote text-white/60">Ya lo retiraste en la barra.</p>}

            {/* Lo único que importa cuando llegas a la barra: el código,
                grande y legible en la oscuridad. */}
            {g.status === 'paid' && g.displayCode && (
              <div className="mt-3 rounded-2xl border border-pink-400/40 bg-pink-500/15 p-4 text-center">
                <p className="mb-1.5 text-caption2 font-semibold uppercase tracking-widest text-white/70">Muéstralo en la barra</p>
                <p className="font-mono text-title1 font-bold tracking-widest">{g.displayCode}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mb-2 text-footnote font-semibold uppercase tracking-wide text-white/60">Invitaste</p>
      {sent.length === 0 && <p className="text-subhead text-white/60">Todavía no invitaste ninguno.</p>}
      <div className="space-y-2">
        {sent.map((g) => (
          <div key={g.id} className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-body font-semibold">{g.drinkName}</p>
              <p className="shrink-0 text-footnote text-white/60">para {g.toAlias}</p>
            </div>

            {g.status === 'invited' && <p className="mt-1.5 text-footnote text-white/65">Esperando respuesta…</p>}
            {g.status === 'declined' && <p className="mt-1.5 text-footnote text-white/60">No lo quiso. No se te cobró nada.</p>}
            {g.status === 'expired' && <p className="mt-1.5 text-footnote text-white/60">Venció sin respuesta. No se te cobró nada.</p>}
            {g.status === 'paid' && <p className="mt-1.5 text-footnote text-emerald-300">Pagado ✅ — puede retirarlo en la barra</p>}
            {g.status === 'redeemed' && <p className="mt-1.5 text-footnote text-white/60">Ya lo retiró 🍹</p>}

            {g.status === 'accepted' && (
              <button
                disabled={pay.isPending}
                onClick={() => pay.mutate({ ticketCode, giftId: g.id })}
                className={`mt-3 h-12 w-full rounded-full text-subhead ${PM_CTA} disabled:opacity-40`}
              >
                ¡Aceptó! Pagar {clp(g.priceClp)}
              </button>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <PmSheet onClose={onClose}>{children}</PmSheet>;
}
