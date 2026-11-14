import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion';
import { toast } from 'sonner';
import { Camera, ChevronUp, Heart, MapPin, RotateCcw, Sparkles, Star, Trophy, Wine, X } from 'lucide-react';
import { useBackLayer } from '@/lib/appNav';
import { trpc } from '@/lib/trpc';
import { ProtectedPhoto, preloadPhoto } from '@/components/party/ProtectedPhoto';
import { Confetti } from '@/components/site/Confetti';
import { Chip, PM_CTA, VibeLine, tap, usePartyFlags } from '@/components/party/ui';
import type { CostumeVoting } from '@/components/party/costumeVotes';
import { ZONE_LABELS, type PartyGender, type PartyZone } from '@shared/party';


export type DeckCard = {
  id: number; alias: string; gender: PartyGender; zone: PartyZone; costume: string | null; photoCount: number; caramelo?: boolean;
  pairType?: string | null; orientation?: string | null; relationStyle?: string | null; intents?: string[]; common?: string[]; affinity?: number | null;
};
type Verdict = 'like' | 'nope' | 'caramelo';

/* Descubrir: el swipe al estilo Tinder, con el vidrio de la App. ♥ a la derecha, ✕ a la izquierda y
 * ⭐ Super Like hacia arriba. Los ♥ son ciegos (la otra persona solo se entera si hay match); el
 * Super Like sí le llega: el primero de la noche es gratis y los demás se compran (con Playcoins o saldo). Solo
 * entra quien puso su foto (el servidor lo exige igual). */
