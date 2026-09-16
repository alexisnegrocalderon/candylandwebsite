import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Instagram } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { articleSchema, breadcrumbSchema } from '@shared/structuredData';
import { CANDYLAND } from '@/config/candyland';
import { EVENT_BRAND } from '@shared/eventBrand';
import { Quiz, type Pregunta, type Resultado } from '@/components/Quiz';

/* Página especial standalone (no un Article más del blog), mismo criterio
 * que QueSonLasFiestasLiberales.tsx/PlayCardArticle.tsx: el pipeline de
 * contenido (content/blog/*.ts + ArticleLayout) es a propósito solo texto
 * plano, sin componentes embebidos -- un quiz interactivo no entra ahí.
 *
 * Reemplaza al viejo `content/blog/dress-code-explicado.ts`, que quedó
 * escrito 100% sobre el código de vestimenta genérico ("candy sensual") y
 * nunca se actualizó cuando el 2º aniversario pasó a exigir disfraz
 * obligatorio -- quedó desalineado con el FAQ y los correos, que ya leían
 * `EVENT_BRAND.dressCode`. Acá se lee ese mismo campo para el texto real
 * (nunca se reescribe a mano), así no puede volver a desalinearse. */

const INSTAGRAM_HANDLE = CANDYLAND.redes.instagram.split('/').filter(Boolean).pop();

const TIPS = [
  'Usa algo que ya tienes: un color fuerte, brillo o textura que no uses todos los días ya cuenta.',
  'Suma un solo accesorio que marque la diferencia -- antifaz, orejas, un collar llamativo.',
  'Si quieres ir más allá, hay tiendas de disfraces y segunda mano con precios bajos -- no hace falta gastar en algo nuevo de marca.',
];

const PREGUNTAS: Pregunta[] = [
  {
    id: 'q1',
    texto: '¿Qué tienes más a mano ahora mismo?',
    opciones: [
      { label: 'Nada especial, tendría que improvisar', puntos: 0 },
      { label: 'Algo con brillo o un color fuerte que ya tengo', puntos: 1 },
      { label: 'Ya tengo pensado un disfraz completo', puntos: 2 },
    ],
  },
  {
    id: 'q2',
    texto: '¿Cuánto tiempo le vas a dedicar antes de salir?',
    opciones: [
      { label: 'Nada, salgo tal cual', puntos: 0 },
      { label: 'Un rato antes de salir', puntos: 1 },
      { label: 'Ya tengo un plan armado hace días', puntos: 2 },
    ],
  },
  {
    id: 'q3',
    texto: 'Si tuvieras que salir en 5 minutos, ¿qué te pondrías?',
    opciones: [
      { label: 'Nada que grite "disfraz"', puntos: 0 },
      { label: 'Un antifaz o accesorio que tengo por ahí', puntos: 1 },
      { label: 'Mi disfraz ya está listo en el clóset', puntos: 2 },
    ],
  },
  {
    id: 'q4',
    texto: '¿Cómo prefieres que te reconozcan esa noche?',
    opciones: [
      { label: 'Por la actitud, no por la ropa', puntos: 0 },
      { label: 'Por un detalle llamativo', puntos: 1 },
      { label: 'Por el look completo', puntos: 2 },
    ],
  },
];

function resultadoPara(puntaje: number): Resultado {
  if (puntaje <= 2) {
    return {
      titulo: 'Máscara y actitud',
      copy: 'Con un antifaz o un accesorio con brillo ya cumples -- lo que pide la noche es que vengas con algo, no que sea de vitrina. Lo importante es venir disfrazado, no que sea perfecto.',
      ctaLabel: 'Ver mi entrada',
      ctaHref: '/eventos',
    };
  }
  if (puntaje <= 5) {
    return {
      titulo: 'Con un guiño',
      copy: 'Ya tienes la idea clara: un color, un accesorio o una textura que marca la diferencia. Con eso más que sobra para la noche.',
      ctaLabel: 'Ver mi entrada',
      ctaHref: '/eventos',
    };
  }
  return {
    titulo: 'Full producción',
    copy: 'Vienes list@ -- ya tienes tu disfraz armado. Nos vemos ahí.',
    ctaLabel: 'Ver mi entrada',
    ctaHref: '/eventos',
  };
}

export default function DressCodeArticle() {
  const path = '/blog/dress-code-explicado';

  useSeo({
    title: 'Disfraz Obligatorio — 2º Aniversario Mansion Playroom',
    description: 'No tiene que ser profesional, pero sí es obligatorio. Tips reales para resolverlo sin gastar y un quiz de 2 minutos: descubre tu nivel de disfraz.',
    path,
    jsonLd: [
      articleSchema({
        headline: 'Disfraz Obligatorio',
        description: 'No tiene que ser profesional, pero sí es obligatorio -- tips reales y un quiz para saber tu nivel de disfraz.',
        url: path,
        datePublished: '2026-09-16',
      }),
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Blog', path: '/blog' },
        { name: 'Disfraz Obligatorio', path },
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

          <div className="text-5xl mb-4" aria-hidden>🎭</div>
          <h1 className="font-heading font-extrabold text-3xl md:text-5xl tracking-tight mb-4 leading-[1.1]">
            Disfraz <span className="text-gradient-candy">Obligatorio</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-10">
            {EVENT_BRAND.dressCode}
          </p>

          <div className="glass-candy rounded-2xl p-6 md:p-8 mb-14">
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-3">No tiene que ser profesional</p>
            <ul className="space-y-3">
              {TIPS.map((tip) => (
                <li key={tip} className="flex gap-3 text-muted-foreground leading-relaxed">
                  <span className="text-primary shrink-0" aria-hidden>•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <section>
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-3 text-center">1 minuto</p>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-center mb-2">
              ¿Qué tan <span className="text-gradient-candy">disfrazado</span> vienes?
            </h2>
            <p className="text-muted-foreground text-center mb-8 max-w-md mx-auto">
              Responde estas 4 preguntas rápidas y te decimos tu nivel de disfraz -- sin presión, es solo para
              orientarte.
            </p>
            <Quiz preguntas={PREGUNTAS} resultadoPara={resultadoPara} />
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
