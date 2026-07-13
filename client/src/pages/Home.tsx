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
  MapPin,
  Martini,
  MessageCircle,
  Minus,
  Music,
  Music2,
  Plus,
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
import { CANDYLAND, formatCLP, whatsappSolteroLink } from '@/config/candyland';
import CandyIntro from '@/components/CandyIntro';
import CandyPass from '@/components/CandyPass';
import { scrollToId, prefersReducedMotion } from '@/lib/smoothScroll';
import { cinematicOn, ensureScrollTrigger } from '@/lib/scrollFx';

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

function scrollToEntradas() {
  scrollToId('entradas');
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

/* ─── Frasco de dulces (contador Misión 300) ───────────────── */

const JAR_CANDIES = ['🍬', '🍭', '🍒', '🍡', '🧁', '🍩', '🍫', '🍪'];

/**
 * Frasco de vidrio que se llena de dulces según el avance de la Misión 300.
 * pct = porcentaje de llenado (0-100). Cuando `dropId` cambia, caen dulces
 * nuevos al frasco (animación de gravedad).
 */
function CandyJar({ pct, dropId }: { pct: number; dropId: number }) {
  // Dulces visibles ∝ porcentaje (grilla que se revela con el nivel)
  const filas = 6;
  const porFila = 4;
  return (
    <div className="relative w-36 md:w-44 shrink-0 select-none" aria-hidden>
      {/* Tapa */}
      <div className="h-4 md:h-5 mx-6 rounded-t-xl bg-gradient-to-b from-primary/70 to-primary/40 border border-white/25" />
      <div className="h-1.5 mx-3 rounded-full bg-white/20 mb-0.5" />

      {/* Cuerpo de vidrio */}
      <div className="relative h-44 md:h-52 rounded-b-3xl rounded-t-lg border-2 border-white/25 bg-white/[0.04] backdrop-blur-sm overflow-hidden">
        {/* Brillo de vidrio */}
        <div className="absolute top-2 left-2 w-1.5 h-3/4 rounded-full bg-white/20" />

        {/* Nivel de dulces */}
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(6, pct)}%` }}
          transition={{ duration: 1.4, ease: [0.23, 1, 0.32, 1] }}
          className="absolute bottom-0 inset-x-0 overflow-hidden"
        >
          <div className="absolute bottom-0 inset-x-0 h-44 md:h-52 flex flex-wrap-reverse content-start items-end justify-center gap-0.5 p-1 bg-gradient-to-t from-primary/25 via-violet-electric/15 to-transparent">
            {Array.from({ length: filas * porFila }).map((_, i) => (
              <span
                key={i}
                className="text-base md:text-lg leading-none"
                style={{ transform: `rotate(${((i * 47) % 40) - 20}deg)` }}
              >
                {JAR_CANDIES[i % JAR_CANDIES.length]}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Dulces cayendo al sumar personas */}
        <AnimatePresence>
          {dropId > 0 && (
            <motion.div key={dropId} className="absolute inset-0 pointer-events-none">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute text-lg"
                  style={{ left: `${25 + i * 22}%` }}
                  initial={{ top: '-14%', opacity: 1, rotate: 0 }}
                  animate={{ top: `${88 - pct * 0.8}%`, opacity: [1, 1, 0.9], rotate: 180 + i * 90 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7 + i * 0.15, ease: [0.34, 1.2, 0.64, 1] }}
                >
                  {JAR_CANDIES[(dropId + i) % JAR_CANDIES.length]}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
          className={`absolute ${c.size} select-none cursor-grab active:cursor-grabbing z-20 drop-shadow-[0_4px_20px_rgba(255,79,195,0.5)] touch-none`}
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

function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const contentY = useTransform(scrollYProgress, [0, 1], ['0%', '-15%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={sectionRef} className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">
      {/* Fondo: video en desktop (si el usuario no pide movimiento reducido), afiche siempre de base */}
      {/* Blur alto + overlay fuerte: el afiche aporta color, no texto (tiene la fecha de la edición pasada) */}
      <motion.div className="absolute inset-0" style={{ y: bgY }}>
        <img
          src="/candyland/poster-hero.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover opacity-30 blur-2xl scale-125"
        />
        <video
          className="absolute inset-0 w-full h-full object-cover opacity-35 hidden motion-safe:md:block"
          src="/candyland/hero-video.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background" />

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
          className="h-16 md:h-20 w-auto mx-auto mb-6 drop-shadow-[0_0_25px_rgba(255,79,195,0.35)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="text-xs md:text-sm uppercase tracking-[0.35em] text-candy-cream/80 mb-4"
        >
          {CANDYLAND.valores.join(' · ')}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 50, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="font-heading font-extrabold text-[clamp(2.6rem,8vw,6.2rem)] leading-[0.95] tracking-tight text-gradient-candy drop-shadow-[0_4px_30px_rgba(255,46,99,0.25)] whitespace-nowrap"
        >
          {CANDYLAND.nombre}
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

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.85 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={scrollToEntradas}
            className="btn-jelly inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-full text-lg font-bold uppercase tracking-wide interactive"
          >
            <Ticket className="w-5 h-5" />
            Comprar entrada
          </button>
          <button
            type="button"
            onClick={() => scrollToId('experiencia')}
            className="inline-flex items-center gap-2 px-8 py-4 border border-primary/40 text-foreground rounded-full text-base font-semibold hover:border-primary hover:text-primary transition-colors interactive"
          >
            Ver la experiencia
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ─── Countdown + Misión 300 ───────────────────────────────── */

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center min-w-[52px] md:min-w-[80px]">
      <span className="font-heading font-bold text-3xl md:text-6xl tabular-nums text-foreground">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-muted-foreground mt-1">{label}</span>
    </div>
  );
}

function UrgencySection({ vendidos }: { vendidos: number }) {
  const { dias, horas, minutos, segundos, esHoy } = useCountdown(CANDYLAND.eventDate);
  const { meta, titulo, copy } = CANDYLAND.mision;
  const progreso = Math.min(100, Math.round((vendidos / meta) * 100));
  const displayCount = useCountUp(vendidos);
  const burstId = useIncreaseBurst(vendidos);

  return (
    <section className="relative py-16 md:py-20 border-y border-primary/15 bg-gradient-to-r from-primary/10 via-violet-electric/10 to-candy-blue/10 overflow-hidden">
      {/* Blobs candy ambientales */}
      <div aria-hidden className="absolute -top-16 left-[10%] w-72 h-72 rounded-full bg-primary/20 blur-[100px] candy-float-slow" />
      <div aria-hidden className="absolute -bottom-20 right-[8%] w-80 h-80 rounded-full bg-cherry/20 blur-[110px] candy-float" />

      <div className="container relative grid lg:grid-cols-2 gap-12 items-center">
        <motion.div {...reveal} className="text-center lg:text-left">
          <p className="text-sm uppercase tracking-[0.3em] text-cherry font-semibold mb-4 inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cherry candy-pulse inline-block" />
            {esHoy ? '¡Es hoy!' : 'La cuenta regresiva empezó'}
          </p>
          <div className="flex items-center justify-center lg:justify-start gap-1.5 md:gap-6">
            <CountdownUnit value={dias} label="Días" />
            <span className="text-2xl md:text-3xl text-primary/50 font-heading">:</span>
            <CountdownUnit value={horas} label="Horas" />
            <span className="text-2xl md:text-3xl text-primary/50 font-heading">:</span>
            <CountdownUnit value={minutos} label="Min" />
            <span className="text-2xl md:text-3xl text-primary/50 font-heading">:</span>
            <CountdownUnit value={segundos} label="Seg" />
          </div>
          <p className="mt-4 text-muted-foreground text-sm md:text-base">
            {CANDYLAND.fechaTexto} · {CANDYLAND.horarioTexto} · {CANDYLAND.afterTexto}
          </p>
        </motion.div>

        <motion.div {...reveal} className="relative glass-candy rounded-3xl p-6 md:p-8 overflow-visible">
          <h3 className="font-heading font-bold text-xl md:text-2xl text-gradient-candy text-center mb-1">{titulo}</h3>
          <p className="text-center text-muted-foreground text-xs md:text-sm mb-5">{copy}</p>

          {/* Frasco de dulces + número: cada persona confirmada es un dulce más */}
          <div className="relative flex items-center justify-center gap-5 md:gap-8 mb-5">
            <div aria-hidden className="absolute w-44 h-44 md:w-52 md:h-52 rounded-full bg-primary/30 blur-3xl candy-glow-pulse" />
            <CandyJar pct={progreso} dropId={burstId} />
            <div className="relative flex flex-col items-start">
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading font-extrabold text-5xl md:text-6xl text-gradient-candy tabular-nums drop-shadow-[0_0_30px_rgba(255,79,195,0.55)]">
                  {displayCount}
                </span>
                <span className="font-heading font-bold text-xl md:text-2xl text-muted-foreground">/{meta}</span>
              </div>
              <span className="text-[10px] md:text-xs uppercase tracking-[0.25em] text-foreground/70 mt-1">
                personas confirmadas
              </span>
              <span className="text-[10px] md:text-xs text-muted-foreground mt-2">
                🍬 Cada acceso llena el frasco
              </span>
            </div>
          </div>

          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progreso}%` }}
              transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric relative overflow-hidden"
            >
              <span className="absolute inset-0 candy-bar-shine" />
            </motion.div>
          </div>

          <button
            onClick={scrollToEntradas}
            className="btn-jelly mt-5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide interactive"
          >
            Sumarme a la misión
            <ArrowRight className="w-4 h-4" />
          </button>
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

