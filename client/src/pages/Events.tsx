import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Calendar, Clock, MapPin, Ticket, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { breadcrumbSchema } from '@shared/structuredData';

// Mismo objeto `reveal` que usa Home.tsx -- duplicado acá (no exportado
// desde allá) para no crear un import cruzado entre páginas por 5 líneas.
const reveal = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '400px' },
  transition: { duration: 0.6, ease: [0.23, 1, 0.32, 1] as const },
};

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' });
}

export default function Events() {
  // Esta página se queda con la intención de CALENDARIO ("eventos este fin de
  // semana en Valparaíso"), no con la de experiencia -- ésa es del home.
  useSeo({
    title: 'Eventos y Fiestas en Valparaíso — Calendario | Mansion Playroom',
    description: 'Calendario de próximos eventos de Mansion Playroom en la Región de Valparaíso. Fechas, horarios y entradas para tu próxima salida nocturna en Viña del Mar y Valparaíso.',
    path: '/eventos',
    jsonLd: [
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Eventos', path: '/eventos' },
      ]),
    ],
  });

  const { data: events, isLoading } = trpc.events.listPublished.useQuery();

  // `getPublishedEvents` (server/db.ts) trae todo ordenado desc(eventDate),
  // así que el primero de la lista es el más LEJANO en el tiempo, no el más
  // próximo -- si algún día hay 2 eventos futuros publicados a la vez, hay
  // que elegir a mano cuál es el que realmente viene primero.
  const now = Date.now();
  const upcoming = (events ?? [])
    .filter((e: any) => new Date(e.eventDate).getTime() >= now)
    .sort((a: any, b: any) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  const nextEvent = upcoming[0];
  const restEvents = (events ?? []).filter((e: any) => e.id !== nextEvent?.id);

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container">
        <motion.div {...reveal} className="mb-16">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Calendario</p>
          <h1 className="font-heading text-5xl md:text-7xl tracking-tight">
            Eventos <span className="text-gradient">PlayRoom</span>
          </h1>
        </motion.div>

        {isLoading ? (
          <div className="space-y-8">
            <div className="aspect-[16/9] md:aspect-[21/9] rounded-2xl bg-card animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="aspect-[3/4] rounded-2xl bg-card animate-pulse" />
              ))}
            </div>
          </div>
        ) : events && events.length > 0 ? (
          <div className="space-y-12">
            {nextEvent && <NextEventHero event={nextEvent} />}

            {restEvents.length > 0 && (
              <div>
                {nextEvent && (
                  <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground mb-6">Ediciones anteriores</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {restEvents.map((event: any, i: number) => {
                    const isPast = new Date(event.eventDate).getTime() < now;
                    return <EventCard key={event.id} event={event} isPast={isPast} index={i} />;
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-24">
            <Ticket className="w-16 h-16 text-primary/30 mx-auto mb-6" />
            <h3 className="font-heading text-3xl mb-4">Próximamente</h3>
            <p className="text-muted-foreground text-lg">Estamos preparando eventos increíbles. ¡Mantente atento!</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** El próximo evento sale del grid parejo y se muestra solo, grande, arriba
 * de todo -- para que se note de un vistazo cuál es el vigente sin tener
 * que leer la fecha de cada tarjeta (pedido explícito del dueño: "que se
 * note más una diferencia visual"). */
function NextEventHero({ event }: { event: any }) {
  return (
    <motion.div {...reveal}>
      <Link href={`/eventos/${event.slug}`} className="group block">
        <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-2xl md:rounded-3xl overflow-hidden glass-candy interactive transition-all duration-500 border border-primary/40 shadow-[0_0_60px_-15px_oklch(0.70_0.19_340_/_0.4)] group-hover:border-primary/70 group-hover:scale-[1.01]">
          {event.imageUrl ? (
            <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover transition-all duration-500" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <Ticket className="w-20 h-20 text-primary/50" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <span className="absolute top-4 left-4 md:top-6 md:left-6 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-extrabold uppercase tracking-wider shadow-lg shadow-primary/40">
            ✨ Próximo evento
          </span>
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="flex items-center gap-2 text-primary text-sm md:text-base mb-3 font-semibold">
              <Calendar className="w-4 h-4 md:w-5 md:h-5" />
              <span>{formatEventDate(event.eventDate)}</span>
            </div>
            <h3 className="font-heading text-3xl md:text-5xl mb-2 md:mb-3">{event.title}</h3>
            {event.shortDescription && (
              <p className="text-muted-foreground text-sm md:text-base mb-4 max-w-2xl line-clamp-2">{event.shortDescription}</p>
            )}
            {event.venue && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-5">
                <MapPin className="w-4 h-4" />
                <span>{event.venue}</span>
              </div>
            )}
            <span className="btn-jelly inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide">
              Comprar entradas <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/** Tarjeta del grid de "Ediciones anteriores". Casi siempre son eventos
 * pasados (el próximo se muestra aparte en `NextEventHero`), pero por si
 * llega a haber más de un evento publicado a futuro a la vez, cada una
 * calcula su propio `isPast` en vez de asumirlo. */
function EventCard({ event, isPast, index }: { event: any; isPast: boolean; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '400px' }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.3), ease: [0.23, 1, 0.32, 1] }}
    >
      <Link href={`/eventos/${event.slug}`} className="group block">
        <div
          className={`relative aspect-[3/4] rounded-2xl overflow-hidden glass-candy interactive transition-all duration-500 group-hover:scale-[1.02] ${
            isPast ? 'group-hover:border-white/25' : 'group-hover:border-primary/50'
          }`}
        >
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.title}
              className={`w-full h-full object-cover transition-all duration-500 ${isPast ? 'grayscale opacity-60' : ''}`}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <Ticket className="w-16 h-16 text-primary/50" />
            </div>
          )}

          {/* Cinta diagonal -- mucho más notoria que un pill chico, y el
              `overflow-hidden` del contenedor de arriba la recorta prolija
              justo en el borde de la tarjeta. */}
          {isPast && (
            <div
              className="absolute top-[22px] right-[-42px] w-[170px] rotate-45 bg-black/85 backdrop-blur-sm py-1.5 text-center shadow-lg shadow-black/40 border-y border-white/10"
              aria-hidden
            >
              <span className="inline-flex items-center gap-1 text-white text-[11px] font-extrabold uppercase tracking-wider">
                <Clock className="w-3 h-3" /> Finalizado
              </span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className={`flex items-center gap-2 text-sm mb-3 ${isPast ? 'text-muted-foreground' : 'text-primary'}`}>
              <Calendar className="w-4 h-4" />
              <span>{formatEventDate(event.eventDate)}</span>
            </div>
            <h3 className="font-heading text-2xl md:text-3xl mb-2">{event.title}</h3>
            {event.shortDescription && (
              <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{event.shortDescription}</p>
            )}
            {event.venue && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
                <MapPin className="w-4 h-4" />
                <span>{event.venue}</span>
              </div>
            )}
            {isPast ? (
              <div className="text-muted-foreground font-semibold text-sm">Ver detalles</div>
            ) : (
              <div className="flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                Ver Evento <ArrowRight className="w-4 h-4" />
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
