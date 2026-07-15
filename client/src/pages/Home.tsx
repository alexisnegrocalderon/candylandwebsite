import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  Calendar,
  Car,
  Cigarette,
  Clock,
  Gamepad2,
  Instagram,
  Lollipop,
  MapPin,
  Martini,
  MessageCircle,
  Music,
  Music2,
  ShieldCheck,
  Shirt,
  Sparkles,
  Ticket,
  VenetianMask,
} from 'lucide-react';
import { Link } from 'wouter';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { trpc } from '@/lib/trpc';
import { CANDYLAND, formatCLP } from '@/config/candyland';
import CandyIntro from '@/components/CandyIntro';
import { scrollToId, prefersReducedMotion } from '@/lib/smoothScroll';
import { isMissionWindowOpen, missionDepositPrice } from '@shared/mission300';

type MissionPricing = { generalPrice: number; depositPrice: number } | null;

/* ─── Utilidades ───────────────────────────────────────────── */

const AMENITY_ICONS: Record<string, typeof Music> = {
  Music, Car, Shirt, Gamepad2, VenetianMask, Martini, Cigarette, ShieldCheck,
};

const reveal = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.23, 1, 0.32, 1] as const },
};

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now);
  return {
    dias: Math.floor(diff / 86_400_000),
    horas: Math.floor((diff / 3_600_000) % 24),
    minutos: Math.floor((diff / 60_000) % 60),
    segundos: Math.floor((diff / 1000) % 60),
    esHoy: diff === 0,
  };
}

/** Anima un número desde su valor previo hasta `target` (easeOutCubic). */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Dispara un id incremental cada vez que `value` sube (para animar un "burst"). */
function useIncreaseBurst(value: number) {
  const [burstId, setBurstId] = useState(0);
  const prevRef = useRef(value);
  useEffect(() => {
    if (value > prevRef.current) setBurstId((n) => n + 1);
    prevRef.current = value;
  }, [value]);
  return burstId;
}

/* ─── Anillo de progreso (contador Misión 300) ─────────────── */

/**
 * Anillo de progreso Misión 300: reemplaza la vieja "máquina de dulces" por
 * un aro moderno con gradiente candy que se llena según el avance. Cuando
 * `dropId` cambia (compra confirmada) se dispara un pequeño brillo ✨.
 */