export function DiscoverView({ ticketCode, alias, myProfileId, participating, superLikesLeft, voting, onOpenPhoto, onMatch, onGift, onInfo, onBuySuperLike, onOpenLikes }: {
  ticketCode: string;
  alias: string;
  myProfileId: number;
  participating: boolean;
  superLikesLeft: number;
  /** «Mejor disfraz»: solo en modo Halloween. */
  voting?: CostumeVoting;
  /** Abre la compra de Super Likes y, al pagar, vuelve a intentar lo que se quería hacer. */
  onBuySuperLike: (then: () => void) => void;
  /** «Les gustas a N personas»: abre quién te dio ♥. */
  onOpenLikes: () => void;
  onOpenPhoto: () => void;
  onMatch: (m: { connectionId: number; alias: string; otherId: number }) => void;
  onGift: (profileId: number, alias: string) => void;
  onInfo: (card: DeckCard) => void;
}) {
  const utils = trpc.useUtils();
  const deckQuery = trpc.party.swipeDeck.useQuery({ ticketCode }, { enabled: participating, refetchInterval: 30_000 });
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

  // Cuánto va arrastrada la tarjeta de arriba: los botones y la tarjeta de atrás reaccionan a eso.
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const likeScale = useTransform(dragX, [0, 140], [1, 1.2], { clamp: true });
  const nopeScale = useTransform(dragX, [-140, 0], [1.2, 1], { clamp: true });
  const starScale = useTransform(dragY, [-150, -20], [1.25, 1], { clamp: true });
  const nextScale = useTransform(dragX, [-220, 0, 220], [1, 0.955, 1], { clamp: true });
  const nextLift = useTransform(dragX, [-220, 0, 220], [0, 10, 0], { clamp: true });

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
          else toast.success(`Le mandaste un Super Like a ${card.alias} ⭐`);
          refill();
        },
        onError: (e) => {
          // Sin Super Likes: la tarjeta vuelve y se abre la compra; al pagar, se manda.
          if (e.message === 'sin_super_likes') {
            setDone((prev) => { const next = new Set(prev); next.delete(card.id); return next; });
            onBuySuperLike(() => setCommand({ v: 'caramelo', n: Date.now() }));
            return;
          }
          toast.error(e.message);
        },
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
    // Sin Super Likes se abre la compra (no es un error): al pagar, se manda solo.
    if (v === 'caramelo' && superLikesLeft <= 0) { tap(); onBuySuperLike(() => setCommand({ v: 'caramelo', n: Date.now() })); return; }
    setCommand({ v, n: Date.now() });
  };

  if (!participating) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 text-center">
        <div className="relative mb-6 grid h-40 w-32 place-items-center rounded-[26px] border border-white/15 bg-white/[0.06]">
          <Camera className="h-10 w-10 text-pink-300" strokeWidth={1.6} />
          <span className="absolute -right-5 top-5 grid h-11 w-11 rotate-12 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-500 shadow-[0_8px_24px_-6px_rgba(236,72,153,0.8)]"><Heart className="h-5 w-5 fill-[color:var(--pm-on-accent,#fff)] text-[color:var(--pm-on-accent,#fff)]" /></span>
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
      {/* Solo el número, nunca quiénes (a menos que pague el desbloqueo de la noche): los ♥ siguen siendo ciegos. */}
      {likesYou > 0 && (
        <button type="button" onClick={() => { tap(); onOpenLikes(); }} className="mx-auto mb-2 flex w-fit items-center gap-1.5 rounded-full bg-pink-500/15 px-3 py-1.5 text-footnote font-semibold text-pink-200 interactive">
          <Heart className="h-3.5 w-3.5 fill-pink-400 text-pink-400" /> Les gustas a {likesYou === 1 ? '1 persona' : `${likesYou} personas`} · ver quién
        </button>
      )}
      <div className="relative mx-auto w-full max-w-md flex-1" style={{ minHeight: 360 }}>
        {/* Las de atrás asoman escaladas, como un mazo. */}
        {deck.slice(1, 3).reverse().map((c, i, arr) => {
          const depth = arr.length - i;
          return (
            <motion.div key={c.id} aria-hidden className="absolute inset-0 overflow-hidden rounded-[30px] border border-white/10 bg-[#1a0f18]"
              style={depth === 1 ? { y: nextLift, scale: nextScale, opacity: 0.92 } : { y: 20, scale: 0.91, opacity: 0.5 }}>
              {depth === 1 && <ProtectedPhoto ticketCode={ticketCode} profileId={c.id} viewerAlias={alias} className="absolute inset-0" quiet />}
              {depth === 1 && <div className="absolute inset-0 bg-black/25" />}
            </motion.div>
          );
        })}
        <SwipeCard key={top.id} ticketCode={ticketCode} viewerAlias={alias} card={top} command={command} caramelo={superLikesLeft > 0}
          voting={voting} dragX={dragX} dragY={dragY} onVerdict={(v) => resolve(top, v)} onInfo={() => onInfo(top)} onBuy={() => press('caramelo')} />
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <RoundButton label={rewindsLeft > 0 ? 'Deshacer el último No' : 'Ya usaste tu deshacer de esta noche'} size="sm" onClick={rewind} dim={lastNope === null || rewindsLeft <= 0}>
          <RotateCcw className="h-5 w-5 text-amber-300" strokeWidth={2.4} />
        </RoundButton>
        <RoundButton label="No" size="lg" scale={nopeScale} onClick={() => press('nope')}><X className="h-8 w-8 text-rose-300" strokeWidth={2.8} /></RoundButton>
        <RoundButton label={superLikesLeft > 0 ? `Super Like (te quedan ${superLikesLeft})` : 'Comprar Super Likes'} scale={starScale} onClick={() => press('caramelo')}>
          <Star className="h-6 w-6 fill-sky-300 text-sky-300" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sky-400 px-1 text-caption2 font-bold text-[#0b0612]">{superLikesLeft > 0 ? superLikesLeft : '+'}</span>
        </RoundButton>
        <RoundButton label="Me gusta" size="lg" primary scale={likeScale} onClick={() => press('like')}><Heart className="h-8 w-8 fill-[color:var(--pm-on-accent,#fff)] text-[color:var(--pm-on-accent,#fff)]" /></RoundButton>
        <RoundButton label={`Invitarle un trago a ${top.alias}`} onClick={() => { tap(); onGift(top.id, top.alias); }}><Wine className="h-6 w-6 text-amber-300" /></RoundButton>
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, children, size = 'md', primary = false, dim = false, scale }: { label: string; onClick: () => void; children: React.ReactNode; size?: 'sm' | 'md' | 'lg'; primary?: boolean; dim?: boolean; scale?: MotionValue<number> }) {
  const dims = size === 'lg' ? 'h-[66px] w-[66px]' : size === 'sm' ? 'h-11 w-11' : 'h-[50px] w-[50px]';
  const look = primary
    ? 'bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500 shadow-[0_12px_30px_-6px_var(--pm-glow,rgba(236,72,153,0.75)),inset_0_1px_0_rgba(255,255,255,0.45)]'
    : 'lg-pill';
  return (
    <motion.button type="button" onClick={onClick} aria-label={label} style={scale ? { scale } : undefined} whileTap={{ scale: 0.86 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={`relative grid ${dims} shrink-0 place-items-center rounded-full ${look} ${dim ? 'opacity-45' : ''}`}>
      {children}
    </motion.button>
  );
}

function SwipeCard({ ticketCode, viewerAlias, card, command, caramelo, voting, dragX, dragY, onVerdict, onInfo, onBuy }: {
  ticketCode: string;
  viewerAlias: string;
  card: DeckCard;
  command: { v: Verdict; n: number } | null;
  caramelo: boolean;
  /** Deslizó hacia arriba sin Super Likes: se abre la compra. */
  onBuy: () => void;
  voting?: CostumeVoting;
  /** Hacia dónde va la tarjeta, para que los botones de abajo y el mazo reaccionen. */
  dragX: MotionValue<number>;
  dragY: MotionValue<number>;
  onVerdict: (v: Verdict) => void;
  onInfo: () => void;
}) {
  const { zones } = usePartyFlags();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  useMotionValueEvent(x, 'change', (v) => dragX.set(v));
  useMotionValueEvent(y, 'change', (v) => dragY.set(v));
  useEffect(() => { dragX.set(0); dragY.set(0); return () => { dragX.set(0); dragY.set(0); }; }, [dragX, dragY]);
  // Un tinte del color de la decisión cubre la foto a medida que se arrastra.
  const likeTint = useTransform(x, [20, 180], [0, 0.55]);
  const nopeTint = useTransform(x, [-180, -20], [0.55, 0]);
  const caraTint = useTransform(y, [-200, -40], [0.5, 0]);
  const stampScale = useTransform(x, [-140, -30, 30, 140], [1, 0.8, 0.8, 1]);
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
      className={`absolute inset-0 cursor-grab touch-none overflow-hidden rounded-[30px] bg-[#1a0f18] active:cursor-grabbing ${card.caramelo ? 'border-[3px] border-sky-300 shadow-[0_0_40px_-6px_var(--pm-star-glow,rgba(56,189,248,0.8))]' : 'border border-white/15 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.9)]'}`}
      style={{ x, y, rotate }}
      initial={{ scale: 0.96, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      drag
      dragMomentum={false}
      onTap={(_, info) => {
        // El evento de onTap llega sin currentTarget: la posición se mide contra la propia tarjeta.
        const rect = el.current?.getBoundingClientRect();
        if (!rect) return;
        // Tocar el nombre (la franja de abajo) abre el perfil completo, como en las apps de citas.
        if (info.point.y - window.scrollY > rect.bottom - 132) { tap(); onInfo(); return; }
        if (count < 2) return;
        const right = info.point.x - window.scrollX > rect.left + rect.width / 2;
        tap();
        setPhoto((p) => Math.min(count - 1, Math.max(0, p + (right ? 1 : -1))));
      }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110 || info.velocity.x > 700) fly('like');
        else if (info.offset.x < -110 || info.velocity.x < -700) fly('nope');
        else if (info.offset.y < -130 || info.velocity.y < -800) { if (caramelo) fly('caramelo'); else { back(); onBuy(); } }
        else back();
      }}
    >
      <ProtectedPhoto ticketCode={ticketCode} profileId={card.id} position={photo} viewerAlias={viewerAlias} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
      {card.caramelo && (
        <p className="pointer-events-none absolute inset-x-0 top-6 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-sky-400 px-3.5 py-1.5 text-footnote font-bold text-[#0b0612] shadow-[0_6px_20px_-4px_rgba(56,189,248,0.9)]">
          <Star className="h-4 w-4 fill-[#0b0612]" /> Te mandó un Super Like · dale ♥ y es match
        </p>
      )}
      {count > 1 && (
        <div className="pointer-events-none absolute inset-x-3 top-2.5 flex gap-1.5" aria-label={`Foto ${photo + 1} de ${count}`}>
          {Array.from({ length: count }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i === photo ? 'bg-white' : 'bg-white/35'}`} />)}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-5 pb-5 pt-28">
        <p className="flex items-center gap-2 pr-14 text-[2rem] font-extrabold leading-none tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
          <span className="truncate">{card.alias}</span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" aria-label="Activa ahora" />
        </p>
        {card.costume && <p className="mt-1.5 flex items-center gap-1.5 truncate pr-14 text-subhead font-semibold text-amber-200"><Sparkles className="h-4 w-4 shrink-0" /> {card.costume}</p>}
        <div className="pr-12"><VibeLine person={card} zone={zones ? <Chip><MapPin className="h-3 w-3" /> {ZONE_LABELS[card.zone]}</Chip> : undefined} /></div>
      </div>
      <div className="absolute bottom-5 right-4 flex flex-col gap-2">
        {voting && (
          <button type="button" onClick={() => { tap(); voting.toggle(card.id, card.alias); }} onPointerDownCapture={(e) => e.stopPropagation()}
            aria-pressed={voting.votedIds.has(card.id)} aria-label={voting.votedIds.has(card.id) ? `Quitar mi voto de mejor disfraz a ${card.alias}` : `Votar el disfraz de ${card.alias} como el mejor`}
            className={`grid h-10 w-10 place-items-center rounded-full backdrop-blur-md ${voting.votedIds.has(card.id) ? 'bg-amber-300 text-[#1a1a1a]' : 'bg-white/15'}`}>
            <Trophy className={`h-5 w-5 ${voting.votedIds.has(card.id) ? 'fill-current' : ''}`} />
          </button>
        )}
        <button type="button" onClick={() => { tap(); onInfo(); }} onPointerDownCapture={(e) => e.stopPropagation()} aria-label={`Ver el perfil de ${card.alias}`}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur-md">
          <ChevronUp className="h-5 w-5" strokeWidth={2.6} />
        </button>
      </div>

      {/* El tinte de la decisión sobre la foto. */}
      <motion.div aria-hidden style={{ opacity: likeTint }} className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-pink-500 via-pink-500/40 to-transparent" />
      <motion.div aria-hidden style={{ opacity: nopeTint }} className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-black via-black/50 to-transparent" />
      {caramelo && <motion.div aria-hidden style={{ opacity: caraTint }} className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sky-400 via-sky-400/30 to-transparent" />}

      {/* Los sellos: ME GUSTA (rosa), NOPE (blanco) y SUPER LIKE (celeste, hacia arriba). */}
      <motion.span style={{ opacity: likeOpacity, scale: stampScale }} className="pointer-events-none absolute left-5 top-10 flex -rotate-[14deg] items-center gap-1.5 rounded-2xl border-[3.5px] border-white bg-pink-500/25 px-3.5 py-1.5 text-title1 font-black tracking-wider text-white backdrop-blur-sm [text-shadow:0_2px_12px_rgba(0,0,0,0.45)]">
        <Heart className="h-6 w-6 fill-white" /> ME GUSTA
      </motion.span>
      <motion.span style={{ opacity: nopeOpacity, scale: stampScale }} className="pointer-events-none absolute right-5 top-10 flex rotate-[14deg] items-center gap-1 rounded-2xl border-[3.5px] border-white/90 bg-black/30 px-3.5 py-1.5 text-title1 font-black tracking-wider text-white backdrop-blur-sm">
        <X className="h-6 w-6" strokeWidth={3.5} /> PASO
      </motion.span>
      {caramelo && (
        <motion.span style={{ opacity: caraOpacity }} className="pointer-events-none absolute inset-x-0 bottom-44 mx-auto flex w-fit items-center gap-1.5 rounded-2xl border-[3.5px] border-white bg-sky-400/30 px-3.5 py-1.5 text-title1 font-black tracking-wider text-white backdrop-blur-sm [text-shadow:0_2px_12px_rgba(0,0,0,0.45)]">
          <Star className="h-6 w-6 fill-white" /> SUPER LIKE
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
      <p className="mt-1 max-w-xs text-subhead text-white/65">{searching ? 'Un segundo.' : 'Sigue llegando gente: vuelve en un rato o mira quién está en Fiesta.'}</p>
    </div>
  );
}

/** «¡Es un Playmatch!»: las dos fotos, confeti y lo que se puede hacer ahora. `theirs`: la otra persona dio el ♥ que
 * faltaba mientras tenías la app abierta (el match te llega en vivo). */
export function MatchCelebration({ ticketCode, alias, myProfileId, match, theirs = false, onChat, onGift, onClose }: {
  ticketCode: string;
  alias: string;
  myProfileId: number;
  match: { connectionId: number; alias: string; otherId: number };
  theirs?: boolean;
  onChat: () => void;
  onGift: () => void;
  onClose: () => void;
}) {
  useBackLayer(true, onClose);
  useEffect(() => { try { navigator.vibrate?.([18, 60, 18, 60, 40]); } catch { /* sin vibración */ } }, []);
  return (
    <motion.div className="account-font fixed inset-0 z-[85] flex flex-col items-center justify-center overflow-hidden bg-[color:var(--pm-bg,#0b0612)]/95 px-6 text-center backdrop-blur-xl"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Un resplandor que late detrás de las fotos, y corazones que suben. */}
      <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[130vmin] w-[130vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,var(--pm-glow,rgba(236,72,153,0.55)),transparent_62%)]"
        initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.6, 1.05, 0.95, 1.05], opacity: [0, 0.9, 0.6, 0.8] }} transition={{ duration: 3.2, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }} />
      {[12, 28, 46, 63, 80, 90].map((left, i) => (
        <motion.span key={left} aria-hidden className="pointer-events-none absolute bottom-0 text-pink-400" style={{ left: `${left}%` }}
          initial={{ y: 40, opacity: 0, scale: 0.6 }} animate={{ y: '-105vh', opacity: [0, 0.9, 0.9, 0], scale: [0.6, 1.1, 0.9], rotate: i % 2 ? 18 : -18 }}
          transition={{ duration: 3.4 + (i % 3) * 0.7, delay: 0.2 + i * 0.35, repeat: Infinity, ease: 'easeOut' }}>
          <Heart className="fill-current" style={{ width: 18 + (i % 3) * 8, height: 18 + (i % 3) * 8 }} />
        </motion.span>
      ))}
      <Confetti pieces={80} />
      <motion.p initial={{ scale: 0.4, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} transition={{ type: 'spring', stiffness: 240, damping: 13, delay: 0.1 }}
        className="relative bg-gradient-to-r from-pink-400 via-fuchsia-300 to-sky-300 bg-clip-text px-2 text-[2.75rem] font-black italic leading-[1.05] tracking-tight text-transparent drop-shadow-[0_0_28px_var(--pm-glow,rgba(236,72,153,0.5))]">
        ¡Es un Playmatch!
      </motion.p>
      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="relative mt-3 text-body text-white/80">
        {theirs ? <><b className="font-bold text-white">{match.alias}</b> también te dio ♥</> : <>Tú y <b className="font-bold text-white">{match.alias}</b> se gustaron</>}
      </motion.p>
      <div className="relative my-9 flex items-center">
        {[myProfileId, match.otherId].map((id, i) => (
          <motion.span key={id} initial={{ x: i === 0 ? -120 : 120, rotate: i === 0 ? -24 : 24, opacity: 0 }} animate={{ x: i === 0 ? 14 : -14, rotate: i === 0 ? -8 : 8, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 190, damping: 15, delay: 0.25 }}
            className="block h-44 w-[136px] overflow-hidden rounded-[24px] border-[3px] border-white/90 shadow-[0_24px_60px_-15px_var(--pm-glow,rgba(236,72,153,0.8))]">
            <ProtectedPhoto ticketCode={ticketCode} profileId={id} viewerAlias={alias} className="h-full w-full" quiet />
          </motion.span>
        ))}
        <motion.span aria-hidden initial={{ scale: 0 }} animate={{ scale: [0, 1.35, 1] }} transition={{ delay: 0.6, duration: 0.5, ease: 'easeOut' }}
          className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500 shadow-[0_10px_30px_-6px_var(--pm-glow,rgba(236,72,153,0.9)),inset_0_1px_0_rgba(255,255,255,0.5)]">
          <motion.span animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}><Heart className="h-7 w-7 fill-[color:var(--pm-on-accent,#fff)] text-[color:var(--pm-on-accent,#fff)]" /></motion.span>
        </motion.span>
      </div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="relative w-full max-w-xs space-y-2.5">
        <button type="button" onClick={() => { tap(); onChat(); }} className={`flex h-14 w-full items-center justify-center rounded-full text-headline ${PM_CTA}`}>Escribirle ahora</button>
        <button type="button" onClick={() => { tap(); onGift(); }} className="lg-pill flex h-12 w-full items-center justify-center gap-2 rounded-full text-subhead font-semibold"><Wine className="h-4 w-4 text-amber-300" /> Invitarle un trago</button>
        <button type="button" onClick={onClose} className="h-11 w-full text-subhead font-semibold text-white/65">Seguir mirando</button>
      </motion.div>
    </motion.div>
  );
}
