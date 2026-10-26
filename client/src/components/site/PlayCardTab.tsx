import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { Heart, Plus, QrCode, Wallet } from 'lucide-react';
import { WalletCard } from '@/components/wallet/WalletCard';
import { TiltCard } from '@/components/site/TiltCard';
import { CardCarousel } from '@/components/site/CardCarousel';
import { KitchenPass, LockerPass, QrViewer, TicketPass, tapHaptic, useRealTap, type MeEvent, type MeTicket, type Movement } from '@/components/site/walletParts';
import { buildWalletCards } from '@shared/walletCards';
import { canEnterParty } from '@shared/party';

/* La pestaña PlayCard de «Mi cuenta»: todas las tarjetas de la persona (entradas, estacionamiento, extras con
 * código, guardarropía y cocina de caja, y la PlayCard con su saldo) en un carrusel. Deslizar pasa de una a
 * otra y, en la última, a Playmatch. Cada tarjeta lleva sus propios botones. */

const BIG = 'flex h-14 shrink-0 items-center justify-center gap-2 rounded-full text-headline font-bold text-white interactive [@media(max-height:700px)]:h-12';
const GRADIENT = 'bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.4)]';

function QrButton({ onClick, primary }: { onClick: () => void; primary: boolean }) {
  const tap = useRealTap(() => { tapHaptic(); onClick(); });
  return <button type="button" {...tap} className={`${BIG} ${primary ? GRADIENT : 'lg-pill'}`}><QrCode className="h-5 w-5" /> Mostrar QR</button>;
}

function PlaymatchButton({ onClick }: { onClick: () => void }) {
  const tap = useRealTap(() => { tapHaptic(); onClick(); });
  return <button type="button" {...tap} className={`${BIG} ${GRADIENT}`}><Heart className="h-5 w-5" /> Entrar a Playmatch</button>;
}

/** Una página del carrusel: la tarjeta (centrada) y sus botones. Si no cabe, se desliza hacia abajo dentro de la página. */
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain">
      <div className="my-auto flex flex-col gap-3 py-1 [@media(max-height:700px)]:gap-2">{children}</div>
    </div>
  );
}

export function PlayCardTab({ events, holder, prepaidBalance, playcoins, movements, movementsPreview, onTopup, onPayCaja, onPlaymatch, onNextTab }: {
  events: MeEvent[]; holder: string; prepaidBalance: number; playcoins: number; movements: Movement[];
  /** Los últimos movimientos, debajo de la PlayCard. */
  movementsPreview?: ReactNode;
  onTopup?: () => void; onPayCaja?: () => void; onPlaymatch: () => void; onNextTab: () => void;
}) {
  const [qr, setQr] = useState<{ ev: MeEvent; t: MeTicket } | null>(null);
  const specs = useMemo(() => buildWalletCards(events), [events]);
  const firstTicket = events[0]?.tickets[0]?.ticketCode ?? null;

  const cards = specs.map((spec) => {
    if (spec.type === 'playcard') {
      return (
        <Page key={spec.key}>
          <TiltCard>
            <WalletCard
              eventTitle="" eventDateShort="" holderName={holder} ticketCode={firstTicket} qrImageUrl={null}
              prepaidBalance={prepaidBalance} playcoins={playcoins}
              movements={movements.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })) as any}
              hideFlipHint
            />
          </TiltCard>
          {(onPayCaja || onTopup) && (
            <div className={`grid shrink-0 gap-2 ${onPayCaja && onTopup ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {onPayCaja && <button type="button" onClick={() => { tapHaptic(); onPayCaja(); }} className="lg-pill flex h-12 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive"><Wallet className="h-4 w-4 text-pink-300" /> Pagar</button>}
              {onTopup && <button type="button" onClick={() => { tapHaptic(); onTopup(); }} className="lg-pill flex h-12 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive"><Plus className="h-4 w-4 text-pink-300" /> Recargar</button>}
            </div>
          )}
          {movementsPreview}
        </Page>
      );
    }
    const ev = events.find((e) => e.eventId === spec.eventId);
    if (!ev) return <Page key={spec.key}>{null}</Page>;
    if (spec.type === 'locker') {
      const locker = ev.lockers?.find((l) => l.tagNumber === spec.tagNumber);
      return <Page key={spec.key}>{locker && <LockerPass ev={ev} locker={locker} />}</Page>;
    }
    if (spec.type === 'kitchen') {
      const order = ev.kitchen?.find((k) => k.ticketNumber === spec.ticketNumber);
      return <Page key={spec.key}>{order && <KitchenPass ev={ev} order={order} />}</Page>;
    }
    const t = ev.tickets.find((x) => x.ticketCode === spec.ticketCode);
    if (!t) return <Page key={spec.key}>{null}</Page>;
    const usable = !!t.qrImageUrl && t.status !== 'used';
    // La noche de la fiesta, con la entrada ya escaneada en la puerta: Playmatch a un toque, en esa entrada.
    const playmatch = (t.category ?? 'acceso') === 'acceso' && canEnterParty({ status: t.status, eventId: ev.eventId }, { eventDate: ev.eventDate, doorsOpen: ev.doorsOpen, eventEnd: ev.eventEnd });
    return (
      <Page key={spec.key}>
        <TicketPass ev={ev} t={t} holder={holder} />
        {playmatch && <PlaymatchButton onClick={onPlaymatch} />}
        {usable && <QrButton onClick={() => setQr({ ev, t })} primary={!playmatch} />}
      </Page>
    );
  });

  return (
    <>
      <CardCarousel cards={cards} onNextTab={onNextTab} />
      {createPortal(<AnimatePresence>{qr && <QrViewer ev={qr.ev} t={qr.t} holder={holder} onClose={() => setQr(null)} />}</AnimatePresence>, document.body)}
    </>
  );
}
