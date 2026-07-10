import { useEffect, useMemo, useState } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import {
  ArrowRight,
  Calendar,
  Car,
  Cigarette,
  Clock,
  Crown,
  Gamepad2,
  Heart,
  Instagram,
  MapPin,
  Martini,
  MessageCircle,
  Minus,
  Music,
  Music2,
  PartyPopper,
  Plus,
  ShieldCheck,
  Shirt,
  Sparkles,
  Ticket,
  User,
  Users,
  VenetianMask,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { trpc } from '@/lib/trpc';
import { CANDYLAND, formatCLP, type Acceso } from '@/config/candyland';

/* ─── Utilidades ───────────────────────────────────────────── */

const AMENITY_ICONS: Record<string, typeof Music> = {
  Music, Car, Shirt, Gamepad2, VenetianMask, Martini, Cigarette, ShieldCheck,
};

const ACCESO_ICONS: Record<string, typeof Heart> = {
  duo: Heart,
  soltera: Sparkles,
  soltero: User,
  trio: Users,
  cumpleaneros: PartyPopper,
  vip: Crown,
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
  document.getElementById('entradas')?.scrollIntoView({ behavior: 'smooth' });
}

/* ─── Hero ─────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden">
      {/* Fondo: video en desktop (si el usuario no pide movimiento reducido), afiche siempre de base */}
      {/* Blur alto + overlay fuerte: el afiche aporta color, no texto (tiene la fecha de la edición pasada) */}
      <img
        src="/candyland/poster-hero.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-30 blur-2xl scale-110"
      />
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-35 hidden motion-safe:md:block"
        src="/candyland/hero-video.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background" />

      {/* Brillos de club */}
      <div aria-hidden className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/25 blur-[120px] candy-float-slow" />
      <div aria-hidden className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-violet-electric/20 blur-[140px] candy-float" />
      <div aria-hidden className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-candy-blue/20 blur-[110px] candy-float-slow" />

      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto pt-24 pb-20">
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
          className="font-heading font-extrabold text-[min(9.5vw,7rem)] leading-[0.9] tracking-tighter text-gradient-candy drop-shadow-[0_4px_30px_rgba(255,46,99,0.25)] whitespace-nowrap"
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
          <a
            href="#experiencia"
            className="inline-flex items-center gap-2 px-8 py-4 border border-primary/40 text-foreground rounded-full text-base font-semibold hover:border-primary hover:text-primary transition-colors interactive"
          >
            Ver la experiencia
            <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
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

  return (
    <section className="relative py-16 md:py-20 border-y border-primary/15 bg-gradient-to-r from-primary/10 via-violet-electric/10 to-candy-blue/10 overflow-hidden">
      <div className="container grid lg:grid-cols-2 gap-12 items-center">
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

        <motion.div {...reveal} className="glass-candy rounded-3xl p-6 md:p-8">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-heading font-bold text-2xl md:text-3xl text-gradient-candy">{titulo}</h3>
            <span className="font-heading font-bold text-xl md:text-2xl text-foreground tabular-nums">
              {vendidos}<span className="text-muted-foreground">/{meta}</span>
            </span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${progreso}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric"
            />
          </div>
          <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">{copy}</p>
          <button
            onClick={scrollToEntradas}
            className="btn-jelly mt-5 inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide interactive"
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

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <motion.div {...reveal} className="md:col-span-2 relative rounded-3xl overflow-hidden aspect-[16/10] group">
            <img
              src="/candyland/poster-candy3d.webp"
              alt="Candyland"
              className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
            <div className="absolute bottom-6 left-6">
              <p className="font-heading font-bold text-2xl md:text-3xl">2 pistas de baile</p>
              <p className="text-muted-foreground">
                {CANDYLAND.pistas.map((p) => `${p.nombre} ${p.genero}`).join(' · ')}
              </p>
            </div>
          </motion.div>
          <motion.div {...reveal} className="relative rounded-3xl overflow-hidden aspect-[16/10] md:aspect-auto group">
            <img
              src="/candyland/candy-girl.webp"
              alt="Candy girl"
              className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
            <div className="absolute bottom-6 left-6">
              <p className="font-heading font-bold text-2xl">Energía Candy</p>
              <p className="text-muted-foreground">Dress code que se disfruta</p>
            </div>
          </motion.div>
        </div>

        <motion.div {...reveal} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CANDYLAND.amenities.map((a) => {
            const Icon = AMENITY_ICONS[a.icono] ?? Sparkles;
            return (
              <div
                key={a.texto}
                className="glass-candy rounded-2xl p-5 flex items-center gap-3 hover:border-primary/40 transition-colors"
              >
                <Icon className="w-6 h-6 text-primary shrink-0" />
                <span className="text-sm md:text-base font-medium">{a.texto}</span>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── Line-up ──────────────────────────────────────────────── */

function LineupSection() {
  const hayLineup = CANDYLAND.lineup.length > 0;
  return (
    <section className="py-24 md:py-32 bg-gradient-to-b from-transparent via-violet-electric/5 to-transparent">
      <div className="container">
        <motion.div {...reveal} className="mb-14">
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Line-up</p>
          <h2 className="font-heading font-bold text-4xl md:text-6xl tracking-tight">
            Quienes ponen <span className="text-gradient-candy">el azúcar</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {CANDYLAND.pistas.map((pista, i) => (
            <motion.div
              {...reveal}
              key={pista.nombre}
              className="relative rounded-3xl overflow-hidden glass-candy p-8 md:p-10 group"
            >
              <img
                src={i === 0 ? '/candyland/cubo-dj-1.webp' : '/candyland/audifonos-neon.webp'}
                alt=""
                aria-hidden
                className="absolute right-[-10%] bottom-[-20%] w-56 md:w-72 opacity-50 group-hover:opacity-75 transition-opacity duration-500 candy-float-slow"
              />
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">{pista.nombre}</p>
              <h3 className="font-heading font-bold text-5xl md:text-6xl text-gradient-candy mb-3">{pista.genero}</h3>
              <p className="text-muted-foreground text-lg">{pista.descripcion}</p>

              <div className="mt-8 space-y-3 relative z-10">
                {hayLineup ? (
                  CANDYLAND.lineup
                    .filter((dj) => dj.pista === pista.genero)
                    .map((dj) => (
                      <div key={dj.nombre} className="flex items-center gap-3">
                        <Music2 className="w-4 h-4 text-primary" />
                        <span className="font-semibold">{dj.nombre}</span>
                        {dj.horario && <span className="text-muted-foreground text-sm">{dj.horario}</span>}
                      </div>
                    ))
                ) : (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 text-sm text-primary">
                    <Sparkles className="w-4 h-4" /> Line-up por anunciar
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
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

function TicketCardStatic({ acceso }: { acceso: Acceso }) {
  const Icon = ACCESO_ICONS[acceso.id] ?? Ticket;
  const agotado = acceso.estado === 'soldout';
  return (
    <motion.div
      {...reveal}
      className={`relative glass-candy rounded-3xl p-6 md:p-7 flex flex-col ${
        acceso.id === 'vip' ? 'border-primary/50 shadow-[0_0_50px_rgba(255,79,195,0.15)]' : ''
      } ${agotado ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <div className="flex flex-col items-end gap-2">
          {estadoBadge(acceso.estado)}
          {acceso.exclusivoComunidad && (
            <span className="px-3 py-1 rounded-full bg-violet-electric/20 text-violet-electric text-xs font-bold uppercase tracking-wide">
              Exclusivo comunidad
            </span>
          )}
        </div>
      </div>
      <h3 className="font-heading font-bold text-2xl md:text-3xl mb-1">{acceso.nombre}</h3>
      <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{acceso.descripcion}</p>
      <ul className="space-y-2 mb-6">
        {acceso.beneficios.map((b) => (
          <li key={b} className="flex items-center gap-2 text-sm">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" /> {b}
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <p className="font-heading font-bold text-3xl mb-4">{formatCLP(acceso.precio)}</p>
        <button
          disabled={agotado}
          onClick={() =>
            toast('🍭 La venta se abre muy pronto', {
              description: 'Síguenos en Instagram para enterarte primero.',
            })
          }
          className={`btn-jelly w-full py-3.5 rounded-full font-bold uppercase tracking-wide text-sm interactive ${
            agotado
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {agotado ? 'Agotado' : 'Comprar'}
        </button>
      </div>
    </motion.div>
  );
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

function TicketsSection({ liveTickets }: { liveTickets: LiveTicket[] | undefined }) {
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const live = (liveTickets?.length ?? 0) > 0;

  const totalItems = Object.values(quantities).reduce((s, q) => s + q, 0);
  const totalPrice = (liveTickets ?? []).reduce(
    (s, t) => s + (quantities[t.id] || 0) * Number(t.price),
    0,
  );

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

        {live ? (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {liveTickets!
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
          </>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {CANDYLAND.accesos.map((a) => (
              <TicketCardStatic key={a.id} acceso={a} />
            ))}
          </div>
        )}

        <motion.p {...reveal} className="text-center text-muted-foreground text-sm mt-10">
          Pago seguro procesado por <span className="text-foreground font-semibold">Mercado Pago</span> · Evento +{CANDYLAND.edadMinima}
        </motion.p>
      </div>
    </section>
  );
}

/* ─── Galería ──────────────────────────────────────────────── */

function GallerySection() {
  return (
    <section className="py-24 md:py-32">
      <div className="container">
        <motion.div {...reveal} className="flex flex-wrap items-end justify-between gap-6 mb-14">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">La mansión vive</p>
            <h2 className="font-heading font-bold text-4xl md:text-6xl tracking-tight">
              Esto no se explica.
              <br />
              <span className="text-gradient-candy">Se vive.</span>
            </h2>
          </div>
        </motion.div>

        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [&>*]:mb-4">
          {CANDYLAND.galeria.map((img) => (
            <motion.div
              {...reveal}
              key={img.src}
              className="relative rounded-2xl overflow-hidden group break-inside-avoid"
            >
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                className="w-full transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Info esencial + FAQ ──────────────────────────────────── */

function InfoSection() {
  return (
    <section className="py-24 md:py-32 bg-gradient-to-b from-transparent via-primary/5 to-transparent">
      <div className="container grid lg:grid-cols-2 gap-12 items-start">
        <motion.div {...reveal} className="relative rounded-3xl overflow-hidden lg:sticky lg:top-28">
          <img src="/candyland/mansion-noche.webp" alt="La mansión de noche" className="w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
          <div className="absolute bottom-0 p-6 md:p-8">
            <h3 className="font-heading font-bold text-3xl md:text-4xl mb-2">La Mansión</h3>
            <p className="text-muted-foreground max-w-md">
              {CANDYLAND.lugar}. {CANDYLAND.afterTexto}.
            </p>
          </div>
        </motion.div>

        <motion.div {...reveal}>
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Lo esencial</p>
          <h2 className="font-heading font-bold text-4xl md:text-5xl tracking-tight mb-8">
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
      return liveTickets.reduce((s, t) => s + (t.soldCount ?? 0), 0);
    }
    return CANDYLAND.mision.confirmadosFallback;
  }, [liveTickets]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="noise-overlay" />
      <Hero />
      <UrgencySection vendidos={vendidos} />
      <ExperienceSection />
      <LineupSection />
      <TicketsSection liveTickets={liveTickets as LiveTicket[] | undefined} />
      <GallerySection />
      <InfoSection />
      <FinalCTASection />
      <Footer />
      <StickyMobileCTA />
    </MotionConfig>
  );
}
