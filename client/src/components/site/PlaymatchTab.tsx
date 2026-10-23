import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookOpen, Check, Pencil, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { AppScreen, useBackClosable } from '@/components/site/AmbassadorAccount';
import { PartyAvatar } from '@/components/party/Avatar';
import { CreateProfile } from '@/components/site/PartyProfileForm';
import { PartyPhotos } from '@/components/site/PartyPhotos';
import { ProtectedPhoto } from '@/components/party/ProtectedPhoto';

// La fiesta en sí trae su propia hoja de estilos (admin.css): se carga recién al entrar.
const PartyExperience = lazy(() => import('@/pages/Party').then((m) => ({ default: m.PartyExperience })));
import { canPreRegister, isPartyWindowOpen, partyWindow, type PartyGender } from '@shared/party';

/* Playmatch dentro de la app («Mi cuenta» → pestaña Playmatch).
 *
 * Con la entrada comprada se puede inscribir desde ya: crea su perfil y acepta
 * las normas, y queda invisible hasta que escanean su entrada en la puerta
 * (ahí se activa sola y le llega el aviso). La fiesta en sí (mansión, swipe,
 * chat) se abre como otra pantalla de la app, nunca como la página web. */

type PmTicket = { ticketCode: string; status: string; category?: string };
export type PmEvent = { eventId: number; eventTitle: string; eventDate: string | Date; doorsOpen?: string | Date | null; eventEnd?: string | Date | null; tickets: PmTicket[] };

const tapHaptic = () => { try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };
const GUIDE_KEY = 'playmatch.guide.v1';
const NEON_RING = 'bg-gradient-to-br from-pink-500/70 via-fuchsia-400/40 to-sky-400/70';

const GUIDE = [
  { emoji: '🍬', title: '¿Qué es Playmatch?', body: 'La fiesta en tu celular: mira quién está en cada zona de la mansión, conecta y chatea. Solo existe mientras dura la fiesta.' },
  { emoji: '💘', title: 'Cómo se hace match', body: 'Pon tu foto y desliza: ♥ a la derecha, ✕ a la izquierda. Si los dos se dan ♥ es match y se abre el chat. Con un Caramelo ★ (hacia arriba) la otra persona se entera al tiro.' },
  { emoji: '🍹', title: 'Invita un trago', body: 'Regálale un trago a alguien desde Playmatch. Si lo acepta, lo retira en la barra.' },
  { emoji: '🔒', title: 'Tu privacidad primero', body: 'Te ven con un alias y un avatar, nunca con tu nombre. La foto se toma adentro y se borra al cerrar la fiesta. Puedes bloquear y denunciar cuando quieras.' },
];

const RULES = [
  { emoji: '🤝', text: 'Respeto siempre: un no es un no, y nadie te escribe sin que aceptes primero.' },
  { emoji: '🙈', text: 'Nada de datos personales: ni redes, ni teléfono, ni tu nombre real en el alias o el chat.' },
  { emoji: '📵', text: 'Sin capturas ni fotos de otras personas.' },
  { emoji: '🌙', text: 'Lo que pasa en Playmatch se queda en la fiesta: al cerrar se borra todo.' },
  { emoji: '🚩', text: 'Si alguien te incomoda, bloquéalo o denúncialo. El equipo lo revisa al momento y puede sacarlo de Playmatch.' },
];

const STEPS = ['Inscríbete ahora', 'Muestra tu QR en la puerta', 'Te llega el aviso y entras al tiro'];

/** El acceso con el que juega: el ya escaneado de la fiesta abierta, o el primero que aún sirve. */
function pickTicket(events: PmEvent[], now: Date): { ev: PmEvent; t: PmTicket } | null {
  for (const ev of events) {
    const win = { eventDate: ev.eventDate, doorsOpen: ev.doorsOpen, eventEnd: ev.eventEnd };
    const access = ev.tickets.filter((t) => (t.category ?? 'acceso') === 'acceso' && canPreRegister({ status: t.status, eventId: ev.eventId }, win, now));
    const t = access.find((x) => x.status === 'used') ?? access[0];
    if (t) return { ev, t };
  }
  return null;
}