function MissionRing({ pct, dropId }: { pct: number; dropId: number }) {
  const size = 176;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, pct)) / 100);

  return (
    <div className="relative w-36 h-36 md:w-44 md:h-44 shrink-0 select-none" aria-hidden>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#missionRingGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: [0.23, 1, 0.32, 1] }}
        />
        <defs>
          <linearGradient id="missionRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-primary)" />
            <stop offset="50%" stopColor="var(--color-cherry)" />
            <stop offset="100%" stopColor="var(--color-violet-electric)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full glass-candy flex items-center justify-center">
          <Lollipop className="w-8 h-8 md:w-10 md:h-10 text-primary" strokeWidth={1.5} />
        </div>
      </div>
      <AnimatePresence>
        {dropId > 0 && (
          <motion.span
            key={dropId}
            className="absolute top-0 right-0 text-2xl md:text-3xl"
            initial={{ scale: 0, opacity: 0, y: 6 }}
            animate={{ scale: 1.1, opacity: 1, y: -6 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.6, ease: [0.34, 1.4, 0.64, 1] }}
          >
            ✨
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Capa global de caramelos que derivan con el scroll (sutil, detrás del contenido) */
function ScrollCandies() {
  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 1], ['-5vh', '55vh']);
  const y2 = useTransform(scrollYProgress, [0, 1], ['10vh', '-45vh']);
  const y3 = useTransform(scrollYProgress, [0, 1], ['0vh', '70vh']);
  const rot = useTransform(scrollYProgress, [0, 1], [0, 260]);
  if (prefersReducedMotion()) return null;
  return (
    <div aria-hidden className="fixed inset-0 z-[5] pointer-events-none overflow-hidden">
      <motion.span style={{ y: y1, rotate: rot }} className="absolute left-[4%] top-[20%] text-6xl md:text-8xl opacity-[0.12] blur-[1px]">🍬</motion.span>
      <motion.span style={{ y: y2, rotate: rot }} className="absolute right-[6%] top-[35%] text-5xl md:text-7xl opacity-[0.12] blur-[1px]">🍭</motion.span>
      <motion.span style={{ y: y3 }} className="absolute left-[46%] top-[60%] text-5xl md:text-7xl opacity-[0.1] blur-[1px]">🫧</motion.span>
    </div>
  );
}

/* Caramelos arrastrables — juego en el hero (touch + mouse) */
const CANDIES = [
  { emoji: '🍭', left: '8%', top: '22%', size: 'text-5xl md:text-7xl', dur: 3.5 },
  { emoji: '🍬', left: '82%', top: '18%', size: 'text-4xl md:text-6xl', dur: 4.2 },
  { emoji: '🍒', left: '14%', top: '68%', size: 'text-4xl md:text-6xl', dur: 5 },
  { emoji: '🍥', left: '86%', top: '64%', size: 'text-5xl md:text-7xl', dur: 4.6 },
  { emoji: '🫧', left: '46%', top: '12%', size: 'text-3xl md:text-5xl', dur: 6 },
];

function DraggableCandies({ boundsRef }: { boundsRef: React.RefObject<HTMLElement | null> }) {
  return (
    <>
      {CANDIES.map((c, i) => (
        <motion.span
          key={i}
          drag
          dragConstraints={boundsRef}
          dragElastic={0.4}
          dragMomentum
          whileDrag={{ scale: 1.25, zIndex: 30 }}
          whileTap={{ scale: 1.15 }}
          className={`absolute ${c.size} select-none cursor-grab active:cursor-grabbing z-20 drop-shadow-[0_4px_20px_oklch(0.68_0.16_340_/_0.35)] touch-none`}
          style={{ left: c.left, top: c.top }}
          animate={{ y: [0, -16, 0], rotate: [0, 8, 0] }}
          transition={{ duration: c.dur, repeat: Infinity, ease: 'easeInOut' }}
        >
          {c.emoji}
        </motion.span>
      ))}
    </>
  );
}

/* ─── Hero ─────────────────────────────────────────────────── */

function Hero({ missionPricing }: { missionPricing: MissionPricing }) {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '-15%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={sectionRef} className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">
      {/* Fondo: el video candy define la paleta del sitio, con un velo claro
          suficiente para que el texto se lea sin taparle el color. */}
      <motion.div className="absolute inset-0" style={{ y: bgY }}>
        <img
          src="/candyland/poster-hero.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover opacity-30 blur-3xl scale-125"
        />
        <video
          className="absolute inset-0 w-full h-full object-cover opacity-90 saturate-[1.15] motion-reduce:hidden"
          src="/candyland/hero-video.mp4"
          poster="/candyland/poster-hero.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      </motion.div>
      {/* Viñeta oscura centrada en el texto (contraste) + degradé claro solo
       * en el borde inferior (transición a la sección siguiente) — el resto
       * del video queda a color fuerte en vez de lavado con el fondo claro. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_42%,oklch(0.18_0.04_330/0.45),transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

      {/* Brillos de club */}
      <div aria-hidden className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/25 blur-[120px] candy-float-slow" />
      <div aria-hidden className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-violet-electric/20 blur-[140px] candy-float" />
      <div aria-hidden className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-candy-blue/20 blur-[110px] candy-float-slow" />

      {/* Caramelos arrastrables (juego) */}
      <DraggableCandies boundsRef={sectionRef} />

      <motion.div style={{ y: contentY, opacity: contentOpacity }} className="relative z-10 text-center px-4 max-w-5xl mx-auto pt-24 pb-20">
        <motion.img
          src="/candyland/logo-wordmark.webp"
          alt="Mansion Playroom"
          className="h-16 md:h-20 w-auto mx-auto mb-6 drop-shadow-[0_0_25px_oklch(0.68_0.16_340_/_0.3)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="text-xs md:text-sm uppercase tracking-[0.35em] text-foreground/70 mb-4"
        >
          {CANDYLAND.valores.join(' · ')}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 50, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="font-heading font-extrabold text-[clamp(1.7rem,8.5vw,6.2rem)] leading-[0.95] tracking-tight drop-shadow-[0_4px_30px_oklch(0.76_0.13_35_/_0.25)] whitespace-normal sm:whitespace-nowrap break-words"
          aria-label={CANDYLAND.nombre}
        >
          {/* Letras interactivas: hover material candy en desktop, shimmer automático en móvil */}
          {CANDYLAND.nombre.split('').map((ch, i) => (
            <span key={i} aria-hidden className="candy-letter" style={{ animationDelay: `${i * 0.22}s` }}>
              {ch}
            </span>
          ))}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.55 }}
          className="mt-6 text-xl md:text-2xl text-foreground/90 font-medium"
        >
          {CANDYLAND.heroTitulo}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm md:text-base"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-candy">
            <Calendar className="w-4 h-4 text-primary" /> {CANDYLAND.fechaTexto}
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-candy">
            <Clock className="w-4 h-4 text-primary" /> {CANDYLAND.horarioTexto}
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-candy">
            <MapPin className="w-4 h-4 text-primary" /> {CANDYLAND.ciudad}
          </span>
        </motion.div>

        {missionPricing && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.78 }}
            className="mt-6 flex justify-center"
          >
            <span className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-5 py-2.5 rounded-full glass-candy border border-cherry/40 shadow-[0_0_24px_oklch(0.76_0.13_35_/_0.2)]">
              <span className="text-[10px] md:text-xs uppercase tracking-[0.15em] font-bold text-cherry">🔥 Misión 300</span>
              <span className="line-through text-muted-foreground text-sm">{formatCLP(missionPricing.generalPrice)}</span>
              <span className="font-heading font-extrabold text-lg md:text-xl text-gradient-candy">{formatCLP(missionPricing.depositPrice)}</span>
              <span className="text-xs md:text-sm text-foreground/80">reserva tu lugar hoy</span>
            </span>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.85 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href={`/checkout/${CANDYLAND.slug}`}
            className="btn-jelly inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-full text-lg font-bold uppercase tracking-wide interactive"
          >
            <Ticket className="w-5 h-5" />
            Comprar entrada
          </Link>
          <button
            type="button"
            onClick={() => scrollToId('proximos-eventos')}
            className="inline-flex items-center gap-2 px-8 py-4 border border-primary/40 text-foreground rounded-full text-base font-semibold hover:border-primary hover:text-primary transition-colors interactive"
          >
            Próximos Eventos
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ─── Próximos Eventos ─────────────────────────────────────── */

