import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { toast } from 'sonner';
import { Camera, Heart, Info, MapPin, RotateCcw, Sparkles, Star, Wine, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { ProtectedPhoto, preloadPhoto } from '@/components/party/ProtectedPhoto';
import { Confetti } from '@/components/site/Confetti';
import { Chip, PM_CTA, tap } from '@/components/party/ui';
import { ZONE_LABELS, type PartyGender, type PartyZone } from '@shared/party';

const GENDER_LABELS: Record<PartyGender, string> = { hombre: 'Hombre', mujer: 'Mujer', pareja: 'Pareja' };

export type DeckCard = { id: number; alias: string; gender: PartyGender; zone: PartyZone; costume: string | null; photoCount: number; caramelo?: boolean };
type Verdict = 'like' | 'nope' | 'caramelo';

/* Descubrir: el swipe al estilo Tinder, con el vidrio de la App. ♥ a la derecha, ✕ a la izquierda y
 * ★ Caramelo hacia arriba. Los ♥ son ciegos (la otra persona solo se entera si hay match); el
 * Caramelo sí le llega (es el «toque» de siempre, con su tope por noche). Solo entra quien puso su
 * foto (el servidor lo exige igual). */
export function DiscoverView({ ticketCode, alias, myProfileId, participating, caramelosLeft, onOpenPhoto, onMatch, onGift, onInfo }: {
  ticketCode: string;
  alias: string;
  myProfileId: number;
  participating: boolean;
  caramelosLeft: number;
  onOpenPhoto: () => void;
  onMatch: (m: { connectionId: number; alias: string; otherId: number }) => void;
  onGift: (profileId: number, alias: string) => void;
  onInfo: (card: DeckCard) => void;
}) {
  const utils = trpc.useUtils();
  const deckQuery = trpc.party.swipeDeck.useQuery({ ticketCode }, { enabled: participating, refetchInterval: 15_000 });
  const swipe = trpc.party.swipe.useMutation();
  const touch = trpc.party.touch.useMutation();
  const undo = trpc.party.undoSwipe.useMutation();
  // El último ✕ de esta sesión (lo único que se puede deshacer) y la tarjeta que volvió arriba.
  const [lastNope, setLastNope] = useState<number | null>(null);
  const [restored, setRestored] = useState<DeckCard | null>(null);

  // Las tarjetas ya resueltas se esconden al instante sin esperar al servidor. `done` no se reinicia
  // al refrescar el mazo: un refresco que llega antes de que el servidor registre el último swipe
  // devolvería la misma tarjeta. Los ids no se repiten, así que dejarlo crecer es inofensivo.
  const [done, setDone] = useState<Set<number>>(new Set());
  // Orden para la tarjeta de arriba cuando se decide con los botones (sale volando igual que al arrastrar).
  const [command, setCommand] = useState<{ v: Verdict; n: number } | null>(null);

  const serverDeck: DeckCard[] = (deckQuery.data?.deck ?? []).filter((c) => !done.has(c.id) && c.id !== restored?.id);
  const deck: DeckCard[] = restored && !done.has(restored.id) ? [restored, ...serverDeck] : serverDeck;
  const top = deck[0];
  const likesYou = deckQuery.data?.likesYou ?? 0;
  const rewindsLeft = deckQuery.data?.rewindsLeft ?? 0;

  // Las fotos de las dos tarjetas siguientes (y el resto del carrusel de la actual) se piden
  // mientras miras la actual.
  const nextIds = deck.slice(1, 3).map((c) => c.id).join(',');
  useEffect(() => {
    if (!nextIds) return;
    nextIds.split(',').forEach((id) => preloadPhoto(ticketCode, Number(id)));
  }, [nextIds, ticketCode]);
  useEffect(() => {
    if (!top) return;
    for (let p = 1; p < top.photoCount; p++) preloadPhoto(ticketCode, top.id, p);
  }, [top?.id, top?.photoCount, ticketCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = (card: DeckCard, v: Verdict) => {
    setDone((prev) => new Set(prev).add(card.id));
    setCommand(null);
    setLastNope(v === 'nope' ? card.id : null);
    const refill = () => { if (deck.length <= 3) utils.party.swipeDeck.invalidate(); };
    if (v === 'caramelo') {
      touch.mutate({ ticketCode, targetProfileId: card.id }, {
        onSuccess: (res) => {
          utils.party.listMansion.invalidate();
          if (res.status === 'accepted') onMatch({ connectionId: res.connectionId, alias: card.alias, otherId: card.id });
          else toast.success(`Le mandaste un Caramelo a ${card.alias} ★`);
          refill();
        },
        onError: (e) => toast.error(e.message),
      });
      return;
    }
    swipe.mutate({ ticketCode, targetProfileId: card.id, liked: v === 'like' }, {
      onSuccess: (res) => {
        if (res.match) {
          onMatch({ connectionId: res.connectionId, alias: res.alias, otherId: card.id });
          utils.party.listMansion.invalidate();
        }
        refill();
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const rewind = () => {
    if (lastNope === null || undo.isPending) return;
    tap();
    undo.mutate({ ticketCode }, {
      onSuccess: ({ card }) => {
        setDone((prev) => { const next = new Set(prev); next.delete(card.id); return next; });
        setRestored(card);
        setLastNope(null);
        utils.party.swipeDeck.invalidate();
      },
      onError: (e) => { setLastNope(null); toast.error(e.message); },
    });
  };

  const press = (v: Verdict) => {
    if (!top || command) return;
    if (v === 'caramelo' && caramelosLeft <= 0) { toast.error('Ya usaste tus Caramelos de esta noche'); return; }
    setCommand({ v, n: Date.now() });
  };

  if (!participating) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 text-center">
        <div className="relative mb-6 grid h-40 w-32 place-items-center rounded-[26px] border border-white/15 bg-white/[0.06]">
          <Camera className="h-10 w-10 text-pink-300" strokeWidth={1.6} />
          <span className="absolute -right-5 top-5 grid h-11 w-11 rotate-12 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-500 shadow-[0_8px_24px_-6px_rgba(236,72,153,0.8)]"><Heart className="h-5 w-5 fill-white text-white" /></span>
        </div>
        <h2 className="text-title1 font-bold tracking-tight">Pon tu foto y entra al juego</h2>
        <p className="mt-2 max-w-xs text-subhead leading-snug text-white/70">
          Para ver fotos tienes que poner la tuya. Solo la ve gente que también participa, solo durante esta fiesta, y se borra al terminar.
        </p>
        <button type="button" onClick={() => { tap(); onOpenPhoto(); }} className={`mt-6 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-full text-headline ${PM_CTA} interactive`}>
          <Camera className="h-5 w-5" /> Tomar mi foto
        </button>
      </div>
    );
  }

  if (deckQuery.isLoading || !top) {
    return <Radar ticketCode={ticketCode} alias={alias} myProfileId={myProfileId} searching={deckQuery.isLoading} />;
  }

  return (
    <div className="flex flex-1 flex-col px-3 pb-3">
      {/* Solo el número, nunca quiénes: los ♥ siguen siendo ciegos. */}
      {likesYou > 0 && (
        <p className="mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-full bg-pink-500/15 px-3 py-1.5 text-footnote font-semibold text-pink-200">
          <Heart className="h-3.5 w-3.5 fill-pink-400 text-pink-400" /> Les gustas a {likesYou === 1 ? '1 persona' : `${likesYou} personas`} · sigue deslizando
        </p>
      )}
      <div className="relative mx-auto w-full max-w-md flex-1" style={{ minHeight: 360 }}>
        {/* Las de atrás asoman escaladas, como un mazo. */}
        {deck.slice(1, 3).reverse().map((c, i, arr) => {
          const depth = arr.length - i;
          return (
            <div key={c.id} aria-hidden className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#1a0f18]"
              style={{ transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.045})`, opacity: depth === 1 ? 0.9 : 0.5 }}>
              {depth === 1 && <ProtectedPhoto ticketCode={ticketCode} profileId={c.id} viewerAlias={alias} className="absolute inset-0" quiet />}
            </div>
          );
        })}
        <SwipeCard key={top.id} ticketCode={ticketCode} viewerAlias={alias} card={top} command={command} caramelo={caramelosLeft > 0}
          onVerdict={(v) => resolve(top, v)} onInfo={() => onInfo(top)} />
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <RoundButton label={rewindsLeft > 0 ? 'Deshacer el último No' : 'Ya usaste tu deshacer de esta noche'} size="sm" onClick={rewind} dim={lastNope === null || rewindsLeft <= 0}>
          <RotateCcw className="h-5 w-5 text-amber-300" strokeWidth={2.4} />
        </RoundButton>
        <RoundButton label="No" size="lg" onClick={() => press('nope')}><X className="h-8 w-8 text-white" strokeWidth={2.6} /></RoundButton>
        <RoundButton label={`Caramelo (te quedan ${caramelosLeft})`} onClick={() => press('caramelo')} dim={caramelosLeft <= 0}>
          <Star className="h-6 w-6 fill-sky-300 text-sky-300" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sky-400 px-1 text-caption2 font-bold text-[#0b0612]">{caramelosLeft}</span>
        </RoundButton>
        <RoundButton label="Me gusta" size="lg" primary onClick={() => press('like')}><Heart className="h-8 w-8 fill-white text-white" /></RoundButton>
        <RoundButton label={`Invitarle un trago a ${top.alias}`} onClick={() => { tap(); onGift(top.id, top.alias); }}><Wine className="h-6 w-6 text-amber-300" /></RoundButton>
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, children, size = 'md', primary = false, dim = false }: { label: string; onClick: () => void; children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; primary?: boolean; dim?: boolean }) {
  const dims = size === 'lg' ? 'h-[66px] w-[66px]' : size === 'sm' ? 'h-11 w-11' : 'h-[50px] w-[50px]';
  const look = primary
    ? 'bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500 shadow-[0_12px_30px_-6px_rgba(236,72,153,0.75),inset_0_1px_0_rgba(255,255,255,0.45)]'
    : 'lg-pill';
  return (
    <button type="button" onClick={onClick} aria-label={label} className={`relative grid ${dims} shrink-0 place-items-center rounded-full transition-transform active:scale-90 ${look} ${dim ? 'opacity-45' : ''}`}>
      {children}
    </button>
  );
}

function SwipeCard({ ticketCode, viewerAlias, card, command, caramelo, onVerdict, onInfo }: {
  ticketCode: string;
  viewerAlias: string;
  card: DeckCard;
  command: { v: Verdict; n: number } | null;
  caramelo: boolean;
  onVerdict: (v: Verdict) => void;
  onInfo: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const likeOpacity = useTransform(x, [30, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -30], [1, 0]);
  const caraOpacity = useTransform(y, [-130, -40], [1, 0]);
  const gone = useRef(false);
  // Carrusel: tocar la mitad derecha pasa a la siguiente foto; la izquierda vuelve.
  const [photo, setPhoto] = useState(0);
  const count = Math.max(1, card.photoCount);
  const el = useRef<HTMLDivElement>(null);

  const fly = (v: Verdict) => {
    if (gone.current) return;
    gone.current = true;
    tap();
    const w = typeof window === 'undefined' ? 400 : window.innerWidth;
    const h = typeof window === 'undefined' ? 800 : window.innerHeight;
    const to = v === 'like' ? { x: w * 1.3, y: y.get() + 40 } : v === 'nope' ? { x: -w * 1.3, y: y.get() + 40 } : { x: x.get(), y: -h };
    const ease = { duration: 0.34, ease: [0.4, 0, 0.7, 1] as const };
    Promise.all([animate(x, to.x, ease), animate(y, to.y, ease)]).then(() => onVerdict(v));
  };
  const back = () => {
    animate(x, 0, { type: 'spring', stiffness: 420, damping: 30 });
    animate(y, 0, { type: 'spring', stiffness: 420, damping: 30 });
  };

  useEffect(() => { if (command) fly(command.v); }, [command?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      ref={el}
      className={`absolute inset-0 cursor-grab touch-none overflow-hidden rounded-[28px] bg-[#1a0f18] active:cursor-grabbing ${card.caramelo ? 'border-[3px] border-sky-300 shadow-[0_0_40px_-6px_rgba(56,189,248,0.8)]' : 'border border-white/15 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.9)]'}`}
      style={{ x, y, rotate }}
      initial={{ scale: 0.96, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      drag
      dragMomentum={false}
      onTap={(_, info) => {
        // El evento de onTap llega sin currentTarget: la posición se mide contra la propia tarjeta.
        const rect = el.current?.getBoundingClientRect();
        if (count < 2 || !rect) return;
        const right = info.point.x - window.scrollX > rect.left + rect.width / 2;
        tap();
        setPhoto((p) => Math.min(count - 1, Math.max(0, p + (right ? 1 : -1))));
      }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110 || info.velocity.x > 700) fly('like');
        else if (info.offset.x < -110 || info.velocity.x < -700) fly('nope');
        else if (caramelo && (info.offset.y < -130 || info.velocity.y < -800)) fly('caramelo');
        else back();
      }}
    >
      <ProtectedPhoto ticketCode={ticketCode} profileId={card.id} position={photo} viewerAlias={viewerAlias} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
      {card.caramelo && (
        <p className="pointer-events-none absolute inset-x-0 top-6 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-sky-400 px-3.5 py-1.5 text-footnote font-bold text-[#0b0612] shadow-[0_6px_20px_-4px_rgba(56,189,248,0.9)]">
          <Star className="h-4 w-4 fill-[#0b0612]" /> Te mandó un Caramelo · dale ♥ y es match
        </p>
      )}
      {count > 1 && (
        <div className="pointer-events-none absolute inset-x-3 top-2.5 flex gap-1.5" aria-label={`Foto ${photo + 1} de ${count}`}>
          {Array.from({ length: count }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i === photo ? 'bg-white' : 'bg-white/35'}`} />)}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-5 pb-5 pt-24">
        <p className="flex items-center gap-2 text-title1 font-bold leading-tight tracking-tight">
          <span className="truncate">{card.alias}</span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" aria-label="Activa ahora" />
        </p>
        {card.costume && <p className="mt-0.5 flex items-center gap-1.5 truncate text-headline font-semibold text-amber-200"><Sparkles className="h-4 w-4 shrink-0" /> {card.costume}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip>{GENDER_LABELS[card.gender]}</Chip>
          <Chip><MapPin className="h-3 w-3" /> En {ZONE_LABELS[card.zone]}</Chip>
        </div>
      </div>
      <button type="button" onClick={() => { tap(); onInfo(); }} onPointerDownCapture={(e) => e.stopPropagation()} aria-label={`Ver el perfil de ${card.alias}`}
        className="absolute bottom-5 right-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur-md">
        <Info className="h-5 w-5" />
      </button>

      {/* Los sellos: ME GUSTA (rosa), NOPE (blanco) y CARAMELO (celeste, hacia arriba). */}
      <motion.span style={{ opacity: likeOpacity }} className="pointer-events-none absolute left-5 top-8 -rotate-[14deg] rounded-xl border-[3px] border-pink-400 px-3 py-1 text-title2 font-black tracking-wider text-pink-400 shadow-[0_0_24px_rgba(236,72,153,0.6)]">
        ME GUSTA
      </motion.span>
      <motion.span style={{ opacity: nopeOpacity }} className="pointer-events-none absolute right-5 top-8 rotate-[14deg] rounded-xl border-[3px] border-white px-3 py-1 text-title2 font-black tracking-wider text-white">
        NOPE
      </motion.span>
      {caramelo && (
        <motion.span style={{ opacity: caraOpacity }} className="pointer-events-none absolute inset-x-0 bottom-40 mx-auto flex w-fit items-center gap-1.5 rounded-xl border-[3px] border-sky-300 px-3 py-1 text-title2 font-black tracking-wider text-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.6)]">
          <Star className="h-5 w-5 fill-sky-300" /> CARAMELO
        </motion.span>
      )}
    </motion.div>
  );
}

/** Sin tarjetas (o buscando): tu foto con ondas que salen, como un radar. */
function Radar({ ticketCode, alias, myProfileId, searching }: { ticketCode: string; alias: string; myProfileId: number; searching: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
      <div className="relative grid h-56 w-56 place-items-center">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="absolute inset-0 rounded-full border border-pink-400/40"
            initial={{ scale: 0.4, opacity: 0.8 }} animate={{ scale: 1.15, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }} />
        ))}
        <span className="relative h-24 w-24 overflow-hidden rounded-full ring-4 ring-pink-500/70 shadow-[0_0_40px_rgba(236,72,153,0.55)]">
          <ProtectedPhoto ticketCode={ticketCode} profileId={myProfileId} viewerAlias={alias} className="h-full w-full" quiet />
        </span>
      </div>
      <p className="mt-2 text-title3 font-bold">{searching ? 'Buscando gente en la fiesta…' : 'Ya viste a todos por ahora'}</p>
      <p className="mt-1 max-w-xs text-subhead text-white/65">{searching ? 'Un segundo.' : 'Sigue llegando gente: vuelve en un rato o date una vuelta por la Fiesta.'}</p>
    </div>
  );
}

/** «¡Es un Playmatch!»: las dos fotos, confeti y lo que se puede hacer ahora. */
export function MatchCelebration({ ticketCode, alias, myProfileId, match, onChat, onGift, onClose }: {
  ticketCode: string;
  alias: string;
  myProfileId: number;
  match: { connectionId: number; alias: string; otherId: number };
  onChat: () => void;
  onGift: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div className="account-font fixed inset-0 z-[85] flex flex-col items-center justify-center bg-[#0b0612]/92 px-6 text-center backdrop-blur-xl"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Confetti pieces={80} />
      <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
        className="bg-gradient-to-r from-pink-400 via-fuchsia-300 to-sky-300 bg-clip-text text-large-title font-black italic tracking-tight text-transparent drop-shadow-[0_0_24px_rgba(236,72,153,0.5)]">
        ¡Es un Playmatch!
      </motion.p>
      <p className="mt-2 text-subhead text-white/75">Tú y {match.alias} se gustaron.</p>
      <div className="my-9 flex items-center">
        {[myProfileId, match.otherId].map((id, i) => (
          <motion.span key={id} initial={{ x: i === 0 ? -80 : 80, rotate: 0, opacity: 0 }} animate={{ x: i === 0 ? 12 : -12, rotate: i === 0 ? -8 : 8, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.2 }}
            className="block h-40 w-32 overflow-hidden rounded-[22px] border-2 border-white/80 shadow-[0_20px_50px_-15px_rgba(236,72,153,0.7)]">
            <ProtectedPhoto ticketCode={ticketCode} profileId={id} viewerAlias={alias} className="h-full w-full" quiet />
          </motion.span>
        ))}
      </div>
      <div className="w-full max-w-xs space-y-2.5">
        <button type="button" onClick={() => { tap(); onChat(); }} className={`flex h-14 w-full items-center justify-center rounded-full text-headline ${PM_CTA}`}>Escribirle</button>
        <button type="button" onClick={() => { tap(); onGift(); }} className="lg-pill flex h-12 w-full items-center justify-center gap-2 rounded-full text-subhead font-semibold"><Wine className="h-4 w-4 text-amber-300" /> Invitarle un trago</button>
        <button type="button" onClick={onClose} className="h-11 w-full text-subhead font-semibold text-white/65">Seguir mirando</button>
      </div>
    </motion.div>
  );
}

