import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig, useScroll, useTransform } from 'framer-motion';
import {
  Calendar,
  Car,
  Cigarette,
  Clock,
  Gamepad2,
  ImageOff,
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
import { CANDYLAND, EVENTO, formatCLP } from '@/config/candyland';
import CandyIntro from '@/components/CandyIntro';
import ScrollStory from '@/components/home/ScrollStory';
import FeaturedEventPanel from '@/components/home/FeaturedEventPanel';
import { scrollToId, prefersReducedMotion, isFinePointer, isMobileViewport } from '@/lib/smoothScroll';
import { isMissionActiveForEvent, missionDepositPrice, personasForAccesoSlug, MISSION_300_DEPOSIT_PER_PERSON } from '@shared/mission300';
import { useSeo } from '@/hooks/useSeo';
import { eventSchema, faqSchema } from '@shared/structuredData';

type MissionPricing = { generalPrice: number; depositPrice: number } | null;

/** Precio de un acceso dentro de la tanda vigente, para la lista completa
 * que muestra `TandaUrgencyCard` (Soltera, Soltero, Dúo, Trío, Grupo...). */
type TandaAccesoPrecio = {
  name: string;
  price: number;
  originalPrice: number | null;
};

/** Info de la tanda de entradas vigente. Se usa en `UrgencySection` cuando
 * la Misión 300 está cerrada (`missionForceClosed`) -- reemplaza el anillo
 * de progreso por escasez de stock real, sin revelar cuánta gente confirmó
 * en total (ver plan de ventas del aniversario).
 *
 * `remaining`/`totalStock` son el cupo REAL vigente: si el acceso destacado
 * usa un cupo compartido (`stockPools`, ver drizzle/schema.ts), son el
 * remanente/cap del POOL -- no el `totalStock` propio de una fila, que deja
 * de ser el límite real cuando hay pool. `totalStock` viaja acá SOLO para
 * calcular la barra de progreso (`tandaPct`): pedido explícito del dueño,
 * la UI nunca debe imprimir este número en ningún texto visible (ver
 * TandaUrgencyCard) -- lo único que se muestra es `remaining`. */
type TandaInfo = {
  remaining: number;
  totalStock: number;
  salesEnd: Date | null;
  soldOut: boolean;
  /** Precio de CADA acceso activo de la tanda, no solo el "destacado". */
  accesos: TandaAccesoPrecio[];
} | null;

/** Fecha muy lejana para pasarle a `useCountdown` cuando no hay `salesEnd`
 * -- los Hooks no se pueden llamar condicionalmente, así que el countdown
 * de alza de precio siempre corre, y el render decide si mostrarlo. */
const NO_SALES_END = new Date('2999-01-01T00:00:00Z');

/** Precio más bajo entre los accesos: Google exige un `price` concreto en la
 * oferta del evento, si no descarta el resultado enriquecido. */
const PRECIO_MINIMO_ACCESO = Math.min(...CANDYLAND.accesos.map((a) => a.precio));

/* ─── Utilidades ───────────────────────────────────────────── */

const AMENITY_ICONS: Record<string, typeof Music> = {
  Music, Car, Shirt, Gamepad2, VenetianMask, Martini, Cigarette, ShieldCheck,
};

// Todas las secciones de abajo del hero arrancan en opacity 0 y aparecen al
// entrar en pantalla. El margen es POSITIVO a propósito: agranda la caja de
// detección, así cada bloque empieza a aparecer 400px ANTES de que llegues y
// para cuando lo mirás ya terminó de animar. 400px alcanza para que la
// primera sección de abajo del hero (que arranca ~300px bajo el pliegue) ya
// esté resuelta sin scrollear nada.
//
// Antes era '-80px' (negativo), que ENCOGE la caja: el bloque tenía que
// entrar 80px dentro de la pantalla para recién ahí empezar a aparecer. En
// iPad eso se veía como una franja del fondo del sitio sin contenido durante
// un par de segundos -- el contenido ya estaba en el DOM, pero invisible.
// Pasa justo ahí porque el iPad es touch (así que no le aplican las
// optimizaciones gateadas por isFinePointer: parallax, ScrollCandies,
// caramelos, textura de ruido) pero es ancho (así que SÍ le aplican los blur
// `md:` grandes y las tarjetas glass a todo el ancho). El hilo principal
// llega tarde a disparar la animación y el hueco se hace visible.
const reveal = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '400px' },
  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const },
};

/* ─── Tilt 3D para tarjetas .candy-pass (Lineup/Experience) ──
 * El sistema de CSS .candy-perspective/.candy-pass/.candy-sheen/.candy-holo
 * ya existía en index.css pero no se usaba en ningún componente -- el CSS
 * solo define el LOOK (perspectiva, brillo que sigue --mx/--my, banda
 * holográfica), el tilt en sí (rotateX/rotateY) y el valor de --mx/--my hay
 * que empujarlo por JS en cada pointermove. Solo se engancha en desktop
 * (pointerFine) -- en reduced-motion, index.css ya fuerza `transform: none
 * !important` en .candy-pass, así que estos handlers pueden seguir corriendo
 * sin efecto visible en vez de tener que gatearlos acá también. */
