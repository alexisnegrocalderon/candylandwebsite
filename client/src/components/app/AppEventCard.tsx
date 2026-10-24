import { Link } from 'wouter';
import { ArrowRight, CalendarDays, CalendarPlus, MapPin, Share } from 'lucide-react';
import { buildIcs, downloadIcs } from '@/lib/calendar';
import { eventImage } from '@shared/eventImage';

/* Tarjeta de un evento dentro de la app (inicio y «Eventos»): el flyer a sangre,
 * la fecha y un botón para comprar. Reemplaza las páginas de eventos del sitio. */

export type AppEvent = {
  id: number;
  slug: string;
  title: string;
  eventDate: string | Date;
  venue?: string | null;
  imageUrl?: string | null;
  shortDescription?: string | null;
  status?: string | null;
  eventEnd?: string | Date | null;
};

export function eventWhen(date: string | Date): string {
  const d = new Date(date);
  const day = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
  const hour = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${hour} hrs`;
}

/** Los próximos primero (el más cercano arriba) y después los pasados, del más reciente. */
export function splitEvents<T extends { eventDate: string | Date }>(events: T[], now = Date.now()): { upcoming: T[]; past: T[] } {
  const t = (e: T) => new Date(e.eventDate).getTime();
  // Hasta 12 horas después de empezar sigue siendo «esta noche».
  const upcoming = events.filter((e) => t(e) >= now - 12 * 3_600_000).sort((a, b) => t(a) - t(b));
  const past = events.filter((e) => !upcoming.includes(e)).sort((a, b) => t(b) - t(a));
  return { upcoming, past };
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Compartir el evento con la hoja del teléfono (WhatsApp, Instagram…); sin ella, copia el link. */
async function shareEvent(event: AppEvent) {
  const url = `${window.location.origin}/eventos/${event.slug}`;
  const text = `${event.title} · ${eventWhen(event.eventDate)}`;
  try {
    if (navigator.share) { await navigator.share({ title: event.title, text, url }); return; }
    await navigator.clipboard?.writeText(`${text} ${url}`);
  } catch { /* la persona cerró la hoja */ }
}

function addToCalendar(event: AppEvent) {
  downloadIcs(`${event.slug}.ics`, buildIcs({
    uid: `evento-${event.id}`,
    title: event.title,
    start: new Date(event.eventDate),
    end: event.eventEnd ? new Date(event.eventEnd) : null,
    location: event.venue ?? null,
    url: `${window.location.origin}/eventos/${event.slug}`,
  }));
}

export function AppEventCard({ event, big = false, onInfo, from = null }: { event: AppEvent; big?: boolean; onInfo?: () => void; from?: number | null }) {
  const img = eventImage(event.slug, event.imageUrl);
  const soldOut = event.status === 'soldout';
  return (
    <article className="account-glass overflow-hidden rounded-[28px]">
      <button type="button" onClick={onInfo} disabled={!onInfo} className={`relative block w-full overflow-hidden ${img ? (big ? 'aspect-[3/4]' : 'aspect-[16/10]') : 'aspect-[16/10]'} bg-gradient-to-br from-pink-500/30 via-fuchsia-500/20 to-sky-500/30`}>
        {img ? (
          <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" loading={big ? 'eager' : 'lazy'} />
        ) : (
          <span className="absolute inset-0 grid place-items-center"><img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-20 w-20 opacity-80" /></span>
        )}
      </button>
      {/* El flyer ya trae su arte y sus letras: los datos van debajo, no encima. */}
      <div className="px-4 pt-3.5">
        <h3 className="text-title2 font-bold leading-tight">{event.title}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-subhead text-white/75"><CalendarDays className="h-4 w-4 shrink-0" />{eventWhen(event.eventDate)}</p>
        {event.venue && <p className="mt-0.5 flex items-center gap-1.5 text-subhead text-white/65"><MapPin className="h-4 w-4 shrink-0" />{event.venue}</p>}
        <div className="mt-3 flex items-center gap-2">
          {from != null && !soldOut && <span className="mr-auto rounded-full bg-white/10 px-3 py-1.5 text-footnote font-semibold tabular-nums">Desde {clp(from)}</span>}
          <button type="button" onClick={() => addToCalendar(event)} aria-label="Agregar al calendario" className={`lg-pill grid h-9 w-9 place-items-center rounded-full interactive ${from == null || soldOut ? 'ml-auto' : ''}`}><CalendarPlus className="h-[18px] w-[18px]" /></button>
          <button type="button" onClick={() => { void shareEvent(event); }} aria-label="Compartir" className="lg-pill grid h-9 w-9 place-items-center rounded-full interactive"><Share className="h-[18px] w-[18px]" /></button>
        </div>
      </div>
      <div className="p-3">
        {soldOut ? (
          <p className="flex h-12 items-center justify-center rounded-full bg-white/10 text-subhead font-semibold text-white/70">Entradas agotadas</p>
        ) : (
          <Link href={`/checkout/${event.slug}`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] interactive">
            Comprar entrada <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </article>
  );
}
