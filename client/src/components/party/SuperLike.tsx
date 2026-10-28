import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Heart, Loader2, Lock, Star, Wallet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { TicketTopup } from '@/components/site/AccountPayments';
import { PM_CTA, PersonPhoto, PmSheet, tap } from '@/components/party/ui';
import type { PartyGender, PartyZone } from '@shared/party';

/* Super Likes pagados y «Ver quién me dio ♥»: las dos hojas que cobran dentro de Playmatch. Se paga primero con
 * Playcoins y lo que falte sale del saldo PlayCard; si no alcanza, se recarga ahí mismo (la recarga de siempre). */

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

/** Un identificador por intento de compra: si la conexión se corta y se reintenta, no se cobra dos veces. */
export function newOpId(): string {
  try { return crypto.randomUUID().replace(/-/g, '').slice(0, 24); } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }
}

export function useSuperLikeStatus(ticketCode: string, enabled = true) {
  return trpc.party.superLikeStatus.useQuery({ ticketCode }, { enabled, staleTime: 5_000 });
}

/** Lo que tiene la persona para pagar. */
function WalletLine({ playcoins, saldo }: { playcoins: number; saldo: number }) {
  return (
    <p className="flex items-center justify-center gap-1.5 text-footnote text-white/65">
      <Wallet className="h-3.5 w-3.5" /> {playcoins.toLocaleString('es-CL')} Playcoins · {clp(saldo)} de saldo
    </p>
  );
}

/** Lo que falta y cómo recargar. */
function TopupPrompt({ ticketCode, missing, onBack, onPaid }: { ticketCode: string; missing: number | null; onBack: () => void; onPaid: () => void }) {
  return (
    <div className="space-y-3 pb-2">
      <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1 rounded-full pr-3 text-subhead font-semibold text-pink-300 interactive"><ArrowLeft className="h-4 w-4" /> Volver</button>
      <p className="text-headline font-bold">Recarga tu saldo</p>
      {missing ? <p className="text-subhead text-white/70">Te faltan {clp(missing)}. Elige un monto: cuando se confirme el pago, vuelves y pagas con un toque.</p> : null}
      <TicketTopup ticketCode={ticketCode} onPaid={onPaid} />
    </div>
  );
}

type Pending = { quantity: number; opId: string };

