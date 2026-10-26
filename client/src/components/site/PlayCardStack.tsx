import { Fragment, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Heart, Plus, QrCode, Wallet } from 'lucide-react';
import { WalletCard } from '@/components/wallet/WalletCard';
import { TiltCard } from '@/components/site/TiltCard';
import { QrViewer, TicketPass, holderLabels, tapHaptic, useRealTap, type MeEvent, type MeTicket, type Movement } from '@/components/site/walletParts';
import { LiveStrip, NightRow, NightSheet } from '@/components/site/NightExtras';
import { horizontalSwipe } from '@shared/cardSwipe';
import { canEnterParty } from '@shared/party';

/* La pestaña PlayCard de «Mi cuenta», como siempre: la entrada del próximo evento adelante y la PlayCard
 * (saldo y Playcoins) detrás, asomando su encabezado, con los botones de abajo (Mostrar QR, Pagar, Recargar)
 * y el selector de entradas. Tocar la tarjeta de atrás la trae al frente.
 *
 * Lo único que se suma: deslizar de lado SOBRE LA TARJETA también las pasa (entrada ↔ PlayCard). Estando en
 * la PlayCard, un deslizar más hacia la izquierda pasa a Playmatch. Fuera de la tarjeta, deslizar sigue
 * cambiando de pestaña como antes. */

/** Cuánto asoma la tarjeta de atrás (su encabezado), como en Apple Wallet. */
const STACK_PEEK = 58;