/* ─── Entradas ─────────────────────────────────────────────── */

type LiveTicket = {
  id: number;
  name: string;
  description: string | null;
  price: string;
  totalStock: number;
  soldCount: number;
  maxPerOrder: number;
  status: string;
};

function estadoBadge(estado: string) {
  switch (estado) {
    case 'last_tickets':
      return <span className="px-3 py-1 rounded-full bg-cherry/20 text-cherry text-xs font-bold uppercase tracking-wide candy-pulse">Últimos cupos</span>;
    case 'soldout':
      return <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-bold uppercase tracking-wide">Agotado</span>;
    case 'coming_soon':
      return <span className="px-3 py-1 rounded-full bg-candy-blue/20 text-candy-blue text-xs font-bold uppercase tracking-wide">Próximo tramo</span>;
    default:
      return null;
  }
}


function TicketCardLive({
  ticket,
  quantity,
  onChange,
}: {
  ticket: LiveTicket;
  quantity: number;
  onChange: (delta: number) => void;
}) {
  const disponibles = ticket.totalStock - ticket.soldCount;
  const agotado = ticket.status === 'soldout' || disponibles <= 0;
  const ultimos = !agotado && disponibles <= 10;
  return (
    <motion.div {...reveal} className={`glass-candy rounded-3xl p-6 flex flex-col ${agotado ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-heading font-bold text-2xl">{ticket.name}</h3>
        {agotado
          ? estadoBadge('soldout')
          : ultimos
            ? estadoBadge('last_tickets')
            : null}
      </div>
      {ticket.description && (
        <p className="text-muted-foreground text-sm mb-4">{ticket.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-4">
        <p className="font-heading font-bold text-2xl">{formatCLP(Number(ticket.price))}</p>
        {!agotado && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onChange(-1)}
              className="w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center hover:bg-primary/10 interactive"
              aria-label={`Quitar ${ticket.name}`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center font-bold tabular-nums">{quantity}</span>
            <button
              onClick={() => onChange(1)}
              className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 transition-transform interactive"
              aria-label={`Agregar ${ticket.name}`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* Hook: fija la sección y desplaza un track en horizontal con el scroll (GSAP+Lenis).
   Solo desktop (cinematicOn). En móvil no hace nada → el track queda swipe táctil. */
/**
 * Fija `triggerRef` en el viewport y desplaza `trackRef` en horizontal mientras
 * se hace scroll vertical. Si ambos refs son el mismo elemento, se pinea
 * exactamente ese elemento (sin arrastrar contenido extra como un heading).
 * `start: 'top 90px'` deja el elemento pineado siempre por debajo del navbar
 * fijo (h-20 ≈ 80px), evitando que el navbar tape su borde superior.
 */
function useHorizontalPin(
  triggerRef: React.RefObject<HTMLElement | null>,
  trackRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!cinematicOn() || !triggerRef.current || !trackRef.current) return;
    const trigger = triggerRef.current;
    const track = trackRef.current;
    const { gsap, ScrollTrigger } = ensureScrollTrigger();
    let kill = () => {};
    const ctx = gsap.context(() => {
      const distance = () => Math.max(0, track.scrollWidth - track.clientWidth);
      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger,
          start: 'top 90px',
          end: () => `+=${distance()}`,
          scrub: 1,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
      kill = () => tween.scrollTrigger?.kill();
    }, trigger);
    ScrollTrigger.refresh();
    return () => {
      kill();
      ctx.revert();
    };
  }, [triggerRef, trackRef]);
}

/* Accesos con scroll horizontal cinematográfico (desktop) / swipe táctil (móvil).
   Solo el riel de tarjetas se pinea (no el título) para que su alto quepa
   siempre en el viewport, sin cortar contenido. */
function CandyPassesSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useHorizontalPin(trackRef, trackRef);
  const accesos = CANDYLAND.accesos;

  const step = () => {
    const card = trackRef.current?.querySelector('.candy-perspective') as HTMLElement | null;
    return (card?.offsetWidth ?? 280) + 16;
  };
  const goTo = (i: number) => trackRef.current?.scrollTo({ left: i * step(), behavior: 'smooth' });
  const onScroll = () => {
    if (trackRef.current) setActive(Math.round(trackRef.current.scrollLeft / step()));
  };

  return (
    <section id="entradas" className="relative scroll-mt-24 py-20 md:py-28">
      <div aria-hidden className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[40rem] h-[20rem] rounded-full bg-primary/10 blur-[130px]" />
      <div className="container relative mb-8 md:mb-12">
        <motion.div {...reveal} className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Accesos</p>
          <h2 className="font-heading font-bold text-4xl md:text-6xl tracking-tight">
            Desliza y elige tu <span className="text-gradient-candy">llave a Candyland</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-base md:text-lg">
            <span className="hidden md:inline">Haz scroll para recorrer los accesos. </span>
            Compra directa con Mercado Pago.
          </p>
        </motion.div>
      </div>

      {/* Riel: en desktop lo mueve GSAP (pineado, alto fijo que cabe en pantalla); en móvil es swipe táctil */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex items-stretch gap-4 px-4 md:px-12 py-6 overflow-x-auto md:overflow-x-hidden scrollbar-hide snap-x snap-mandatory md:snap-none"
      >
        {accesos.map((a) => (
          <CandyPass key={a.id} acceso={a} />
        ))}
        <div className="shrink-0 w-2 md:w-[8vw]" aria-hidden />
      </div>

      <div className="container relative mt-6 md:mt-10">
        {/* Dots (solo móvil) */}
        <div className="flex md:hidden justify-center gap-2 mb-4">
          {accesos.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Ir a ${a.nombre}`}
              className={`h-2 rounded-full transition-all ${i === active ? 'w-8 bg-primary' : 'w-2 bg-muted-foreground/40'}`}
            />
          ))}
        </div>
        <p className="text-center text-muted-foreground text-sm">
          Pago seguro procesado por <span className="text-foreground font-semibold">Mercado Pago</span> · Evento +{CANDYLAND.edadMinima}
        </p>
      </div>
    </section>
  );
}

