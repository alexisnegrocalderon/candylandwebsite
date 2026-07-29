import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaymentBrick } from '@/components/PaymentBrick';
import { MAX_GIFT_MESSAGE_LENGTH } from '@shared/party';

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
      <h2 className="font-heading font-extrabold text-2xl tracking-tight mb-1">Invítale un trago</h2>
      <p className="text-sm text-white/45 mb-5">A {targetAlias}. Si acepta, ahí recién pagas.</p>

      {drinks.isLoading && <p className="text-sm text-white/40 py-6 text-center">Cargando la barra…</p>}
      {drinks.data?.length === 0 && (
        <p className="text-sm text-white/40 py-6 text-center">Esta fiesta no tiene tragos cargados en la barra.</p>
      )}

      <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
        {drinks.data?.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelected(d.id)}
            className={`w-full flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition-colors ${
              selected === d.id ? 'bg-primary/15 border-primary/60' : 'border-white/12'
            }`}
          >
            <span className="min-w-0">
              <span className="block font-semibold text-sm">{d.name}</span>
              {d.description && <span className="block text-xs text-white/40 truncate">{d.description}</span>}
            </span>
            <span className="font-bold text-sm shrink-0">{clp(d.price)}</span>
          </button>
        ))}
      </div>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={MAX_GIFT_MESSAGE_LENGTH}
        placeholder="Una nota, si quieres (opcional)"
        className="w-full h-12 px-4 mb-4 rounded-2xl bg-white/[0.06] border border-white/15 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
      />

      <button
        disabled={!selected || send.isPending}
        onClick={() => selected && send.mutate({ ticketCode, targetProfileId, ticketTypeId: selected, message })}
        className="w-full h-14 rounded-full bg-primary font-bold disabled:opacity-35"
      >
        {send.isPending ? 'Enviando…' : 'Mandar la invitación'}
      </button>
      <p className="text-[11px] text-white/30 text-center mt-3">
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
        <h2 className="font-heading font-extrabold text-2xl tracking-tight mb-1">Paga el trago</h2>
        <p className="text-sm text-white/45 mb-5">{clp(paying.total)} · al precio de la barra, sin recargo</p>
        <PaymentBrick
          orderNumber={paying.orderNumber}
          amount={paying.total}
          containerId="mp-gift-brick"
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
      <h2 className="font-heading font-extrabold text-2xl tracking-tight mb-5">Tragos 🍹</h2>

      <p className="text-xs uppercase tracking-wide text-white/45 mb-2">Para ti</p>
      {received.length === 0 && <p className="text-sm text-white/30 mb-6">Todavía no te invitaron nada.</p>}
      <div className="space-y-2 mb-6">
        {received.map((g) => (
          <div key={g.id} className="p-4 rounded-2xl bg-white/[0.05] border border-white/10">
            <div className="flex items-start justify-between gap-3 mb-1">
              <p className="font-semibold text-sm">{g.drinkName}</p>
              <p className="text-xs text-white/40 shrink-0">de {g.fromAlias}</p>
            </div>
            {g.message && <p className="text-xs text-white/50 italic mb-2">"{g.message}"</p>}

            {g.status === 'invited' && (
              <div className="flex gap-2 mt-3">
                <button
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ ticketCode, giftId: g.id, accept: true })}
                  className="flex-1 h-11 rounded-full bg-primary text-sm font-bold disabled:opacity-40"
                >
                  Aceptar
                </button>
                <button
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ ticketCode, giftId: g.id, accept: false })}
                  className="px-5 h-11 rounded-full border border-white/15 text-sm text-white/55 disabled:opacity-40"
                >
                  No, gracias
                </button>
              </div>
            )}

            {g.status === 'accepted' && <p className="text-xs text-white/45 mt-2">Aceptado. Esperando que lo pague…</p>}
            {g.status === 'declined' && <p className="text-xs text-white/35 mt-2">Lo rechazaste.</p>}
            {g.status === 'expired' && <p className="text-xs text-white/35 mt-2">La invitación venció.</p>}
            {g.status === 'redeemed' && <p className="text-xs text-white/35 mt-2">Ya lo retiraste en la barra.</p>}

            {/* Lo único que importa cuando llegas a la barra: el código,
                grande y legible en la oscuridad. */}
            {g.status === 'paid' && g.displayCode && (
              <div className="mt-3 p-4 rounded-2xl bg-primary/15 border border-primary/35 text-center">
                <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1.5">Muéstralo en la barra</p>
                <p className="font-mono font-bold text-2xl tracking-widest">{g.displayCode}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs uppercase tracking-wide text-white/45 mb-2">Invitaste</p>
      {sent.length === 0 && <p className="text-sm text-white/30">Todavía no invitaste ninguno.</p>}
      <div className="space-y-2">
        {sent.map((g) => (
          <div key={g.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-sm">{g.drinkName}</p>
              <p className="text-xs text-white/40 shrink-0">para {g.toAlias}</p>
            </div>

            {g.status === 'invited' && <p className="text-xs text-white/40 mt-1.5">Esperando respuesta…</p>}
            {g.status === 'declined' && <p className="text-xs text-white/35 mt-1.5">No lo quiso. No se te cobró nada.</p>}
            {g.status === 'expired' && <p className="text-xs text-white/35 mt-1.5">Venció sin respuesta. No se te cobró nada.</p>}
            {g.status === 'paid' && <p className="text-xs text-emerald-300/70 mt-1.5">Pagado ✅ — puede retirarlo en la barra</p>}
            {g.status === 'redeemed' && <p className="text-xs text-white/35 mt-1.5">Ya lo retiró 🍹</p>}

            {g.status === 'accepted' && (
              <button
                disabled={pay.isPending}
                onClick={() => pay.mutate({ ticketCode, giftId: g.id })}
                className="w-full h-12 mt-3 rounded-full bg-primary text-sm font-bold disabled:opacity-40"
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
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md max-h-[88dvh] overflow-y-auto bg-[#1a1019] border-t border-white/12 rounded-t-3xl p-6 pb-9"
        initial={{ y: 240 }} animate={{ y: 0 }} exit={{ y: 240 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end -mt-2 -mr-2 mb-1">
          <button onClick={onClose} className="p-2 text-white/40" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
