import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowUp, ChevronLeft, MapPin, Wine } from 'lucide-react';
import { useBackLayer } from '@/lib/appNav';
import { trpc } from '@/lib/trpc';
import { PersonPhoto, tap, usePartyFlags } from '@/components/party/ui';
import { MAX_MESSAGE_LENGTH, ZONE_LABELS, isOnline, isSeenBy, type PartyGender, type PartyZone } from '@shared/party';

/** Para romper el hielo cuando todavía no se escriben: tocar uno lo deja en el campo. */
const ICEBREAKERS = ['¿Dónde te encuentro? 👀', '¿Te invito algo? 🍹', 'Tu foto me hizo sonreír 😏', '¿Bailamos esta? 💃', '¿Qué te trajo esta noche? ✨'];
const HALLOWEEN_ICEBREAKERS = ['¿De qué vienes disfrazad@? 🎃', ...ICEBREAKERS.slice(0, 3)];
/** Respuestas de un toque: se mandan al tiro, como una reacción. */
const QUICK = ['😏', '🔥', '😂', '❤️', '👀', '🥂'];
const hhmm = (d: Date | string) => new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
/** Solo emojis (hasta 3): se muestran grandes y sin burbuja. */
const BIG_EMOJI = new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\s)+$', 'u');
const isBigEmoji = (body: string) => body.length <= 12 && BIG_EMOJI.test(body);

