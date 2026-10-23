import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowUp, ChevronLeft, MapPin, Wine } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PersonPhoto, tap } from '@/components/party/ui';
import { MAX_MESSAGE_LENGTH, ZONE_LABELS, isSeenBy, type PartyGender, type PartyZone } from '@shared/party';

/** Para romper el hielo cuando todavía no se escriben: tocar uno lo deja en el campo. */
const ICEBREAKERS = ['¿De qué vienes disfrazad@? 🎃', '¿En qué zona estás? 👀', '¿Te invito algo? 🍹', 'Tu foto me hizo sonreír 😏'];

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
  const [text, setText] = useState('');
  const chat = trpc.party.getMessages.useQuery({ ticketCode, connectionId }, { refetchInterval: 3_000 });
  const utils = trpc.useUtils();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const send = trpc.party.sendMessage.useMutation({
    onSuccess: () => { setText(''); utils.party.getMessages.invalidate({ ticketCode, connectionId }); },
    onError: (e) => toast.error(e.message),
  });

  const messages = chat.data?.messages ?? [];
  const other = chat.data?.other;
  // «Visto» bajo mi último mensaje, si es lo último del chat y la otra persona lo abrió después.
  const lastMsg = messages[messages.length - 1];
  const seen = !!lastMsg?.mine && isSeenBy(lastMsg.createdAt, chat.data?.otherReadAt);

  // Pegado abajo con cada mensaje nuevo, como cualquier chat.
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    tap();
    send.mutate({ ticketCode, connectionId, body });
  };

  return (
    <motion.div
      className="account-font account-tokens fixed inset-0 z-[88] flex flex-col bg-[color:var(--pm-bg,#0b0612)] text-white"
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
    >
      <div className="account-backdrop" />
      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#0b0612]/70 px-3 pb-2.5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur-xl">
        <button type="button" onClick={onClose} aria-label="Volver" className="-ml-1 grid h-10 w-10 place-items-center rounded-full text-pink-300"><ChevronLeft className="h-7 w-7" /></button>
        <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto}
          person={{ id: otherId, gender: (other?.gender ?? 'mujer') as PartyGender, avatarId: other?.avatarId ?? 1 }} className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline font-bold leading-tight">{alias}</p>
          {other?.zone && <p className="flex items-center gap-1 truncate text-caption1 text-white/60"><MapPin className="h-3 w-3 shrink-0" /> En {ZONE_LABELS[other.zone as PartyZone]}{other.costume ? ` · ${other.costume}` : ''}</p>}
        </div>
        <button type="button" onClick={() => { tap(); onGift(otherId, alias); }} aria-label={`Invitarle un trago a ${alias}`} className="lg-pill grid h-10 w-10 place-items-center rounded-full"><Wine className="h-[18px] w-[18px] text-amber-300" /></button>
      </header>

      <div className="relative z-10 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-4">
        {messages.length === 0 && !chat.isLoading && (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto}
              person={{ id: otherId, gender: (other?.gender ?? 'mujer') as PartyGender, avatarId: other?.avatarId ?? 1 }} className="h-24 w-24 rounded-full ring-4 ring-pink-500/60" />
            <p className="mt-3 text-title3 font-bold">Hicieron match con {alias}</p>
            <p className="mt-1 text-subhead text-white/65">Rompe el hielo:</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {ICEBREAKERS.map((t) => (
                <button key={t} type="button" onClick={() => { tap(); setText(t); input.current?.focus(); }} className="lg-pill rounded-full px-3.5 py-2 text-footnote font-semibold">{t}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const next = messages[i + 1];
          const tail = !next || next.mine !== m.mine;
          return (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'} ${tail ? 'pb-1.5' : ''}`}>
              <p className={`max-w-[78%] whitespace-pre-wrap break-words px-4 py-2.5 text-body leading-snug ${
                m.mine
                  ? `bg-gradient-to-br from-pink-500 to-fuchsia-600 text-[color:var(--pm-on-accent,#fff)] ${tail ? 'rounded-[20px] rounded-br-[6px]' : 'rounded-[20px]'}`
                  : `bg-white/[0.12] text-white backdrop-blur-md ${tail ? 'rounded-[20px] rounded-bl-[6px]' : 'rounded-[20px]'}`
              }`}>
                {m.body}
              </p>
            </div>
          );
        })}
        {seen && <p className="pr-1 text-right text-caption2 font-semibold text-white/60">Visto</p>}
        <div ref={end} />
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-2 border-t border-white/10 bg-[#0b0612]/70 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl">
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
        <button type="button" onClick={submit} disabled={!text.trim() || send.isPending} aria-label="Enviar"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-600 text-[color:var(--pm-on-accent,#fff)] transition-opacity disabled:opacity-35">
          <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
        </button>
      </div>
    </motion.div>
  );
}