export function PlayCardStack({ ev, holder, prepaidBalance, playcoins, movements, onTopup, onPayCaja, onPlaymatch, onNextTab }: {
  ev: MeEvent | null; holder: string; prepaidBalance: number; playcoins: number; movements: Movement[];
  onTopup?: () => void; onPayCaja?: () => void; onPlaymatch: () => void; onNextTab: () => void;
}) {
  const [i, setI] = useState(0);
  // El QR abierto (por código): desde el botón, desde «Mi noche» o al cambiar de QR dentro de la pantalla.
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [nightOpen, setNightOpen] = useState(false);
  const t = ev ? ev.tickets[Math.min(i, ev.tickets.length - 1)] : null;
  const usable = !!(ev && t?.qrImageUrl && t.status !== 'used');
  const hasPass = !!(ev && t);
  const qrTicket = ev && qrCode ? (ev.tickets.find((x) => x.ticketCode === qrCode) ?? null) : null;

  const [front, setFront] = useState<'entrada' | 'playcard'>('entrada');
  // Hacia dónde se fue el dedo en el último deslizar (para que la tarjeta entre del mismo lado); 0 = un toque.
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  // ¿El último movimiento fue pasar de entrada (el dedo o las flechas) o voltear a la PlayCard? Cambia cómo entra la tarjeta.
  const [movedTicket, setMovedTicket] = useState(false);
  const shown = hasPass ? front : 'playcard';
  const flip = (d: -1 | 0 | 1) => { tapHaptic(); setDir(d); setMovedTicket(false); setFront((f) => (f === 'entrada' ? 'playcard' : 'entrada')); };
  // Pasar de una entrada a otra: lo mismo con las flechas del selector que deslizando sobre la tarjeta.
  const count = ev?.tickets.length ?? 0;
  const step = (d: -1 | 1) => { if (!ev || count < 2) return; tapHaptic(); setDir(d); setMovedTicket(true); setI((v) => (v + d + count) % count); };
  const swap = useRealTap(() => flip(0));
  const qrTap = useRealTap(() => { tapHaptic(); if (t) setQrCode(t.ticketCode); });
  const playmatchTap = useRealTap(() => { tapHaptic(); onPlaymatch(); });

  // Deslizar sobre la tarjeta.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current; touch.current = null;
    if (!start) return;
    const p = e.changedTouches[0];
    const swipe = horizontalSwipe(p.clientX - start.x, p.clientY - start.y);
    if (!swipe) return;
    if (shown === 'entrada') step(swipe === 'left' ? 1 : -1);
    else if (swipe === 'left') onNextTab();
    else flip(-1);
  };

  const ownsSwipe = hasPass && (count > 1 || shown === 'playcard');

  const playcard = (
    <WalletCard
      eventTitle="" eventDateShort="" holderName={holder} ticketCode={t?.ticketCode ?? null} qrImageUrl={null}
      prepaidBalance={prepaidBalance} playcoins={playcoins}
      movements={movements.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })) as any}
      hideFlipHint
    />
  );
  const pass = hasPass ? <TicketPass ev={ev!} t={t!} holder={holder} /> : null;
  const frontNode = shown === 'entrada' ? pass : <TiltCard>{playcard}</TiltCard>;
  const backNode = shown === 'entrada' ? playcard : pass;

  // Hasta 3 entradas: píldoras. Más: selector con flechas («‹ Persona 2 · 2/6 ›»), que siempre cabe en una línea.
  const many = !!ev && ev.tickets.length > 3;
  const labels = ev ? holderLabels(ev.tickets) : [];
  const holderPills = ev && ev.tickets.length > 1 && (many ? (
    <div className="flex h-9 items-center gap-1 px-1 text-subhead font-semibold">
      <button type="button" onClick={() => step(-1)} aria-label="Entrada anterior" className="grid h-8 w-8 place-items-center rounded-full text-white/70"><ChevronLeft className="h-4 w-4" /></button>
      <span className="max-w-[120px] truncate px-1">{labels[i]} <span className="text-white/60">· {i + 1}/{ev.tickets.length}</span></span>
      <button type="button" onClick={() => step(1)} aria-label="Entrada siguiente" className="grid h-8 w-8 place-items-center rounded-full text-white/70"><ChevronRight className="h-4 w-4" /></button>
    </div>
  ) : ev.tickets.map((x, n) => (
    <Fragment key={x.ticketCode}>
      {n > 0 && (x.kind ?? 'acceso') !== 'acceso' && (ev.tickets[n - 1].kind ?? 'acceso') === 'acceso' && <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-white/20" />}
      <button type="button" onClick={() => { tapHaptic(); setI(n); }} className={`h-9 max-w-[124px] truncate rounded-full px-4 text-subhead font-semibold interactive ${n === i ? 'lg-pill text-white' : 'text-white/60'} ${x.status === 'used' ? 'line-through decoration-white/40' : ''}`}>
        {labels[n]}
      </button>
    </Fragment>
  )));

  // La noche de la fiesta, con la entrada ya escaneada en la puerta: Playmatch a un toque.
  const playmatch = !!(ev && ev.tickets.some((x) => x.category === 'acceso' && canEnterParty({ status: x.status, eventId: ev.eventId }, { eventDate: ev.eventDate, doorsOpen: ev.doorsOpen, eventEnd: ev.eventEnd })));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="my-auto flex flex-col gap-3 [&>*]:shrink-0 [@media(max-height:700px)]:gap-2">
        <LiveStrip ev={ev} onOpen={() => setNightOpen(true)} />
        {/* `data-pager="multi"`: sobre la tarjeta, deslizar de lado pasa de entrada y no cambia de pestaña. Con una sola
            entrada no hay a dónde pasar: ahí deslizar sigue cambiando de pestaña, como siempre. */}
        <div className="relative" style={{ paddingTop: hasPass ? STACK_PEEK : 0 }} data-pager={ownsSwipe ? 'multi' : undefined} onTouchStart={ownsSwipe ? onTouchStart : undefined} onTouchEnd={ownsSwipe ? onTouchEnd : undefined}>
          {hasPass && (
            <motion.button
              key={`back-${shown}`}
              type="button"
              {...swap}
              aria-label={shown === 'entrada' ? 'Ver mi PlayCard' : 'Ver mi entrada'}
              // Solo asoma el encabezado: el resto se recorta, así no se transparenta detrás de la PlayCard (que es de vidrio).
              className="absolute inset-x-0 top-0 z-0 block origin-top overflow-hidden rounded-t-[26px] text-left"
              style={{ height: STACK_PEEK - 4 }}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, scale: 0.94, opacity: 0.92 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            >
              {backNode}
            </motion.button>
          )}
          <motion.div
            key={`front-${shown}-${shown === 'entrada' ? i : 0}`}
            className="relative z-10"
            initial={hasPass ? (movedTicket && shown === 'entrada' ? { x: dir * 72, scale: 0.97, opacity: 0.4 } : { x: dir * 56, y: -STACK_PEEK, scale: 0.94, opacity: 0.6 }) : false}
            animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          >
            {frontNode}
          </motion.div>
        </div>
        {shown === 'entrada' && holderPills && (
          <div className="flex justify-center"><div className="flex min-w-0 items-center gap-1 rounded-full bg-white/[0.06] p-1">{holderPills}</div></div>
        )}
        {hasPass && (
          <p className="-mt-1 text-center text-caption1 text-white/60 [@media(max-height:700px)]:hidden">{shown === 'entrada' ? 'Toca la tarjeta de atrás para ver tu PlayCard' : 'Toca la tarjeta de atrás para volver a tu entrada'}</p>
        )}
        {playmatch && (
          <button type="button" {...playmatchTap} className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-bold text-white shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7)] interactive"><Heart className="h-5 w-5" /> Entrar a Playmatch</button>
        )}
        {usable && (
          <button type="button" {...qrTap} className={`flex h-14 shrink-0 items-center justify-center gap-2 rounded-full text-headline font-bold text-white interactive [@media(max-height:700px)]:h-12 ${playmatch ? 'lg-pill' : 'bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.4)]'}`}>
            <QrCode className="h-5 w-5" /> Mostrar QR
          </button>
        )}
        {(onPayCaja || onTopup) && (
          <div className={`grid shrink-0 gap-2 [@media(max-height:700px)]:hidden ${onPayCaja && onTopup ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {onPayCaja && <button type="button" onClick={() => { tapHaptic(); onPayCaja(); }} className="lg-pill flex h-11 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive"><Wallet className="h-4 w-4 text-pink-300" /> Pagar</button>}
            {onTopup && <button type="button" onClick={() => { tapHaptic(); onTopup(); }} className="lg-pill flex h-11 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive"><Plus className="h-4 w-4 text-pink-300" /> Recargar</button>}
          </div>
        )}
        <NightRow ev={ev} onOpen={() => setNightOpen(true)} />
        <NightSheet open={nightOpen} onClose={() => setNightOpen(false)} ev={ev} onShowQr={(x: MeTicket) => { setNightOpen(false); setQrCode(x.ticketCode); }} />
        {createPortal(<AnimatePresence>{ev && qrTicket && <QrViewer ev={ev} t={qrTicket} holder={holder} onClose={() => setQrCode(null)} onSelect={(x) => setQrCode(x.ticketCode)} />}</AnimatePresence>, document.body)}
      </div>
    </div>
  );
}
