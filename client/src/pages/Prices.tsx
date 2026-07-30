import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Ticket, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CANDYLAND, formatCLP } from '@/config/candyland';
import { isMissionWindowOpen, missionDepositPrice } from '@shared/mission300';
import { useSeo } from '@/hooks/useSeo';
import { breadcrumbSchema } from '@shared/structuredData';

/** Página "Entradas": lista todos los accesos con su precio general y, si la
 * ventana de Misión 300 sigue abierta, el precio de abono al lado tachando
 * el general — mismo gancho de urgencia que ya está en el Hero, pero acá con
 * el detalle completo de cada tipo de acceso. */
export default function Prices() {
  // Intención de conversión pura: precios y accesos. No repite el pitch de
  // experiencia del home ni la frase "fiesta liberal en Viña del Mar y
  // Valparaíso", que antes llevaban cuatro páginas a la vez.
  useSeo({
    title: 'Entradas y Precios — Mansion Playroom',
    description: 'Valores y tipos de acceso para Candyland: Dúo, Soltera, Dúo Mujeres y Soltero. Compra online con confirmación inmediata por correo. Evento +18.',
    path: '/entradas',
    jsonLd: [
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Entradas', path: '/entradas' },
      ]),
    ],
  });

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

          {/* Antes esta página era solo la tabla de precios. Este bloque
              responde las dudas que aparecen justo antes de comprar, que es
              donde se pierden las ventas. */}
          <div className="mt-16 space-y-6 text-left">
            <div className="glass-candy rounded-2xl p-6">
              <h2 className="font-heading text-xl mb-3">Todos los accesos incluyen lo mismo</h2>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Cualquier acceso te da entrada a todas las zonas del recinto: las dos pistas de
                baile, el Playground XXL, la Kink Room, la barra completa y la zona de fumadores
                techada. La diferencia entre uno y otro es a cuántas personas cubre y su valor,
                no a qué puedes entrar.
              </p>
            </div>

            <div className="glass-candy rounded-2xl p-6">
              <h2 className="font-heading text-xl mb-3">Antes de comprar</h2>
              <ul className="space-y-2.5">
                {[
                  'Evento estrictamente +18: se pide carnet en la entrada, sin excepciones.',
                  'Hay dress code y se revisa en la puerta. Vale la pena leerlo antes.',
                  'La dirección exacta llega por correo junto con tu entrada.',
                  'El estacionamiento privado se toma al comprar: los cupos son limitados.',
                  'La barra se paga aparte de la entrada.',
                ].map((item) => (
                  <li
                    key={item}
                    className="text-sm text-muted-foreground leading-relaxed pl-5 relative before:content-['•'] before:absolute before:left-0 before:text-primary"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-candy rounded-2xl p-6">
              <h2 className="font-heading text-xl mb-3">¿Primera vez?</h2>
              <p className="text-muted-foreground leading-relaxed text-sm mb-4">
                Si nunca has ido a un evento así, estas guías responden lo que la mayoría se
                pregunta antes de decidirse.
              </p>
              <div className="flex flex-col gap-2">
                <Link href="/blog/primera-vez-que-esperar" className="text-primary text-sm font-semibold hover:underline">
                  Qué esperar en tu primera vez →
                </Link>
                <Link href="/blog/dress-code-explicado" className="text-primary text-sm font-semibold hover:underline">
                  Dress code explicado →
                </Link>
                <Link href="/blog/como-llegar-y-estacionar" className="text-primary text-sm font-semibold hover:underline">
                  Cómo llegar y dónde estacionar →
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
