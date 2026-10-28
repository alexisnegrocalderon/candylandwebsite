import { useEffect, useRef } from 'react';
import { useEntryState } from '@/lib/appNav';
import { useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { useHalloweenMode } from '@/lib/halloween';
import { AppEventCard, eventWhen, splitEvents, type AppEvent } from '@/components/app/AppEventCard';
import { BottomSheet } from '@/components/site/AccountPayments';
import { eventImage } from '@shared/eventImage';

/* «Eventos» dentro de la app (reemplaza /eventos y /eventos/:slug del sitio en
 * modo app): los próximos con su botón de compra y los pasados como recuerdo.
 * El detalle de un evento sube en una hoja, sin salir de la app. */

export default function AppEvents() {
  useSeo({ title: 'Eventos — Mansion Playroom', description: 'Próximos eventos de Mansion Playroom.', path: '/eventos' });
  const { data: events, isLoading } = trpc.events.listPublished.useQuery();
  const { upcoming, past } = splitEvents((events ?? []) as AppEvent[]);
  // El evento abierto queda en la entrada del historial (por slug): al volver de la compra sigue abierto.
  const [detailSlug, setDetailSlug] = useEntryState<string | null>('eventos.detalle', null);
  const detail = detailSlug ? ((events ?? []) as AppEvent[]).find((e) => e.slug === detailSlug) ?? null : null;
  const setDetail = (e: AppEvent | null) => setDetailSlug(e?.slug ?? null);
  const halloween = useHalloweenMode();
  // /eventos/<slug> (un link compartido) abre la app con ese evento ya en su hoja.
  const [, params] = useRoute('/eventos/:slug');
  // Una sola vez por link: si después la persona la cierra, no se vuelve a abrir al refrescarse la lista.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const found = params?.slug && opened.current !== params.slug ? (events as AppEvent[] | undefined)?.find((e) => e.slug === params.slug) : undefined;
    if (found) { opened.current = found.slug; setDetail(found); }
  }, [params?.slug, events]);

  return (
    <div className={`account-font account-tokens relative min-h-dvh bg-[#0b0612] text-white ${halloween ? 'pm-halloween' : ''}`}>
      <div className="account-backdrop" />
      <div className="relative z-10 mx-auto max-w-lg px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+72px)]">
        <h1 className="text-large-title font-bold tracking-tight">Eventos</h1>
        <div className="mt-4 space-y-4">
          {isLoading && <div className="account-glass aspect-[16/10] rounded-[28px] lg-skeleton" />}
          {!isLoading && upcoming.length === 0 && (
            <div className="account-glass rounded-[28px] p-6 text-center">
              <p className="text-title3 font-bold">Pronto anunciamos la próxima</p>
              <p className="mt-1 text-subhead text-white/60">Activa los avisos en tu cuenta y te contamos primero.</p>
            </div>
          )}
          {upcoming.map((e, i) => <AppEventCard key={e.id} event={e} big={i === 0} onInfo={() => setDetail(e)} />)}
        </div>

        {past.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-white/55">Fiestas pasadas</h2>
            <div className="account-glass divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">
              {past.slice(0, 12).map((e) => {
                const img = eventImage(e.slug, e.imageUrl);
                return (
                  <button key={e.id} type="button" onClick={() => setDetail(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[12px] bg-white/10">{img && <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold">{e.title}</span>
                      <span className="block text-footnote text-white/55 first-letter:uppercase">{new Date(e.eventDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' })}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <BottomSheet open={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? ''}>
        {detail && (
          <div className="space-y-3 pb-2">
            <p className="text-subhead text-white/70 first-letter:uppercase">{eventWhen(detail.eventDate)}{detail.venue ? ` · ${detail.venue}` : ''}</p>
            {detail.shortDescription && <p className="text-body leading-relaxed text-white/85">{detail.shortDescription}</p>}
            {upcoming.includes(detail) && <AppEventCard event={detail} />}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
