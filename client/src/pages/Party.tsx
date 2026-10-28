import '@/admin.css';
import { useEffect, useRef, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Bell, Camera, ChevronLeft, DoorClosed, Flame, MessageCircle, Moon, PartyPopper, TicketX, Trophy, Wine } from 'lucide-react';
import { useEntryState } from '@/lib/appNav';
import { trpc } from '@/lib/trpc';
import { useMemberSession } from '@/lib/member';
import { useSeo } from '@/hooks/useSeo';
import { Mansion, type MansionPerson } from '@/components/party/Mansion';
import { DrinkPicker, GiftInbox } from '@/components/party/Gifts';
import { MyPhotoPanel } from '@/components/party/MyPhotoPanel';
import { DiscoverView, MatchCelebration } from '@/components/party/Swipe';
import { MatchesView } from '@/components/party/Matches';
import { Chat } from '@/components/party/Chat';
import { CostumesView } from '@/components/party/Costumes';
import { LikesSheet, SuperLikeSheet } from '@/components/party/SuperLike';
import { PersonSheet, type SheetPerson } from '@/components/party/PersonSheet';
import { ProtectedPhoto } from '@/components/party/ProtectedPhoto';
import { GlassIconButton, ON_ACCENT, PmSheet, PM_CTA, tap } from '@/components/party/ui';
import { useCostumeVotes } from '@/components/party/costumeVotes';
import { useHalloweenMode } from '@/lib/halloween';
import type { PartyGender, PartyZone } from '@shared/party';
import { rememberTicketCode } from '@/lib/lastTicketCode';
import { CreateProfile } from '@/components/site/PartyProfileForm';
import { useInstallableApp } from '@/hooks/useInstallableApp';


/** Playmatch — la capa social de la fiesta, en el celular de cada invitado.
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
  return <PartyExperience ticketCode={ticketCode} />;
}

/** Playmatch completo. En la página /fiesta ocupa la pantalla; dentro de la app de «Mi cuenta» se
 * abre como una pantalla más (`onBack` = volver a la app, sin salir a la web).
 *
 * Pestañas como una app de citas: Descubrir (el swipe), Fiesta (quién está en cada sala), Matches (Super Likes
 * que te mandaron y tus chats) y, durante el concurso, Disfraces. Todo con el vidrio y la letra de la App. */
type Tab = 'descubrir' | 'fiesta' | 'matches' | 'disfraces';
const TABS: { id: Tab; label: string; icon: typeof Flame }[] = [
  { id: 'descubrir', label: 'Descubrir', icon: Flame },
  { id: 'fiesta', label: 'Fiesta', icon: PartyPopper },
  { id: 'matches', label: 'Matches', icon: MessageCircle },
  { id: 'disfraces', label: 'Disfraces', icon: Trophy },
];

