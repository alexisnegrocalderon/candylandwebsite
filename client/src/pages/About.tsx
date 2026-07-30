import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { breadcrumbSchema } from '@shared/structuredData';

/* Los tres valores de CANDYLAND.valores (Respeto, Consentimiento, Libertad),
 * explicados en concreto. En el config son solo tres palabras; acá se dice qué
 * significan en la práctica, que es lo que de verdad responde la duda de
 * alguien que nunca ha ido. */
const VALORES_EXPLICADOS = [
  {
    titulo: 'Respeto',
    texto: 'Nadie comenta, juzga ni fotografía lo que hacen los demás. Lo que pasa adentro se queda adentro, y eso incluye no sacar el celular donde no corresponde.',
  },
  {
    titulo: 'Consentimiento',
    texto: 'Todo se pregunta. Un "no" se respeta a la primera, sin explicaciones y sin insistir. No es una formalidad: es la regla que sostiene todo lo demás.',
  },
  {
    titulo: 'Libertad',
    texto: 'Cada quien decide su noche. Mirar es válido, participar es válido, y quedarse bailando toda la noche sin hacer ninguna de las dos también lo es.',
  },
];

export default function About() {
  // Intención de confianza: comunidad, consentimiento y seguridad. Es la
  // página que responde "¿puedo confiar en esta gente?", no una segunda
  // versión del pitch comercial.
  useSeo({
    title: 'Quiénes Somos — Comunidad y Consentimiento | Mansion Playroom',
    description: 'Cómo cuidamos el espacio: respeto, consentimiento y libertad. Conoce la comunidad detrás de las noches de Mansion Playroom en la Región de Valparaíso.',
    path: '/nosotros',
    jsonLd: [
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Nosotros', path: '/nosotros' },
      ]),
    ],
  });

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
            Mansion Playroom nació con la misión de transformar la vida nocturna de la V Región.
            Somos la fiesta liberal de referencia para salir a bailar en Viña del Mar y Valparaíso:
            creemos que cada evento debe ser una experiencia sensorial completa, donde la música,
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
            <h2 className="font-heading text-2xl mb-4 text-gradient">Nuestra Visión</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ser la referencia en eventos exclusivos en Latinoamérica, creando comunidades
              que comparten la pasión por las experiencias premium y la vida nocturna de calidad.
            </p>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-8">
            <h2 className="font-heading text-2xl mb-4 text-gradient">Nuestra Misión</h2>
            <p className="text-muted-foreground leading-relaxed">
              Diseñar y producir eventos que superen todas las expectativas, con atención
              obsesiva al detalle, tecnología de punta y un compromiso inquebrantable con la calidad.
            </p>
          </div>
        </motion.div>

        {/* Los tres valores del config, explicados. Es la sección que responde
            la duda real de quien nunca ha ido: "¿es seguro?". */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="max-w-3xl mb-16"
        >
          <h2 className="font-heading text-3xl md:text-4xl tracking-tight mb-4">
            Cómo cuidamos <span className="text-gradient">el espacio</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-8">
            Una noche así solo funciona si todo el mundo se siente seguro. Por eso nuestras tres
            reglas no son decorativas: son lo que hace que el lugar funcione, y se aplican sin
            excepciones.
          </p>

          <div className="space-y-5">
            {VALORES_EXPLICADOS.map((valor) => (
              <div key={valor.titulo} className="glass-candy rounded-2xl p-6">
                <h3 className="font-heading text-xl mb-2">{valor.titulo}</h3>
                <p className="text-muted-foreground leading-relaxed">{valor.texto}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mt-6 leading-relaxed">
            Si alguien no respeta estas reglas, se va del evento. No hay una segunda conversación,
            y esa firmeza es precisamente lo que permite que el resto se relaje.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="max-w-3xl mb-16"
        >
          <h2 className="font-heading text-3xl md:text-4xl tracking-tight mb-4">
            ¿Es tu <span className="text-gradient">primera vez</span>?
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Es la pregunta que más nos llega, así que va directo: no pasa nada que tú no quieras que
            pase. Puedes venir, bailar toda la noche, tomarte algo y volver a tu casa sin haber hecho
            nada más. Es completamente válido y pasa todo el tiempo.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-6">
            El recinto tiene zonas con intensidades distintas: las pistas son pistas —se baila, se
            conversa, se toma algo— y las zonas más íntimas están separadas, así que entrar a ellas
            es siempre una decisión activa. Nadie llega ahí por accidente.
          </p>
          <Link
            href="/blog/primera-vez-que-esperar"
            className="inline-flex items-center gap-2 text-primary font-semibold hover:underline interactive"
          >
            Leer la guía completa para tu primera vez <ArrowRight className="w-4 h-4" />
          </Link>
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

