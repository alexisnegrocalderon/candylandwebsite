import { lazy, Suspense } from 'react';
import { trpc } from '@/lib/trpc';

// Ticket girable, story y link de grupo: solo se descarga si el evento es una colab.
const ColabPostPurchase = lazy(() => import('@/components/playmore/PostPurchase').then((m) => ({ default: m.ColabPostPurchase })));

/* Cabecera de marca compartida del checkout cuando el evento es una
 * co-producción activa (ej. PLAYMORE · Playroom × Dalmore). Para cualquier
 * otro evento no renderiza nada. La marca sale de la co-producción
 * (server/coproduction.ts getEventColabBrand), así que una colab nueva solo
 * necesita sus datos cargados en el panel. */
const DALMORE_MARK = '/playmore/dalmore-mark.png';

export function ColabBanner({ eventSlug, preview }: { eventSlug: string; preview?: string }) {
  const { data: brand } = trpc.coproduction.brandForEvent.useQuery({ eventSlug, preview }, { enabled: !!eventSlug, retry: false, staleTime: 5 * 60_000 });
  if (!brand) return null;
  const logo = brand.partnerLogoUrl || (brand.slug === 'dalmore' ? DALMORE_MARK : '');
  return (
    <div className="mb-5 flex items-center justify-center gap-4 rounded-2xl border border-[#d6b25e]/40 bg-[#0c0908] px-4 py-3 text-[#e9d9b0]">
      <img src="/playmore/playroom-logo.png" alt="Mansion Playroom" className="h-9 w-auto" />
      <span className="text-[#E477EA]" aria-hidden="true">×</span>
      {logo
        ? <img src={logo} alt={brand.partnerName} className="h-8 w-auto max-w-[120px] object-contain" />
        : <span className="text-[11px] font-extrabold tracking-[0.3em]">{brand.partnerName.toUpperCase()}</span>}
      <span className="hidden border-l border-[#d6b25e]/30 pl-4 text-[11px] font-semibold tracking-[0.3em] text-[#d6b25e] sm:inline">{brand.eventName}</span>
    </div>
  );
}

/** Después de pagar un evento colab: ticket con su nombre, story y link para el grupo. */
export function ColabAfterPurchase(props: { eventSlug: string; holderName: string; accesoSlug?: string | null; accessLabel?: string }) {
  const { data: brand } = trpc.coproduction.brandForEvent.useQuery({ eventSlug: props.eventSlug }, { enabled: !!props.eventSlug, retry: false, staleTime: 5 * 60_000 });
  if (!brand) return null;
  return <Suspense fallback={null}><ColabPostPurchase {...props} /></Suspense>;
}
