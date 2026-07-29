import { useEffect, useMemo, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Flag, Send, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { PartyAvatar } from '@/components/party/Avatar';
import { Mansion, type MansionPerson } from '@/components/party/Mansion';
import { DrinkPicker, GiftInbox } from '@/components/party/Gifts';
import {
  AVATARS_PER_GENDER, MAX_ALIAS_LENGTH, MAX_MESSAGE_LENGTH, PARTY_GENDERS, PARTY_ZONES,
  ZONE_LABELS, sanitizeAlias, type PartyGender, type PartyZone,
} from '@shared/party';

const GENDER_LABELS: Record<PartyGender, string> = {
  hombre: 'Hombre',
  mujer: 'Mujer',
  pareja: 'Pareja',
};

/** "Caramelo" — la capa social de la fiesta, en el celular de cada invitado.
 * Solo entra quien tuvo su QR escaneado en la puerta, y solo mientras dura
 * el evento; ambas cosas las revalida el servidor en cada llamada, esto es
 * únicamente la cara visible. */
export default function Party() {
  const [, params] = useRoute('/fiesta/:ticketCode');
  const ticketCode = params?.ticketCode ?? '';

  useSeo({
    title: 'Playmatch — Mansion Playroom',
    description: 'Conecta con la gente que está en la fiesta contigo, en Playmatch.',
    path: `/fiesta/${ticketCode}`,
    noindex: true,
  });

  const session = trpc.party.getSession.useQuery({ ticketCode }, { enabled: !!ticketCode, retry: false });
  const [openChat, setOpenChat] = useState<{ connectionId: number; alias: string } | null>(null);
  const [selected, setSelected] = useState<MansionPerson | null>(null);
  const [gifting, setGifting] = useState<{ profileId: number; alias: string } | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);

  if (session.isLoading) {
    return (
      <div className="min-h-dvh grid place-items-center bg-[#120a11]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const denial = session.data?.denial;
  if (denial) return <ClosedDoor denial={denial} eventTitle={session.data?.event?.title} doorsOpen={session.data?.event?.doorsOpen} />;

  if (!session.data?.profile) {
    return <CreateProfile ticketCode={ticketCode} onCreated={() => session.refetch()} />;
  }

  return (
    <div className="min-h-dvh bg-[#120a11] text-white">
      <MansionView
        ticketCode={ticketCode}
        myZone={session.data.profile.zone as PartyZone}
        onPick={setSelected}
        onZoneChanged={() => session.refetch()}
        onOpenChat={(connectionId, alias) => { setSelected(null); setOpenChat({ connectionId, alias }); }}
        onGift={(profileId, alias) => { setSelected(null); setGifting({ profileId, alias }); }}
        onOpenInbox={() => setInboxOpen(true)}
        selected={selected}
        onCloseCard={() => setSelected(null)}
      />

      <AnimatePresence>
        {gifting && (
          <DrinkPicker
            ticketCode={ticketCode}
            targetProfileId={gifting.profileId}
            targetAlias={gifting.alias}
            onClose={() => setGifting(null)}
            onSent={() => setGifting(null)}
          />
        )}
        {inboxOpen && <GiftInbox ticketCode={ticketCode} onClose={() => setInboxOpen(false)} />}
        {openChat && (
          <Chat
            ticketCode={ticketCode}
            connectionId={openChat.connectionId}
            alias={openChat.alias}
            onClose={() => setOpenChat(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* --- Puerta cerrada ------------------------------------------------------ */

function ClosedDoor({ denial, eventTitle, doorsOpen }: { denial: string; eventTitle?: string | null; doorsOpen?: string | Date | null }) {
  const horaApertura = doorsOpen
    ? new Date(doorsOpen).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : null;

  const copy = {
    sin_ticket: {
      emoji: '🎫',
      title: 'No encontramos tu entrada',
      body: 'Revisa el link de tu email. Si crees que es un error, escríbenos por Instagram.',
    },
    no_ingreso: {
      emoji: '🚪',
      title: 'Todavía no estás adentro',
      body: 'Playmatch se abre recién cuando escaneen tu QR en la entrada principal. Muestra tu entrada al anfitrión y vuelve a entrar acá.',
    },
    fuera_de_horario: {
      emoji: '🌙',
      title: 'Playmatch no está abierto',
      body: horaApertura
        ? `Esto vive solo durante la fiesta. Se abre a las ${horaApertura} y se cierra cuando termina el evento.`
        : 'Esto vive solo durante el evento. Se abre cuando abren las puertas y se cierra cuando termina.',
    },
  }[denial] ?? { emoji: '🌙', title: 'Playmatch no está abierto', body: '' };

  return (
    <div className="min-h-dvh grid place-items-center bg-[#120a11] text-white px-6">
      <div className="text-center max-w-sm">
        <img src="/candyland/logo-wordmark.webp" alt="Mansion Playroom" className="h-10 w-auto mx-auto mb-6" />
        <p className="text-5xl mb-4" aria-hidden>{copy.emoji}</p>
        <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-2">{copy.title}</h1>
        <p className="text-white/50 text-sm mb-8">{copy.body}</p>
        {eventTitle && <p className="text-xs text-white/30 mb-6">{eventTitle}</p>}
        <Link href="/" className="inline-flex h-12 items-center px-8 rounded-full border border-white/15 text-sm font-semibold">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

/* --- Crear perfil -------------------------------------------------------- */

function CreateProfile({ ticketCode, onCreated }: { ticketCode: string; onCreated: () => void }) {
  const [alias, setAlias] = useState('');
  const [gender, setGender] = useState<PartyGender>('mujer');
  const [avatarId, setAvatarId] = useState(1);
  const [zone, setZone] = useState<PartyZone>('living');

  const create = trpc.party.createProfile.useMutation({
    onSuccess: onCreated,
    onError: (e) => toast.error(e.message),
  });

  const check = sanitizeAlias(alias);
  const aliasError = alias.length > 0 && !check.ok ? check.reason : null;

  return (
    <div className="min-h-dvh bg-[#120a11] text-white px-5 py-10">
      <div className="max-w-md mx-auto">
        <p className="text-4xl text-center mb-3" aria-hidden>🍬</p>
        <h1 className="font-heading font-extrabold text-3xl tracking-tight text-center mb-2">Estás adentro</h1>
        <p className="text-white/50 text-sm text-center mb-8">
          Elige cómo te van a ver esta noche. Sin fotos y sin tu nombre real.
        </p>

        <label className="block text-xs uppercase tracking-wide text-white/50 mb-2">Tu alias</label>
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          maxLength={MAX_ALIAS_LENGTH}
          placeholder="Ej: La Reina"
          className="w-full h-13 px-4 rounded-2xl bg-white/[0.06] border border-white/15 text-white text-base placeholder:text-white/25 focus:border-primary/60 focus:outline-none"
        />
        <p className={`text-xs mt-1.5 mb-6 ${aliasError ? 'text-red-400' : 'text-white/30'}`}>
          {aliasError ?? `${alias.length}/${MAX_ALIAS_LENGTH} · sin redes ni teléfonos`}
        </p>

        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Vengo como</p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {PARTY_GENDERS.map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`h-11 rounded-2xl text-sm font-semibold border transition-colors ${
                gender === g ? 'bg-primary/20 border-primary/60 text-white' : 'border-white/12 text-white/55'
              }`}
            >
              {GENDER_LABELS[g]}
            </button>
          ))}
        </div>

        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">Tu avatar</p>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {Array.from({ length: AVATARS_PER_GENDER }, (_, i) => i + 1).map((id) => (
            <button
              key={id}
              onClick={() => setAvatarId(id)}
              aria-label={`Avatar ${id}`}
              className={`rounded-full transition-transform active:scale-95 ${
                avatarId === id ? 'ring-3 ring-primary scale-105' : 'opacity-55'
              }`}
            >
              <PartyAvatar gender={gender} avatarId={id} className="w-full h-auto rounded-full" />
            </button>
          ))}
        </div>

        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">¿Dónde estás ahora?</p>
        <div className="grid grid-cols-2 gap-2 mb-8">
          {PARTY_ZONES.map((z) => (
            <button
              key={z}
              onClick={() => setZone(z)}
              className={`h-11 rounded-2xl text-sm font-semibold border transition-colors ${
                zone === z ? 'bg-primary/20 border-primary/60 text-white' : 'border-white/12 text-white/55'
              }`}
            >
              {ZONE_LABELS[z]}
            </button>
          ))}
        </div>

        <button
          disabled={!check.ok || create.isPending}
          onClick={() => check.ok && create.mutate({ ticketCode, alias: check.alias, gender, avatarId, zone })}
          className="w-full h-14 rounded-full bg-primary text-white font-bold text-base disabled:opacity-35 transition-opacity"
        >
          {create.isPending ? 'Entrando…' : 'Entrar a Playmatch'}
        </button>

        <p className="text-[11px] text-white/30 text-center mt-4 leading-relaxed">
          Nadie puede escribirte sin que aceptes primero. Puedes bloquear y denunciar en cualquier momento.
        </p>
      </div>
    </div>
  );
}

/* --- La mansión ---------------------------------------------------------- */

function MansionView({ ticketCode, myZone, onPick, onZoneChanged, onOpenChat, onGift, onOpenInbox, selected, onCloseCard }: {
  ticketCode: string;
  myZone: PartyZone;
  onPick: (p: MansionPerson) => void;
  onZoneChanged: () => void;
  onOpenChat: (connectionId: number, alias: string) => void;
  onGift: (profileId: number, alias: string) => void;
  onOpenInbox: () => void;
  selected: MansionPerson | null;
  onCloseCard: () => void;
}) {
  // 10 segundos: se siente vivo sin castigar la batería ni la función
  // serverless. El chat abierto sí va más rápido (3s).
  const mansion = trpc.party.listMansion.useQuery({ ticketCode }, { refetchInterval: 10_000 });
  const utils = trpc.useUtils();

  const setZone = trpc.party.setZone.useMutation({
    onSuccess: () => { onZoneChanged(); utils.party.listMansion.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const people = mansion.data?.people ?? [];
  const pending = useMemo(() => people.filter((p) => p.pendingForMe), [people]);

  // Lo que pide acción mía: una invitación por responder, o una que ya me
  // aceptaron y falta pagar.
  const myGifts = trpc.party.myGifts.useQuery({ ticketCode }, { refetchInterval: 10_000 });
  const pendingGifts =
    (myGifts.data?.received.filter((g) => g.status === 'invited').length ?? 0) +
    (myGifts.data?.sent.filter((g) => g.status === 'accepted').length ?? 0);

  return (
    <div className="max-w-md mx-auto px-4 py-5 pb-24">
      <header className="flex items-center justify-between mb-4">
        <h1 className="font-heading font-extrabold text-2xl tracking-tight">Playmatch 🍬</h1>
        <div className="flex items-center gap-3">
          <p className="text-xs text-white/40">
            {mansion.data ? `${mansion.data.touchesLeft} toques` : ''}
          </p>
          <button
            onClick={onOpenInbox}
            className="relative h-9 px-3 rounded-full border border-white/15 text-sm"
            aria-label="Mis tragos"
          >
            🍹
            {pendingGifts > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 grid place-items-center rounded-full bg-primary text-[11px] font-bold">
                {pendingGifts}
              </span>
            )}
          </button>
        </div>
      </header>

      {pending.length > 0 && (
        <div className="mb-5 p-4 rounded-3xl bg-primary/12 border border-primary/30">
          <p className="text-sm font-bold mb-3">
            {pending.length === 1 ? 'Alguien te tocó 👋' : `${pending.length} personas te tocaron 👋`}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pending.map((p) => (
              <button key={p.id} onClick={() => onPick(p)} className="shrink-0 flex flex-col items-center gap-1.5 w-16">
                <PartyAvatar gender={p.gender} avatarId={p.avatarId} className="w-14 h-14 rounded-full ring-2 ring-primary" />
                <span className="text-[11px] truncate max-w-full">{p.alias}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Mansion
        people={people}
        myZone={myZone}
        onPick={onPick}
        onChangeZone={(zone) => setZone.mutate({ ticketCode, zone })}
      />

      <AnimatePresence>
        {selected && (
          <PersonCard
            ticketCode={ticketCode}
            person={selected}
            onClose={onCloseCard}
            onOpenChat={onOpenChat}
            onGift={onGift}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* --- Tarjeta de una persona ---------------------------------------------- */

function PersonCard({ ticketCode, person, onClose, onOpenChat, onGift }: {
  ticketCode: string;
  person: MansionPerson;
  onClose: () => void;
  onOpenChat: (connectionId: number, alias: string) => void;
  onGift: (profileId: number, alias: string) => void;
}) {
  const utils = trpc.useUtils();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');

  const refresh = () => utils.party.listMansion.invalidate();

  const touch = trpc.party.touch.useMutation({
    onSuccess: (res) => {
      refresh();
      if (res.status === 'accepted') {
        toast.success('¡Se tocaron los dos! Ya pueden hablar 💬');
        onOpenChat(res.connectionId, person.alias);
      } else {
        toast.success('Toque enviado 👋');
        onClose();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const respond = trpc.party.respondTouch.useMutation({
    onSuccess: (res) => {
      refresh();
      if (res.status === 'accepted' && person.connectionId) {
        onOpenChat(person.connectionId, person.alias);
      } else {
        onClose();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const block = trpc.party.block.useMutation({
    onSuccess: () => { refresh(); toast.success('Listo, no se van a ver más'); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const report = trpc.party.report.useMutation({
    onSuccess: () => { refresh(); toast.success('Denuncia enviada al equipo del local'); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const busy = touch.isPending || respond.isPending || block.isPending || report.isPending;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-md bg-[#1a1019] border-t border-white/12 rounded-t-3xl p-6 pb-9"
        initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end -mt-2 -mr-2 mb-1">
          <button onClick={onClose} className="p-2 text-white/40" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-col items-center text-center mb-6">
          <PartyAvatar gender={person.gender} avatarId={person.avatarId} className="w-24 h-24 rounded-full mb-3" />
          <h2 className="font-heading font-extrabold text-2xl tracking-tight">{person.alias}</h2>
          <p className="text-sm text-white/45">{GENDER_LABELS[person.gender]} · {ZONE_LABELS[person.zone]}</p>
        </div>

        {person.pendingForMe && person.connectionId ? (
          <div className="space-y-2.5">
            <p className="text-sm text-center text-white/70 mb-3">Te mandó un toque 👋</p>
            <button
              disabled={busy}
              onClick={() => respond.mutate({ ticketCode, connectionId: person.connectionId!, accept: true })}
              className="w-full h-14 rounded-full bg-primary font-bold disabled:opacity-40"
            >
              Aceptar y hablar
            </button>
            <button
              disabled={busy}
              onClick={() => respond.mutate({ ticketCode, connectionId: person.connectionId!, accept: false })}
              className="w-full h-12 rounded-full border border-white/15 text-white/60 font-semibold disabled:opacity-40"
            >
              Ahora no
            </button>
          </div>
        ) : person.connectionStatus === 'accepted' && person.connectionId ? (
          <button
            onClick={() => onOpenChat(person.connectionId!, person.alias)}
            className="w-full h-14 rounded-full bg-primary font-bold"
          >
            Abrir chat 💬
          </button>
        ) : person.connectionStatus === 'pending' ? (
          <p className="text-sm text-center text-white/45 py-4">Ya le mandaste un toque. Queda esperar 🤞</p>
        ) : (
          <button
            disabled={busy}
            onClick={() => touch.mutate({ ticketCode, targetProfileId: person.id })}
            className="w-full h-14 rounded-full bg-primary font-bold disabled:opacity-40"
          >
            Mandar un toque 👋
          </button>
        )}

        {/* Invitar un trago no exige tener el chat abierto: es justamente
            la forma clásica de acercarse a alguien que no conoces. La otra
            persona puede rechazarlo, y ahí no se cobra nada. */}
        <button
          onClick={() => onGift(person.id, person.alias)}
          className="w-full h-13 mt-2.5 rounded-full border border-primary/40 bg-primary/10 font-semibold"
        >
          Invitarle un trago 🍹
        </button>

        <div className="mt-6 pt-5 border-t border-white/10">
          {!reporting ? (
            <div className="flex gap-3">
              <button
                onClick={() => block.mutate({ ticketCode, targetProfileId: person.id })}
                disabled={busy}
                className="flex-1 h-11 rounded-full border border-white/12 text-xs text-white/50 font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" /> Bloquear
              </button>
              <button
                onClick={() => setReporting(true)}
                className="flex-1 h-11 rounded-full border border-red-500/25 text-xs text-red-300 font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Flag className="w-3.5 h-3.5" /> Denunciar
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="¿Qué pasó?"
                className="w-full h-12 px-4 rounded-2xl bg-white/[0.06] border border-white/15 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-red-400/50"
              />
              <div className="flex gap-2">
                <button
                  disabled={reason.trim().length < 3 || busy}
                  onClick={() => report.mutate({ ticketCode, targetProfileId: person.id, reason: reason.trim() })}
                  className="flex-1 h-11 rounded-full bg-red-500/85 text-sm font-bold disabled:opacity-35"
                >
                  Enviar denuncia
                </button>
                <button onClick={() => setReporting(false)} className="px-5 h-11 rounded-full border border-white/12 text-sm text-white/55">
                  Cancelar
                </button>
              </div>
              <p className="text-[11px] text-white/30 text-center">Al denunciar, también dejan de verse.</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* --- Chat ---------------------------------------------------------------- */

function Chat({ ticketCode, connectionId, alias, onClose }: {
  ticketCode: string;
  connectionId: number;
  alias: string;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const chat = trpc.party.getMessages.useQuery({ ticketCode, connectionId }, { refetchInterval: 3_000 });
  const utils = trpc.useUtils();

  const send = trpc.party.sendMessage.useMutation({
    onSuccess: () => { setText(''); utils.party.getMessages.invalidate({ ticketCode, connectionId }); },
    onError: (e) => toast.error(e.message),
  });

  const messages = chat.data?.messages ?? [];

  // Pegado abajo con cada mensaje nuevo, como cualquier chat.
  useEffect(() => {
    const el = document.getElementById('party-chat-end');
    el?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    send.mutate({ ticketCode, connectionId, body });
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-[#120a11] flex flex-col"
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <button onClick={onClose} className="p-1 -ml-1 text-white/60" aria-label="Volver">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {chat.data?.other && (
          <PartyAvatar gender={chat.data.other.gender as PartyGender} avatarId={chat.data.other.avatarId} className="w-9 h-9 rounded-full" />
        )}
        <p className="font-bold">{alias}</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-white/35 py-10">
            Se tocaron los dos. Rompe el hielo 🍬
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[78%] px-4 py-2.5 rounded-3xl text-sm leading-snug ${
              m.mine ? 'bg-primary text-white rounded-br-lg' : 'bg-white/10 text-white rounded-bl-lg'
            }`}>
              {m.body}
            </p>
          </div>
        ))}
        <div id="party-chat-end" />
      </div>

      <div className="p-3 border-t border-white/10 flex gap-2 shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Escribe algo…"
          className="flex-1 h-12 px-4 rounded-full bg-white/[0.07] border border-white/12 text-white text-base placeholder:text-white/25 focus:outline-none focus:border-primary/50"
        />
        <button
          onClick={submit}
          disabled={!text.trim() || send.isPending}
          className="w-12 h-12 shrink-0 grid place-items-center rounded-full bg-primary disabled:opacity-35"
          aria-label="Enviar"
        >
          <Send className="w-4.5 h-4.5" />
        </button>
      </div>
    </motion.div>
  );
}
