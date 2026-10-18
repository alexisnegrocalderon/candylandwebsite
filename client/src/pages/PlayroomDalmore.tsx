import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { CHILE_TZ } from '@shared/chileDate';
import '@/components/playmore/playmore.css';
import {
  Accesos, BuyButton, CodeAndFaq, DALMORE_MARK, Experience, Gallery, PlaymoreFooter, PlaymoreHero, PlaymoreMarquee, TwoWorlds, clp,
} from '@/components/playmore/sections';
import { startMusic, stopMusic } from '@/components/playmore/playmoreAudio';

// El 3D (three.js) se descarga aparte y solo si se ve el intro.
const TicketIntro = lazy(() => import('@/components/playmore/TicketIntro').then((m) => ({ default: m.TicketIntro })));

/* Landing PLAYMORE: la co-producción Playroom × Dalmore (/playroomdalmore).
 *
 * Empieza con el intro cinematográfico del ticket (se arranca el talón para
 * entrar) y sigue con la portada y las secciones. Mientras el dueño no la
 * active, el servidor (coproduction.publicGet) solo entrega el teaser: sin
 * precios ni compra, y el checkout del evento rechaza ventas. Con
 * `?preview=<token>` (Configuración → Vista previa) se ve completa. */

const SLUG = 'dalmore';

/** "04 DIC 2026" en hora de Chile, para el ticket. */
function ticketDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('es-CL', { timeZone: CHILE_TZ, day: '2-digit', month: 'short', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month').replace('.', '').toUpperCase()} ${get('year')}`;
}

export default function PlayroomDalmore() {
  const preview = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('preview') ?? undefined; } catch { return undefined; }
  }, []);
  const { data, isLoading } = trpc.coproduction.publicGet.useQuery({ slug: SLUG, preview }, { retry: false });
  // Sin logo subido en Configuración se usa el de Dalmore que viene con la página.
  const landing = data?.landing && { ...data.landing, partnerLogoUrl: data.landing.partnerLogoUrl || DALMORE_MARK };
  const full = !!data && (data.isLive || data.preview);
  const checkoutHref = data?.event ? `/checkout/${data.event.slug}` : null;
  // En la vista previa se ve todo, pero la compra recién se abre al activar
  // (el servidor igual rechaza órdenes de un evento sin activar).
  const buyHref = data?.isLive && checkoutHref ? checkoutHref : null;

  const [entered, setEntered] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
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
    const prev = [html.style.background, document.body.style.background];
    html.style.background = '#0c0908';
    document.body.style.background = '#0c0908';
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevColor = meta?.content;
    if (meta) meta.content = '#0c0908';
    return () => {
      html.style.background = prev[0];
      document.body.style.background = prev[1];
      if (meta && prevColor !== undefined) meta.content = prevColor;
    };
  }, []);
  const enter = useCallback(() => {
    setEntered(true);
    window.scrollTo(0, 0);
  }, []);

  useSeo({
    title: landing ? `${landing.eventName} · Playroom × Dalmore · ${full ? landing.dateText : 'Próximamente'}` : 'Playroom × Dalmore',
    description: landing?.headline ?? 'Playroom × Dalmore',
    path: '/playroomdalmore',
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

  return (
    <div className="playmore relative min-h-dvh overflow-x-hidden">
      <AnimatePresence>
        {!entered && (
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
                onEnter={enter}
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

          <PlaymoreHero landing={landing} partnerName={data.partnerName} buyHref={buyHref} preview={data.preview} minPrice={minPrice} />
          <PlaymoreMarquee partnerName={data.partnerName} />
          <TwoWorlds landing={landing} partnerName={data.partnerName} />
          {full && (
            <>
              <Experience landing={landing} />
              <Gallery urls={landing.galleryUrls} />
              <Accesos types={data.ticketTypes} buyHref={buyHref} eventName={landing.eventName} />
            </>
          )}
          <CodeAndFaq landing={landing} eventName={landing.eventName} />
          <PlaymoreFooter landing={landing} partnerName={data.partnerName} />

          {/* Botón de compra fijo en celular */}
          {buyHref && (
            <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-black/80 to-transparent p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:hidden">
              <BuyButton href={buyHref} className="w-full justify-center">COMPRAR{minPrice != null ? ` · DESDE ${clp(minPrice)}` : ''}</BuyButton>
            </div>
          )}
        </motion.main>
      )}
    </div>
  );
}
