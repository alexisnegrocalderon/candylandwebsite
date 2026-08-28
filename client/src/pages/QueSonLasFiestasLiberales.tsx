import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight, Instagram, RotateCcw, Sparkles } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { articleSchema, breadcrumbSchema } from '@shared/structuredData';
import { CANDYLAND } from '@/config/candyland';

/* Página especial standalone (no un Article más del blog): el pipeline de
 * contenido (content/blog/*.ts + ArticleLayout) es a propósito solo datos de
 * texto, sin componentes embebidos -- meterle un quiz interactivo ahí
 * hubiera roto ese contrato. Esta vive fuera de ese sistema, con su propia
 * ruta registrada en App.tsx antes de la genérica /blog/:slug. */

const INSTAGRAM_HANDLE = CANDYLAND.redes.instagram.split('/').filter(Boolean).pop();

type Mito = { mito: string; realidad: string };

const MITOS: Mito[] = [
  {
    mito: 'Es solo sobre sexo',
    realidad: 'Es sobre todo sobre comunidad, baile y conexión. Lo íntimo pasa solo si tú quieres, cuándo quieres y con quién quieres -- nunca es el punto de partida obligatorio.',
  },
  {
    mito: 'Es peligroso o descontrolado',
    realidad: 'Hay dress code, staff, zonas claras y reglas de convivencia. El respeto y el consentimiento no son un eslogan: son lo que sostiene que la noche funcione.',
  },
  {
    mito: 'Es solo para parejas',
    realidad: 'Hay accesos pensados para solteras, solteros (con validación de comunidad) y grupos. Nadie queda afuera por venir solo.',
  },
  {
    mito: 'Hay presión para "participar"',
    realidad: 'Puedes ir, bailar, tomar algo y simplemente mirar toda la noche. Nadie te empuja a nada -- el "no" se respeta siempre, sin explicaciones.',
  },
  {
    mito: 'Da vergüenza ir la primera vez',
    realidad: 'La mayoría de la gente que vas a conocer también fue primeriza alguna vez. Hay guías completas de qué esperar antes de decidirte.',
  },
];

type Opcion = { label: string; puntos: number };
type Pregunta = { id: string; texto: string; opciones: Opcion[] };

const PREGUNTAS: Pregunta[] = [
  {
    id: 'q1',
    texto: '¿Qué te trajo hasta acá?',
    opciones: [
      { label: 'Pura curiosidad, recién estoy averiguando', puntos: 0 },
      { label: 'Llevo tiempo dándole vueltas a la idea', puntos: 1 },
      { label: 'Ya quiero vivirlo, solo me falta el empujón', puntos: 2 },
    ],
  },
  {
    id: 'q2',
    texto: '¿Qué es lo que más te gustaría encontrar en una noche así?',
    opciones: [
      { label: 'Gente nueva, buena música y buena vibra', puntos: 1 },
      { label: 'Un espacio sin juicios donde ser yo sin filtro', puntos: 2 },
      { label: 'Todavía no lo tengo claro', puntos: 0 },
    ],
  },
  {
    id: 'q3',
    texto: '¿Qué tan cómodx te sientes con la idea del consentimiento explícito (preguntar y que te pregunten)?',
    opciones: [
      { label: 'Me encanta que sea así de claro', puntos: 2 },
      { label: 'Me hace sentido, aunque es nuevo para mí', puntos: 1 },
      { label: 'Todavía me da un poco de pudor', puntos: 0 },
    ],
  },
  {
    id: 'q4',
    texto: '¿Con quién te imaginas yendo?',
    opciones: [
      { label: 'Con mi pareja', puntos: 2 },
      { label: 'Sola/o o con amigues', puntos: 1 },
      { label: 'Todavía no sé si ir acompañadx', puntos: 0 },
    ],
  },
  {
    id: 'q5',
    texto: 'Si hoy compraras tu entrada, ¿qué tan lista/o te sientes?',
    opciones: [
      { label: 'Lista/o, solo dime cuándo', puntos: 2 },
      { label: 'Con ganas, pero quiero leer un poco más antes', puntos: 1 },
      { label: 'Prefiero informarme con calma primero', puntos: 0 },
    ],
  },
];

const PUNTAJE_MAX = PREGUNTAS.reduce((acc, p) => acc + Math.max(...p.opciones.map((o) => o.puntos)), 0);

type Resultado = {
  titulo: string;
  copy: string;
  ctaLabel: string;
  ctaHref: string;
};