function opensLabel(ev: PmEvent): string {
  const w = partyWindow({ eventDate: ev.eventDate, doorsOpen: ev.doorsOpen, eventEnd: ev.eventEnd });
  if (!w) return '';
  const d = new Date(w.opensAt);
  const day = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} desde las ${hour}`;
}

export function PlaymatchTab({ events, buyHref }: { events: PmEvent[]; buyHref?: string | null }) {
  const now = new Date();
  const pick = pickTicket(events, now);
  const [screen, setScreen] = useState<null | 'guia' | 'normas' | 'editar' | 'fiesta'>(null);
  const [photosVersion, setPhotosVersion] = useState(0);
  const close = useCallback(() => setScreen(null), []);
  const [guideSeen, setGuideSeen] = useState(() => { try { return !!localStorage.getItem(GUIDE_KEY); } catch { return false; } });
  const markGuide = () => { setGuideSeen(true); try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* nada */ } };

  const win = pick ? { eventDate: pick.ev.eventDate, doorsOpen: pick.ev.doorsOpen, eventEnd: pick.ev.eventEnd } : null;
  const openNight = !!win && isPartyWindowOpen(win, now);
  const session = trpc.party.getSession.useQuery({ ticketCode: pick?.t.ticketCode ?? '' }, {
    enabled: !!pick,
    retry: false,
    // La noche de la fiesta, mientras espera en la puerta: se entera solo cuando lo escanean.
    refetchInterval: openNight ? 15_000 : false,
  });
  const profile = session.data?.profile ?? null;
  const inside = !!session.data && !session.data.denial;

  const sheets = (
    <>
      <AppScreen open={screen === 'guia'} title="Cómo funciona" onClose={close}><Guide onDone={() => { markGuide(); close(); }} /></AppScreen>
      <AppScreen open={screen === 'normas'} title="Normas de la casa" onClose={close}><Rules /></AppScreen>
      {pick && profile && (
        <AppScreen open={screen === 'editar'} title="Tu perfil" onClose={close}>
          <CreateProfile embedded mode="edit" ticketCode={pick.t.ticketCode} initial={{ alias: profile.alias, gender: profile.gender as PartyGender, avatarId: profile.avatarId, lookingFor: profile.lookingFor as PartyGender[], costume: profile.costume }}
            onCreated={() => { session.refetch(); close(); }} />
        </AppScreen>
      )}
      {pick && <PartyScreen open={screen === 'fiesta'} ticketCode={pick.t.ticketCode} onClose={() => { close(); session.refetch(); }} />}
    </>
  );

  const links = (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => { tapHaptic(); setScreen('guia'); }} className="account-glass flex h-12 items-center justify-center gap-2 rounded-2xl text-footnote font-semibold interactive"><BookOpen className="h-4 w-4 text-pink-300" /> Cómo funciona</button>
      <button type="button" onClick={() => { tapHaptic(); setScreen('normas'); }} className="account-glass flex h-12 items-center justify-center gap-2 rounded-2xl text-footnote font-semibold interactive"><ShieldCheck className="h-4 w-4 text-sky-300" /> Normas</button>
    </div>
  );

  // Sin entrada para una fiesta que viene: la invitación a sumarse.
  if (!pick) {
    return (
      <div className="space-y-3">
        <Hero title="La fiesta en tu celular" body="Con tu entrada puedes inscribirte en Playmatch desde ya: mira quién está, haz match y chatea durante la fiesta." />
        <Steps />
        {buyHref && (
          <Link href={buyHref} onClick={tapHaptic} className="flex h-13 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 py-3.5 text-subhead font-bold text-white interactive">
            Comprar mi entrada <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {links}
        {sheets}
      </div>
    );
  }

  if (session.isLoading) {
    return <div className="grid flex-1 place-items-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-400 border-t-transparent" /></div>;
  }

  // Primera vez: la guía antes de inscribirse.
  if (!profile && !guideSeen) {
    return (<div className="space-y-3"><Guide onDone={markGuide} />{sheets}</div>);
  }

  // Inscripción (antes de la fiesta) o perfil recién adentro.
  if (!profile) {
    if (!inside && !session.data?.preRegister) {
      return (<div className="space-y-3"><Hero title="Playmatch no está disponible" body="No pudimos usar esta entrada para Playmatch. Si crees que es un error, escríbenos." />{links}{sheets}</div>);
    }
    return (
      <div className="space-y-4">
        {!inside && <Steps active={0} />}
        <div className="account-glass rounded-[26px] px-4 py-6">
          <CreateProfile embedded mode={inside ? 'inside' : 'pre'} ticketCode={pick.t.ticketCode} onCreated={() => { tapHaptic(); session.refetch(); if (inside) setScreen('fiesta'); }} />
        </div>
        {links}
        {sheets}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="account-glass flex items-center gap-3 rounded-[26px] px-4 py-3.5">
        {profile.photoCount > 0
          ? <ProtectedPhoto key={photosVersion} ticketCode={pick.t.ticketCode} profileId={profile.id} viewerAlias={profile.alias} className="h-14 w-14 shrink-0 rounded-full" quiet />
          : <PartyAvatar gender={profile.gender as PartyGender} avatarId={profile.avatarId} className="h-14 w-14 shrink-0 rounded-full" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-bold leading-tight">{profile.alias}</p>
          {profile.costume && <p className="truncate text-footnote font-semibold text-amber-200">✨ {profile.costume}</p>}
          <p className="mt-0.5 inline-flex items-center gap-1 text-footnote font-semibold text-emerald-300"><Check className="h-3.5 w-3.5" /> {inside ? 'Estás en la fiesta' : 'Inscripción lista'}</p>
        </div>
        <button type="button" onClick={() => { tapHaptic(); setScreen('editar'); }} aria-label="Editar perfil" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 interactive"><Pencil className="h-4 w-4" /></button>
      </div>

      {/* Las fotos del swipe se pueden dejar listas desde ya (las del disfraz): nadie las ve hasta que escanean la entrada. */}
      <div className="account-glass rounded-[26px] px-4 py-4">
        <p className="text-subhead font-bold">Tus fotos para el swipe</p>
        <p className="mb-3 mt-0.5 text-footnote leading-snug text-white/65">
          {profile.photoCount > 0 ? 'Listas. Puedes cambiarlas hasta que termine la fiesta.' : 'Sube hasta 3 (tu disfraz, por ejemplo). Nadie las ve hasta que entras a la fiesta, y se borran al terminar.'}
        </p>
        <PartyPhotos ticketCode={pick.t.ticketCode} profileId={profile.id} alias={profile.alias} photoCount={profile.photoCount}
          onChanged={() => { setPhotosVersion((v) => v + 1); session.refetch(); }} />
      </div>

      {inside ? (
        <button type="button" onClick={() => { tapHaptic(); setScreen('fiesta'); }} className={`block w-full rounded-[26px] p-[1.5px] text-left ${NEON_RING} interactive`}>
          <span className="flex items-center gap-3 rounded-[25px] bg-[#0d0712] px-4 py-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-sky-500 text-2xl">🍬</span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-bold leading-tight">Entrar a Playmatch</span>
              <span className="block truncate text-footnote text-white/60">Desliza, haz match y chatea</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-pink-300" />
          </span>
        </button>
      ) : (
        <div className="account-glass rounded-[26px] px-4 py-4">
          <p className="text-subhead font-bold">{openNight ? '🚪 Muestra tu QR en la puerta' : '⏳ Se activa en la fiesta'}</p>
          <p className="mt-1 text-footnote leading-snug text-white/65">
            {openNight
              ? 'Apenas te escaneen, tu perfil aparece en la fiesta y te llega el aviso. Esta pantalla se actualiza sola.'
              : `${pick.ev.eventTitle} · ${opensLabel(pick.ev)}. Cuando escaneen tu entrada en la puerta, entras al tiro.`}
          </p>
          <div className="mt-3"><Steps active={1} bare /></div>
        </div>
      )}
      {links}
      {sheets}
    </div>
  );
}

function Hero({ title, body }: { title: string; body: string }) {
  return (
    <div className={`rounded-[26px] p-[1.5px] ${NEON_RING}`}>
      <div className="rounded-[25px] bg-[#0d0712] px-5 py-6 text-center">
        <p className="text-4xl" aria-hidden>🍬</p>
        <p className="mt-2 text-title3 font-bold tracking-tight">{title}</p>
        <p className="mx-auto mt-1.5 max-w-xs text-footnote leading-snug text-white/65">{body}</p>
      </div>
    </div>
  );
}

/** Los 3 pasos (inscribirse → puerta → adentro); `active` marca hasta dónde va. */
function Steps({ active = -1, bare }: { active?: number; bare?: boolean }) {
  const list = (
    <ol className="space-y-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-3 text-footnote">
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-caption1 font-bold ${i < active ? 'bg-emerald-400/20 text-emerald-300' : i === active ? 'bg-pink-500 text-white' : 'bg-white/10 text-white/60'}`}>
            {i < active ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={i <= active ? 'text-white' : 'text-white/65'}>{s}</span>
        </li>
      ))}
    </ol>
  );
  return bare ? list : <div className="account-glass rounded-[22px] px-4 py-3.5">{list}</div>;
}

