import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Ticket, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CANDYLAND, formatCLP } from '@/config/candyland';
import { isMissionWindowOpen, missionDepositPrice } from '@shared/mission300';

/** Página "Entradas": lista todos los accesos con su precio general y, si la
 * ventana de Misión 300 sigue abierta, el precio de abono al lado tachando
 * el general — mismo gancho de urgencia que ya está en el Hero, pero acá con
 * el detalle completo de cada tipo de acceso. */
export default function Prices() {
  const { data: event } = trpc.events.getBySlug.useQuery({ slug: CANDYLAND.slug }, { retry: false });
  const { data: liveTickets } = trpc.events.getTicketTypes.useQuery({ slug: CANDYLAND.slug }, { retry: false });

  const accesos = (liveTickets ?? []).filter((t: any) => t.category === 'acceso' && t.status !== 'hidden');
  const missionOpen = !!event?.eventDate && isMissionWindowOpen(new Date(event.eventDate));

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <div className="container max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-3 text-center">Candyland</p>
          <h1 className="font-heading font-extrabold text-3xl md:text-4xl tracking-tight text-center mb-2">Entradas</h1>
          <p className="text-muted-foreground text-sm text-center mb-10">
            {missionOpen
              ? 'Mientras dure la Misión 300, todos los accesos principales tienen precio de abono.'
              : 'Estos son los valores generales de cada acceso.'}
          </p>

          {accesos.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">Todavía no hay accesos cargados para este evento.</p>
          ) : (
            <div className="space-y-4">
              {accesos.map((t: any) => {
                const generalPrice = Number(t.price);
                const depositPrice = missionOpen ? missionDepositPrice(t.accesoSlug) : null;
                return (
                  <div key={t.id} className="glass-candy rounded-2xl p-5 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-heading font-bold text-lg">{t.name}</h3>
                      {t.description && <p className="text-muted-foreground text-xs mt-0.5">{t.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {depositPrice !== null && depositPrice < generalPrice ? (
                        <>
                          <p className="line-through text-muted-foreground text-sm">{formatCLP(generalPrice)}</p>
                          <p className="font-heading font-extrabold text-xl text-gradient-candy">{formatCLP(depositPrice)}</p>
                        </>
                      ) : (
                        <p className="font-heading font-extrabold text-xl">{formatCLP(generalPrice)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-center mt-10">
            <Link
              href={`/checkout/${CANDYLAND.slug}`}
              className="btn-jelly inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full text-base font-bold uppercase tracking-wide interactive"
            >
              <Ticket className="w-5 h-5" /> Comprar entrada <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
