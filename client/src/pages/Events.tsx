import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Calendar, MapPin, Ticket, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function Events() {
  const { data: events, isLoading } = trpc.events.listPublished.useQuery();

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-16"
        >
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Calendario</p>
          <h1 className="font-heading text-5xl md:text-7xl tracking-tight">
            Próximos <span className="text-gradient">Eventos</span>
          </h1>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-[3/4] rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        ) : events && events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {events.map((event: any, i: number) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <Link href={`/eventos/${event.slug}`} className="group block">
                  <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-card border border-border/50 transition-all duration-500 group-hover:border-primary/50 group-hover:scale-[1.02]">
                    {event.imageUrl ? (
                      <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                        <Ticket className="w-16 h-16 text-primary/50" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <div className="flex items-center gap-2 text-primary text-sm mb-3">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(event.eventDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' })}</span>
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
                      <div className="flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                        Ver Evento <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
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
