import { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight, Calendar, MapPin, Ticket, Users, Star } from 'lucide-react';
import HeroScene from '@/components/HeroScene';
import { trpc } from '@/lib/trpc';

function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePos({
          x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
          y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
        });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <section ref={containerRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <HeroScene />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background z-[1]" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
          style={{
            transform: `translate(${mousePos.x * -10}px, ${mousePos.y * -10}px)`,
          }}
        >
          <p className="text-sm md:text-base uppercase tracking-[0.3em] text-primary mb-6 font-medium">
            Fiestas que no se repiten
          </p>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="font-heading text-[3.5rem] sm:text-6xl md:text-8xl lg:text-[10rem] leading-[0.85] tracking-tight mb-8"
          style={{ transform: `translate(${mousePos.x * -20}px, ${mousePos.y * -15}px)` }}
        >
          <span className="text-gradient block overflow-hidden">MANSION</span>
          <br />
          <span className="text-foreground block overflow-hidden">PLAYROOM</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8, ease: [0.23, 1, 0.32, 1] }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          style={{
            transform: `translate(${mousePos.x * -5}px, ${mousePos.y * -5}px)`,
          }}
        >
          Donde la noche cobra vida. Experiencias inmersivas, fiestas exclusivas y momentos que no olvidarás.
        </motion.p>


        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.1, ease: [0.23, 1, 0.32, 1] }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link
            href="/eventos"
            className="group inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold transition-all duration-300 hover:scale-105 active:scale-95 glow-pink interactive"
          >
            Ver Eventos
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/nosotros"
            className="inline-flex items-center gap-3 px-8 py-4 border border-border text-foreground rounded-full text-lg font-semibold transition-all duration-300 hover:border-primary hover:text-primary interactive"
          >
            Conocer Más
          </Link>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <div className="w-6 h-10 border-2 border-muted-foreground/50 rounded-full flex justify-center">
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 bg-primary rounded-full mt-2"
          />
        </div>
      </motion.div>
    </section>
  );
}

