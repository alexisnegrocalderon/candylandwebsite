import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { toast } from 'sonner';
import { Flag, Heart, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { ProtectedPhoto, preloadPhoto } from '@/components/party/ProtectedPhoto';
import { SWIPE_REPORT_REASONS, ZONE_LABELS, type PartyGender, type PartyZone } from '@shared/party';

const GENDER_LABELS: Record<PartyGender, string> = { hombre: 'Hombre', mujer: 'Mujer', pareja: 'Pareja' };

type Card = { id: number; alias: string; gender: PartyGender; zone: PartyZone };

/* Swipe estilo Tinder: ❤️ a la derecha, ✖️ a la izquierda. Los ❤️ son ciegos:
 * la otra persona solo se entera si hay match, y ahí se abre el chat de
 * siempre. Solo entra quien puso su foto (el servidor lo exige igual). */
export function SwipeView({ ticketCode, alias, participating, onOpenPhoto, onOpenChat }: {
  ticketCode: string;
  alias: string;
  participating: boolean;
  onOpenPhoto: () => void;
  onOpenChat: (connectionId: number, alias: string) => void;
}) {
  const utils = trpc.useUtils();
  const deckQuery = trpc.party.swipeDeck.useQuery({ ticketCode }, { enabled: participating, refetchInterval: 15_000 });
  const swipe = trpc.party.swipe.useMutation();
  const report = trpc.party.report.useMutation();

  // Las tarjetas ya resueltas se esconden al instante sin esperar al servidor.
  const [done, setDone] = useState<Set<number>>(new Set());
  const [match, setMatch] = useState<{ connectionId: number; alias: string } | null>(null);
  const [reporting, setReporting] = useState(false);

  const deck: Card[] = (deckQuery.data?.deck ?? []).filter((c) => !done.has(c.id));
  const top = deck[0];

  // `done` no se reinicia al refrescar el mazo: un refresco que llega antes de
  // que el servidor registre el último swipe devolvería la misma tarjeta de
  // nuevo. Los ids no se repiten, así que dejarlo crecer es inofensivo.

  // La foto de las dos tarjetas siguientes se pide mientras miras la actual.
  const nextIds = deck.slice(1, 3).map((c) => c.id).join(',');
  useEffect(() => {
    if (!nextIds) return;
    nextIds.split(',').forEach((id) => preloadPhoto(ticketCode, Number(id)));
  }, [nextIds, ticketCode]);

  const decide = (card: Card, liked: boolean) => {
    setDone((prev) => new Set(prev).add(card.id));
    setReporting(false);
    swipe.mutate({ ticketCode, targetProfileId: card.id, liked }, {
      onSuccess: (res) => {
        if (res.match) {
          setMatch({ connectionId: res.connectionId, alias: res.alias });
          utils.party.listMansion.invalidate();
        }
        if (deck.length <= 3) utils.party.swipeDeck.invalidate();
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const sendReport = (card: Card, reason: string) => {
    setDone((prev) => new Set(prev).add(card.id));
    setReporting(false);
    report.mutate({ ticketCode, targetProfileId: card.id, reason }, {
      onSuccess: () => toast.success('Gracias, el equipo lo va a revisar.'),
      onError: (e) => toast.error(e.message),
    });
  };

  if (!participating) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <p className="text-5xl mb-4" aria-hidden>💘</p>
        <h2 className="font-heading font-extrabold text-2xl mb-2">Swipe</h2>
        <p className="text-sm text-white/55 mb-6 leading-relaxed">
          Para ver fotos tienes que poner la tuya. Solo la ve gente que también participa, solo durante esta fiesta,
          y se borra al terminar. Si hay ❤️ de los dos, se abre el chat.
        </p>
        <button onClick={onOpenPhoto} className="h-12 px-8 rounded-full bg-primary font-bold">
          Tomar mi foto 📸
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-5 pb-28">
      <h2 className="font-heading font-extrabold text-2xl tracking-tight mb-4">Swipe 💘</h2>

      {deckQuery.isLoading && <p className="text-center text-white/40 text-sm py-16">Buscando gente…</p>}

      {!deckQuery.isLoading && !top && (
        <div className="text-center py-16">
          <p className="text-4xl mb-3" aria-hidden>🌙</p>
          <p className="text-white/60 text-sm">Por ahora no hay más gente. Vuelve en un rato, llega más a la fiesta.</p>
        </div>
      )}

      {top && (
        <>
          <div className="relative aspect-[3/4] w-full">
            {deck[1] && <div className="absolute inset-0 rounded-3xl bg-white/5 scale-95 translate-y-3" aria-hidden />}
            <SwipeCard key={top.id} ticketCode={ticketCode} viewerAlias={alias} card={top} onDecide={(liked) => decide(top, liked)} />
          </div>

          <div className="flex items-center justify-center gap-6 mt-6">
            <button
              onClick={() => decide(top, false)}
              aria-label="No"
              className="w-16 h-16 rounded-full border border-white/20 grid place-items-center active:scale-95 transition-transform"
            >
              <X className="w-7 h-7 text-white/70" />
            </button>
            <button
              onClick={() => decide(top, true)}
              aria-label="Me gusta"
              className="w-20 h-20 rounded-full bg-primary grid place-items-center active:scale-95 transition-transform shadow-lg shadow-primary/30"
            >
              <Heart className="w-9 h-9 fill-white" />
            </button>
            <button
              onClick={() => setReporting((v) => !v)}
              aria-label="Denunciar"
              className="w-12 h-12 rounded-full border border-white/12 grid place-items-center text-white/50"
            >
              <Flag className="w-5 h-5" />
            </button>
          </div>

          {reporting && (
            <div className="mt-4 p-3 rounded-2xl bg-white/[0.06] border border-white/10 space-y-2">
              <p className="text-xs text-white/50">Denunciar a {top.alias} (también lo dejas de ver):</p>
              {SWIPE_REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => sendReport(top, reason)}
                  className="w-full text-left text-sm px-3 py-2 rounded-xl bg-white/[0.06]"
                >
                  {reason}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {match && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/85 grid place-items-center px-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="text-center max-w-xs">
              <p className="text-6xl mb-4" aria-hidden>💘</p>
              <h3 className="font-heading font-extrabold text-3xl mb-2">¡Hicieron match!</h3>
              <p className="text-white/60 mb-6">Tú y {match.alias} se gustaron.</p>
              <button
                onClick={() => { const m = match; setMatch(null); onOpenChat(m.connectionId, m.alias); }}
                className="w-full h-12 rounded-full bg-primary font-bold mb-2"
              >
                Escribirle
              </button>
              <button onClick={() => setMatch(null)} className="w-full h-11 text-sm text-white/50">Seguir mirando</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SwipeCard({ ticketCode, viewerAlias, card, onDecide }: {
  ticketCode: string;
  viewerAlias: string;
  card: Card;
  onDecide: (liked: boolean) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);
  const dragged = useRef(false);

  return (
    <motion.div
      className="absolute inset-0 rounded-3xl overflow-hidden border border-white/10 bg-[#1a0f18] touch-pan-y"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragStart={() => { dragged.current = true; }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110) onDecide(true);
        else if (info.offset.x < -110) onDecide(false);
        setTimeout(() => { dragged.current = false; }, 0);
      }}
    >
      <ProtectedPhoto ticketCode={ticketCode} profileId={card.id} viewerAlias={viewerAlias} className="absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/85 to-transparent pointer-events-none">
        <p className="font-heading font-extrabold text-2xl">{card.alias}</p>
        <p className="text-sm text-white/65">{GENDER_LABELS[card.gender]} · {ZONE_LABELS[card.zone]}</p>
      </div>
      <motion.span style={{ opacity: likeOpacity }} className="absolute top-5 left-5 px-3 py-1 rounded-xl border-2 border-green-400 text-green-400 font-extrabold -rotate-12 pointer-events-none">
        ME GUSTA
      </motion.span>
      <motion.span style={{ opacity: nopeOpacity }} className="absolute top-5 right-5 px-3 py-1 rounded-xl border-2 border-red-400 text-red-400 font-extrabold rotate-12 pointer-events-none">
        NO
      </motion.span>
    </motion.div>
  );
}
