import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Ticket, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CANDYLAND, EVENTO, formatCLP } from '@/config/candyland';
import { useSeo } from '@/hooks/useSeo';
import { prefersReducedMotion } from '@/lib/smoothScroll';
import { breadcrumbSchema } from '@shared/structuredData';

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '300px' } as const,
  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const },
};

/** Sheen/holo que sigue al puntero -- mismo mecanismo que el Candy Pass del
 *  Home y el banner de Embajadores (`--mx`/`--my` en el propio nodo vía
 *  `currentTarget`, sin necesitar un ref por tarjeta). */
function handleCandyPassMove(e: React.PointerEvent<HTMLDivElement>) {
  if (prefersReducedMotion()) return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}

/** Página "Entradas": lista todos los accesos con su precio general. */
export default function Prices() {
  // Intención de conversión pura: precios y accesos. No repite el pitch de
  // experiencia del home ni la frase "fiesta liberal en Viña del Mar y
  // Valparaíso", que antes llevaban cuatro páginas a la vez.
  useSeo({
    title: 'Entradas y Precios — Mansion Playroom',
    description: 'Valores y tipos de acceso a las noches de Mansion Playroom: Dúo, Soltera, Dúo Mujeres y Soltero. Compra online con confirmación inmediata por correo. Evento +18.',
    path: '/entradas',
    jsonLd: [
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Entradas', path: '/entradas' },
      ]),
    ],
  });

  const { data: liveTickets } = trpc.events.getTicketTypes.useQuery({ slug: CANDYLAND.slug }, { retry: false });

  const accesos = (liveTickets ?? []).filter((t: any) => t.category === 'acceso' && t.status !== 'hidden');

  return (
    <div className="relative min-h-dvh pt-24 pb-16 overflow-hidden">
      <div aria-hidden className="absolute -top-16 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-primary/15 blur-[110px] candy-float-slow" />

      <div className="container relative max-w-2xl">
        <motion.div {...reveal}>
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-3 text-center">{EVENTO.nombre}</p>
          <h1 className="font-heading font-extrabold text-3xl md:text-4xl tracking-tight text-center mb-2">Entradas</h1>
          <p className="text-muted-foreground text-sm text-center mb-10">
            Estos son los valores generales de cada acceso.
          </p>
        </motion.div>

        {accesos.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">Todavía no hay accesos cargados para este evento.</p>
        ) : (
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '300px' }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            className="space-y-4"
          >
            {accesos.map((t: any) => {
              const generalPrice = Number(t.price);
              return (
                <motion.div
                  key={t.id}
                  variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.23, 1, 0.32, 1] } } }}
                  onPointerMove={handleCandyPassMove}
                  className="candy-pass relative glass-candy-pastel rounded-2xl p-5 flex items-center justify-between gap-4 overflow-hidden"
                >
                  <div className="candy-holo" />
                  <div className="candy-sheen" />
                  <div className="relative">
                    <h3 className="font-heading font-bold text-lg">{t.name}</h3>
                    {t.description && <p className="text-muted-foreground text-xs mt-0.5">{t.description}</p>}
                  </div>
                  <div className="relative text-right shrink-0">
                    <p className="font-heading font-extrabold text-xl">{formatCLP(generalPrice)}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        <motion.div {...reveal} className="text-center mt-10">
          {EVENTO.fechaConfirmada ? (
            <Link
              href={`/checkout/${CANDYLAND.slug}`}
              className="btn-jelly inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full text-base font-bold uppercase tracking-wide interactive"
            >
              <Ticket className="w-5 h-5" /> Comprar entrada <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <p className="text-muted-foreground text-sm">Venta de entradas próximamente -- todavía no hay fecha confirmada.</p>
          )}
        </motion.div>

        {/* Antes esta página era solo la tabla de precios. Este bloque
            responde las dudas que aparecen justo antes de comprar, que es
            donde se pierden las ventas. */}
        <motion.div {...reveal} className="mt-16 space-y-6 text-left">
          <div className="glass-candy rounded-2xl p-6">
            <h2 className="font-heading font-bold text-xl mb-3">Todos los accesos incluyen lo mismo</h2>
            <p className="text-muted-foreground leading-relaxed text-sm">
              Cualquier acceso te da entrada a todas las zonas del recinto: las dos pistas de
              baile, el Playground XXL, la Kink Room, la barra completa y la zona de fumadores
              techada. La diferencia entre uno y otro es a cuántas personas cubre y su valor,
              no a qué puedes entrar.
            </p>
          </div>

          <div className="glass-candy rounded-2xl p-6">
            <h2 className="font-heading font-bold text-xl mb-3">Antes de comprar</h2>
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
            <h2 className="font-heading font-bold text-xl mb-3">¿Primera vez?</h2>
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
        </motion.div>
      </div>
    </div>
  );
}
