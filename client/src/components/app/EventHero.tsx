import { useRef } from 'react';
import { Link } from 'wouter';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import { ArrowRight, CalendarDays, CalendarPlus, ChevronRight, MapPin, Share } from 'lucide-react';
import { eventImage } from '@shared/eventImage';
import { addToCalendar, eventWhen, shareEvent, type AppEvent } from '@/components/app/AppEventCard';

/* Portada del próximo evento en la app, como la portada de un álbum: el flyer
 * difuminado de fondo y el flyer como póster flotante al centro, que se inclina
 * siguiendo el dedo (sin pedir permisos de movimiento al teléfono). Debajo, los
 * datos y el botón de comprar: todo cabe en la primera pantalla.
 *
 * El póster abre el detalle (EventDetail) solo con un toque claro: si el dedo se
 * movió (estaba deslizando la página), no abre nada. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
export const posterLayoutId = (event: AppEvent) => `event-poster-${event.id}`;

/** ¿Fue un toque de verdad? (no el final de un deslizamiento ni un dedo que se quedó apoyado). */
export function useRealTap(onTap: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY, t: Date.now() }; },
    onPointerCancel: () => { start.current = null; },
    onClick: (e: React.MouseEvent) => {
      const s = start.current;
      start.current = null;
      // Sin pointerdown (teclado) también vale.
      if (s && (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10 || Date.now() - s.t > 700)) return;
      onTap();
    },
  };
}

export function EventHero({ event, from, onOpen }: { event: AppEvent; from: number | null; onOpen: () => void }) {
  const img = eventImage(event.slug, event.imageUrl);
  const soldOut = event.status === 'soldout';
  const tap = useRealTap(onOpen);

  // Inclinación 3D y reflejo que siguen al dedo (o al mouse).
  const rx = useSpring(useMotionValue(0), { stiffness: 160, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 160, damping: 18 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(30);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.28), transparent 55%)`;
  const tilt = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 16);
    rx.set(-(py - 0.5) * 16);
    gx.set(px * 100);
    gy.set(py * 100);
  };
  const reset = () => { rx.set(0); ry.set(0); gx.set(50); gy.set(30); };

  return (
    <section className="relative">
      {/* El mismo flyer, difuminado, de fondo: le da color a toda la portada. */}
      {img && (
        <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-40 h-[36rem] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_55%,transparent)]">
          <img src={img} alt="" className="h-full w-full scale-125 object-cover opacity-60 blur-3xl saturate-150" />
        </div>
      )}

      <div className="relative flex flex-col items-center pt-2">
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} style={{ perspective: 900 }}>
          <motion.button
            type="button" aria-label={`Ver la fiesta: ${event.title}`}
            {...tap}
            onPointerMove={tilt} onPointerLeave={reset} onPointerUp={reset}
            style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
            whileTap={{ scale: 0.97 }}
            className="relative block w-[min(62vw,250px)] [-webkit-tap-highlight-color:transparent]"
          >
            <motion.div
              layoutId={posterLayoutId(event)}
              className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-gradient-to-br from-pink-500/40 via-fuchsia-500/30 to-sky-500/40 shadow-[0_30px_60px_-18px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.12)]"
            >
              {img
                ? <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
                : <span className="absolute inset-0 grid place-items-center"><img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-20 w-20 opacity-80" /></span>}
              <motion.span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: glare }} />
            </motion.div>
          </motion.button>
        </motion.div>

        <h2 className="mt-5 text-center text-title1 font-bold leading-tight tracking-tight">{event.title}</h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-subhead text-white/75"><CalendarDays className="h-4 w-4 shrink-0" />{eventWhen(event.eventDate)}</p>
        {event.venue && <p className="mt-0.5 flex items-center gap-1.5 text-subhead text-white/60"><MapPin className="h-4 w-4 shrink-0" />{event.venue}</p>}

        <div className="mt-3 flex items-center gap-2">
          {from != null && !soldOut && <span className="rounded-full bg-white/10 px-3 py-1.5 text-footnote font-semibold tabular-nums">Desde {clp(from)}</span>}
          <button type="button" onClick={() => addToCalendar(event)} aria-label="Agregar al calendario" className="lg-pill grid h-9 w-9 place-items-center rounded-full interactive"><CalendarPlus className="h-[18px] w-[18px]" /></button>
          <button type="button" onClick={() => { void shareEvent(event); }} aria-label="Compartir" className="lg-pill grid h-9 w-9 place-items-center rounded-full interactive"><Share className="h-[18px] w-[18px]" /></button>
        </div>

        <div className="mt-4 w-full">
          {soldOut ? (
            <p className="flex h-14 items-center justify-center rounded-full bg-white/10 text-headline font-semibold text-white/70">Entradas agotadas</p>
          ) : (
            <Link href={`/checkout/${event.slug}`} className="flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-semibold text-white shadow-[0_12px_32px_-10px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.35)] interactive">
              Comprar entrada <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <button type="button" onClick={onOpen} className="mx-auto mt-2 flex h-11 items-center gap-1 px-4 text-subhead font-semibold text-pink-200">
            Ver la fiesta <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