type HomeEventItem = {
  id: string;
  title: string;
  date: Date;
  dateLabel: string;
  venue?: string | null;
  imageUrl: string;
  isPast: boolean;
  featured: boolean;
  href: string;
};

function EventCard({ event, size = 'normal' }: { event: HomeEventItem; size?: 'featured' | 'normal' | 'small' }) {
  const isFeatured = size === 'featured';
  const isSmall = size === 'small';
  return (
    <Link
      href={event.href}
      className={`group relative block rounded-2xl md:rounded-3xl overflow-hidden glass-candy interactive ${
        isFeatured ? 'aspect-[16/10] md:aspect-[21/9]' : isSmall ? 'aspect-square' : 'aspect-[4/5]'
      }`}
    >
      <img
        src={event.imageUrl}
        alt={event.title}
        loading="lazy"
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${
          event.isPast ? 'grayscale group-hover:grayscale-0 opacity-80 group-hover:opacity-100' : 'group-hover:scale-105'
        }`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
      {event.featured && !event.isPast && (
        <span className="absolute top-3 left-3 md:top-4 md:left-4 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] md:text-xs font-bold uppercase tracking-wide">
          ✨ Próximo evento
        </span>
      )}
      {event.isPast && (
        <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-muted/90 text-muted-foreground text-[9px] font-bold uppercase tracking-wide">
          Finalizado
        </span>
      )}
      <div className={`absolute bottom-0 inset-x-0 p-3 md:p-5 ${isFeatured ? 'md:p-8' : ''}`}>
        <p className={`flex items-center gap-1.5 text-primary font-semibold mb-1 ${isSmall ? 'text-[10px]' : 'text-xs md:text-sm'}`}>
          <Calendar className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5 md:w-4 md:h-4'} /> {event.dateLabel}
        </p>
        <h3 className={`font-heading font-bold text-foreground leading-tight ${isFeatured ? 'text-2xl md:text-4xl' : isSmall ? 'text-sm' : 'text-lg md:text-xl'}`}>
          {event.title}
        </h3>
        {event.venue && !isSmall && (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs md:text-sm mt-1">
            <MapPin className="w-3.5 h-3.5" /> {event.venue}
          </p>
        )}
        {isFeatured && !event.isPast && (
          <span className="btn-jelly inline-flex items-center gap-2 mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide">
            <Ticket className="w-4 h-4" /> Comprar entrada
          </span>
        )}
      </div>
    </Link>
  );
}

function UpcomingEventsSection() {
  const { data } = trpc.events.listForHome.useQuery(undefined, { retry: false });
  const now = Date.now();

  const dbEvents = data ?? [];
  const hasRealCandyland = dbEvents.some((e: any) => e.slug === CANDYLAND.slug);

  // Fallback solo mientras el evento no exista todavía en la base de datos
  // (demo/config mode) — una vez que el admin lo carga, se usa el real (con
  // su propio flyer e info) en vez de este placeholder.
  const staticEvent: HomeEventItem = {
    id: 'static-candyland',
    title: CANDYLAND.nombre,
    date: CANDYLAND.eventDate,
    dateLabel: CANDYLAND.fechaTexto,
    venue: CANDYLAND.ciudad,
    imageUrl: '/candyland/poster-hero.webp',
    isPast: CANDYLAND.eventDate.getTime() < now,
    featured: true,
    href: `/checkout/${CANDYLAND.slug}`,
  };

  const mapped: HomeEventItem[] = dbEvents.map((e: any) => {
    const date = new Date(e.eventDate);
    return {
      id: String(e.id),
      title: e.title,
      date,
      dateLabel: date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
      venue: e.venue,
      imageUrl: e.imageUrl || '/candyland/poster-hero.webp',
      isPast: e.status === 'past' || date.getTime() < now,
      featured: !!e.featured,
      href: `/checkout/${e.slug}`,
    };
  });

  const all = hasRealCandyland ? mapped : [staticEvent, ...mapped];
  const upcoming = all.filter((e) => !e.isPast).sort((a, b) => a.date.getTime() - b.date.getTime());
  const past = all.filter((e) => e.isPast).sort((a, b) => b.date.getTime() - a.date.getTime());

  // El destacado: el que el admin marcó featured, o si no hay ninguno, el próximo más cercano.
  const featuredEvent = upcoming.find((e) => e.featured) ?? upcoming[0];
  const restUpcoming = upcoming.filter((e) => e.id !== featuredEvent?.id);

  if (!featuredEvent && past.length === 0) return null;

  return (
    <section id="proximos-eventos" className="relative scroll-mt-24 py-20 md:py-28">
      <div className="container">
        <motion.div {...reveal} className="max-w-2xl mb-10 md:mb-12">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Calendario</p>
          <h2 className="font-heading font-bold text-4xl md:text-6xl tracking-tight">
            Próximos <span className="text-gradient-candy">Eventos</span>
          </h2>
        </motion.div>

        {featuredEvent && (
          <motion.div {...reveal} className="mb-6 md:mb-8">
            <EventCard event={{ ...featuredEvent, featured: true }} size="featured" />
          </motion.div>
        )}

        {restUpcoming.length > 0 && (
          <motion.div {...reveal} className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-12 md:mb-16">
            {restUpcoming.map((e) => (
              <EventCard key={e.id} event={e} size="normal" />
            ))}
          </motion.div>
        )}

        {past.length > 0 && (
          <motion.div {...reveal}>
            <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground mb-4">Ediciones anteriores</p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
              {past.map((e) => (
                <EventCard key={e.id} event={e} size="small" />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

/* ─── Countdown + Misión 300 ───────────────────────────────── */

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary via-cherry to-violet-electric shadow-[0_4px_16px_oklch(0.68_0.16_340_/_0.35)] flex items-center justify-center overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-white/10 mix-blend-overlay" />
        <span className="font-heading font-extrabold text-xl md:text-3xl tabular-nums text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)]">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[9px] md:text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{label}</span>
    </div>
  );
}

function UrgencySection({ vendidos, missionPricing }: { vendidos: number; missionPricing: MissionPricing }) {
  const { dias, horas, minutos, segundos, esHoy } = useCountdown(CANDYLAND.eventDate);
  const { meta, titulo, copy } = CANDYLAND.mision;
  const progreso = Math.min(100, Math.round((vendidos / meta) * 100));
  const displayCount = useCountUp(vendidos);
  const burstId = useIncreaseBurst(vendidos);
  const soldOut = vendidos >= meta;

  return (
    <section className="relative py-10 md:py-14 overflow-hidden">
      <div aria-hidden className="absolute -top-16 left-[10%] w-72 h-72 rounded-full bg-primary/15 blur-[100px] candy-float-slow" />
      <div aria-hidden className="absolute -bottom-20 right-[8%] w-80 h-80 rounded-full bg-cherry/15 blur-[110px] candy-float" />

      <div className="container relative space-y-6 md:space-y-8">
        {/* Countdown — más presencia: pastillas con degradé candy en vez de texto plano */}
        <motion.div
          {...reveal}
          className="relative glass-candy rounded-2xl px-5 py-4 md:px-8 md:py-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 overflow-hidden"
        >
          <div aria-hidden className="absolute -top-10 left-1/4 w-48 h-48 rounded-full bg-primary/20 blur-[80px]" />
          <p className="relative text-[10px] md:text-xs uppercase tracking-[0.25em] text-cherry font-bold inline-flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-cherry candy-pulse inline-block" />
            {esHoy ? '¡Es hoy! 🍭' : 'Cuenta regresiva'}
          </p>
          <div className="relative flex items-center gap-2 md:gap-3">
            <CountdownUnit value={dias} label="Días" />
            <span className="text-lg md:text-2xl font-heading font-bold text-primary/40 -mt-3">:</span>
            <CountdownUnit value={horas} label="Hrs" />
            <span className="text-lg md:text-2xl font-heading font-bold text-primary/40 -mt-3">:</span>
            <CountdownUnit value={minutos} label="Min" />
            <span className="text-lg md:text-2xl font-heading font-bold text-primary/40 -mt-3">:</span>
            <CountdownUnit value={segundos} label="Seg" />
          </div>
          <p className="relative text-muted-foreground text-xs md:text-sm shrink-0">
            {CANDYLAND.fechaTexto} · {CANDYLAND.horarioTexto}
          </p>
        </motion.div>

        {/* Misión 300 — a todo el ancho, con espacio para respirar */}
        <motion.div {...reveal} className="relative glass-candy rounded-3xl p-6 md:p-10 overflow-visible">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
            <div className="relative shrink-0">
              <div aria-hidden className="absolute inset-0 rounded-full bg-primary/25 blur-3xl candy-glow-pulse" />
              <MissionRing pct={progreso} dropId={burstId} />
            </div>

            <div className="flex-1 text-center md:text-left w-full">
              <h3 className="font-heading font-bold text-xl md:text-2xl text-gradient-candy mb-1">{titulo}</h3>
              <div className="flex items-baseline justify-center md:justify-start flex-wrap gap-x-2 gap-y-0.5">
                <span className="font-heading font-extrabold text-4xl md:text-5xl text-gradient-candy tabular-nums" aria-live="polite">
                  {displayCount}
                </span>
                <span className="font-heading font-bold text-lg md:text-xl text-muted-foreground">/{meta}</span>
                <span className="text-sm md:text-base font-semibold text-foreground/85">ya entraron</span>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">{copy}</p>

              {missionPricing && (
                <p className="mt-2.5 inline-flex flex-wrap items-baseline justify-center md:justify-start gap-x-2 gap-y-0.5 text-sm md:text-base">
                  <span className="text-muted-foreground">Hoy pagas</span>
                  <span className="font-heading font-extrabold text-gradient-candy text-lg md:text-xl">{formatCLP(missionPricing.depositPrice)}</span>
                  <span className="text-muted-foreground">por tu lugar ·</span>
                  <span className="line-through text-muted-foreground">{formatCLP(missionPricing.generalPrice)}</span>
                  <span className="text-muted-foreground">valor general</span>
                </p>
              )}

              <AnimatePresence>
                {burstId > 0 && (
                  <motion.p
                    key={burstId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-xs md:text-sm text-primary font-semibold mt-2"
                  >
                    ✨ Una persona más se suma a la noche
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="h-3.5 rounded-full bg-muted overflow-hidden mt-4">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progreso}%` }}
                  transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric relative overflow-hidden"
                >
                  <span className="absolute inset-0 candy-bar-shine" />
                </motion.div>
              </div>

              {soldOut ? (
                <div className="mt-5 w-full md:w-auto text-center px-6 py-3 rounded-full bg-muted text-muted-foreground text-sm font-bold uppercase tracking-wide" role="status">
                  Candyland está completo · Sold out
                </div>
              ) : (
                <Link
                  href={`/checkout/${CANDYLAND.slug}`}
                  className="btn-jelly mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide interactive"
                >
                  🍭 Quiero mi dulce · Comprar entrada
                </Link>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── La Experiencia ───────────────────────────────────────── */

function ExperienceSection() {
  return (
    <section id="experiencia" className="py-24 md:py-32 relative overflow-hidden">
      <div className="container">
        <motion.div {...reveal} className="max-w-3xl mb-16">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">La experiencia</p>
          <h2 className="font-heading font-bold text-4xl md:text-6xl tracking-tight leading-[1.05]">
            Dulces de lujo,
            <br />
            <span className="text-gradient-candy">después de medianoche.</span>
          </h2>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
            {CANDYLAND.tagline}. Dos pistas, luces de club, caramelos translúcidos y una mansión
            entera para perderte. Esto no es una fiesta más: es un universo donde el juego es la regla.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {CANDYLAND.amenities.map((a) => {
            const Icon = AMENITY_ICONS[a.icono] ?? Sparkles;
            return (
              <motion.div
                key={a.texto}
                variants={{
                  hidden: { opacity: 0, y: 26, scale: 0.92 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] } },
                }}
                whileHover={{ y: -4, scale: 1.03 }}
                className="glass-candy rounded-2xl p-5 flex items-center gap-3 hover:border-primary/40 transition-colors"
              >
                <motion.span
                  whileHover={{ rotate: [0, -12, 10, -6, 0] }}
                  transition={{ duration: 0.6 }}
                  className="inline-flex shrink-0"
                >
                  <Icon className="w-6 h-6 text-primary" />
                </motion.span>
                <span className="text-sm md:text-base font-medium">{a.texto}</span>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Line-up ──────────────────────────────────────────────── */

/* Identidad visual por pista (EDITABLE) */
const PISTA_SKINS: Record<string, { grad: string; bar: string; emoji: string }> = {
  PERREO: { grad: 'from-primary/35 via-cherry/20 to-transparent', bar: 'bg-primary', emoji: '🍑' },
  TECH: { grad: 'from-candy-blue/35 via-violet-electric/20 to-transparent', bar: 'bg-candy-blue', emoji: '🤖' },
};

function LineupSection() {
  const hayLineup = CANDYLAND.lineup.length > 0;
  const [activa, setActiva] = useState<string | null>(null);

  return (
    <section className="py-14 md:py-20 bg-gradient-to-b from-transparent via-violet-electric/5 to-transparent">
      <div className="container">
        <motion.div {...reveal} className="mb-6 md:mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-2">Line-up</p>
          <h2 className="font-heading font-bold text-2xl md:text-4xl tracking-tight">
            Elige tu <span className="text-gradient-candy">energía</span>
          </h2>
        </motion.div>

        {/* Split de energía: la pista activa se expande, la otra respira */}
        <motion.div {...reveal} className="flex gap-2 md:gap-3 h-56 md:h-64">
          {CANDYLAND.pistas.map((pista) => {
            const skin = PISTA_SKINS[pista.genero] ?? PISTA_SKINS.PERREO;
            const isActive = activa === pista.genero;
            const isDimmed = activa !== null && !isActive;
            return (
              <div
                key={pista.nombre}
                onPointerEnter={() => setActiva(pista.genero)}
                onPointerLeave={() => setActiva(null)}
                onClick={() => setActiva(isActive ? null : pista.genero)}
                className={`relative rounded-2xl overflow-hidden glass-candy cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  isActive ? 'flex-[2]' : isDimmed ? 'flex-[0.75] opacity-70' : 'flex-1'
                }`}
              >
                {/* Fondo de energía */}
                <div className={`absolute inset-0 bg-gradient-to-t ${skin.grad}`} />

                {/* Ecualizador animado */}
                <div aria-hidden className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1 md:gap-1.5 h-1/2 px-4 opacity-50">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span
                      key={i}
                      className={`eq-bar w-1.5 md:w-2 rounded-t-full ${skin.bar} ${isActive ? '' : 'eq-bar-idle'}`}
                      style={{ animationDelay: `${i * 0.12}s`, height: `${18 + ((i * 37) % 55)}%` }}
                    />
                  ))}
                </div>

                {/* Contenido */}
                <div className="relative h-full flex flex-col justify-end p-4 md:p-6">
                  <p className="text-[10px] md:text-xs uppercase tracking-[0.25em] text-foreground/60 mb-0.5">{pista.nombre}</p>
                  <h3 className="font-heading font-extrabold text-2xl md:text-4xl text-gradient-candy leading-none mb-1">
                    {skin.emoji} {pista.genero}
                  </h3>
                  <p className={`text-foreground/70 text-xs md:text-sm transition-opacity duration-300 ${isDimmed ? 'opacity-0' : 'opacity-100'}`}>
                    {pista.descripcion}
                  </p>

                  <div className="mt-2 space-y-1">
                    {hayLineup ? (
                      CANDYLAND.lineup
                        .filter((dj) => dj.pista === pista.genero)
                        .map((dj) => (
                          <div key={dj.nombre} className="flex items-center gap-2 text-xs md:text-sm">
                            <Music2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-semibold">{dj.nombre}</span>
                            {dj.horario && <span className="text-muted-foreground">{dj.horario}</span>}
                          </div>
                        ))
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 text-[10px] md:text-xs text-primary transition-opacity duration-300 ${isDimmed ? 'opacity-0' : 'opacity-100'}`}>
                        <Sparkles className="w-3 h-3" /> Por anunciar
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Info esencial + FAQ ──────────────────────────────────── */

function InfoSection() {
  return (
    <section className="py-24 md:py-32 bg-gradient-to-b from-transparent via-primary/5 to-transparent">
      <div className="container max-w-3xl">
        <motion.div {...reveal}>
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4 text-center">Lo esencial</p>
          <h2 className="font-heading font-bold text-4xl md:text-5xl tracking-tight mb-8 text-center">
            Todo lo que necesitas <span className="text-gradient-candy">saber</span>
          </h2>

          <Accordion type="single" collapsible className="w-full">
            {CANDYLAND.faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-primary/15">
                <AccordionTrigger className="text-left text-base md:text-lg font-semibold hover:text-primary">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── CTA final ────────────────────────────────────────────── */

function FinalCTASection() {
  return (
    <section className="relative py-28 md:py-40 overflow-hidden">
      <img
        src="/candyland/poster-hero.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-25 blur-2xl scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/70 to-background" />
      <div aria-hidden className="absolute inset-0 flex items-center justify-center">
        <div className="w-[36rem] h-[36rem] rounded-full bg-primary/15 blur-[150px]" />
      </div>

      <motion.div {...reveal} className="container relative text-center max-w-3xl">
        <img
          src="/candyland/logo-wordmark.webp"
          alt=""
          aria-hidden
          className="h-24 w-auto mx-auto mb-8 candy-float drop-shadow-[0_0_25px_oklch(0.68_0.16_340_/_0.3)]"
        />
        <h2 className="font-heading font-bold text-4xl md:text-7xl tracking-tight leading-[1.02] mb-6">
          Tu entrada es la llave a{' '}
          <span className="text-gradient-candy">Candyland.</span>
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground mb-10">
          {CANDYLAND.fechaTexto} · {CANDYLAND.horarioTexto} · {CANDYLAND.ciudad}
        </p>
        <Link
          href={`/checkout/${CANDYLAND.slug}`}
          className="btn-jelly inline-flex items-center gap-3 px-12 py-6 bg-primary text-primary-foreground rounded-full text-xl font-bold uppercase tracking-wide interactive"
        >
          <Ticket className="w-6 h-6" />
          Comprar entrada ahora
        </Link>
      </motion.div>
    </section>
  );
}

/* ─── Footer ───────────────────────────────────────────────── */

/** Bar con avatar + seguidores/publicaciones — más confianza que un ícono suelto. */
function InstagramBar() {
  const { data: settings } = trpc.settings.get.useQuery();
  const followers = settings?.instagramFollowers ?? 0;
  const posts = settings?.instagramPosts ?? 0;
  const handle = CANDYLAND.redes.instagram.split('/').filter(Boolean).pop();
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n));

  return (
    <a
      href={CANDYLAND.redes.instagram}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-candy rounded-full pl-2.5 pr-5 py-2 flex items-center gap-3 hover:border-primary/50 transition-colors interactive"
    >
      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-primary via-cherry to-violet-electric flex items-center justify-center shrink-0">
        <Instagram className="w-4.5 h-4.5 text-white" />
      </span>
      <span className="flex flex-col leading-tight text-left">
        <span className="text-xs font-bold text-foreground">@{handle}</span>
        {(followers > 0 || posts > 0) && (
          <span className="text-[11px] text-muted-foreground">{fmt(followers)} seguidores · {fmt(posts)} publicaciones</span>
        )}
      </span>
    </a>
  );
}

function Footer() {
  return (
    <footer className="border-t border-primary/15 py-14">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <img src="/candyland/logo-wordmark.webp" alt="Mansion Playroom" className="h-12 w-auto" />

          <div className="flex items-center gap-5">
            <InstagramBar />
            <a
              href={CANDYLAND.redes.tiktok}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
              className="w-11 h-11 rounded-full glass-candy flex items-center justify-center hover:border-primary/50 transition-colors interactive"
            >
              <Music2 className="w-5 h-5 text-primary" />
            </a>
            <a
              href={CANDYLAND.redes.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="w-11 h-11 rounded-full glass-candy flex items-center justify-center hover:border-primary/50 transition-colors interactive"
            >
              <MessageCircle className="w-5 h-5 text-primary" />
            </a>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Mansion Playroom · La Evolución del Carrete</p>
          <div className="flex items-center gap-6">
            <span className="px-3 py-1 rounded-full border border-cherry/40 text-cherry font-bold text-xs">+{CANDYLAND.edadMinima}</span>
            <a href="#" className="hover:text-foreground transition-colors">Términos</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacidad</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ─── CTA sticky móvil ─────────────────────────────────────── */

function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 96 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="fixed bottom-0 inset-x-0 z-40 p-3 md:hidden"
    >
      <Link
        href={`/checkout/${CANDYLAND.slug}`}
        className="btn-jelly w-full py-4 bg-primary text-primary-foreground rounded-full font-bold uppercase tracking-wide text-base shadow-[0_-4px_24px_oklch(0.68_0.16_340_/_0.25)] inline-flex items-center justify-center gap-2"
      >
        <Ticket className="w-5 h-5" />
        Comprar acceso
      </Link>
    </motion.div>
  );
}

/* ─── Página ───────────────────────────────────────────────── */

export default function Home() {
  const { data: liveTickets } = trpc.events.getTicketTypes.useQuery(
    { slug: CANDYLAND.slug },
    // Polling suave: con DB conectada, el contador Misión 300 se actualiza solo
    // cuando entran compras aprobadas (webhook MP → soldCount). Sin DB, no-op.
    { retry: false, refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  const vendidos = useMemo(() => {
    if (liveTickets && liveTickets.length > 0) {
      // Cuenta PERSONAS: cada entrada vendida suma según el acceso (dúo=2, trío=3…)
      return liveTickets.reduce((s, t) => {
        const acc = CANDYLAND.accesos.find((a) => a.nombre.toLowerCase() === (t as any).name?.toLowerCase());
        const personas = acc?.personas ?? 1;
        return s + (t.soldCount ?? 0) * personas;
      }, 0);
    }
    return CANDYLAND.mision.confirmadosFallback;
  }, [liveTickets]);

  // Precio "gancho" para publicitar la preventa Misión 300 en el Hero y en su
  // propia sección: prioriza el acceso Dúo (el que se usa en toda la
  // comunicación de la preventa) y si no existe usa el acceso más barato.
  const missionPricing: MissionPricing = useMemo(() => {
    if (!liveTickets || liveTickets.length === 0) return null;
    if (!isMissionWindowOpen(new Date(CANDYLAND.eventDate))) return null;
    const accesos = liveTickets.filter((t: any) => t.category === 'acceso' && t.status === 'active');
    if (accesos.length === 0) return null;
    const destacado = accesos.find((t: any) => t.accesoSlug === 'duo')
      ?? [...accesos].sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];
    const generalPrice = Number((destacado as any).price);
    const depositPrice = missionDepositPrice((destacado as any).accesoSlug);
    if (!(depositPrice < generalPrice)) return null;
    return { generalPrice, depositPrice };
  }, [liveTickets]);

  return (
    <MotionConfig reducedMotion="user">
      <CandyIntro />
      <ScrollCandies />
      <div className="noise-overlay" />
      <Hero missionPricing={missionPricing} />
      <UpcomingEventsSection />
      <UrgencySection vendidos={vendidos} missionPricing={missionPricing} />
      <LineupSection />
      <ExperienceSection />
      <InfoSection />
      <FinalCTASection />
      <Footer />
      <StickyMobileCTA />
    </MotionConfig>
  );
}
