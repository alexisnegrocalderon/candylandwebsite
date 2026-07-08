import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRoute, Link } from 'wouter';
import { Calendar, MapPin, Clock, Ticket, Minus, Plus, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

export default function EventDetail() {
  const [, params] = useRoute('/eventos/:slug');
  const slug = params?.slug ?? '';
  const { data: event, isLoading } = trpc.events.getBySlug.useQuery({ slug });
  const { data: ticketTypesData } = trpc.events.getTicketTypes.useQuery({ slug });
  const [quantities, setQuantities] = useState<Record<number, number>>({});

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

  const ticketTypes = ticketTypesData ?? [];
  const totalItems = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const totalPrice = ticketTypes.reduce((sum: number, tt: any) => {
    return sum + (quantities[tt.id] || 0) * Number(tt.price);
  }, 0);

  const updateQuantity = (id: number, delta: number, max: number) => {
    setQuantities((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [id]: next };
    });
  };

  const buildCheckoutUrl = () => {
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => `${id}:${q}`)
      .join(',');
    return `/checkout/${slug}?items=${items}`;
  };

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

          {/* Ticket selection */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:col-span-1"
          >
            <div className="sticky top-24 bg-card border border-border/50 rounded-2xl p-6">
              <h3 className="font-heading text-2xl mb-6">Selecciona tus entradas</h3>

              {ticketTypes.length > 0 ? (
                <div className="space-y-4 mb-6">
                  {ticketTypes.map((tt: any) => {
                    const available = tt.totalStock - tt.soldCount;
                    const isSoldOut = available <= 0;
                    return (
                      <div key={tt.id} className={`p-4 rounded-xl border ${isSoldOut ? 'border-border/30 opacity-50' : 'border-border/50 hover:border-primary/50'} transition-colors`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-semibold">{tt.name}</h4>
                            {tt.description && <p className="text-muted-foreground text-xs mt-1">{tt.description}</p>}
                          </div>
                          <div className="text-right">
                            <p className="font-heading text-lg text-primary">${Number(tt.price).toLocaleString('es-CL')}</p>
                            {tt.originalPrice && Number(tt.originalPrice) > Number(tt.price) && (
                              <p className="text-muted-foreground text-xs line-through">${Number(tt.originalPrice).toLocaleString('es-CL')}</p>
                            )}
                          </div>
                        </div>
                        {!isSoldOut ? (
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-muted-foreground">{available} disponibles</span>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => updateQuantity(tt.id, -1, tt.maxPerOrder)}
                                className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:border-primary transition-colors interactive"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center font-semibold">{quantities[tt.id] || 0}</span>
                              <button
                                onClick={() => updateQuantity(tt.id, 1, Math.min(tt.maxPerOrder, available))}
                                className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:border-primary transition-colors interactive"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-destructive mt-2">Agotado</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Las entradas estarán disponibles pronto.</p>
              )}

              {totalItems > 0 && (
                <div className="border-t border-border/50 pt-4 mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-muted-foreground">{totalItems} entrada{totalItems > 1 ? 's' : ''}</span>
                    <span className="font-heading text-2xl text-gradient">${totalPrice.toLocaleString('es-CL')}</span>
                  </div>
                  <Link href={buildCheckoutUrl()}>
                    <Button className="w-full h-12 rounded-full text-lg font-semibold glow-pink interactive">
                      Continuar <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