export function PartyExperience({ ticketCode, onBack }: { ticketCode: string; onBack?: () => void }) {
  // Requisito para que las notificaciones push funcionen en iOS (ver
  // NotificationsPanel más abajo): solo registra el service worker, sin
  // tocar el manifest -- ese ya viene correcto desde el HTML estático
  // generado en el build (scripts/generate-pwa-html.mjs), igual que /admin.
  useInstallableApp('/fiesta/sw.js', '/fiesta/');

  // Cada 20 s (y al volver a la app): así se entera solo de lo que el administrador prende o apaga (pausa, Super Likes, podio del concurso).
  const session = trpc.party.getSession.useQuery({ ticketCode }, { enabled: !!ticketCode, retry: false, refetchInterval: 20_000 });

  useEffect(() => {
    if (ticketCode && !session.data?.denial) rememberTicketCode(ticketCode);
  }, [ticketCode, session.data?.denial]);

  // Pestaña, chat y paneles quedan en la entrada del historial: al volver a la fiesta están como se dejaron.
  const [tab, setTab] = useEntryState<Tab>('fiesta.tab', 'descubrir');
  const [openChat, setOpenChat] = useEntryState<{ connectionId: number; alias: string; otherId: number } | null>('fiesta.chat', null);
  const [selected, setSelected] = useState<SheetPerson | null>(null);
  const [gifting, setGifting] = useState<{ profileId: number; alias: string } | null>(null);
  const [match, setMatch] = useState<{ connectionId: number; alias: string; otherId: number } | null>(null);
  const [inboxOpen, setInboxOpen] = useEntryState('fiesta.tragos', false);
  const [notifOpen, setNotifOpen] = useEntryState('fiesta.avisos', false);
  const [photoOpen, setPhotoOpen] = useEntryState('fiesta.foto', false);
  // Compra de Super Likes y «Quién me dio ♥»: viven acá (y no dentro de cada pantalla) para que se abran por encima de cualquier hoja.
  // `afterBuy` guarda lo que se quería hacer, para hacerlo apenas termine de pagar.
  const [buyOpen, setBuyOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const afterBuy = useRef<(() => void) | null>(null);
  const openBuy = (then: () => void) => { afterBuy.current = then; setBuyOpen(true); };

  const inside = !!session.data?.profile && !session.data?.denial;
  // Modo Halloween (el interruptor del admin): paleta lima y violeta, y votar «Mejor disfraz».
  const halloween = useHalloweenMode();
  const voting = useCostumeVotes(ticketCode, inside && halloween);
  // 10 segundos: se siente vivo sin castigar la batería ni la función serverless. El chat abierto va a 3 s.
  const mansion = trpc.party.listMansion.useQuery({ ticketCode }, { enabled: inside, refetchInterval: 10_000 });
  const myGifts = trpc.party.myGifts.useQuery({ ticketCode }, { enabled: inside, refetchInterval: 10_000 });
  const myMatches = trpc.party.myMatches.useQuery({ ticketCode }, { enabled: inside, refetchInterval: 10_000 });
  const utils = trpc.useUtils();
  const setZone = trpc.party.setZone.useMutation({
    onSuccess: () => { session.refetch(); utils.party.listMansion.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (session.isLoading) {
    return <div className="account-font grid min-h-dvh place-items-center bg-[#0b0612]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-400 border-t-transparent" /></div>;
  }

  const denial = session.data?.denial;
  if (denial) return <ClosedDoor denial={denial} eventTitle={session.data?.event?.title} doorsOpen={session.data?.event?.doorsOpen} onBack={onBack} />;

  if (!session.data?.profile) {
    return <CreateProfile ticketCode={ticketCode} onCreated={() => session.refetch()} />;
  }

  const profile = session.data.profile;
  // El administrador puede poner Playmatch en pausa en vivo: mientras dure, una pantalla clara en vez de pantallas que fallan.
  if (session.data.config && !session.data.config.enabled) return <PausedScreen eventTitle={session.data.event?.title} onBack={onBack} />;
  // El concurso del mejor disfraz (Modo Halloween): la pestaña se ve mientras el administrador lo tenga prendido; se vota hasta que revele el podio.
  const config = session.data.config;
  const showContest = halloween && !!config?.costumes;
  const contestOpen = showContest && !config?.costumeRevealed;
  const tabs = TABS.filter((t) => t.id !== 'disfraces' || showContest);
  const canPhoto = profile.hasPhoto && profile.swipeEnabled;
  const people = (mansion.data?.people ?? []) as MansionPerson[];
  const superLikesLeft = mansion.data?.touchesLeft ?? 0;
  const caramelosForMe = people.filter((p) => p.pendingForMe).length;
  // Lo que pide respuesta en Matches: Super Likes por contestar y mensajes sin leer.
  const unreadChats = (myMatches.data ?? []).reduce((n, m) => n + m.unread, 0);
  // Lo que pide acción mía en los tragos: una invitación por responder, o una aceptada por pagar.
  const pendingGifts =
    (myGifts.data?.received.filter((g) => g.status === 'invited').length ?? 0) +
    (myGifts.data?.sent.filter((g) => g.status === 'accepted').length ?? 0);

  // Si el administrador apaga el concurso estando en esa pestaña, vuelve a Descubrir.
  const view: Tab = tab === 'disfraces' && !showContest ? 'descubrir' : tab;
  const go = (next: Tab) => { if (next !== view) { tap(); setTab(next); } };
  const openPerson = (p: SheetPerson) => setSelected(p);
  const chatWith = (connectionId: number, alias: string, otherId: number) => { setSelected(null); setMatch(null); setOpenChat({ connectionId, alias, otherId }); };
  const gift = (profileId: number, alias: string) => { setSelected(null); setGifting({ profileId, alias }); };
  const celebrate = (m: { connectionId: number; alias: string; otherId: number }) => { setSelected(null); setMatch(m); utils.party.listMansion.invalidate(); utils.party.myMatches.invalidate(); };

  return (
    <div className={`account-font account-tokens relative flex h-dvh flex-col overflow-hidden bg-[color:var(--pm-bg,#0b0612)] text-white ${halloween ? 'pm-halloween' : ''}`}>
      <div className="account-backdrop" />
      <header className="relative z-10 flex shrink-0 items-center gap-2 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Volver a la app" className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-pink-300"><ChevronLeft className="h-7 w-7" /></button>
        ) : (
          <MemberBackLink />
        )}
        <h1 className="flex min-w-0 flex-1 items-center gap-1.5 text-title2 font-bold tracking-tight">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500"><Flame className="h-4 w-4 fill-white text-white" /></span>
          <span className="truncate">Playmatch</span>
        </h1>
        <button type="button" onClick={() => { tap(); setPhotoOpen(true); }} aria-label="Mi foto y mi perfil" className="lg-pill relative grid h-11 w-11 place-items-center overflow-hidden rounded-full">
          {profile.hasPhoto
            ? <ProtectedPhoto ticketCode={ticketCode} profileId={profile.id} viewerAlias={profile.alias} className="h-full w-full" quiet />
            : <Camera className="h-5 w-5" />}
        </button>
        <GlassIconButton label="Mis tragos" onClick={() => setInboxOpen(true)} badge={pendingGifts}><Wine className="h-5 w-5 text-amber-300" /></GlassIconButton>
        <GlassIconButton label="Avisos" onClick={() => setNotifOpen(true)}><Bell className="h-5 w-5" /></GlassIconButton>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+84px)]">
        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex min-h-0 flex-1 flex-col">
          {view === 'descubrir' && (
            <DiscoverView
              ticketCode={ticketCode}
              alias={profile.alias}
              myProfileId={profile.id}
              participating={canPhoto}
              superLikesLeft={superLikesLeft}
              voting={contestOpen ? voting : undefined}
              onBuySuperLike={openBuy}
              onOpenLikes={() => setLikesOpen(true)}
              onOpenPhoto={() => setPhotoOpen(true)}
              onMatch={celebrate}
              onGift={gift}
              onInfo={(card) => openPerson(people.find((p) => p.id === card.id) ?? { ...card, avatarId: 1, connectionId: null, connectionStatus: null, pendingForMe: false })}
            />
          )}
          {view === 'fiesta' && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
              <Mansion people={people} myZone={profile.zone as PartyZone} onPick={openPerson} onChangeZone={(zone) => setZone.mutate({ ticketCode, zone })}
                ticketCode={ticketCode} viewerAlias={profile.alias} canPhoto={canPhoto} />
            </div>
          )}
          {view === 'matches' && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-1">
              <MatchesView people={people} ticketCode={ticketCode} viewerAlias={profile.alias} canPhoto={canPhoto}
                onPick={openPerson} onOpenChat={chatWith} onDiscover={() => go('descubrir')} />
            </div>
          )}
          {view === 'disfraces' && (
            <CostumesView ticketCode={ticketCode} viewerAlias={profile.alias} canPhoto={canPhoto} voting={voting} onOpenPhoto={() => setPhotoOpen(true)} />
          )}
        </motion.div>
      </main>

      {/* La barra de abajo, del mismo vidrio que la de la App. */}
      <nav aria-label="Secciones de Playmatch" className={`fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 z-20 w-[calc(100vw-48px)] -translate-x-1/2 ${tabs.length > 3 ? 'max-w-sm' : 'max-w-xs'}`}>
        <div className="lg-pill grid rounded-full p-1.5" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const badge = id === 'matches' ? caramelosForMe + unreadChats : 0;
            return (
              <button key={id} type="button" onClick={() => go(id)} aria-current={view === id ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-full py-2 text-caption2 font-semibold transition-all duration-300 ${view === id ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]' : 'text-white/60'}`}>
                <Icon className={`h-[22px] w-[22px] ${view === id && id === 'descubrir' ? 'fill-pink-500 text-pink-400' : ''}`} />
                {label}
                {badge > 0 && <span className={`absolute right-3 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-caption2 font-bold ${ON_ACCENT}`}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {selected && (
          <PersonSheet key="persona" ticketCode={ticketCode} viewerAlias={profile.alias} canPhoto={canPhoto} person={selected} superLikesLeft={superLikesLeft} voting={contestOpen ? voting : undefined}
            onClose={() => setSelected(null)} onOpenChat={chatWith} onGift={gift} onMatch={celebrate} onBuySuperLike={openBuy} />
        )}
        {match && (
          <MatchCelebration key="match" ticketCode={ticketCode} alias={profile.alias} myProfileId={profile.id} match={match}
            onChat={() => chatWith(match.connectionId, match.alias, match.otherId)} onGift={() => { const m = match; setMatch(null); setGifting({ profileId: m.otherId, alias: m.alias }); }} onClose={() => setMatch(null)} />
        )}
        {gifting && (
          <DrinkPicker key="trago" ticketCode={ticketCode} targetProfileId={gifting.profileId} targetAlias={gifting.alias}
            onClose={() => setGifting(null)} onSent={() => setGifting(null)} />
        )}
        {inboxOpen && <GiftInbox key="tragos" ticketCode={ticketCode} onClose={() => setInboxOpen(false)} />}
        {photoOpen && (
          <MyPhotoPanel key="foto" ticketCode={ticketCode} profileId={profile.id} alias={profile.alias} gender={profile.gender as PartyGender} zone={profile.zone as PartyZone}
            costume={profile.costume} photoCount={profile.photoCount} swipeEnabled={profile.swipeEnabled} onChanged={() => { session.refetch(); utils.party.swipeDeck.invalidate(); }} onClose={() => setPhotoOpen(false)} />
        )}
        {notifOpen && <NotificationsPanel key="avisos" ticketCode={ticketCode} onClose={() => setNotifOpen(false)} />}
        {openChat && (
          <Chat key="chat" ticketCode={ticketCode} connectionId={openChat.connectionId} alias={openChat.alias} otherId={openChat.otherId}
            viewerAlias={profile.alias} canPhoto={canPhoto} onClose={() => { setOpenChat(null); utils.party.myMatches.invalidate(); }} onGift={gift} />
        )}
        {likesOpen && (
          <LikesSheet key="likes" ticketCode={ticketCode} viewerAlias={profile.alias} canPhoto={canPhoto} onClose={() => setLikesOpen(false)} onMatch={celebrate}
            onInfo={(card) => { setLikesOpen(false); openPerson(people.find((p) => p.id === card.id) ?? { ...card, connectionId: null, connectionStatus: null, pendingForMe: false }); }} />
        )}
        {buyOpen && (
          <SuperLikeSheet key="superlike" ticketCode={ticketCode}
            onClose={() => { afterBuy.current = null; setBuyOpen(false); }}
            onBought={() => { const then = afterBuy.current; afterBuy.current = null; setBuyOpen(false); if (then) window.setTimeout(then, 250); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Abierta como página suelta (/fiesta) con sesión de «Mi cuenta»: vuelta a la cuenta. */
function MemberBackLink() {
  const memberSession = useMemberSession();
  if (!memberSession.data?.loggedIn) return null;
  return <Link href="/cuenta" aria-label="Volver a mi cuenta" className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-pink-300"><ChevronLeft className="h-7 w-7" /></Link>;
}

/* --- Puerta cerrada ------------------------------------------------------ */

function PausedScreen({ eventTitle, onBack }: { eventTitle?: string | null; onBack?: () => void }) {
  return (
    <div className="account-font account-tokens relative grid min-h-dvh place-items-center bg-[#0b0612] px-6 pt-[env(safe-area-inset-top)] text-white">
      <div className="account-backdrop" />
      <div className="account-glass relative z-10 w-full max-w-sm rounded-[28px] px-6 py-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-pink-500/25 to-sky-500/25"><Moon className="h-8 w-8 text-pink-300" /></span>
        <h1 className="mt-4 text-title2 font-bold tracking-tight">Playmatch está en pausa</h1>
        <p className="mt-2 text-subhead text-white/70">El equipo lo pausó un momento. Tu perfil, tus matches y tus chats siguen acá: vuelve en un rato y se activa solo.</p>
        {eventTitle && <p className="mt-4 text-footnote text-white/60">{eventTitle}</p>}
        {onBack ? (
          <button type="button" onClick={onBack} className="lg-pill mt-6 inline-flex h-12 items-center rounded-full px-8 text-subhead font-semibold">Volver</button>
        ) : (
          <Link href="/cuenta" className="lg-pill mt-6 inline-flex h-12 items-center rounded-full px-8 text-subhead font-semibold">Volver a mi cuenta</Link>
        )}
      </div>
    </div>
  );
}

function ClosedDoor({ denial, eventTitle, doorsOpen, onBack }: { denial: string; eventTitle?: string | null; doorsOpen?: string | Date | null; onBack?: () => void }) {
  const horaApertura = doorsOpen
    ? new Date(doorsOpen).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : null;

  const copy = {
    sin_ticket: {
      icon: TicketX,
      title: 'No encontramos tu entrada',
      body: 'Revisa el link de tu email. Si crees que es un error, escríbenos por Instagram.',
    },
    no_ingreso: {
      icon: DoorClosed,
      title: 'Todavía no estás adentro',
      body: 'Playmatch se abre recién cuando escaneen tu QR en la entrada principal. Muestra tu entrada al anfitrión y vuelve a entrar acá.',
    },
    fuera_de_horario: {
      icon: Moon,
      title: 'Playmatch no está abierto',
      body: horaApertura
        ? `Esto vive solo durante la fiesta. Se abre a las ${horaApertura} y se cierra cuando termina el evento.`
        : 'Esto vive solo durante el evento. Se abre cuando abren las puertas y se cierra cuando termina.',
    },
  }[denial] ?? { icon: Moon, title: 'Playmatch no está abierto', body: '' };
  const Icon = copy.icon;

  return (
    <div className="account-font account-tokens relative grid min-h-dvh place-items-center bg-[#0b0612] px-6 pt-[env(safe-area-inset-top)] text-white">
      <div className="account-backdrop" />
      <div className="account-glass relative z-10 w-full max-w-sm rounded-[28px] px-6 py-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-pink-500/25 to-sky-500/25"><Icon className="h-8 w-8 text-pink-300" /></span>
        <h1 className="mt-4 text-title2 font-bold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-subhead text-white/70">{copy.body}</p>
        {eventTitle && <p className="mt-4 text-footnote text-white/60">{eventTitle}</p>}
        {onBack ? (
          <button type="button" onClick={onBack} className="lg-pill mt-6 inline-flex h-12 items-center rounded-full px-8 text-subhead font-semibold">Volver</button>
        ) : (
          <Link href="/cuenta" className="lg-pill mt-6 inline-flex h-12 items-center rounded-full px-8 text-subhead font-semibold">Volver a mi cuenta</Link>
        )}
      </div>
    </div>
  );
}

/* --- Notificaciones -------------------------------------------------------
 * Aviso de "te escribieron" + promos relámpago del anfitrión. Mismo flujo
 * que la tarjeta de Alertas del admin (server/push.ts, VAPID) pero para el
 * invitado: sin sesión, sin interruptores, un solo botón. */

/** Convierte la clave pública VAPID (base64url) al formato que pide
 * `pushManager.subscribe` -- misma transformación que el lado admin. */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

function isIos(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

function NotificationsPanel({ ticketCode, onClose }: { ticketCode: string; onClose: () => void }) {
  const { data: vapid } = trpc.party.getVapidPublicKey.useQuery();
  const subscribe = trpc.party.pushSubscribe.useMutation();
  const unsubscribe = trpc.party.pushUnsubscribe.useMutation();

  const [thisDeviceEndpoint, setThisDeviceEndpoint] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration('/fiesta/').then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (sub) setThisDeviceEndpoint(sub.endpoint);
    }).catch(() => {});
  }, []);

  const notifSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const alreadyOn = !!thisDeviceEndpoint;
  // En iPhone/iPad, Safari solo entrega push a una app agregada a Inicio --
  // si todavía está abierta en una pestaña normal, hay que decirlo antes de
  // que toque "Activar" y no le llegue nunca nada.
  const needsInstallFirst = isIos() && !isStandalone();

  const handleActivate = async () => {
    if (!vapid?.publicKey) { toast.error('Las notificaciones todavía no están disponibles.'); return; }
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast.error('No diste permiso de notificaciones -- revísalo en Ajustes del navegador.'); return; }

      const reg = await navigator.serviceWorker.getRegistration('/fiesta/') ?? await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      await subscribe.mutateAsync({ ticketCode, endpoint: json.endpoint!, p256dh: json.keys!.p256dh, auth: json.keys!.auth });
      setThisDeviceEndpoint(json.endpoint!);
      toast.success('Avisos activados');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo activar.');
    } finally {
      setSubscribing(false);
    }
  };

  const handleDeactivate = async () => {
    if (!thisDeviceEndpoint) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/fiesta/');
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await unsubscribe.mutateAsync({ endpoint: thisDeviceEndpoint });
      setThisDeviceEndpoint(null);
      toast.success('Avisos desactivados');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desactivar.');
    }
  };

  return (
    <PmSheet title="Avisos" onClose={onClose}>
      <p className="mb-4 text-subhead text-white/70">
        Te avisamos cuando alguien te escribe o te manda un Super Like, y si el anfitrión larga una promo relámpago durante la fiesta.
      </p>

      {needsInstallFirst && (
        <div className="mb-4 space-y-1.5 rounded-[20px] border border-pink-400/30 bg-pink-500/10 p-4 text-subhead">
          <p className="font-bold">Primero agrega Playmatch a Inicio</p>
          <p className="text-white/70">
            En iPhone/iPad los avisos solo funcionan si esta página está en tu pantalla de inicio.
            Toca <span className="font-semibold">Compartir</span> (la cajita con la flecha) y después{' '}
            <span className="font-semibold">«Agregar a Inicio»</span>. Abre Playmatch desde ese ícono y activa los avisos acá.
          </p>
        </div>
      )}

      {!notifSupported && !needsInstallFirst && (
        <p className="mb-4 text-footnote text-white/60">Este navegador no permite recibir avisos.</p>
      )}

      {notifSupported && (
        <button
          type="button"
          onClick={alreadyOn ? handleDeactivate : handleActivate}
          disabled={subscribing || needsInstallFirst || !vapid?.publicKey}
          className={`h-14 w-full rounded-full text-headline disabled:opacity-40 ${alreadyOn ? 'lg-pill font-semibold' : PM_CTA}`}
        >
          {subscribing ? 'Activando…' : alreadyOn ? 'Desactivar avisos' : 'Activar avisos'}
        </button>
      )}
    </PmSheet>
  );
}
