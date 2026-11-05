import { useEffect } from 'react';
import { Link } from 'wouter';
import { CalendarDays, CircleUser } from 'lucide-react';
import type { CoproductionLanding } from '@shared/coproduction';
import '@/components/playmore/playmore.css';
import { BuyButton, CodeAndFaq, DALMORE_MARK, PlaymoreFooter, PlaymoreHero, QuickFacts } from '@/components/playmore/sections';
import { NightTimeline } from '@/components/playmore/NightTimeline';
import { TwoWorlds } from '@/components/playmore/WorldsFusion';

/* La portada de la app mientras dura PLAYMORE: es la MISMA landing (hero con el nombre de partículas, datos, fusión de
 * las dos marcas, la noche minuto a minuto, el código y las preguntas) con lo propio de la app arriba: entrar a «Mi
 * cuenta» y ver los otros eventos. Así quien abre la app y quien abre la landing ven exactamente lo mismo. */

export default function PlaymoreAppHome({ landing: raw, partnerName, eventSlug, previewToken, isPreview }: {
  landing: CoproductionLanding; partnerName: string; eventSlug: string; previewToken?: string; isPreview: boolean;
}) {
  // Sin logo propio cargado en el panel se usa el de Dalmore que ya trae la página (igual que la landing).
  const landing = { ...raw, partnerLogoUrl: raw.partnerLogoUrl || DALMORE_MARK };
  // Fondo y barra de estado negros, como la landing (nunca el violeta de la app detrás).
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.background, document.body.style.background];
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevColor = meta?.content;
    html.style.background = '#0c0908'; document.body.style.background = '#0c0908';
    if (meta) meta.content = '#0c0908';
    return () => {
      html.style.background = prev[0]; document.body.style.background = prev[1];
      if (meta && prevColor !== undefined) meta.content = prevColor;
    };
  }, []);

  const buyHref = `/checkout/${eventSlug}${isPreview && previewToken ? `?preview=${previewToken}` : ''}`;

  return (
    <div className="playmore relative min-h-dvh overflow-x-clip">
      {/* Barra de la app: «Mi cuenta» siempre a mano. */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 pt-[max(14px,env(safe-area-inset-top))]">
        <img src="/candyland/logo-isotipo-transparent.png" alt="Mansion Playroom" className="h-9 w-9" />
        <span className="flex items-center gap-2">
          <Link href="/eventos" aria-label="Eventos" className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b25e]/45 bg-black/45 text-[var(--pm-sand)] backdrop-blur"><CalendarDays className="h-[18px] w-[18px]" /></Link>
          <Link href="/cuenta" aria-label="Mi cuenta" className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b25e]/45 bg-black/45 text-[var(--pm-sand)] backdrop-blur"><CircleUser className="h-5 w-5" /></Link>
        </span>
      </header>

      <PlaymoreHero landing={landing} partnerName={partnerName} buyHref={buyHref} preview={isPreview} minPrice={null} />
      <QuickFacts landing={landing} />
      <TwoWorlds landing={landing} partnerName={partnerName} />
      <NightTimeline moments={landing.timeline} />
      <CodeAndFaq landing={landing} eventName={landing.eventName} />

      <section className="px-5 pb-10 text-center">
        <BuyButton href={buyHref}>COMPRAR ENTRADAS</BuyButton>
        <div className="mx-auto mt-6 flex max-w-xs flex-col gap-3">
          <Link href="/cuenta" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#d6b25e]/45 text-xs font-semibold tracking-[0.2em] text-[var(--pm-sand)] hover:bg-white/5"><CircleUser className="h-4 w-4" /> MI CUENTA Y MIS ENTRADAS</Link>
          <Link href="/eventos" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#d6b25e]/25 text-xs font-semibold tracking-[0.2em] text-[var(--pm-sand)]/80 hover:bg-white/5"><CalendarDays className="h-4 w-4" /> OTROS EVENTOS</Link>
        </div>
      </section>
      <PlaymoreFooter landing={landing} partnerName={partnerName} />
    </div>
  );
}