/* Accesos con datos reales (DB): grilla + selector de cantidad */
function LiveTicketsSection({ liveTickets }: { liveTickets: LiveTicket[] }) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const totalItems = Object.values(quantities).reduce((s, q) => s + q, 0);
  const totalPrice = liveTickets.reduce((s, t) => s + (quantities[t.id] || 0) * Number(t.price), 0);

  const checkoutUrl = useMemo(() => {
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => `${id}:${q}`)
      .join(',');
    return `/checkout/${CANDYLAND.slug}?items=${items}`;
  }, [quantities]);

  return (
    <section id="entradas" className="py-24 md:py-32 relative scroll-mt-24">
      <div aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-[40rem] h-[20rem] rounded-full bg-primary/10 blur-[130px]" />
      <div className="container relative">
        <motion.div {...reveal} className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Accesos</p>
          <h2 className="font-heading font-bold text-4xl md:text-6xl tracking-tight">
            Elige tu <span className="text-gradient-candy">llave a Candyland</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Cada acceso incluye la experiencia completa. Compra directa con Mercado Pago.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {liveTickets
            .filter((t) => t.status !== 'hidden')
            .map((t) => (
              <TicketCardLive
                key={t.id}
                ticket={t}
                quantity={quantities[t.id] || 0}
                onChange={(delta) =>
                  setQuantities((prev) => {
                    const disponibles = t.totalStock - t.soldCount;
                    const max = Math.min(t.maxPerOrder, disponibles);
                    const next = Math.max(0, Math.min(max, (prev[t.id] || 0) + delta));
                    return { ...prev, [t.id]: next };
                  })
                }
              />
            ))}
        </div>
        {totalItems > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky bottom-4 mt-8 glass-candy rounded-2xl p-4 flex items-center justify-between gap-4 max-w-xl mx-auto z-30"
          >
            <div>
              <p className="text-sm text-muted-foreground">{totalItems} acceso{totalItems > 1 ? 's' : ''}</p>
              <p className="font-heading font-bold text-2xl">{formatCLP(totalPrice)}</p>
            </div>
            <a
              href={checkoutUrl}
              className="btn-jelly inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-bold uppercase tracking-wide text-sm interactive"
            >
              Ir a pagar <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>
        )}

        <motion.p {...reveal} className="text-center text-muted-foreground text-sm mt-10">
          Pago seguro procesado por <span className="text-foreground font-semibold">Mercado Pago</span> · Evento +{CANDYLAND.edadMinima}
        </motion.p>
      </div>
    </section>
  );
}

