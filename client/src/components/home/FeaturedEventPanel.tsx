import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Calendar, MapPin, Ticket, Sparkles } from 'lucide-react';
import { isFinePointer } from '@/lib/smoothScroll';
import type { HomeEventItem } from '@/pages/Home';

// Mismos handlers de tilt que usan LineupSection/ExperienceSection en
// Home.tsx (`.candy-perspective`/`.candy-pass`/`.candy-sheen`/`.candy-holo`,
// ya definidos en index.css) -- duplicados acá a propósito en vez de
// importados, mismo criterio que ScrollStory.tsx: evita un import cruzado
// con Home.tsx (que a su vez importa este componente).
function handleCandyTilt(e: React.PointerEvent<HTMLDivElement>) {
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  card.style.setProperty('--mx', `${px * 100}%`);
  card.style.setProperty('--my', `${py * 100}%`);
  card.style.transform = `rotateX(${(0.5 - py) * 10}deg) rotateY(${(px - 0.5) * 10}deg)`;
}
function resetCandyTilt(e: React.PointerEvent<HTMLDivElement>) {
  e.currentTarget.style.transform = 'rotateX(0deg) rotateY(0deg)';
}

const panelStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const } },
};

interface FeaturedEventPanelProps {
  event: HomeEventItem;
  /** 'upcoming': hay fecha confirmada, se vende entrada. 'past': todavía no
   * hay próximo evento cargado, así que se promueve la edición pasada más
   * reciente a este mismo panel grande en vez de dejar la sección sin
   * ningún momento visual fuerte (ver UpcomingEventsSection en Home.tsx). */
  mode: 'upcoming' | 'past';
}

/** El "momento grande" de Próximos Eventos: el flyer a su proporción real
 * (retrato, 3:4) como ancla visual, con el detalle del evento al lado en
 * vez de encima -- reemplaza el viejo EventCard variante "featured", que
 * forzaba el flyer (siempre retrato) dentro de una caja panorámica 21:9 y
 * le recortaba la mayor parte del diseño. */
export default function FeaturedEventPanel({ event, mode }: FeaturedEventPanelProps) {
  const [pointerFine] = useState(() => isFinePointer());
  const isUpcoming = mode === 'upcoming';

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '400px' }}
      variants={panelStagger}
      className="grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr] gap-8 lg:gap-14 items-center"
    >
      {/* Flyer */}
      <motion.div variants={fadeUp} className="relative mx-auto w-full max-w-sm lg:max-w-none">
        <div aria-hidden className="absolute -top-8 -left-8 w-48 h-48 rounded-full bg-primary/20 blur-2xl md:blur-[90px] candy-float-slow" />
        <div aria-hidden className="absolute -bottom-10 -right-6 w-56 h-56 rounded-full bg-cherry/15 blur-2xl md:blur-[100px] candy-float" />
        <Link href={event.href} className="group candy-perspective relative block">
          <div
            onPointerMove={pointerFine ? handleCandyTilt : undefined}
            onPointerLeave={pointerFine ? resetCandyTilt : undefined}
            className="candy-pass relative aspect-[3/4] rounded-3xl overflow-hidden glass-candy interactive"
          >
            {/* El flyer real es 1060×1413 (3:4) -- la caja ya calza con esa
             * proporción, así que object-cover no tiene nada que recortar
             * (a diferencia del viejo aspect-[21/9]). */}
            <img
              src={event.imageUrl}
              alt={event.title}
              width={1060}
              height={1413}
              // Blanco y negro para ediciones pasadas -- mismo criterio que
              // ya usa EventCard (grayscale, se revela a color en hover),
              // no un gris parcial: una edición pasada tiene que leerse
              // como pasada de un vistazo, no como el próximo evento.
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${
                !isUpcoming ? 'grayscale group-hover:grayscale-0 opacity-90 group-hover:opacity-100' : 'group-hover:scale-105'
              }`}
            />
            <div aria-hidden className="candy-sheen" />
            <div aria-hidden className="candy-holo" />
          </div>
        </Link>
      </motion.div>

      {/* Detalle */}
      <motion.div variants={fadeUp}>
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-candy text-xs md:text-sm font-bold uppercase tracking-wide text-primary mb-4">
          {isUpcoming ? '✨ Próximo evento' : '🕓 La última vez'}
        </span>
        <p className="flex items-center gap-2 text-primary font-semibold text-base md:text-lg mb-2">
          <Calendar className="w-4 h-4 md:w-5 md:h-5" /> {event.dateLabel}
        </p>
        <h3 className="font-heading font-extrabold text-4xl md:text-6xl leading-[0.95] tracking-tight text-gradient-candy mb-4">
          {event.title}
        </h3>
        {event.venue && (
          <p className="flex items-center gap-2 text-muted-foreground text-sm md:text-base mb-2">
            <MapPin className="w-4 h-4" /> {event.venue}
          </p>
        )}
        {event.shortDescription && (
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed mt-4 max-w-xl">{event.shortDescription}</p>
        )}
        <Link
          href={event.href}
          className="btn-jelly inline-flex items-center gap-2 mt-8 px-8 py-4 bg-primary text-primary-foreground rounded-full text-sm md:text-base font-bold uppercase tracking-wide interactive"
        >
          {isUpcoming ? <Ticket className="w-4 h-4 md:w-5 md:h-5" /> : <Sparkles className="w-4 h-4 md:w-5 md:h-5" />}
          {isUpcoming ? 'Comprar entrada' : 'Ver cómo fue'}
        </Link>
      </motion.div>
    </motion.div>
  );
}
