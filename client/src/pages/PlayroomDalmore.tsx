import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { colabSlugForHost } from '@shared/colabHosts';
import { ACCESO_GROUPS, deriveTanda } from '@shared/playmoreTanda';
import '@/components/playmore/playmore.css';
import {
  CodeAndFaq, DALMORE_MARK, Gallery, PlaymoreFooter, PlaymoreHero, QuickFacts,
} from '@/components/playmore/sections';
import { Accesos, FloatingBuy } from '@/components/playmore/accesos';
import { TicketPicker } from '@/components/playmore/TicketPicker';
import { LivePurchases } from '@/components/playmore/LivePurchases';
import { NightTimeline } from '@/components/playmore/NightTimeline';
import { TwoWorlds } from '@/components/playmore/WorldsFusion';

/* Landing PLAYMORE: la co-producción Playroom × Dalmore (/playroomdalmore).
 *
 * Abre directo en la portada (sin intro): hero → la fusión de los dos mundos →
 * la noche minuto a minuto → accesos → código y preguntas. Mientras el dueño no la
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
  // Selector de tickets: se abre al instante desde cualquier botón de compra.
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data, isLoading } = trpc.coproduction.publicGet.useQuery({ slug: SLUG, preview }, { retry: false });
  // Sin logo subido en Configuración se usa el de Dalmore que viene con la página.
  const landing = data?.landing && { ...data.landing, partnerLogoUrl: data.landing.partnerLogoUrl || DALMORE_MARK };
  // Contenido completo: evento activo, vista previa del dueño, o "mostrar tickets antes de lanzar".
  const full = !!data && (data.isLive || data.preview || data.early);
  const checkoutHref = data?.event ? `/checkout/${data.event.slug}` : null;
  // En la vista previa se ve todo, pero la compra recién se abre al activar
  // (el servidor igual rechaza órdenes de un evento sin activar).
  const buyHref = data?.isLive && checkoutHref ? checkoutHref : null;

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

  const active = data.ticketTypes.filter((t) => t.status === 'active' && t.price > 0);
  const minPrice = active.length ? Math.min(...active.map((t) => t.price)) : null;
  const tanda = deriveTanda(data.ticketTypes, Date.now());
  // Con accesos a la vista abre el selector; si no hay ninguno, lleva a la sección (que explica por qué).
  const hasAccesos = data.ticketTypes.some((t) => t.category === 'acceso');
  const openBuy = () => {
    if (hasAccesos) setPickerOpen(true);
    else document.getElementById('accesos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="playmore relative min-h-dvh overflow-x-clip">
      {(
        <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          {data.preview && (
            <div className="sticky top-0 z-50 bg-amber-400 px-4 py-2 text-center text-xs font-bold tracking-[0.15em] text-black">
              VISTA PREVIA PRIVADA · EL PÚBLICO TODAVÍA VE "PRÓXIMAMENTE"
            </div>
          )}

          {invite?.name && (
            <motion.a href="#accesos" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="relative z-30 mx-auto mt-4 flex w-fit max-w-[92vw] items-center gap-2 rounded-full border border-[#d6b25e]/50 bg-black/60 px-4 py-2 text-xs text-[var(--pm-sand)] backdrop-blur-md">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--pm-fuchsia)]" aria-hidden="true" />
              <span><span className="playmore-gold font-bold">{invite.name}</span> ya tiene su entrada{invite.label ? <> · viene en <span className="font-bold">{invite.label}</span></> : ''}. Súmate →</span>
            </motion.a>
          )}
          <PlaymoreHero landing={landing} partnerName={data.partnerName} buyHref={buyHref} preview={data.preview} early={data.early} minPrice={minPrice} onBuy={openBuy} />
          <QuickFacts landing={landing} />
          <TwoWorlds landing={landing} partnerName={data.partnerName} />
          {full && (
            <>
              <NightTimeline moments={landing.timeline} />
              <Gallery urls={landing.galleryUrls} />
              <Accesos types={data.ticketTypes} buyHref={buyHref} eventName={landing.eventName} tanda={tanda} initialGroup={invite?.group ?? null} preview={data.preview} early={data.early} diag={data.diag} />
            </>
          )}
          <CodeAndFaq landing={landing} eventName={landing.eventName} />
          <PlaymoreFooter landing={landing} partnerName={data.partnerName} />

          {/* Compras reales recientes (sin nombres ni cantidades) */}
          {full && <LivePurchases slug={SLUG} preview={preview} />}
          {/* Botón flotante de compra: ticket dorado que acompaña toda la página */}
          <FloatingBuy href={buyHref} tanda={tanda} preview={data.preview || data.early} onOpen={openBuy} />
          <TicketPicker open={pickerOpen} onClose={() => setPickerOpen(false)} types={data.ticketTypes} buyHref={buyHref} eventName={landing.eventName} tanda={tanda}
            demo={!buyHref} early={data.early} />
        </motion.main>
      )}
    </div>
  );
}
