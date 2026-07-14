import { motion } from 'framer-motion';
import { useRoute, Link } from 'wouter';
import { Calendar, MapPin, Clock, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

export default function EventDetail() {
  const [, params] = useRoute('/eventos/:slug');
  const slug = params?.slug ?? '';
  const { data: event, isLoading } = trpc.events.getBySlug.useQuery({ slug });

  if (isLoading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-heading text-4xl mb-4">Evento no encontrado</h2>
          <Link href="/eventos" className="text-primary">Volver a eventos</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative rounded-3xl overflow-hidden mb-12 aspect-[21/9]"
        >
          {event.imageUrl ? (
            <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
            <div className="flex items-center gap-2 text-primary text-sm mb-3">
              <Calendar className="w-4 h-4" />
              <span>{new Date(event.eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl tracking-tight">{event.title}</h1>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Info */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="flex flex-wrap gap-4 mb-8">
                {event.venue && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-full border border-border/50">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-sm">{event.venue}</span>
                  </div>
                )}
                {event.doorsOpen && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-full border border-border/50">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-sm">Puertas: {new Date(event.doorsOpen).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>

              {event.description && (
                <div className="prose prose-invert max-w-none">
                  <p className="text-muted-foreground text-lg leading-relaxed whitespace-pre-wrap">{event.description}</p>
                </div>
              )}
            </motion.div>
          </div>

          {/* CTA de compra — los tipos de entrada y precios se muestran recién
           * dentro del wizard conversacional, no acá. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:col-span-1"
          >
            <div className="sticky top-24 bg-card border border-border/50 rounded-2xl p-6 text-center">
              <h3 className="font-heading text-2xl mb-2">¿Vienes a Candyland?</h3>
              <p className="text-muted-foreground text-sm mb-6">Elegí cómo vienes y te mostramos tu acceso y el valor al tiro.</p>
              <Link href={`/checkout/${slug}`}>
                <Button className="w-full h-12 rounded-full text-lg font-semibold glow-pink interactive">
                  Comprar entrada <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
