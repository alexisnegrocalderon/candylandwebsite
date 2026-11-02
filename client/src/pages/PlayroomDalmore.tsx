import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { colabSlugForHost } from '@shared/colabHosts';
import { ACCESO_GROUPS, deriveTanda } from '@shared/playmoreTanda';
import '@/components/playmore/playmore.css';
import {
  CodeAndFaq, DALMORE_MARK, Experience, Gallery, PlaymoreFooter, PlaymoreHero, PlaymoreMarquee,
} from '@/components/playmore/sections';
import { startMusic, stopMusic } from '@/components/playmore/playmoreAudio';
import { ticketDate } from '@/components/playmore/ticketArt';
import { Accesos, StickyBuyBar } from '@/components/playmore/accesos';
import { LivePurchases } from '@/components/playmore/LivePurchases';
import { NightTimeline } from '@/components/playmore/NightTimeline';
import { TwoWorlds } from '@/components/playmore/WorldsFusion';

// El 3D (three.js) se descarga aparte y solo si se ve el intro.
const TicketIntro = lazy(() => import('@/components/playmore/TicketIntro').then((m) => ({ default: m.TicketIntro })));

/* Landing PLAYMORE: la co-producción Playroom × Dalmore (/playroomdalmore).
 *
 * Empieza con el intro cinematográfico del ticket (se arranca el talón para
 * entrar, sin video de por medio) y sigue con la portada y las secciones. Mientras el dueño no la
 * active, el servidor (coproduction.publicGet) solo entrega el teaser: sin
 * precios ni compra, y el checkout del evento rechaza ventas. Con
 * `?preview=<token>` (Configuración → Vista previa) se ve completa. */

/** Co-producción de esta página: la del subdominio, o la de Dalmore. */
const SLUG = colabSlugForHost(typeof window !== 'undefined' ? window.location.hostname : null) ?? 'dalmore';

