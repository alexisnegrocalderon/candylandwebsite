import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useRoute, Link } from 'wouter';
import { Calendar, MapPin, Clock, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useSeo } from '@/hooks/useSeo';
import { prefersReducedMotion } from '@/lib/smoothScroll';
import { breadcrumbSchema, eventSchema } from '@shared/structuredData';

export default function EventDetail() {
  const [, params] = useRoute('/eventos/:slug');
  const slug = params?.slug ?? '';
  const { data: event, isLoading } = trpc.events.getBySlug.useQuery({ slug });
  const passRef = useRef<HTMLDivElement>(null);
  const rm = prefersReducedMotion();
  const handlePassMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rm || !passRef.current) return;
    const r = passRef.current.getBoundingClientRect();
    passRef.current.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    passRef.current.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  // Precio más bajo real del evento: Google exige un `price` concreto en la
  // oferta, y antes el schema del evento vivía fijo en index.html sin precio
  // (por eso nunca calificó para resultado enriquecido).
  const { data: ticketTypes } = trpc.events.getTicketTypes.useQuery(
    { slug },
    { enabled: !!slug },
  );
  const precioDesde = (() => {
    const accesos = (ticketTypes ?? []).filter((t: any) => t.category === 'acceso');
    if (!accesos.length) return null;
    return Math.min(...accesos.map((t: any) => Number(t.price)));
  })();

  const isPast = event ? new Date(event.eventDate).getTime() < Date.now() : false;

  useSeo({
    title: event ? `${event.title} — Fiesta Liberal en Viña del Mar | +18` : 'Cargando evento… | Mansion Playroom',
    description: event?.shortDescription || 'Fiesta liberal en la Región de Valparaíso: fecha, horario, accesos y entradas para tu próxima noche con Mansion Playroom.',
    path: `/eventos/${slug}`,
    image: event?.imageUrl || undefined,
    jsonLd: event
      ? [
          eventSchema({
            name: event.title,
            description: event.shortDescription,
            startDate: new Date(event.eventDate).toISOString(),
            endDate: event.eventEnd ? new Date(event.eventEnd).toISOString() : null,
            slug: event.slug,
            imageUrl: event.imageUrl,
            priceFrom: precioDesde,
            venueName: event.venue ?? undefined,
          }),
          breadcrumbSchema([
            { name: 'Inicio', path: '/' },
            { name: 'Eventos', path: '/eventos' },
            { name: event.title, path: `/eventos/${event.slug}` },
          ]),
        ]
      : undefined,
  });

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
    <div className="relative min-h-screen pt-24 pb-16 overflow-hidden">
      <div aria-hidden className="absolute -top-16 right-[6%] w-72 h-72 rounded-full bg-cherry/15 blur-[100px] candy-float-slow" />

      <div className="container relative">
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
              <span>{new Date(event.eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' })}</span>
            </div>
            <h1 className="font-heading font-bold text-4xl md:text-6xl lg:text-7xl tracking-tight">{event.title}</h1>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Info */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '400px' }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="flex flex-wrap gap-4 mb-8">
                {event.venue && (
                  <div className="flex items-center gap-2 px-4 py-2 glass-candy rounded-full">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-sm">{event.venue}</span>
                  </div>
                )}
                {event.doorsOpen && (
                  <div className="flex items-center gap-2 px-4 py-2 glass-candy rounded-full">
                    <Clock className="w-4 h-4 text-primary" />
                    <span className="text-sm">Puertas: {new Date(event.doorsOpen).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })}</span>
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
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '400px' }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="lg:col-span-1"
          >
            <div
              ref={passRef}
              onPointerMove={handlePassMove}
              className="candy-pass sticky top-24 glass-candy rounded-2xl p-6 text-center overflow-hidden"
            >
              {!isPast && <div className="candy-holo" />}
              {!isPast && <div className="candy-sheen" />}
              {isPast ? (
                <>
                  <h3 className="font-heading font-bold text-2xl mb-2">Evento finalizado</h3>
                  <p className="text-muted-foreground text-sm">Esta noche ya pasó -- revisa nuestros próximos eventos.</p>
                  <Link href="/eventos" className="mt-4 inline-block text-primary text-sm font-semibold hover:underline">
                    Ver próximos eventos →
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="relative font-heading font-bold text-2xl mb-2">¿Vienes a {event.title}?</h3>
                  <p className="relative text-muted-foreground text-sm mb-6">Elegí cómo vienes y te mostramos tu acceso y el valor al tiro.</p>
                  <Link href={`/checkout/${slug}`} className="relative block">
                    <Button className="btn-jelly w-full h-12 rounded-full text-lg font-semibold interactive">
                      Comprar entrada <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