function resultadoPara(puntaje: number): Resultado {
  if (puntaje <= 3) {
    return {
      titulo: 'Todavía resolviendo tus dudas',
      copy: 'Totalmente normal -- antes de decidir cualquier cosa, vale la pena leer qué esperar realmente en tu primera vez.',
      ctaLabel: 'Leer: qué esperar en tu primera vez',
      ctaHref: '/blog/primera-vez-que-esperar',
    };
  }
  if (puntaje <= 7) {
    return {
      titulo: 'Con curiosidad y con ganas',
      copy: 'Ya tienes la inquietud -- síguenos en Instagram para enterarte apenas anunciemos la próxima fecha.',
      ctaLabel: 'Síguenos en Instagram',
      ctaHref: CANDYLAND.redes.instagram,
    };
  }
  return {
    titulo: 'Lista/o para vivirlo',
    copy: 'Sabes lo que buscas. Revisa el calendario de próximos eventos para no perderte la siguiente noche.',
    ctaLabel: 'Ver próximos eventos',
    ctaHref: '/eventos',
  };
}

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '100px' },
  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const },
};

function MitoCard({ mito, realidad }: Mito) {
  const [volteada, setVolteada] = useState(false);
  return (
    <div className="[perspective:1200px]">
      <motion.button
        type="button"
        onClick={() => setVolteada((v) => !v)}
        aria-pressed={volteada}
        aria-label={volteada ? `Realidad: ${realidad}` : `Mito: ${mito}. Toca para ver la realidad`}
        className="relative w-full text-left h-56 md:h-48 interactive [transform-style:preserve-3d]"
        animate={{ rotateY: volteada ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="absolute inset-0 glass-candy rounded-2xl p-5 flex flex-col justify-between [backface-visibility:hidden]">
          <span className="text-[10px] uppercase tracking-[0.25em] text-cherry font-bold">Mito</span>
          <p className="font-heading font-bold text-lg md:text-xl">{mito}</p>
          <span className="text-xs text-muted-foreground">Toca para ver la realidad →</span>
        </div>
        <div
          className="absolute inset-0 glass-candy-pastel rounded-2xl p-5 flex flex-col justify-between [backface-visibility:hidden]"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <span className="text-[10px] uppercase tracking-[0.25em] text-primary font-bold">Realidad</span>
          <p className="text-sm md:text-base text-foreground/90 leading-relaxed">{realidad}</p>
          <span className="text-xs text-muted-foreground">← Toca para volver</span>
        </div>
      </motion.button>
    </div>
  );
}

function Quiz() {
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const respondidas = Object.keys(respuestas).length;
  const terminado = respondidas === PREGUNTAS.length;
  const puntaje = useMemo(() => Object.values(respuestas).reduce((a, b) => a + b, 0), [respuestas]);
  const progreso = Math.round((respondidas / PREGUNTAS.length) * 100);

  const elegir = (preguntaId: string, puntos: number) => {
    setRespuestas((prev) => ({ ...prev, [preguntaId]: puntos }));
  };

  const reiniciar = () => setRespuestas({});

  return (
    <div className="glass-candy rounded-3xl p-6 md:p-10">
      <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-8">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progreso}%` }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric relative overflow-hidden"
        >
          <span className="absolute inset-0 candy-bar-shine" />
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        {!terminado ? (
          <motion.div
            key="preguntas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {PREGUNTAS.map((p, i) => {
              const yaRespondida = respuestas[p.id] !== undefined;
              const esSiguiente = i === respondidas;
              if (i > respondidas) return null;
              return (
                <div key={p.id} className={esSiguiente || yaRespondida ? '' : 'opacity-40'}>
                  <p className="font-heading font-bold text-lg md:text-xl mb-4">
                    {i + 1}. {p.texto}
                  </p>
                  <div className="grid gap-3">
                    {p.opciones.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => elegir(p.id, o.puntos)}
                        disabled={yaRespondida}
                        className={`btn-jelly interactive text-left px-5 py-3.5 rounded-2xl border transition-colors ${
                          respuestas[p.id] === o.puntos
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card border-border/50 hover:border-primary/40 disabled:opacity-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="resultado"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="text-center"
          >
            <div className="relative w-16 h-16 mx-auto mb-5 flex items-center justify-center">
              <div aria-hidden className="absolute inset-0 rounded-full bg-primary/30 blur-xl candy-glow-pulse" />
              <div className="relative w-12 h-12 rounded-full glass-candy flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
            </div>
            {(() => {
              const r = resultadoPara(puntaje);
              const esInterno = r.ctaHref.startsWith('/');
              return (
                <>
                  <p className="font-heading font-extrabold text-2xl md:text-3xl text-gradient-candy mb-3">
                    {r.titulo}
                  </p>
                  <p className="text-muted-foreground max-w-md mx-auto mb-7">{r.copy}</p>
                  {esInterno ? (
                    <Link
                      href={r.ctaHref}
                      className="btn-jelly inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
                    >
                      {r.ctaLabel} <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    <a
                      href={r.ctaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-jelly inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
                    >
                      <Instagram className="w-4 h-4" /> {r.ctaLabel}
                    </a>
                  )}
                </>
              );
            })()}
            <button
              type="button"
              onClick={reiniciar}
              className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors interactive mx-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Responder de nuevo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function QueSonLasFiestasLiberales() {
  const path = '/blog/que-son-las-fiestas-liberales';

  useSeo({
    title: '¿Qué son las fiestas liberales? — Mansion Playroom',
    description: 'Mitos, realidades y un quiz rápido para saber si una fiesta liberal es para ti -- respeto, consentimiento y libertad, explicado sin vueltas.',
    path,
    jsonLd: [
      articleSchema({
        headline: '¿Qué son las fiestas liberales?',
        description: 'Mitos, realidades y un quiz rápido para saber si una fiesta liberal es para ti.',
        url: path,
        datePublished: '2026-08-11',
      }),
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Blog', path: '/blog' },
        { name: '¿Qué son las fiestas liberales?', path },
      ]),
    ],
  });

  return (
    <div className="min-h-screen pt-24 pb-16">
      <article className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <nav aria-label="Migas de pan" className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
            <span aria-hidden>/</span>
            <Link href="/blog" className="hover:text-primary transition-colors">Blog</Link>
          </nav>

          <div className="text-5xl mb-4" aria-hidden>✨</div>
          <h1 className="font-heading font-extrabold text-3xl md:text-5xl tracking-tight mb-4 leading-[1.1]">
            ¿Qué son las <span className="text-gradient-candy">fiestas liberales</span>?
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-10">
            Sin vueltas ni exageraciones: acá te contamos qué son de verdad, desarmamos los mitos más comunes, y
            al final un quiz de dos minutos te dice qué tan lista/o estás para vivirlo.
          </p>

          <div className="space-y-6 text-muted-foreground leading-relaxed mb-14">
            <p>
              Una fiesta liberal es un espacio de fiesta para adultos donde la <strong className="text-foreground">libertad</strong>,
              el <strong className="text-foreground">respeto</strong> y el <strong className="text-foreground">consentimiento</strong> son
              las reglas del juego, no solo un eslogan en el flyer. Hay música, baile, distintas zonas del recinto,
              y un ambiente pensado para que cada persona decida qué tan lejos quiere llegar en su propia noche --
              desde solo bailar y conocer gente, hasta explorar lo que quiera con quien quiera, siempre que ambas
              partes estén de acuerdo.
            </p>
            <p>
              No hay un solo tipo de persona que vaya: parejas, solteras, solteros validados por la comunidad y
              grupos de amigues comparten el mismo espacio. Lo que sí es transversal es el criterio de entrada:
              mayoría de edad, dress code, y una comunidad que prioriza que todos se sientan seguros.
            </p>
          </div>

          <section {...reveal} className="mb-14">
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-3 text-center">Toca las cartas</p>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-center mb-8">
              Mitos <span className="text-gradient-candy">vs.</span> Realidad
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {MITOS.map((m) => (
                <MitoCard key={m.mito} {...m} />
              ))}
            </div>
          </section>

          <section {...reveal}>
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-3 text-center">2 minutos</p>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-center mb-2">
              ¿Es esto <span className="text-gradient-candy">para ti</span>?
            </h2>
            <p className="text-muted-foreground text-center mb-8 max-w-md mx-auto">
              Responde estas 5 preguntas rápidas y te decimos qué tan lista/o estás -- sin compromiso, es solo
              para orientarte.
            </p>
            <Quiz />
          </section>

          <div className="glass-candy rounded-2xl p-6 md:p-8 mt-14 text-center">
            <p className="text-base md:text-lg mb-5">¿Todavía tienes dudas? Escríbenos por Instagram sin compromiso.</p>
            <a
              href={CANDYLAND.redes.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-jelly inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
            >
              <Instagram className="w-4 h-4" /> Síguenos en Instagram @{INSTAGRAM_HANDLE}
            </a>
          </div>
        </motion.div>
      </article>
    </div>
  );
}