export default function PlayroomDalmore() {
  const preview = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('preview') ?? undefined; } catch { return undefined; }
  }, []);
  // Link de grupo de alguien que ya compró (?invita=Camila&acceso=duo): se muestra
  // quién invitó y los accesos abren con ese grupo elegido.
  const invite = useMemo(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const name = (q.get('invita') ?? '').replace(/[^A-Za-zÀ-ÿ '-]/g, '').trim().slice(0, 24);
      const g = q.get('acceso');
      const group = ACCESO_GROUPS.find((x) => x.key === g)?.key ?? null;
      return name || group ? { name, group, label: ACCESO_GROUPS.find((x) => x.key === g)?.label } : null;
    } catch { return null; }
  }, []);
  const { data, isLoading } = trpc.coproduction.publicGet.useQuery({ slug: SLUG, preview }, { retry: false });
  // Sin logo subido en Configuración se usa el de Dalmore que viene con la página.
  const landing = data?.landing && { ...data.landing, partnerLogoUrl: data.landing.partnerLogoUrl || DALMORE_MARK };
  const full = !!data && (data.isLive || data.preview);
  const checkoutHref = data?.event ? `/checkout/${data.event.slug}` : null;
  // En la vista previa se ve todo, pero la compra recién se abre al activar
  // (el servidor igual rechaza órdenes de un evento sin activar).
  const buyHref = data?.isLive && checkoutHref ? checkoutHref : null;

  // intro (ticket) → site (portada y secciones).
  const [stage, setStage] = useState<'intro' | 'site'>('intro');
  const entered = stage === 'site';
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      if (on) stopMusic(); else startMusic();
      return !on;
    });
  }, []);
  useEffect(() => () => stopMusic(), []);
  // El fondo del sitio es claro: sin esto se asoma al hacer scroll rápido o
  // al estirar la página en el celular.
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.background, document.body.style.background, html.style.overflowX, document.body.style.overflowX];
    html.style.background = '#0c0908';
    document.body.style.background = '#0c0908';
    // theme.css pone overflow-x: hidden en html y body, y eso convierte al body
    // en contenedor de scroll: rompe el scroll fijo de "La noche minuto a
    // minuto". "clip" recorta igual sin ese efecto.
    if (CSS.supports?.('overflow-x', 'clip')) {
      html.style.overflowX = 'clip';
      document.body.style.overflowX = 'clip';
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevColor = meta?.content;
    if (meta) meta.content = '#0c0908';
    return () => {
      html.style.background = prev[0];
      document.body.style.background = prev[1];
      html.style.overflowX = prev[2];
      document.body.style.overflowX = prev[3];
      if (meta && prevColor !== undefined) meta.content = prevColor;
    };
  }, []);
  const toSite = useCallback(() => {
    setStage('site');
    if (soundRef.current) startMusic();
    window.scrollTo(0, 0);
  }, []);
  useSeo({
    title: landing ? `${landing.eventName} · Playroom × Dalmore · ${full ? landing.dateText : 'Próximamente'}` : 'Playroom × Dalmore',
    description: landing?.headline ?? 'Playroom × Dalmore',
    path: colabSlugForHost(window.location.hostname) ? '/' : '/playroomdalmore',
    image: landing?.heroImageUrl || undefined,
    noindex: !data?.isLive,
  });

  if (isLoading) {
    return <div className="playmore flex min-h-dvh items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d6b25e] border-t-transparent" /></div>;
  }
  if (!data || !landing) {
    return (
      <div className="playmore flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="playmore-sans playmore-gold text-5xl font-extrabold">PLAYMORE</p>
        <p className="text-[var(--pm-sand)]/70">Muy pronto.</p>
        <Link href="/" className="text-sm underline">Ir a Mansion Playroom</Link>
      </div>
    );
  }

  const target = Date.parse(landing.countdownIso);
  const daysLeft = Number.isFinite(target) ? Math.max(0, Math.floor((target - Date.now()) / 86_400_000)) : null;
  const active = data.ticketTypes.filter((t) => t.status === 'active' && t.price > 0);
  const minPrice = active.length ? Math.min(...active.map((t) => t.price)) : null;
  const tanda = deriveTanda(data.ticketTypes, Date.now());

  return (
    <div className="playmore relative min-h-dvh overflow-x-clip">
      <AnimatePresence>
        {stage === 'intro' && (
          <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <Suspense fallback={<div className="fixed inset-0 z-[60] bg-[#0c0908]" />}>
              <TicketIntro
                data={{
                  eventName: landing.eventName,
                  partnerName: data.partnerName,
                  dateText: ticketDate(landing.countdownIso),
                  timeText: landing.timeText,
                  venueText: landing.venueText,
                  daysLeft,
                }}
                countdownIso={landing.countdownIso}
                partnerLogoUrl={landing.partnerLogoUrl}
                soundOn={soundOn}
                onToggleSound={toggleSound}
                onEnter={toSite}
                onSkip={toSite}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {entered && (
        <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9 }}>
          {data.preview && (
            <div className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-xs font-bold tracking-[0.15em] text-black">
              VISTA PREVIA PRIVADA · EL PÚBLICO TODAVÍA VE "PRÓXIMAMENTE"
            </div>
          )}

          <button type="button" onClick={toggleSound} aria-label={soundOn ? 'Silenciar' : 'Activar sonido'} aria-pressed={soundOn}
            className={`fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#d6b25e]/40 bg-black/50 text-[var(--pm-sand)] backdrop-blur-md transition hover:bg-black/70 ${data.preview ? 'top-12' : 'top-4'}`}>
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {invite?.name && (
            <motion.a href="#accesos" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="relative z-30 mx-auto mt-4 flex w-fit max-w-[92vw] items-center gap-2 rounded-full border border-[#d6b25e]/50 bg-black/60 px-4 py-2 text-xs text-[var(--pm-sand)] backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--pm-fuchsia)]" aria-hidden="true" />
              <span><span className="playmore-gold font-bold">{invite.name}</span> ya tiene su entrada{invite.label ? <> · viene en <span className="font-bold">{invite.label}</span></> : ''}. Súmate →</span>
            </motion.a>
          )}
          <PlaymoreHero landing={landing} partnerName={data.partnerName} buyHref={buyHref} preview={data.preview} minPrice={minPrice} />
          <PlaymoreMarquee partnerName={data.partnerName} />
          <TwoWorlds landing={landing} partnerName={data.partnerName} />
          {full && (
            <>
              <Experience landing={landing} />
              <NightTimeline moments={landing.timeline} />
              <Gallery urls={landing.galleryUrls} />
              <Accesos types={data.ticketTypes} buyHref={buyHref} eventName={landing.eventName} tanda={tanda} soundOn={soundOn} initialGroup={invite?.group ?? null} />
            </>
          )}
          <CodeAndFaq landing={landing} eventName={landing.eventName} />
          <PlaymoreFooter landing={landing} partnerName={data.partnerName} />

          {/* Compras reales recientes (sin nombres ni cantidades) */}
          {full && <LivePurchases slug={SLUG} preview={preview} />}
          {/* Barra fija: cuenta regresiva a que suba el precio + comprar */}
          {buyHref && <StickyBuyBar href={buyHref} minPrice={minPrice} tanda={tanda} />}
        </motion.main>
      )}
    </div>
  );
}
