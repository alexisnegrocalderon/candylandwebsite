import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl"
        >
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Sobre Nosotros</p>
          <h1 className="font-heading text-5xl md:text-7xl tracking-tight mb-8">
            Creamos <span className="text-gradient">experiencias</span> inolvidables
          </h1>
          <p className="text-muted-foreground text-xl leading-relaxed mb-12">
            Mansion Playroom nació con la misión de transformar la vida nocturna en Chile.
            Creemos que cada evento debe ser una experiencia sensorial completa, donde la música,
            el arte visual y la energía de las personas se fusionan para crear momentos únicos e irrepetibles.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16"
        >
          <div className="bg-card border border-border/50 rounded-2xl p-8">
            <h3 className="font-heading text-2xl mb-4 text-gradient">Nuestra Visión</h3>
            <p className="text-muted-foreground leading-relaxed">
              Ser la referencia en eventos exclusivos en Latinoamérica, creando comunidades
              que comparten la pasión por las experiencias premium y la vida nocturna de calidad.
            </p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-8">
            <h3 className="font-heading text-2xl mb-4 text-gradient">Nuestra Misión</h3>
            <p className="text-muted-foreground leading-relaxed">
              Diseñar y producir eventos que superen todas las expectativas, con atención
              obsesiva al detalle, tecnología de punta y un compromiso inquebrantable con la calidad.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-center"
        >
          <Link
            href="/eventos"
            className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold transition-all hover:scale-105 active:scale-95 glow-pink interactive"
          >
            Ver Eventos <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

