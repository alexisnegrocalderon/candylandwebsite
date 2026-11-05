import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { COLAB_HOME_REDIRECT } from '@shared/colabHosts';
import { readPlaymorePreviewToken } from '@/lib/playmorePreview';

/* PLAYMORE dentro de la app de Playroom. Con la venta abierta, la portada y «Mi cuenta» muestran una tarjeta negra y
 * dorada que compra ahí mismo (el checkout ya toma la cara de PLAYMORE), sin salir de la app. Mientras el evento no
 * esté activado no aparece nada. */

const FUSE = 'linear-gradient(90deg,#ffb3e2 0%,#e477ea 22%,#d98fc6 40%,#ecc3a0 54%,#f7e7a8 66%,#d6b25e 82%,#9c7630 100%)';
const GOLD = 'linear-gradient(100deg,#9c7630 0%,#c9a24c 15%,#f7e7a8 35%,#d6b25e 55%,#9c7630 100%)';

/** Consulta de PLAYMORE: pública con la venta abierta; con la clave de vista previa (`?playmore=`) el dueño la ve antes. */
export function usePlaymore() {
  const preview = readPlaymorePreviewToken();
  const { data } = trpc.coproduction.publicGet.useQuery({ slug: COLAB_HOME_REDIRECT.slug, preview }, { staleTime: 60_000, retry: false });
  const visible = !!data?.event && (data.isLive || (!!preview && data.preview));
  return { data: visible ? data : null, preview, isPreview: !!data && !data.isLive };
}

/** Slug del evento PLAYMORE si hay que mostrarlo (venta abierta, o vista previa del dueño). */
export function useLivePlaymoreSlug(): string | null {
  const { data } = usePlaymore();
  return data?.event ? data.event.slug : null;
}

export function PlaymoreAppBanner({ ownedSlugs = [], className = '' }: { ownedSlugs?: string[]; className?: string }) {
  const { data, preview, isPreview } = usePlaymore();
  if (!data?.event) return null;
  const slug = data.event.slug;
  const owned = ownedSlugs.includes(slug);
  const l = data.landing;
  return (
    <Link href={owned ? '/cuenta' : `/checkout/${slug}${isPreview && preview ? `?preview=${preview}` : ''}`} aria-label={owned ? `Tu entrada de ${l.eventName}` : `Comprar entrada para ${l.eventName}`}
      className={`relative block overflow-hidden rounded-[28px] border border-[#d6b25e]/40 p-5 text-left uppercase interactive ${className}`}
      style={{ background: 'radial-gradient(120% 80% at 0% 0%, rgba(150,21,157,0.45), transparent 60%), radial-gradient(120% 80% at 100% 100%, rgba(214,178,94,0.22), transparent 60%), #0c0908' }}>
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <img src="/playmore/playroom-logo.png" alt="Mansion Playroom" className="h-6 w-auto" />
          <span className="text-xs text-[#f3e9d2]/70" aria-hidden="true">×</span>
          <img src="/playmore/dalmore-logo.png" alt="Dalmore" className="h-[14px] w-auto" />
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e477ea]/50 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] text-[#ffb3e2]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e477ea]" aria-hidden="true" />{isPreview ? 'Vista previa' : owned ? 'Tu entrada' : 'Venta abierta'}
        </span>
      </span>
      <span className="mt-3 block text-[38px] font-extrabold leading-none tracking-[-0.01em]" style={{ background: FUSE, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{l.eventName}</span>
      <span className="mt-2 block text-[11px] font-semibold tracking-[0.2em] text-[#e9d9b0]/85">{l.dateText} · {l.timeText} · {l.venueText}</span>
      <span className="mt-4 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[12px] font-bold tracking-[0.16em] text-[#141210] shadow-[0_14px_40px_-12px_rgba(247,231,168,0.55)]" style={{ background: GOLD }}>
        {owned ? 'Ver mi entrada' : 'Comprar entrada'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