/** El chat de un match, estilo iMessage: burbujas propias con el degradado de la marca. */
export function Chat({ ticketCode, connectionId, alias, otherId, viewerAlias, canPhoto, onClose, onGift }: {
  ticketCode: string;
  connectionId: number;
  alias: string;
  otherId: number;
  viewerAlias: string;
  canPhoto: boolean;
  onClose: () => void;
  onGift: (profileId: number, alias: string) => void;
}) {
  // «Atrás» (gesto o Android) cierra el chat y vuelve a la fiesta.
  useBackLayer(true, onClose);
  const [text, setText] = useState('');
  const { zones, halloween } = usePartyFlags();
  // Lo que acabo de mandar se ve al instante, sin esperar al servidor (con mala señal el chat igual se siente vivo).
  const [sending, setSending] = useState<{ key: number; body: string }[]>([]);
  const chat = trpc.party.getMessages.useQuery({ ticketCode, connectionId }, { refetchInterval: 3_000 });
  const utils = trpc.useUtils();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const send = trpc.party.sendMessage.useMutation();
  const post = (body: string, restore: boolean) => {
    const key = Date.now() + Math.random();
    tap();
    setSending((list) => [...list, { key, body }]);
    send.mutate({ ticketCode, connectionId, body }, {
      onSuccess: async () => { await utils.party.getMessages.invalidate({ ticketCode, connectionId }); setSending((list) => list.filter((m) => m.key !== key)); },
      // No salió: el texto vuelve al campo para reintentar.
      onError: (e) => { setSending((list) => list.filter((m) => m.key !== key)); if (restore) setText((t) => t || body); toast.error(e.message); },
    });
  };

  const messages = chat.data?.messages ?? [];
  const other = chat.data?.other;
  // «Visto» bajo mi último mensaje, si es lo último del chat y la otra persona lo abrió después.
  const lastMsg = messages[messages.length - 1];
  const seen = !!lastMsg?.mine && isSeenBy(lastMsg.createdAt, chat.data?.otherReadAt);

  // Pegado abajo con cada mensaje nuevo, como cualquier chat.
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, sending.length]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    post(body, true);
    input.current?.focus();
  };
  const online = !!other?.lastSeenAt && isOnline(other.lastSeenAt, new Date());
  const status = [online ? 'Activa ahora' : null, zones && other?.zone ? `En ${ZONE_LABELS[other.zone as PartyZone]}` : null, other?.costume || null].filter(Boolean).join(' · ');

  return (
    <motion.div
      className="account-font account-tokens fixed inset-0 z-[88] flex flex-col bg-[color:var(--pm-bg,#0b0612)] text-white"
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
    >
      <div className="account-backdrop" />
      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/10 bg-[color:var(--pm-bg,#0b0612)]/70 px-3 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur-xl">
        <button type="button" onClick={onClose} aria-label="Volver" className="-ml-1 grid h-10 w-10 place-items-center rounded-full text-pink-300"><ChevronLeft className="h-7 w-7" /></button>
        <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto}
          person={{ id: otherId, gender: (other?.gender ?? 'mujer') as PartyGender, avatarId: other?.avatarId ?? 1 }} className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline font-bold leading-tight">{alias}</p>
          {status && (
            <p className="flex items-center gap-1.5 truncate text-caption1 text-white/60">
              {online ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" aria-hidden /> : zones && <MapPin className="h-3 w-3 shrink-0" />}
              <span className="truncate">{status}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={() => { tap(); onGift(otherId, alias); }} aria-label={`Invitarle un trago a ${alias}`} className="lg-pill grid h-10 w-10 place-items-center rounded-full"><Wine className="h-[18px] w-[18px] text-amber-300" /></button>
      </header>

      <div className="relative z-10 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-4">
        {messages.length === 0 && sending.length === 0 && !chat.isLoading && (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto}
              person={{ id: otherId, gender: (other?.gender ?? 'mujer') as PartyGender, avatarId: other?.avatarId ?? 1 }} className="h-24 w-24 rounded-full ring-4 ring-pink-500/60" />
            <p className="mt-3 text-title3 font-bold">Hicieron match con {alias}</p>
            <p className="mt-1 text-subhead text-white/65">Rompe el hielo:</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(halloween ? HALLOWEEN_ICEBREAKERS : ICEBREAKERS).map((t) => (
                <button key={t} type="button" onClick={() => { tap(); setText(t); input.current?.focus(); }} className="lg-pill rounded-full px-3.5 py-2 text-footnote font-semibold">{t}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const tail = !next || next.mine !== m.mine;
          // La hora, al empezar y cada vez que pasan más de 10 minutos sin escribirse.
          const stamp = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 10 * 60_000;
          return (
            <div key={m.id}>
              {stamp && <p className="py-2 text-center text-caption2 font-semibold text-white/45">{hhmm(m.createdAt)}</p>}
              <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }} className={`flex ${m.mine ? 'justify-end' : 'justify-start'} ${tail ? 'pb-1.5' : ''}`}>
                <Bubble body={m.body} mine={m.mine} tail={tail} />
              </motion.div>
            </div>
          );
        })}
        {sending.map((m) => (
          <div key={m.key} className="flex justify-end pb-1.5 opacity-60"><Bubble body={m.body} mine tail /></div>
        ))}
        {seen && sending.length === 0 && <p className="pr-1 text-right text-caption2 font-semibold text-white/60">Visto</p>}
        <div ref={end} />
      </div>

      <div className="relative z-10 shrink-0 border-t border-white/10 bg-[color:var(--pm-bg,#0b0612)]/70 backdrop-blur-xl">
      <div className="flex justify-between gap-1 px-4 pt-2">
        {QUICK.map((e) => (
          <button key={e} type="button" onClick={() => post(e, false)} aria-label={`Mandar ${e}`} className="grid h-10 flex-1 place-items-center rounded-full text-[1.4rem] transition-transform active:scale-125">{e}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Mensaje"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.07] px-4 text-body text-white placeholder:text-white/45 focus:border-pink-400/60 focus:outline-none"
        />
        <button type="button" onClick={submit} disabled={!text.trim()} aria-label="Enviar"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-600 text-[color:var(--pm-on-accent,#fff)] transition-opacity disabled:opacity-35">
          <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
        </button>
      </div>
      </div>
    </motion.div>
  );
}

function Bubble({ body, mine, tail }: { body: string; mine: boolean; tail: boolean }) {
  if (isBigEmoji(body)) return <p className="px-1 text-[2.6rem] leading-tight">{body}</p>;
  return (
    <p className={`max-w-[78%] whitespace-pre-wrap break-words px-4 py-2.5 text-body leading-snug ${
      mine
        ? `bg-gradient-to-br from-pink-500 to-fuchsia-600 text-[color:var(--pm-on-accent,#fff)] ${tail ? 'rounded-[20px] rounded-br-[6px]' : 'rounded-[20px]'}`
        : `bg-white/[0.12] text-white backdrop-blur-md ${tail ? 'rounded-[20px] rounded-bl-[6px]' : 'rounded-[20px]'}`
    }`}>
      {body}
    </p>
  );
}
