import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'wouter';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { ArrowRight, CalendarDays, CalendarPlus, Car, ChevronRight, Cigarette, CircleHelp, FileText, Gamepad2, MapPin, Martini, Music, Share, ShieldCheck, Shirt, X } from 'lucide-react';
import { CANDYLAND } from '@/config/candyland';
import { BRAND, EVENT_BRAND } from '@shared/eventBrand';
import { eventImage } from '@shared/eventImage';
import { addToCalendar, eventWhen, shareEvent, type AppEvent } from '@/components/app/AppEventCard';
import { posterLayoutId } from '@/components/app/EventHero';
import type { InfoKind } from '@/components/app/InfoSheets';

/* «La fiesta» a pantalla completa: crece desde el póster de la portada (mismo
 * `layoutId`, como las tarjetas del App Store) y se cierra con la X o
 * deslizando hacia abajo desde arriba. El botón de comprar queda fijo abajo. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const AMENITY_ICON: Record<string, typeof Music> = { Music, Car, Shirt, Gamepad2, Martini, Cigarette, ShieldCheck };
const PISTA_TINT = ['from-pink-500/45 via-fuchsia-500/25 to-transparent', 'from-sky-500/45 via-indigo-500/25 to-transparent'];

const reveal = (i: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.18 + i * 0.06, type: 'spring' as const, damping: 26, stiffness: 260 },
});

export function EventDetail({ event, open, from, onClose, onMore }: {
  event: AppEvent;
  open: boolean;
  from: number | null;
  onClose: () => void;
  /** Abre otra hoja de información (preguntas, políticas) cerrando esta. */
  onMore?: (kind: InfoKind) => void;
}) {
  const img = eventImage(event.slug, event.imageUrl);
  const soldOut = event.status === 'soldout';
  const drag = useDragControls();
  const pistas = CANDYLAND.pistas.map((p) => ({ ...p, djs: CANDYLAND.lineup.filter((d) => d.pista === p.genero) }));

  // Mientras está abierta, la página de atrás no se desliza; Escape cierra.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { root.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="detail"
          role="dialog" aria-modal="true" aria-label={event.title}
          className="account-font account-tokens fixed inset-0 z-[80] overflow-hidden bg-[#0b0612] text-white"
          initial={{ backgroundColor: 'rgba(11,6,18,0)' }} animate={{ backgroundColor: 'rgba(11,6,18,1)' }} exit={{ backgroundColor: 'rgba(11,6,18,0)', transition: { duration: 0.2 } }}
          drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); }}
        >
          {/* El contenido hace scroll por dentro: la X y el botón de comprar quedan afuera, siempre a la vista
              (adentro de un contenedor con transform, `fixed` se movería con el contenido). */}
          <div data-detail-scroll className="h-full overflow-y-auto overscroll-contain">
          {/* Cabecera: el flyer difuminado de fondo y el póster que viene volando desde la portada. */}
          <div className="relative overflow-hidden px-6 pb-6 pt-[max(56px,calc(env(safe-area-inset-top)+44px))]">
            {img && (
              <motion.img
                aria-hidden src={img} alt=""
                initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-3xl saturate-150 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
              />
            )}
            {/* Solo esta franja de arriba arrastra para cerrar: deslizar sobre el flyer hace scroll normal. */}
            <div onPointerDown={(e) => drag.start(e)} className="absolute inset-x-0 top-0 z-[1] flex h-[max(48px,calc(env(safe-area-inset-top)+36px))] cursor-grab touch-none items-end justify-center pb-3">
              <div aria-hidden className="h-1.5 w-10 rounded-full bg-white/30" />
            </div>
            <motion.div
              layoutId={posterLayoutId(event)}
              className="relative mx-auto aspect-[4/5] w-[min(78vw,340px)] overflow-hidden rounded-[26px] bg-gradient-to-br from-pink-500/40 via-fuchsia-500/30 to-sky-500/40 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.12)]"
            >
              {img && <img src={img} alt={`Flyer de ${event.title}`} className="absolute inset-0 h-full w-full object-cover" />}
            </motion.div>
          </div>

          <div className="mx-auto max-w-lg px-4 pb-36">
            <motion.div {...reveal(0)} className="text-center">
              <h2 className="text-large-title font-bold leading-tight tracking-tight">{event.title}</h2>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-body text-white/80"><CalendarDays className="h-4 w-4 shrink-0" />{eventWhen(event.eventDate)}</p>
              {event.venue && <p className="mt-0.5 flex items-center justify-center gap-1.5 text-body text-white/60"><MapPin className="h-4 w-4 shrink-0" />{event.venue}</p>}
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" onClick={() => addToCalendar(event)} className="lg-pill flex h-10 items-center gap-2 rounded-full px-4 text-subhead font-semibold interactive"><CalendarPlus className="h-4 w-4" /> Calendario</button>
                <button type="button" onClick={() => { void shareEvent(event); }} className="lg-pill flex h-10 items-center gap-2 rounded-full px-4 text-subhead font-semibold interactive"><Share className="h-4 w-4" /> Compartir</button>
              </div>
            </motion.div>

            {event.shortDescription && (
              <motion.p {...reveal(1)} className="mt-6 text-center text-body leading-relaxed text-white/80">{event.shortDescription}</motion.p>
            )}

            {/* Line-up: una tarjeta por pista, deslizables de lado. */}
            <motion.section {...reveal(2)} className="mt-8">
              <h3 className="mb-3 px-1 text-title3 font-bold">Line-up</h3>
              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {pistas.map((p, i) => (
                  <article key={p.nombre} className={`account-glass relative w-[78%] shrink-0 snap-center overflow-hidden rounded-[26px] p-5`}>
                    <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${PISTA_TINT[i % PISTA_TINT.length]}`} />
                    <div className="relative">
                      <p className="text-caption1 font-semibold uppercase tracking-[0.18em] text-white/70">{p.nombre}</p>
                      <p className="mt-1 text-[40px] font-black leading-none tracking-tight">{p.genero}</p>
                      <p className="mt-2 text-subhead text-white/70">{p.descripcion}</p>
                      {p.djs.length > 0 && (
                        <div className="mt-5 space-y-1.5">
                          {p.djs.some((d) => d.formato === 'B2B') && <span className="inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-caption2 font-bold tracking-widest">B2B</span>}
                          {p.djs.map((d) => <p key={d.nombre} className="text-title3 font-bold leading-tight">{d.nombre}</p>)}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </motion.section>

            {/* Lo que hay en la mansión, como mosaico de íconos. */}
            <motion.section {...reveal(3)} className="mt-8">
              <h3 className="mb-3 px-1 text-title3 font-bold">En la mansión</h3>
              <div className="grid grid-cols-3 gap-2.5">
                {CANDYLAND.amenities.map((a, i, all) => {
                  const Icon = AMENITY_ICON[a.icono] ?? ShieldCheck;
                  // La última tarjeta llena lo que queda de su fila (sin huecos con 4, 5, 7… ítems).
                  const left = all.length % 3;
                  const wide = i === all.length - 1 && left !== 0 ? (left === 1 ? 'col-span-3 flex-row aspect-auto py-4' : 'col-span-2 flex-row aspect-auto') : 'aspect-square flex-col';
                  return (
                    <motion.div
                      key={a.texto}
                      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 + i * 0.04 }}
                      className={`account-glass flex items-center justify-center gap-2 rounded-[22px] p-2 text-center ${wide}`}
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-pink-400/15"><Icon className="h-5 w-5 text-pink-300" /></span>
                      <span className="text-caption1 font-semibold leading-tight">{a.texto}</span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>

            <motion.section {...reveal(4)} className="account-glass mt-8 rounded-[26px] p-5">
              <p className="text-caption1 font-semibold uppercase tracking-[0.18em] text-pink-300">Dress code</p>
              <p className="mt-2 text-body leading-relaxed text-white/85">{EVENT_BRAND.dressCode}</p>
              <p className="mt-3 text-footnote text-white/55">Trae tu carnet o pasaporte: lo piden en la puerta junto al QR de tu entrada.</p>
            </motion.section>

            {onMore && (
              <motion.div {...reveal(5)} className="account-glass mt-4 divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">
                {([['faq', 'Preguntas frecuentes', CircleHelp], ['legal', 'Políticas', FileText]] as const).map(([kind, label, Icon]) => (
                  <button key={kind} type="button" onClick={() => onMore(kind)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-body">
                    <Icon className="h-5 w-5 text-pink-300" /><span className="flex-1">{label}</span><ChevronRight className="h-4 w-4 text-white/40" />
                  </button>
                ))}
              </motion.div>
            )}

            <p className="mt-6 text-center text-footnote text-white/45">{BRAND.valores.join(' · ')} · Evento +{BRAND.edadMinima}</p>
          </div>
          </div>

          <button
            type="button" onClick={onClose} aria-label="Cerrar"
            className="lg-pill absolute right-4 top-[max(14px,env(safe-area-inset-top))] z-10 grid h-10 w-10 place-items-center rounded-full"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Comprar, siempre a mano. */}
          <motion.div
            initial={{ y: 120 }} animate={{ y: 0 }} exit={{ y: 120 }} transition={{ delay: 0.12, type: 'spring', damping: 28, stiffness: 300 }}
            className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#0b0612] via-[#0b0612]/90 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-8"
          >
            <div className="mx-auto max-w-lg">
              {soldOut ? (
                <p className="flex h-14 items-center justify-center rounded-full bg-white/10 text-headline font-semibold text-white/70">Entradas agotadas</p>
              ) : (
                <Link href={`/checkout/${event.slug}`} onClick={onClose} className="flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-semibold text-white shadow-[0_12px_32px_-10px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.35)] interactive">
                  Comprar entrada{from != null ? ` · Desde ${clp(from)}` : ''} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