function handleCandyTilt(e: React.PointerEvent<HTMLDivElement>) {
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  card.style.setProperty('--mx', `${px * 100}%`);
  card.style.setProperty('--my', `${py * 100}%`);
  card.style.transform = `rotateX(${(0.5 - py) * 12}deg) rotateY(${(px - 0.5) * 12}deg)`;
}
function resetCandyTilt(e: React.PointerEvent<HTMLDivElement>) {
  e.currentTarget.style.transform = 'rotateX(0deg) rotateY(0deg)';
}

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
  // Además de "reduce motion", se apaga en touch (celular/tablet) -- es una
  // capa puramente decorativa con su propio useScroll de documento completo
  // corriendo todo el tiempo; en iOS Safari, sumada al parallax del hero y
  // los blobs con blur, satura la composición por GPU y el hero se traba o
  // no llega a pintar (mismo criterio ya usado para apagar Lenis/cursor
  // personalizado en touch, ver isFinePointer() en lib/smoothScroll.ts).
  if (prefersReducedMotion() || !isFinePointer()) return null;
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
          className={`absolute ${c.size} select-none cursor-grab active:cursor-grabbing z-20 drop-shadow-[0_4px_20px_oklch(0.70_0.19_340_/_0.35)] touch-none`}
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
  // El título se mueve a una velocidad distinta (más lenta) que el resto del
  // bloque de texto -- parallax en capas, da sensación de profundidad al
  // hacer scroll en vez de que todo el contenido se mueva como una sola pieza.
  const titleY = useTransform(scrollYProgress, [0, 1], ['0%', '-6%']);

  // En touch (celular/tablet) se apaga el parallax con JS del fondo y no se
  // montan los caramelos arrastrables -- en iOS Safari, sumado a los blobs
  // con blur pesado, todo eso composita en simultáneo con el video y lo
  // satura (el hero se traba o no llega a pintar). El parallax igual "no se
  // nota" en pantallas chicas, así que no se pierde nada quitándolo ahí.
  const [pointerFine] = useState(() => isFinePointer());

  // El video del Hero es panorámico (2,08:1): en celular, `object-cover` a
  // pantalla completa recortaría casi todo el ancho y dejaría fuera lo
  // importante del encuadre (la vela). En vez de confiar en el recorte
  // automático del navegador, se sirve un archivo aparte ya recortado a
  // mano centrado en la vela+torta (client/public/candyland/hero-video-
  // mobile.mp4) -- mismo criterio que isFinePointer() de abajo: se decide
  // una sola vez al montar, no hace falta que reaccione a un resize.
  const [isMobile] = useState(() => isMobileViewport());

  // Si el video no arranca a reproducirse después de unos segundos (conexión
  // mala, o Safari que se quedó pegado tratando de decodificarlo), se deja
  // de esperar y se muestra fijo el poster -- así nunca queda una pantalla
  // pegada esperando algo que puede no llegar a cargar nunca.
  const [videoTimedOut, setVideoTimedOut] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  useEffect(() => {
    if (videoPlaying) return;
    const timer = setTimeout(() => setVideoTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [videoPlaying]);

  return (
    <section ref={sectionRef} className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">
      {/* Fondo: el video candy define la paleta del sitio, con un velo claro
          suficiente para que el texto se lea sin taparle el color. */}
      <motion.div className="absolute inset-0" style={pointerFine ? { y: bgY } : undefined}>
        <img
          src="/candyland/poster-hero-bg.webp"
          alt=""
          aria-hidden
          width={480}
          height={270}
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover opacity-20 blur-2xl scale-125"
        />
        {/* preload="metadata" (no "auto"): en móvil con conexión lenta, pedir
         * todo el video de una empezaba a competir por ancho de banda con el
         * resto de la carga inicial de la página — con "metadata" el navegador
         * solo trae lo justo para arrancar y el poster de arriba cubre el
         * salto mientras el video termina de bajar. */}
        {!videoTimedOut && (
          <video
            className="absolute inset-0 w-full h-full object-cover opacity-90 saturate-[1.15] motion-reduce:hidden"
            src={isMobile ? '/candyland/hero-video-mobile.mp4' : '/candyland/hero-video.mp4'}
            poster={isMobile ? '/candyland/poster-hero-mobile.webp' : '/candyland/poster-hero.webp'}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onPlaying={() => setVideoPlaying(true)}
          />
        )}
      </motion.div>
      {/* Viñeta oscura centrada en el texto (contraste) + degradé claro solo
       * en el borde inferior (transición a la sección siguiente) — el resto
       * del video queda a color fuerte en vez de lavado con el fondo claro. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_55%_at_50%_42%,oklch(0.18_0.04_338/0.45),transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

      {/* Brillos de club -- blur más liviano en mobile (menos costo de
       * composición para Safari), completo en desktop */}
      <div aria-hidden className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/25 blur-2xl md:blur-[120px] candy-float-slow" />
      <div aria-hidden className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-violet-electric/20 blur-2xl md:blur-[140px] candy-float" />
      <div aria-hidden className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-candy-blue/20 blur-2xl md:blur-[110px] candy-float-slow" />

      {/* Caramelos arrastrables (juego) -- solo desktop/mouse, ver comentario arriba */}
      {pointerFine && <DraggableCandies boundsRef={sectionRef} />}

      <motion.div style={{ y: contentY, opacity: contentOpacity }} className="relative z-10 text-center px-4 max-w-5xl mx-auto pt-24 pb-20">
        <motion.img
          src="/candyland/logo-wordmark.webp"
          alt="Mansion Playroom"
          width={300}
          height={300}
          className="h-16 md:h-20 w-auto mx-auto mb-6 drop-shadow-[0_0_25px_oklch(0.70_0.19_340_/_0.3)]"
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
          style={pointerFine ? { y: titleY } : undefined}
          className="font-heading font-extrabold text-[clamp(1.75rem,7vw,5.5rem)] leading-[0.95] tracking-[0.01em] drop-shadow-[0_6px_40px_oklch(0.76_0.13_35_/_0.35)] whitespace-normal sm:whitespace-nowrap break-words"
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
          {EVENTO.fechaConfirmada ? (
            <>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-candy">
                <Calendar className="w-4 h-4 text-primary" /> {CANDYLAND.fechaTexto}
              </span>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-candy">
                <Clock className="w-4 h-4 text-primary" /> {CANDYLAND.horarioTexto}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-candy border border-primary/30">
              <Sparkles className="w-4 h-4 text-primary" /> Próxima fecha: pronto
            </span>
          )}
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
          {EVENTO.fechaConfirmada ? (
            <Link
              href={`/checkout/${CANDYLAND.slug}`}
              className="btn-jelly inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-full text-lg font-bold uppercase tracking-wide interactive"
            >
              <Ticket className="w-5 h-5" />
              Quiero ir
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => scrollToId('proxima-fecha')}
              className="btn-jelly inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-full text-lg font-bold uppercase tracking-wide interactive"
            >
              <Sparkles className="w-5 h-5" />
              Próximos Eventos
            </button>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ─── Próximos Eventos ─────────────────────────────────────── */

// Exportado: FeaturedEventPanel.tsx lo necesita como import de sólo-tipo
// (se borra en compilación, así que no genera un ciclo de import real con
// que ese archivo a su vez sea importado acá abajo).
export type HomeEventItem = {
  id: string;
  title: string;
  date: Date;
  dateLabel: string;
  venue?: string | null;
  shortDescription?: string | null;
  imageUrl: string;
  isPast: boolean;
  featured: boolean;
  href: string;
};

function EventCard({ event, size = 'normal' }: { event: HomeEventItem; size?: 'normal' | 'small' }) {
  const isSmall = size === 'small';
  // Mismo criterio que FeaturedEventPanel.tsx: si la URL del flyer (pegada a
  // mano en el admin) no carga, que se note con un ícono en vez de quedar
  // una tarjeta glass en blanco indistinguible de "no hay nada".
  const [imgOk, setImgOk] = useState(true);
  return (
    <Link
      href={event.href}
      className={`group relative block rounded-2xl md:rounded-3xl overflow-hidden glass-candy interactive ${
        isSmall ? 'aspect-square' : 'aspect-[4/5]'
      }`}
    >
      {/* width/height declarados aunque el contenedor ya reserve el espacio
       * con `aspect-*`: le permiten al navegador reservar memoria y empezar
       * a decodificar antes, así la imagen no "aparece de golpe" sobre una
       * tarjeta glass casi blanca. Son las proporciones nominales, no un
       * tamaño fijo -- el `object-cover` manda igual. */}
      {imgOk ? (
        <img
          src={event.imageUrl}
          alt={event.title}
          loading="lazy"
          width={1060}
          height={1413}
          onError={() => setImgOk(false)}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${
            event.isPast ? 'grayscale group-hover:grayscale-0 opacity-80 group-hover:opacity-100' : 'group-hover:scale-105'
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/20 via-cherry/10 to-violet-electric/15">
          <ImageOff className={isSmall ? 'w-5 h-5 text-primary/50' : 'w-7 h-7 text-primary/50'} />
          {!isSmall && <span className="text-xs font-semibold text-muted-foreground">Flyer no disponible</span>}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
      {event.isPast && (
        <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-muted/90 text-muted-foreground text-[9px] font-bold uppercase tracking-wide">
          Finalizado
        </span>
      )}
      <div className="absolute bottom-0 inset-x-0 p-3 md:p-5">
        <p className={`flex items-center gap-1.5 text-primary font-semibold mb-1 ${isSmall ? 'text-[10px]' : 'text-xs md:text-sm'}`}>
          <Calendar className={isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5 md:w-4 md:h-4'} /> {event.dateLabel}
        </p>
        <h3 className={`font-heading font-bold text-foreground leading-tight ${isSmall ? 'text-sm' : 'text-lg md:text-xl'}`}>
          {event.title}
        </h3>
        {event.venue && !isSmall && (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs md:text-sm mt-1">
            <MapPin className="w-3.5 h-3.5" /> {event.venue}
          </p>
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
  //
  // Los datos acá son fijos (NO se derivan de CANDYLAND/EVENTO): esas
  // constantes ahora describen "Playroom, sin fecha" por el rebrand, y ya no
  // representan al Candyland real que se hizo el 08/08. Este objeto es
  // puramente histórico -- por eso `featured` es siempre false (nunca debe
  // poder aparecer como el "próximo evento" destacado, aunque no haya fecha
  // confirmada para el siguiente) e `isPast` es siempre true (siempre va a
  // "Ediciones anteriores", nunca desaparece).
  const candylandHistorico: HomeEventItem = {
    id: 'static-candyland',
    title: 'Candyland',
    date: new Date('2026-08-08T21:00:00-04:00'),
    dateLabel: 'Sábado 08 de Agosto',
    venue: 'Valparaíso, Chile',
    // El flyer real (retrato, 1060×1413) -- antes acá vivía poster-hero.webp
    // (el still del video del hero, 960×540 panorámico), que es la imagen
    // equivocada para este propósito: quedaba recortada a un cuadrado
    // diminuto en "Ediciones anteriores" y era, en los hechos, la única
    // imagen de evento visible en toda la home mientras no hay fecha
    // confirmada.
    imageUrl: '/candyland/flyer-08-agosto.jpg',
    isPast: true,
    featured: false,
    href: '/eventos/candyland-agosto-2026',
  };

  const mapped: HomeEventItem[] = dbEvents.map((e: any) => {
    const date = new Date(e.eventDate);
    return {
      id: String(e.id),
      title: e.title,
      date,
      dateLabel: date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }),
      venue: e.venue,
      shortDescription: e.shortDescription,
      imageUrl: e.imageUrl || candylandHistorico.imageUrl,
      isPast: e.status === 'past' || date.getTime() < now,
      featured: !!e.featured,
      href: `/eventos/${e.slug}`,
    };
  });

  // El respaldo histórico solo se arma si el Candyland real todavía no está
  // cargado en la BD -- si ya existe una fila real con ese slug, se usa esa
  // (con su flyer/info real) en vez de este objeto fijo. No depende de
  // EVENTO.fechaConfirmada: sea cual sea el estado de la próxima fecha, el
  // evento pasado siempre debe poder verse en "Ediciones anteriores".
  const all = hasRealCandyland ? mapped : [candylandHistorico, ...mapped];
  const upcoming = all.filter((e) => !e.isPast).sort((a, b) => a.date.getTime() - b.date.getTime());
  const past = all.filter((e) => e.isPast).sort((a, b) => b.date.getTime() - a.date.getTime());

  // El destacado: el que el admin marcó featured, o si no hay ninguno, el próximo más cercano.
  // (featuredEvent sólo queda undefined cuando `upcoming` está vacío -- el
  // fallback `?? upcoming[0]` cubre cualquier otro caso -- así que
  // restUpcoming siempre queda vacío en la rama "sin próximo evento".)
  const featuredEvent = upcoming.find((e) => e.featured) ?? upcoming[0];
  const restUpcoming = upcoming.filter((e) => e.id !== featuredEvent?.id);

  // Sin evento próximo todavía: en vez de un segundo estado "vacío", se
  // promueve la edición pasada más reciente al mismo panel grande -- es,
  // en los hechos, el único contenido de evento real que hay hoy en la
  // home, y merece el mismo tratamiento grande que va a tener el próximo
  // evento apenas el admin lo cargue.
  const panelEvent = featuredEvent ?? past[0];
  const panelMode: 'upcoming' | 'past' = featuredEvent ? 'upcoming' : 'past';
  const stripPast = featuredEvent ? past : past.slice(1);

  if (!panelEvent) return null;

  return (
    <section id="proximos-eventos" className="relative scroll-mt-24 py-20 md:py-28">
      <div className="container">
        <motion.div {...reveal} className="max-w-2xl mb-10 md:mb-12">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Calendario</p>
          <h2 className="font-heading font-bold text-4xl md:text-6xl tracking-tight">
            Próximos <span className="text-gradient-candy">Eventos</span>
          </h2>
        </motion.div>

        <div className="mb-12 md:mb-16">
          <FeaturedEventPanel event={panelEvent} mode={panelMode} />
        </div>

        {restUpcoming.length > 0 && (
          <motion.div {...reveal} className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-12 md:mb-16">
            {restUpcoming.map((e) => (
              <EventCard key={e.id} event={e} size="normal" />
            ))}
          </motion.div>
        )}

        {stripPast.length > 0 && (
          <motion.div {...reveal}>
            <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground mb-4">Ediciones anteriores</p>
            {/* Tira horizontal con scroll-snap en vez de una grilla fija --
             * escala mejor a medida que se acumulan más ediciones pasadas
             * (una grilla de 6 columnas se ve bien con 6 items, rara con 4
             * u 8; la tira siempre se ve intencional). */}
            <div className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1">
              {stripPast.map((e) => (
                <div key={e.id} className="snap-start shrink-0 w-28 md:w-40">
                  <EventCard event={e} size="small" />
                </div>
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
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl md:rounded-3xl bg-gradient-to-br from-cherry via-primary to-violet-electric shadow-[0_6px_22px_oklch(0.70_0.19_340_/_0.4)] flex items-center justify-center overflow-hidden ring-2 ring-white/30">
        <div aria-hidden className="absolute inset-0 bg-white/10 mix-blend-overlay" />
        <span className="font-heading font-black text-3xl sm:text-4xl md:text-5xl tabular-nums text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-foreground/80 font-bold">{label}</span>
    </div>
  );
}

/** Tarjeta que reemplaza countdown + Misión 300 mientras no hay fecha
 *  confirmada ni venta activa (ver EVENTO.fechaConfirmada). Mismo fondo con
 *  blobs y estilo `glass-candy` que el resto de la sección, sin números que
 *  contar ni botón de compra. */
function ComingSoonCard() {
  return (
    <motion.div
      {...reveal}
      className="relative glass-candy rounded-3xl px-6 py-10 md:px-10 md:py-14 flex flex-col items-center gap-4 text-center overflow-hidden border-2 border-primary/30"
    >
      <div aria-hidden className="absolute -top-16 left-1/4 w-64 h-64 rounded-full bg-cherry/25 blur-[90px]" />
      <div aria-hidden className="absolute -bottom-16 right-1/4 w-64 h-64 rounded-full bg-primary/20 blur-[90px]" />
      <div className="relative w-14 h-14 flex items-center justify-center">
        <div aria-hidden className="absolute inset-0 rounded-full bg-primary/30 blur-xl candy-glow-pulse" />
        <div className="relative w-11 h-11 rounded-full glass-candy flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
      </div>
      <p className="relative font-heading font-bold text-2xl md:text-3xl text-gradient-candy">
        La próxima fecha se viene pronto
      </p>
      <p className="relative text-muted-foreground text-sm md:text-base max-w-md">
        Todavía no confirmamos día ni venta de entradas — síguenos en Instagram para enterarte primero.
      </p>
      <a
        href={CANDYLAND.redes.instagram}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-jelly relative inline-flex items-center gap-2 mt-2 px-6 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide interactive"
      >
        <Instagram className="w-4 h-4" />
        Síguenos en Instagram
      </a>
    </motion.div>
  );
}

function UrgencySection({
  vendidos,
  missionPricing,
  missionActive,
  tanda,
  eventId,
}: {
  vendidos: number;
  missionPricing: MissionPricing;
  /** false cuando `events.missionForceClosed` está activo para este evento
   * (ver `isMissionActiveForEvent`, shared/mission300.ts) -- este aniversario
   * no usa Misión 300, se vende solo por tandas de precio. */
  missionActive: boolean;
  tanda: TandaInfo;
  /** Id real del evento en la DB (si existe) -- se adjunta al lead para
   * poder segmentarlos por evento en el admin. */
  eventId?: number;
}) {
  const { dias, horas, minutos, segundos, esHoy } = useCountdown(CANDYLAND.eventDate);
  const { meta, titulo, copy } = CANDYLAND.mision;
  const progreso = Math.min(100, Math.round((vendidos / meta) * 100));
  const displayCount = useCountUp(vendidos);
  const burstId = useIncreaseBurst(vendidos);
  const soldOut = vendidos >= meta;
  // Cuenta regresiva al alza de precio de la tanda vigente -- siempre se
  // llama (regla de Hooks), NO_SALES_END si no hay `salesEnd` configurado,
  // y el render decide si la muestra.
  const tandaCountdown = useCountdown(tanda?.salesEnd ?? NO_SALES_END);
  const tandaDisplayRemaining = useCountUp(tanda?.remaining ?? 0);

  // Banda full-bleed detrás de esta sección: el único momento de la home
  // donde el pastel de marca aparece como un campo de color grande en vez
  // de un acento fino (blobs difuminados, bordes) -- rompe el patrón "todo
  // vive en el mismo pastel pálido" que se repite en el resto de la
  // página. Se aplica en las dos ramas (con y sin fecha confirmada) porque
  // hoy, sin fecha, es la única que se ve.
  const fullBleedBand = (
    <div
      aria-hidden
      className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-screen bg-gradient-to-r from-primary/20 via-cherry/15 to-violet-electric/20"
    />
  );

  if (!EVENTO.fechaConfirmada) {
    return (
      <section id="proxima-fecha" className="relative scroll-mt-24 py-10 md:py-14 overflow-hidden">
        {fullBleedBand}
        <div aria-hidden className="absolute -top-16 left-[10%] w-72 h-72 rounded-full bg-primary/15 blur-[100px] candy-float-slow" />
        <div aria-hidden className="absolute -bottom-20 right-[8%] w-80 h-80 rounded-full bg-cherry/15 blur-[110px] candy-float" />
        <div className="container relative">
          <ComingSoonCard />
        </div>
      </section>
    );
  }

  return (
    <section id="proxima-fecha" className="relative scroll-mt-24 py-10 md:py-14 overflow-hidden">
      {fullBleedBand}
      <div aria-hidden className="absolute -top-16 left-[10%] w-72 h-72 rounded-full bg-primary/15 blur-[100px] candy-float-slow" />
      <div aria-hidden className="absolute -bottom-20 right-[8%] w-80 h-80 rounded-full bg-cherry/15 blur-[110px] candy-float" />

      <div className="container relative space-y-6 md:space-y-8">
        {/* Countdown — tarjeta propia, grande y con urgencia visual: borde
         * de alerta, tiles grandes con degradé candy.
         *
         * La tarjeta ya NO lleva `candy-pulse`: esa clase anima `box-shadow`
         * en bucle infinito, y acá iba encima de un `glass-candy`
         * (backdrop-filter) del ancho de la pantalla en tablet/escritorio.
         * Eso obliga a WebKit a rehacer el desenfoque de fondo en cada
         * frame, para siempre. El latido se mantiene en el puntito rojo de
         * abajo, que es donde se lee y no cuesta nada. */}
        <motion.div
          {...reveal}
          className="relative glass-candy rounded-3xl px-5 py-6 md:px-10 md:py-8 flex flex-col items-center gap-4 md:gap-5 overflow-hidden border-2 border-cherry/50"
        >
          <div aria-hidden className="absolute -top-16 left-1/4 w-64 h-64 rounded-full bg-cherry/25 blur-[90px]" />
          <div aria-hidden className="absolute -bottom-16 right-1/4 w-64 h-64 rounded-full bg-primary/20 blur-[90px]" />
          <p className="relative text-xs md:text-sm uppercase tracking-[0.3em] text-cherry font-extrabold inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cherry candy-pulse inline-block" />
            {esHoy ? '¡Es hoy! 🍭' : '🔥 La fiesta empieza en'}
          </p>
          <div className="relative flex items-center gap-2 sm:gap-3 md:gap-4">
            <CountdownUnit value={dias} label="Días" />
            <span className="text-2xl md:text-4xl font-heading font-black text-cherry/50 -mt-4 md:-mt-6">:</span>
            <CountdownUnit value={horas} label="Hrs" />
            <span className="text-2xl md:text-4xl font-heading font-black text-cherry/50 -mt-4 md:-mt-6">:</span>
            <CountdownUnit value={minutos} label="Min" />
            <span className="text-2xl md:text-4xl font-heading font-black text-cherry/50 -mt-4 md:-mt-6">:</span>
            <CountdownUnit value={segundos} label="Seg" />
          </div>
          <p className="relative text-muted-foreground text-xs md:text-base font-medium">
            {CANDYLAND.fechaTexto} · {CANDYLAND.horarioTexto}
          </p>
        </motion.div>

        {/* Misión 300 -- solo si el evento la tiene activa. Este aniversario
         * la tiene cerrada (`missionForceClosed`): se vende por tandas de
         * precio en su lugar, sin mostrar nunca el total de gente confirmada
         * (ver plan de ventas del aniversario). */}
        {missionActive ? (
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

                {/* invisible mientras missionPricing no resuelve -- mismo criterio
                 * que en Hero(), reserva el espacio para no correr la barra de
                 * progreso de abajo cuando llega la query. */}
                <p className={`mt-2.5 inline-flex flex-wrap items-baseline justify-center md:justify-start gap-x-2 gap-y-0.5 text-sm md:text-base ${missionPricing ? '' : 'invisible'}`}>
                  <span className="font-heading font-extrabold text-gradient-candy text-lg md:text-xl">{formatCLP(MISSION_300_DEPOSIT_PER_PERSON)}</span>
                  <span className="text-muted-foreground">por persona ·</span>
                  <span className="font-bold text-cherry">Reserva tu lugar hoy</span>
                </p>

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
                    {EVENTO.nombre} está completo · Sold out
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
        ) : (
          <TandaUrgencyCard tanda={tanda} countdown={tandaCountdown} displayRemaining={tandaDisplayRemaining} />
        )}

        <LeadCaptureInline eventId={eventId} />
      </div>
    </section>
  );
}

/** Captura de leads (agujero 1 del plan de ventas): el gancho "avísame antes
 * de que suba el precio", para quien duda hoy y no compra. Sin esto, esa
 * persona se pierde para siempre -- no hay ninguna otra forma de dejar el
 * contacto en el sitio. Vive dentro de `UrgencySection` (en las dos ramas,
 * Misión 300 y tanda) porque es justo donde ya se está hablando de precio y
 * urgencia. Los UTM se leen directo de la URL en el momento del envío (no
 * persisten entre páginas todavía -- esa persistencia es la atribución de
 * `orders`, un build aparte). */
function LeadCaptureInline({ eventId }: { eventId?: number }) {
  const [email, setEmail] = useState('');
  const createLead = trpc.leads.create.useMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || createLead.isPending) return;
    const params = new URLSearchParams(window.location.search);
    createLead.mutate({
      email: email.trim(),
      eventId,
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
      utmCampaign: params.get('utm_campaign') ?? undefined,
    });
  };

  if (createLead.isSuccess) {
    return (
      <motion.div {...reveal} className="glass-candy rounded-3xl px-6 py-5 text-center">
        <p className="font-heading font-bold text-base md:text-lg text-gradient-candy">✅ Listo, te avisamos apenas suba el precio</p>
      </motion.div>
    );
  }

  return (
    <motion.div {...reveal} className="glass-candy rounded-3xl px-6 py-5">
      {/* El mensaje de error vive FUERA de esta fila (ver abajo), no como
       * tercer hijo del flex -- adentro, un <p> con `w-full` rompía el
       * cálculo de ancho de los otros dos hijos (el texto de la izquierda
       * se apretaba en una columna angosta), detectado con Playwright antes
       * de mandar esto a producción. */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <p className="flex-1 text-sm md:text-base font-semibold text-center sm:text-left">
          🔔 ¿Todavía lo estás pensando? Deja tu correo y te avisamos <span className="text-primary">antes de que suba el precio</span>.
        </p>
        <form onSubmit={handleSubmit} className="flex w-full sm:w-auto gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="flex-1 sm:w-56 px-4 py-2.5 rounded-full bg-background/70 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="submit"
            disabled={createLead.isPending}
            className="btn-jelly px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide interactive disabled:opacity-60 shrink-0"
          >
            Avísame
          </button>
        </form>
      </div>
      {createLead.isError && (
        <p className="text-xs text-destructive text-center sm:text-left mt-3">Algo falló, prueba de nuevo.</p>
      )}
    </motion.div>
  );
}

/** Reemplaza la tarjeta de Misión 300 cuando el evento la tiene cerrada
 * (`missionForceClosed`): en vez de prueba social (un número grande de gente
 * confirmada), usa escasez de stock real de la tanda vigente -- un número
 * chico funciona mejor y no revela nada del total (ver plan de ventas del
 * aniversario). `tanda` sale de `liveTickets` en Home(); puede venir `null`
 * mientras la query no resuelve o no hay accesos activos todavía. */
function TandaUrgencyCard({
  tanda,
  countdown,
  displayRemaining,
}: {
  tanda: TandaInfo;
  countdown: { dias: number; horas: number; minutos: number; segundos: number; esHoy: boolean };
  displayRemaining: number;
}) {
  const tandaPct = tanda
    ? Math.min(100, Math.round(((tanda.totalStock - tanda.remaining) / Math.max(1, tanda.totalStock)) * 100))
    : 0;

  return (
    <motion.div {...reveal} className="relative glass-candy rounded-3xl p-6 md:p-10 overflow-visible border-2 border-cherry/40">
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
        <div className="relative shrink-0">
          <div aria-hidden className="absolute inset-0 rounded-full bg-cherry/25 blur-3xl candy-glow-pulse" />
          <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-cherry via-primary to-violet-electric shadow-[0_6px_22px_oklch(0.70_0.19_340_/_0.4)] flex flex-col items-center justify-center ring-2 ring-white/30">
            <span className="font-heading font-black text-3xl md:text-4xl text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] tabular-nums" aria-live="polite">
              {tanda ? displayRemaining : '—'}
            </span>
            <span className="text-[10px] md:text-xs uppercase tracking-[0.15em] text-white/90 font-bold">cupos</span>
          </div>
        </div>

        <div className="flex-1 text-center md:text-left w-full">
          {/* Nunca "de {totalStock}": solo el remanente, que es lo que
           * genera urgencia sin revelar el tamaño real de la tanda (pedido
           * explícito del dueño). El número grande ya está en el círculo de
           * arriba -- acá solo el copy. */}
          <h3 className="font-heading font-bold text-xl md:text-2xl text-gradient-candy mb-1">
            {tanda ? 'Cupos limitados a este precio' : 'Entradas disponibles'}
          </h3>

          {/* Precio de CADA acceso vigente (Soltera, Soltero, Dúo, Trío,
           * Grupo...), no solo uno destacado -- pedido explícito del dueño. */}
          {tanda && tanda.accesos.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {tanda.accesos.map((a) => (
                <div key={a.name} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm md:text-base font-semibold text-foreground/85">{a.name}</span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    {a.originalPrice && a.originalPrice > a.price && (
                      <span className="text-[11px] md:text-xs text-muted-foreground/70 line-through tabular-nums">{formatCLP(a.originalPrice)}</span>
                    )}
                    <span className="font-heading font-extrabold text-lg md:text-xl text-gradient-candy tabular-nums">{formatCLP(a.price)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs md:text-sm text-muted-foreground mt-3">
            Es el aniversario, cae la noche antes de Halloween: la primera fiesta del fin de semana.
          </p>

          {tanda?.salesEnd && !tanda.soldOut && (
            <div className="mt-4">
              <p className="relative text-xs md:text-sm uppercase tracking-[0.3em] text-cherry font-extrabold inline-flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-cherry candy-pulse inline-block" />
                El precio sube en
              </p>
              <div className="flex items-center gap-2 sm:gap-3 justify-center md:justify-start">
                <CountdownUnit value={countdown.dias} label="Días" />
                <span className="text-xl md:text-2xl font-heading font-black text-cherry/50 -mt-4">:</span>
                <CountdownUnit value={countdown.horas} label="Hrs" />
                <span className="text-xl md:text-2xl font-heading font-black text-cherry/50 -mt-4">:</span>
                <CountdownUnit value={countdown.minutos} label="Min" />
                <span className="text-xl md:text-2xl font-heading font-black text-cherry/50 -mt-4">:</span>
                <CountdownUnit value={countdown.segundos} label="Seg" />
              </div>
            </div>
          )}

          <div className="h-3.5 rounded-full bg-muted overflow-hidden mt-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${tandaPct}%` }}
              transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric relative overflow-hidden"
            >
              <span className="absolute inset-0 candy-bar-shine" />
            </motion.div>
          </div>

          {tanda?.soldOut ? (
            <div className="mt-5 w-full md:w-auto text-center px-6 py-3 rounded-full bg-muted text-muted-foreground text-sm font-bold uppercase tracking-wide" role="status">
              Se agotó esta tanda · Pronto la siguiente
            </div>
          ) : (
            <Link
              href={`/checkout/${CANDYLAND.slug}`}
              className="btn-jelly mt-5 inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide interactive"
            >
              🎃 Quiero mi entrada · Comprar ahora
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── La Experiencia ───────────────────────────────────────── */

function ExperienceSection() {
  const [pointerFine] = useState(() => isFinePointer());

  return (
    <section id="experiencia" className="py-24 md:py-32 relative overflow-hidden">
      {/* Brillos de club difuminados -- mismo patrón que Hero/UrgencySection,
       * ausente acá hasta ahora, lo que hacía que esta sección se sintiera
       * más plana que las de al lado. */}
      <div aria-hidden className="absolute -top-16 -right-20 w-80 h-80 rounded-full bg-secondary/15 blur-2xl md:blur-[130px] candy-float-slow" />
      <div aria-hidden className="absolute bottom-0 -left-24 w-96 h-96 rounded-full bg-cherry/15 blur-2xl md:blur-[130px] candy-float" />

      {/* Columnas asimétricas en vez del "heading arriba + grilla abajo" que
       * repiten Próximos Eventos/FAQ -- el texto queda fijo (sticky) al lado
       * mientras las amenities, ahora más grandes (2 columnas en vez de 4),
       * ocupan su propio carril. */}
      <div className="container grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-10 lg:gap-16 items-start">
        <motion.div {...reveal} className="lg:sticky lg:top-24">
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
          <p className="mt-4 text-base md:text-lg text-muted-foreground/80 leading-relaxed">
            Si buscas salir a bailar en Viña del Mar o salir a bailar en Valparaíso, esta es la fiesta
            liberal más grande de la V Región — una experiencia premium pensada para quienes quieren
            vivir la vida nocturna de la zona sin límites.
          </p>
        </motion.div>

        {/* Mismo criterio que `reveal`: margen positivo para anticiparse, y
         * escalonado más corto -- con 0.08s × 8 amenities + 0.5s cada una,
         * la última tardaba ~1.1s en aparecer desde que disparaba. */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '400px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          className="grid grid-cols-2 gap-4"
        >
          {CANDYLAND.amenities.map((a) => {
            const Icon = AMENITY_ICONS[a.icono] ?? Sparkles;
            return (
              <motion.div
                key={a.texto}
                variants={{
                  hidden: { opacity: 0, y: 26, scale: 0.92 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } },
                }}
                whileHover={{ y: -4, scale: 1.03 }}
                className="candy-perspective"
              >
                {/* Tilt + sheen en un elemento hijo aparte (no el mismo que
                 * anima whileHover arriba) -- ambos escriben `transform`, así
                 * que si compartieran nodo se pisarían entre sí. */}
                <div
                  onPointerMove={pointerFine ? handleCandyTilt : undefined}
                  onPointerLeave={pointerFine ? resetCandyTilt : undefined}
                  className="candy-pass glass-candy rounded-2xl p-6 md:p-7 flex items-center gap-3 hover:border-primary/40 transition-colors"
                >
                  <motion.span
                    whileHover={{ rotate: [0, -12, 10, -6, 0] }}
                    transition={{ duration: 0.6 }}
                    className="inline-flex shrink-0"
                  >
                    <Icon className="w-7 h-7 md:w-8 md:h-8 text-primary" />
                  </motion.span>
                  <span className="text-base md:text-lg font-medium">{a.texto}</span>
                  <div aria-hidden className="candy-sheen" />
                  <div aria-hidden className="candy-holo" />
                </div>
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
  const [pointerFine] = useState(() => isFinePointer());
  const [reducedMotion] = useState(() => prefersReducedMotion());

  // Ecualizador "vivo": mientras hay una pista activa, sus barras se
  // re-randomizan cada ~500ms en vez de quedarse en la altura fija que ya
  // calcula la fórmula de abajo -- la pista inactiva mantiene esa fórmula
  // estática (más calma a propósito, ver `eq-bar-idle`). Se apaga entero con
  // reduced-motion: sin esto, `eq-bar`'s CSS ya para su propia animación,
  // pero este setInterval seguiría reescribiendo `height` igual.
  const [activeBarHeights, setActiveBarHeights] = useState<number[]>([]);
  useEffect(() => {
    if (!activa || reducedMotion) {
      setActiveBarHeights([]);
      return;
    }
    const randomize = () => setActiveBarHeights(Array.from({ length: 9 }, () => 18 + Math.random() * 55));
    randomize();
    const id = setInterval(randomize, 450 + Math.random() * 150);
    return () => clearInterval(id);
  }, [activa, reducedMotion]);

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
                className={`candy-perspective transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  isActive ? 'flex-[2]' : isDimmed ? 'flex-[0.75] opacity-70' : 'flex-1'
                }`}
              >
                <div
                  onPointerEnter={() => setActiva(pista.genero)}
                  onPointerLeave={(e) => {
                    setActiva(null);
                    if (pointerFine) resetCandyTilt(e);
                  }}
                  onPointerMove={pointerFine ? handleCandyTilt : undefined}
                  onClick={() => setActiva(isActive ? null : pista.genero)}
                  className="candy-pass relative h-full rounded-2xl overflow-hidden glass-candy cursor-pointer"
                >
                  {/* Fondo de energía */}
                  <div className={`absolute inset-0 bg-gradient-to-t ${skin.grad}`} />

                  {/* Ecualizador animado -- barras vivas mientras está activa */}
                  <div aria-hidden className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1 md:gap-1.5 h-1/2 px-4 opacity-50">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <span
                        key={i}
                        className={`eq-bar w-1.5 md:w-2 rounded-t-full ${skin.bar} ${isActive ? '' : 'eq-bar-idle'}`}
                        style={{
                          animationDelay: `${i * 0.12}s`,
                          height: `${isActive && activeBarHeights[i] !== undefined ? activeBarHeights[i] : 18 + ((i * 37) % 55)}%`,
                          transition: isActive ? 'height 0.4s ease' : undefined,
                        }}
                      />
                    ))}
                  </div>

                  {/* Brillo + banda holográfica que siguen el puntero (ver
                   * .candy-sheen/.candy-holo en index.css) */}
                  <div aria-hidden className="candy-sheen" />
                  <div aria-hidden className="candy-holo" />

                  {/* Contenido */}
                  <div className="relative h-full flex flex-col justify-end p-4 md:p-6">
                    <p className="text-[10px] md:text-xs uppercase tracking-[0.25em] text-foreground/60 mb-0.5">{pista.nombre}</p>
                    <h3 className="font-heading font-extrabold text-2xl md:text-4xl text-gradient-candy leading-none mb-1">
                      <motion.span
                        aria-hidden
                        className="inline-block"
                        animate={isActive ? { scale: [1, 1.28, 1], rotate: [0, -10, 8, 0] } : { scale: 1, rotate: 0 }}
                        transition={{ duration: 0.55 }}
                      >
                        {skin.emoji}
                      </motion.span>{' '}
                      {pista.genero}
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
    <section className="relative overflow-hidden py-24 md:py-32 bg-gradient-to-b from-transparent via-primary/5 to-transparent">
      {/* Misma capa de brillos difuminados que Experience/Urgency -- acá antes
       * no había nada, así que la sección se veía chata al lado de las otras. */}
      <div aria-hidden className="absolute top-10 -right-16 w-72 h-72 rounded-full bg-violet-electric/12 blur-2xl md:blur-[120px] candy-float" />
      <div aria-hidden className="absolute bottom-10 -left-16 w-72 h-72 rounded-full bg-candy-blue/12 blur-2xl md:blur-[120px] candy-float-slow" />

      <div className="container max-w-3xl relative">
        <motion.div {...reveal}>
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4 text-center">Lo esencial</p>
          <h2 className="font-heading font-bold text-4xl md:text-5xl tracking-tight mb-8 text-center">
            Todo lo que necesitas <span className="text-gradient-candy">saber</span>
          </h2>
        </motion.div>

        {/* Cada pregunta entra escalonada al hacer scroll -- mismo patrón de
         * `variants`/`staggerChildren` que ya usa la grilla de amenities de
         * ExperienceSection. Nota: esto solo reestiliza el envoltorio de cada
         * AccordionItem, nunca CANDYLAND.faqs ni el bloque `faqSchema(...)`
         * de useSeo (Home()) que arma el JSON-LD del FAQPage a partir de esos
         * mismos datos -- ese sigue generándose desde CANDYLAND.faqs, no del DOM. */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '400px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          <Accordion type="single" collapsible className="w-full">
            {CANDYLAND.faqs.map((faq, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } },
                }}
              >
                <AccordionItem value={`faq-${i}`} className="border-primary/15">
                  <AccordionTrigger className="text-left text-base md:text-lg font-semibold hover:text-primary">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
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
        src="/candyland/poster-hero-bg.webp"
        alt=""
        aria-hidden
        width={480}
        height={270}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover opacity-25 blur-2xl scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/70 to-background" />
      <div aria-hidden className="absolute inset-0 flex items-center justify-center">
        <div className="w-[36rem] h-[36rem] rounded-full bg-primary/15 blur-[150px]" />
      </div>

      {/* Momento tipográfico gigante -- ningún otro cierre de sección en la
       * página llega a esta escala; le da a este cierre un peso que antes
       * era casi una repetición del final del Hero (logo + heading + CTA
       * centrados sobre un blob, sin nada que lo distinga). Se recorta
       * contra el `overflow-hidden` de la sección a propósito. */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center overflow-hidden select-none pointer-events-none">
        <span className="font-heading font-black text-gradient-candy opacity-[0.22] text-[clamp(7rem,24vw,18rem)] leading-none tracking-tight whitespace-nowrap">
          ENTRA
        </span>
      </div>

      <motion.div {...reveal} className="container relative text-center max-w-3xl">
        <img
          src="/candyland/logo-wordmark.webp"
          alt=""
          aria-hidden
          width={300}
          height={300}
          loading="lazy"
          className="h-24 w-auto mx-auto mb-8 candy-float drop-shadow-[0_0_25px_oklch(0.70_0.19_340_/_0.3)]"
        />
        {EVENTO.fechaConfirmada ? (
          <>
            <h2 className="font-heading font-bold text-4xl md:text-7xl tracking-tight leading-[1.02] mb-6">
              Tu entrada es la llave a{' '}
              <span className="text-gradient-candy">{EVENTO.nombre}.</span>
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
          </>
        ) : (
          <>
            <h2 className="font-heading font-bold text-4xl md:text-7xl tracking-tight leading-[1.02] mb-6">
              La próxima{' '}
              <span className="text-gradient-candy">llave</span> se viene pronto.
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground">
              Todavía no hay fecha ni venta de entradas -- síguenos en Instagram para enterarte primero.
            </p>
          </>
        )}
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
          <img src="/candyland/logo-wordmark.webp" alt="Mansion Playroom" width={300} height={300} loading="lazy" className="h-12 w-auto" />

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
            <Link href="/politica-de-reembolso" className="hover:text-foreground transition-colors">Política de reembolso</Link>
            <Link href="/politica-de-privacidad" className="hover:text-foreground transition-colors">Política de privacidad</Link>
            <Link href="/panoramas" className="hover:text-foreground transition-colors">Panoramas</Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link href="/embajadores" className="hover:text-foreground transition-colors">Embajadores</Link>
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

  if (!EVENTO.fechaConfirmada) return null;

  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 96 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="fixed bottom-0 inset-x-0 z-40 p-3 md:hidden"
    >
      <Link
        href={`/checkout/${CANDYLAND.slug}`}
        className="btn-jelly w-full py-4 bg-primary text-primary-foreground rounded-full font-bold uppercase tracking-wide text-base shadow-[0_-4px_24px_oklch(0.70_0.19_340_/_0.25)] inline-flex items-center justify-center gap-2"
      >
        <Ticket className="w-5 h-5" />
        Quiero ir
      </Link>
    </motion.div>
  );
}

/* ─── Página ───────────────────────────────────────────────── */

export default function Home() {
  // La textura de ruido es una capa fija a pantalla completa (un SVG de
  // turbulencia) a opacity 0.03: en celular es prácticamente invisible y
  // cuesta una capa de composición del tamaño de toda la ventana. Se apaga
  // en touch con el mismo criterio que ya usan ScrollCandies, los caramelos
  // arrastrables y el parallax del hero.
  const [showNoise] = useState(() => isFinePointer());

  // El home es la única página que conserva "fiesta liberal" en el título
  // (junto con la del evento): antes /eventos, /entradas y /eventos/:slug
  // llevaban todas la misma frase y competían entre ellas por la misma
  // búsqueda, repartiendo la fuerza en vez de concentrarla.
  useSeo({
    title: 'Mansion Playroom — Fiesta Liberal en Viña del Mar | +18',
    description: 'La fiesta liberal más grande de la V Región: 2 pistas, Playground XXL y Kink Room. Comunidad, consentimiento y una noche para salir a bailar en Viña del Mar y Valparaíso. Evento +18.',
    path: '/',
    jsonLd: [
      faqSchema(CANDYLAND.faqs),
      eventSchema({
        name: CANDYLAND.nombre,
        description: CANDYLAND.heroTitulo,
        startDate: CANDYLAND.eventDate.toISOString(),
        slug: CANDYLAND.slug,
        priceFrom: PRECIO_MINIMO_ACCESO,
      }),
    ],
  });

  const { data: event } = trpc.events.getBySlug.useQuery({ slug: CANDYLAND.slug }, { retry: false });
  const { data: liveTickets } = trpc.events.getTicketTypes.useQuery(
    { slug: CANDYLAND.slug },
    // Polling suave: con DB conectada, el contador Misión 300 se actualiza solo
    // cuando entran compras aprobadas (webhook MP → soldCount). Sin DB, no-op.
    { retry: false, refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  // Personas de abonos de Misión 300 que todavía NO están resueltas (ni el
  // grupo juntó la meta, ni pagaron la diferencia) -- soldCount ya las cuenta
  // apenas se aprueba el abono (para que el stock no se sobrevenda), pero acá
  // hay que restarlas: el contador público solo debe mostrar entradas ya
  // confirmadas, no las que todavía dependen de que se resuelva la misión.
  const { data: pendingMission } = trpc.mission300.pendingPersonas.useQuery(
    { slug: CANDYLAND.slug },
    { retry: false, refetchInterval: 30_000, refetchIntervalInBackground: false },
  );

  const vendidos = useMemo(() => {
    if (liveTickets && liveTickets.length > 0) {
      // Cuenta PERSONAS solo de accesos (nunca extras como estacionamiento/piscolón):
      // cada entrada vendida suma según su acceso (dúo=2, trío=3…), usando el
      // accesoSlug real del ticket type en vez de matchear por nombre (frágil ante
      // mayúsculas/tildes) — más el baseline de la ticketera anterior.
      const vendidasDb = liveTickets.reduce((s, t: any) => {
        if (t.category !== 'acceso') return s;
        return s + (t.soldCount ?? 0) * personasForAccesoSlug(t.accesoSlug);
      }, 0) - (pendingMission?.personas ?? 0);
      return CANDYLAND.mision.baseline + vendidasDb;
    }
    return CANDYLAND.mision.confirmadosFallback;
  }, [liveTickets, pendingMission]);

  // Si el evento tiene `missionForceClosed`, Misión 300 no corre para este
  // evento (decisión del usuario para el aniversario: se vende solo por
  // tandas de precio, sin mostrar el total de gente confirmada). Un solo
  // memo para que `missionPricing` y `UrgencySection` usen el mismo criterio.
  const missionActive = useMemo(() => !!event?.eventDate && isMissionActiveForEvent(event), [event]);

  // Precio "gancho" para publicitar la preventa Misión 300 en el Hero y en su
  // propia sección: prioriza el acceso Dúo (el que se usa en toda la
  // comunicación de la preventa) y si no existe usa el acceso más barato.
  const missionPricing: MissionPricing = useMemo(() => {
    if (!liveTickets || liveTickets.length === 0) return null;
    if (!missionActive) return null;
    const accesos = liveTickets.filter((t: any) => t.category === 'acceso' && t.status === 'active');
    if (accesos.length === 0) return null;
    const destacado = accesos.find((t: any) => t.accesoSlug === 'duo')
      ?? [...accesos].sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];
    const generalPrice = Number((destacado as any).price);
    const depositPrice = missionDepositPrice((destacado as any).accesoSlug);
    if (!(depositPrice < generalPrice)) return null;
    return { generalPrice, depositPrice };
  }, [liveTickets, missionActive]);

  // Tanda vigente -- alimenta `TandaUrgencyCard` cuando Misión 300 está
  // cerrada para este evento. El "destacado" (mismo criterio que
  // `missionPricing`: prioriza Dúo, si no el más barato) solo decide de
  // dónde sale el countdown de alza de precio y el remanente/cupo -- la
  // lista de precios de abajo usa TODOS los accesos de la tanda, no solo él.
  const tanda: TandaInfo = useMemo(() => {
    if (!liveTickets || liveTickets.length === 0) return null;
    // Prioriza accesos activos (la tanda que se está vendiendo hoy); si TODOS
    // están agotados, cae a los agotados para poder mostrar "se agotó esta
    // tanda" en vez de no mostrar nada.
    const activos = liveTickets.filter((t: any) => t.category === 'acceso' && t.status === 'active');
    const pool = activos.length > 0 ? activos : liveTickets.filter((t: any) => t.category === 'acceso' && t.status === 'soldout');
    if (pool.length === 0) return null;
    const destacado = pool.find((t: any) => t.accesoSlug === 'duo')
      ?? [...pool].sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];

    // Cupo REAL vigente: si el destacado usa un cupo compartido (stockPools),
    // el remanente/total viene del POOL (poolRemaining/poolTotalCap, ya
    // resueltos por events.getTicketTypes) -- no de su totalStock propio,
    // que deja de ser el límite real en cuanto hay pool. Sin pool, se
    // comporta exactamente igual que antes (por fila).
    const usesPool = (destacado as any).stockPoolId != null && (destacado as any).poolTotalCap != null;
    const totalStock = usesPool
      ? Number((destacado as any).poolTotalCap)
      : Number((destacado as any).totalStock ?? 0);
    const remaining = usesPool
      ? Number((destacado as any).poolRemaining)
      : Math.max(0, totalStock - Number((destacado as any).soldCount ?? 0));

    // Precio de CADA acceso vigente de la tanda (Soltera, Soltero, Dúo,
    // Trío, Grupo...), no solo el destacado -- pedido explícito del dueño.
    const accesos: TandaAccesoPrecio[] = [...pool]
      .sort((a: any, b: any) => Number(a.price) - Number(b.price))
      .map((t: any) => ({
        name: t.name,
        price: Number(t.price),
        originalPrice: t.originalPrice ? Number(t.originalPrice) : null,
      }));

    return {
      remaining,
      totalStock,
      salesEnd: (destacado as any).salesEnd ? new Date((destacado as any).salesEnd) : null,
      soldOut: remaining <= 0 || (destacado as any).status === 'soldout',
      accesos,
    };
  }, [liveTickets]);

  return (
    <MotionConfig reducedMotion="user">
      <CandyIntro />
      <ScrollCandies />
      {showNoise && <div className="noise-overlay" />}
      <Hero />
      <ScrollStory />
      <UpcomingEventsSection />
      <UrgencySection vendidos={vendidos} missionPricing={missionPricing} missionActive={missionActive} tanda={tanda} eventId={event?.id} />
      <LineupSection />
      <ExperienceSection />
      <InfoSection />
      <FinalCTASection />
      <Footer />
      <StickyMobileCTA />
    </MotionConfig>
  );
}