function TicketsSection({ liveTickets }: { liveTickets: LiveTicket[] | undefined }) {
  const live = (liveTickets?.length ?? 0) > 0;
  return live ? <LiveTicketsSection liveTickets={liveTickets!} /> : <CandyPassesSection />;
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
          className="h-24 w-auto mx-auto mb-8 candy-float drop-shadow-[0_0_30px_rgba(255,79,195,0.4)]"
        />
        <h2 className="font-heading font-bold text-4xl md:text-7xl tracking-tight leading-[1.02] mb-6">
          Tu entrada es la llave a{' '}
          <span className="text-gradient-candy">Candyland.</span>
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground mb-10">
          {CANDYLAND.fechaTexto} · {CANDYLAND.horarioTexto} · {CANDYLAND.ciudad}
        </p>
        <button
          onClick={scrollToEntradas}
          className="btn-jelly inline-flex items-center gap-3 px-12 py-6 bg-primary text-primary-foreground rounded-full text-xl font-bold uppercase tracking-wide interactive"
        >
          <Ticket className="w-6 h-6" />
          Comprar entrada ahora
        </button>
      </motion.div>
    </section>
  );
}

/* ─── Footer ───────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-primary/15 py-14">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <img src="/candyland/logo-wordmark.webp" alt="Mansion Playroom" className="h-12 w-auto" />

          <div className="flex items-center gap-5">
            <a
              href={CANDYLAND.redes.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="w-11 h-11 rounded-full glass-candy flex items-center justify-center hover:border-primary/50 transition-colors interactive"
            >
              <Instagram className="w-5 h-5 text-primary" />
            </a>
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
      <button
        onClick={scrollToEntradas}
        className="btn-jelly w-full py-4 bg-primary text-primary-foreground rounded-full font-bold uppercase tracking-wide text-base shadow-[0_-4px_30px_rgba(255,79,195,0.35)] inline-flex items-center justify-center gap-2"
      >
        <Ticket className="w-5 h-5" />
        Comprar acceso
      </button>
    </motion.div>
  );
}

/* ─── Página ───────────────────────────────────────────────── */

export default function Home() {
  const { data: liveTickets } = trpc.events.getTicketTypes.useQuery(
    { slug: CANDYLAND.slug },
    { retry: false },
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

  return (
    <MotionConfig reducedMotion="user">
      <CandyIntro />
      <ScrollCandies />
      <div className="noise-overlay" />
      <Hero />
      <UrgencySection vendidos={vendidos} />
      <TicketsSection liveTickets={liveTickets as LiveTicket[] | undefined} />
      <ExperienceSection />
      <LineupSection />
      <InfoSection />
      <FinalCTASection />
      <Footer />
      <StickyMobileCTA />
    </MotionConfig>
  );
}