/** «Cómo funciona»: 4 tarjetas que se pasan deslizando o con «Siguiente». */
function Guide({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (n: number) => { if (n < 0 || n >= GUIDE.length) return; tapHaptic(); setDir(n > i ? 1 : -1); setI(n); };
  const last = i === GUIDE.length - 1;
  const g = GUIDE[i];
  return (
    <div className="space-y-4" data-pager="multi">
      <div className={`overflow-hidden rounded-[28px] p-[1.5px] ${NEON_RING}`}>
        <div className="relative h-[300px] overflow-hidden rounded-[27px] bg-[#0d0712]">
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.div
              key={i}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.4}
              onDragEnd={(_, info) => { if (info.offset.x < -50) go(i + 1); else if (info.offset.x > 50) go(i - 1); }}
              className="absolute inset-0 flex flex-col items-center justify-center px-7 text-center"
            >
              <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-pink-500/30 to-sky-500/30 text-5xl" aria-hidden>{g.emoji}</span>
              <p className="mt-5 text-title2 font-bold tracking-tight">{g.title}</p>
              <p className="mt-2 text-subhead leading-snug text-white/70">{g.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="flex justify-center gap-1.5" aria-hidden>
        {GUIDE.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all duration-300 ${n === i ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`} />)}
      </div>
      <button type="button" onClick={() => (last ? (tapHaptic(), onDone()) : go(i + 1))} className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 py-3.5 text-subhead font-bold text-white interactive">
        {last ? '¡Vamos!' : 'Siguiente'} <ArrowRight className="h-4 w-4" />
      </button>
      {!last && <button type="button" onClick={onDone} className="block w-full py-1 text-center text-footnote font-semibold text-white/60">Saltar</button>}
    </div>
  );
}

function Rules() {
  return (
    <div className="space-y-3 pb-4">
      <p className="text-subhead leading-snug text-white/65">Playmatch es para pasarlo bien y conocer gente con respeto. Al inscribirte aceptas estas normas:</p>
      <ul className="space-y-2">
        {RULES.map((r) => (
          <li key={r.text} className="account-glass flex items-start gap-3 rounded-[20px] px-4 py-3.5">
            <span className="text-title3 leading-none" aria-hidden>{r.emoji}</span>
            <span className="text-subhead leading-snug">{r.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-caption1 leading-snug text-white/60">Playmatch se abre solo cuando escanean tu entrada en la puerta y se cierra cuando termina la fiesta. Si el equipo te saca por no cumplir las normas, no vuelves a entrar esa noche.</p>
    </div>
  );
}

/** La fiesta (mansión, swipe, chat) a pantalla completa dentro de la app: entra deslizando, y
 * «Volver» o el atrás del teléfono regresan a la pestaña. */
function PartyScreen({ open, ticketCode, onClose }: { open: boolean; ticketCode: string; onClose: () => void }) {
  useBackClosable(open, onClose);
  // Con la pantalla abierta, el fondo de la app no se desplaza.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="fiesta"
          className="account-font party-in-app fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-[#0b0612] text-white"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
        >
          <Suspense fallback={<div className="grid min-h-dvh place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-400 border-t-transparent" /></div>}>
            <PartyExperience ticketCode={ticketCode} onBack={onClose} />
          </Suspense>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