/** Comprar Super Likes: uno suelto o el pack. Al terminar avisa cuántos le quedan (`onBought`). */
export function SuperLikeSheet({ ticketCode, onClose, onBought }: { ticketCode: string; onClose: () => void; onBought: (credits: number) => void }) {
  const utils = trpc.useUtils();
  const status = useSuperLikeStatus(ticketCode);
  const buy = trpc.party.superLikeBuy.useMutation();
  const [view, setView] = useState<'buy' | 'topup'>('buy');
  const [missing, setMissing] = useState<number | null>(null);
  // El mismo id mientras el intento no termina (un reintento no cobra dos veces); uno nuevo después de cada compra.
  const pending = useRef<Pending | null>(null);

  const s = status.data;
  const run = (quantity: number) => {
    if (buy.isPending) return;
    tap();
    if (!pending.current || pending.current.quantity !== quantity) pending.current = { quantity, opId: newOpId() };
    buy.mutate({ ticketCode, quantity, opId: pending.current.opId }, {
      onSuccess: (res) => {
        if (!res.ok) { setMissing(res.missing ?? null); setView('topup'); return; }
        pending.current = null;
        void utils.party.superLikeStatus.invalidate();
        void utils.party.listMansion.invalidate();
        toast.success(`⭐ ${quantity === 1 ? 'Super Like listo' : `${quantity} Super Likes listos`} · pagaste ${res.text}`);
        onBought('credits' in res && typeof res.credits === 'number' ? res.credits : quantity);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <PmSheet title={view === 'buy' ? '⭐ Super Like' : undefined} onClose={onClose}>
      {view === 'topup' ? (
        <TopupPrompt ticketCode={ticketCode} missing={missing} onBack={() => setView('buy')}
          onPaid={() => { window.setTimeout(() => { void utils.party.superLikeStatus.invalidate(); }, 2500); setView('buy'); }} />
      ) : !s ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
      ) : (
        <div className="space-y-4 pb-2">
          <p className="text-subhead leading-snug text-white/75">
            La otra persona se entera al tiro de que le mandaste un Super Like. Si te da ♥, es match.
          </p>
          <p className="flex items-center justify-center gap-2 rounded-2xl bg-sky-400/10 py-2.5 text-subhead font-semibold text-sky-200">
            <Star className="h-4 w-4 fill-sky-300 text-sky-300" /> Te quedan {s.available} {s.available === 1 ? 'Super Like' : 'Super Likes'}
          </p>
          {s.offers.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.06] p-4 text-center text-subhead text-white/70">
              {s.paidLeft === 0 ? `Ya compraste los ${s.bought} de esta noche. Mañana hay más.` : 'Por ahora no se pueden comprar Super Likes.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {s.offers.map((o) => (
                <button key={o.key} type="button" disabled={buy.isPending} onClick={() => run(o.quantity)}
                  className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left interactive disabled:opacity-60 ${o.key === 'pack' ? PM_CTA : 'lg-pill'}`}>
                  <span className="flex items-center gap-2 text-headline font-bold"><Star className="h-5 w-5 fill-current" /> {o.label}</span>
                  <span className="text-headline font-bold tabular-nums">{buy.isPending && pending.current?.quantity === o.quantity ? <Loader2 className="h-5 w-5 animate-spin" /> : clp(o.price)}</span>
                </button>
              ))}
              {s.offers.some((o) => o.key === 'pack') && <p className="text-center text-caption1 text-white/55">El pack sale más barato que comprarlos de a uno.</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-center text-footnote text-white/65">Pagas primero con tus Playcoins y lo que falte sale de tu saldo.</p>
            <WalletLine playcoins={s.wallet.playcoins} saldo={s.wallet.saldo} />
            <button type="button" onClick={() => { tap(); setMissing(null); setView('topup'); }} className="mx-auto flex h-10 items-center justify-center rounded-full px-4 text-subhead font-semibold text-pink-300 interactive">Recargar saldo</button>
          </div>
          <p className="text-center text-caption2 text-white/45">Los que no uses esta noche no se acumulan ni se devuelven.</p>
        </div>
      )}
    </PmSheet>
  );
}

/* --- Quién me dio ♥ ------------------------------------------------------------------ */

export type LikeCard = {
  id: number; alias: string; gender: PartyGender; avatarId: number; zone: PartyZone; costume: string | null; photoCount: number; pairType: string | null;
  orientation: string | null; relationStyle: string | null; intents: string[]; common: string[]; affinity: number | null;
};

/** «Les gustas a N personas»: cuántas se ve siempre; quiénes, tras pagar el desbloqueo de la noche. */
export function LikesSheet({ ticketCode, viewerAlias, canPhoto, onClose, onMatch, onInfo }: {
  ticketCode: string;
  viewerAlias: string;
  canPhoto: boolean;
  onClose: () => void;
  onMatch: (m: { connectionId: number; alias: string; otherId: number }) => void;
  onInfo: (card: LikeCard) => void;
}) {
  const utils = trpc.useUtils();
  const likes = trpc.party.likesForMe.useQuery({ ticketCode });
  const status = useSuperLikeStatus(ticketCode);
  const unlock = trpc.party.likesUnlock.useMutation();
  const swipe = trpc.party.swipe.useMutation();
  const [view, setView] = useState<'list' | 'topup'>('list');
  const [missing, setMissing] = useState<number | null>(null);
  const op = useRef<string | null>(null);

  const data = likes.data;
  const s = status.data;
  const price = s?.likesUnlockPrice ?? 0;

  const pay = () => {
    if (unlock.isPending) return;
    tap();
    op.current ??= newOpId();
    unlock.mutate({ ticketCode, opId: op.current }, {
      onSuccess: (res) => {
        if (!res.ok) { setMissing(res.missing ?? null); setView('topup'); return; }
        op.current = null;
        void utils.party.likesForMe.invalidate();
        void utils.party.superLikeStatus.invalidate();
        toast.success(`♥ Desbloqueado${res.text && res.text !== 'ya desbloqueado' ? ` · pagaste ${res.text}` : ''}`);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const likeBack = (card: LikeCard) => {
    tap();
    swipe.mutate({ ticketCode, targetProfileId: card.id, liked: true }, {
      onSuccess: (res) => {
        void utils.party.likesForMe.invalidate();
        void utils.party.swipeDeck.invalidate();
        if (res.match) { onClose(); onMatch({ connectionId: res.connectionId, alias: res.alias, otherId: card.id }); }
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <PmSheet title={view === 'list' ? 'Quién te dio ♥' : undefined} onClose={onClose} tall={view === 'list' && !!data?.unlocked && data.people.length > 3}>
      {view === 'topup' ? (
        <TopupPrompt ticketCode={ticketCode} missing={missing} onBack={() => setView('list')}
          onPaid={() => { window.setTimeout(() => { void utils.party.superLikeStatus.invalidate(); }, 2500); setView('list'); }} />
      ) : !data ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
      ) : data.count === 0 ? (
        <p className="rounded-2xl bg-white/[0.06] p-5 text-center text-subhead text-white/70">Todavía nadie te dio ♥ que no hayas visto. Sigue deslizando: apenas llegue alguien, te avisamos.</p>
      ) : !data.unlocked ? (
        <div className="space-y-4 pb-2 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-pink-500/15"><Lock className="h-8 w-8 text-pink-300" /></div>
          <p className="text-title2 font-bold">Les gustas a {data.count === 1 ? '1 persona' : `${data.count} personas`}</p>
          <p className="text-subhead text-white/70">Desbloquea para ver quiénes son y darles ♥ al tiro: es match.</p>
          <button type="button" disabled={unlock.isPending} onClick={pay} className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-headline ${PM_CTA} interactive disabled:opacity-60`}>
            {unlock.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Heart className="h-5 w-5 fill-current" /> Ver quién · {clp(price)}</>}
          </button>
          {s && <WalletLine playcoins={s.wallet.playcoins} saldo={s.wallet.saldo} />}
          <p className="text-caption1 text-white/55">Pagas primero con Playcoins y lo que falte sale de tu saldo. Vale solo por esta noche.</p>
        </div>
      ) : (
        <ul className="space-y-2.5 pb-2">
          {(data.people as LikeCard[]).map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5">
              <button type="button" onClick={() => { tap(); onInfo(p); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={p} className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl" quiet />
                <span className="min-w-0">
                  <span className="block truncate text-headline font-bold">{p.alias}</span>
                  <span className="block truncate text-footnote text-white/60">{p.affinity != null ? `${p.affinity}% afín` : 'Te dio ♥'}{p.common.length ? ` · ${p.common.slice(0, 2).join(' · ')}` : ''}</span>
                </span>
              </button>
              <button type="button" disabled={swipe.isPending} onClick={() => likeBack(p)} aria-label={`Darle ♥ a ${p.alias}`}
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${PM_CTA} interactive disabled:opacity-60`}><Heart className="h-6 w-6 fill-current" /></button>
            </li>
          ))}
          <li className="flex items-center justify-center gap-1.5 pt-1 text-caption1 text-white/50"><Check className="h-3.5 w-3.5" /> Desbloqueado por esta noche</li>
        </ul>
      )}
    </PmSheet>
  );
}