function FeaturedEvents() {
  const { data: eventsData } = trpc.events.listPublished.useQuery();
  const events = eventsData ?? [];

  const { scrollYProgress } = useScroll();
  const x = useTransform(scrollYProgress, [0.1, 0.4], ['0%', '-20%']);

  return (
    <section className="py-32 overflow-hidden">
      <div className="container mb-16">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Próximos Eventos</p>
          <h2 className="font-heading text-4xl md:text-6xl lg:text-7xl tracking-tight">
            Experiencias que
            <br />
            <span className="text-gradient">no te puedes perder</span>
          </h2>
        </motion.div>
      </div>

      {events.length > 0 ? (
        <motion.div style={{ x }} className="flex gap-6 px-8">
          {events.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="min-w-[350px] md:min-w-[450px] group"
            >
              <Link href={`/eventos/${event.slug}`}>
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-card border border-border/50 transition-all duration-500 group-hover:border-primary/50 group-hover:scale-[1.02]">
                  {event.imageUrl ? (
                    <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                      <Ticket className="w-16 h-16 text-primary/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex items-center gap-2 text-primary text-sm mb-2">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(event.eventDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    <h3 className="font-heading text-2xl md:text-3xl mb-2">{event.title}</h3>
                    {event.venue && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <MapPin className="w-4 h-4" />
                        <span>{event.venue}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="aspect-[3/4] rounded-2xl bg-gradient-to-br from-card via-card to-primary/5 border border-border/30 flex items-center justify-center relative overflow-hidden group hover:border-primary/30 transition-all duration-500"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,oklch(0.7_0.25_330/0.05),transparent_70%)]" />
                <div className="absolute top-4 right-4 w-20 h-20 border border-primary/10 rounded-full" />
                <div className="absolute bottom-4 left-4 w-12 h-12 border border-secondary/10 rounded-full" />
                <div className="text-center p-8 relative z-10">
                  <div className="w-16 h-16 mx-auto mb-4 border border-primary/20 rounded-xl flex items-center justify-center group-hover:border-primary/50 transition-colors">
                    <Ticket className="w-8 h-8 text-primary/40 group-hover:text-primary/70 transition-colors" />
                  </div>
                  <p className="font-heading text-lg text-foreground/80">Próximamente</p>
                  <p className="text-muted-foreground text-sm mt-1">Algo grande se viene</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatsSection() {
  const stats = [
    { icon: Users, value: '10K+', label: 'Asistentes' },
    { icon: Calendar, value: '50+', label: 'Eventos' },
    { icon: Star, value: '4.9', label: 'Rating' },
    { icon: Ticket, value: '100%', label: 'Seguro' },
  ];

  return (
    <section className="py-24 border-y border-border/50">
      <div className="container">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              <stat.icon className="w-8 h-8 text-primary mx-auto mb-4" />
              <p className="font-heading text-4xl md:text-5xl text-gradient mb-2">{stat.value}</p>
              <p className="text-muted-foreground text-sm uppercase tracking-wider">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className="py-32">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Sobre Nosotros</p>
            <h2 className="font-heading text-4xl md:text-6xl tracking-tight mb-6">
              Donde el arte
              <br />
              <span className="text-gradient">se vuelve fiesta</span>
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Mansion Playroom transforma cada noche en un ritual colectivo. Diseñamos
              experiencias sensoriales donde el sonido, la luz y la energía humana convergen
              en algo irrepetible. No hacemos eventos, creamos recuerdos que marcan.
            </p>
            <Link
              href="/nosotros"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:gap-4 transition-all duration-300 interactive"
            >
              Descubre más <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="aspect-square rounded-3xl bg-gradient-to-br from-primary/20 via-card to-secondary/20 border border-border/50 flex items-center justify-center overflow-hidden">
              <img
                src="/manus-storage/logo-playroom_2ea4ca93.png"
                alt="Mansion Playroom"
                className="w-2/3 h-auto opacity-80"
              />
            </div>
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/20 rounded-full blur-xl" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-secondary/20 rounded-full blur-xl" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-secondary/10" />
      <div className="container relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="font-heading text-4xl md:text-6xl lg:text-7xl tracking-tight mb-6">
            Tu próxima noche
            <br />
            <span className="text-gradient">empieza aquí</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
            Las entradas vuelan. Asegura tu lugar antes de que sea demasiado tarde.
          </p>
          <Link
            href="/eventos"
            className="inline-flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground rounded-full text-xl font-bold transition-all duration-300 hover:scale-105 active:scale-95 glow-pink interactive"
          >
            Comprar Entradas
            <Ticket className="w-6 h-6" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/50 py-16">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <img
              src="/manus-storage/logo-playroom_2ea4ca93.png"
              alt="Mansion Playroom"
              className="h-16 w-auto mb-4"
            />
            <p className="text-muted-foreground max-w-sm">
              Cada noche es un capítulo nuevo. Santiago, Chile.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4 uppercase tracking-wider text-sm">Navegación</h4>
            <div className="flex flex-col gap-3">
              <Link href="/" className="text-muted-foreground hover:text-primary transition-colors interactive">Inicio</Link>
              <Link href="/eventos" className="text-muted-foreground hover:text-primary transition-colors interactive">Eventos</Link>
              <Link href="/nosotros" className="text-muted-foreground hover:text-primary transition-colors interactive">Nosotros</Link>
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4 uppercase tracking-wider text-sm">Legal</h4>
            <div className="flex flex-col gap-3">
              <span className="text-muted-foreground">Términos y Condiciones</span>
              <span className="text-muted-foreground">Política de Privacidad</span>
              <span className="text-muted-foreground">Política de Reembolso</span>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} Mansion Playroom. Todos los derechos reservados.
          </p>
          <p className="text-muted-foreground text-sm">Santiago, Chile</p>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <div className="noise-overlay" />
      <HeroSection />
      <FeaturedEvents />
      <StatsSection />
      <AboutSection />
      <CTASection />
      <Footer />
    </div>
  );
}
