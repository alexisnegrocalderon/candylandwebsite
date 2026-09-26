import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { isFinePointer, prefersReducedMotion } from '@/lib/smoothScroll';

// Mismo objeto `reveal` que usa Home.tsx (ver ahí para el porqué del
// margin:'400px') -- duplicado acá a propósito en vez de importado, para no
// crear un import circular entre este archivo y Home.tsx.
const reveal = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '400px' },
  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const },
};

const BEATS = ['De la mansión...', '...a la pista...', 'una sola noche.'];
const FULL_SENTENCE = 'De la mansión a la pista — dos ambientes, una sola noche.';

/** Momento conector entre el Hero y la grilla de eventos: en vez de un corte
 * seco, en desktop/pointer fino/sin reduced-motion se "pinnea" un tramo de
 * scroll (position: sticky, sin GSAP) y se scrubean tres frases + un
 * caramelo girando según el progreso de ese tramo. En mobile o con
 * reduced-motion se cae a una sola sección corta y estática -- nunca queda
 * un tramo de scroll vacío de 250vh regalado en un celular. */
export default function ScrollStory() {
  const [pointerFine] = useState(() => isFinePointer());
  const [reducedMotion] = useState(() => prefersReducedMotion());
  const pinRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: pinRef, offset: ['start start', 'end end'] });

  const bgOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.12, 0.32, 0.12]);
  const candyRotate = useTransform(scrollYProgress, [0, 1], [0, 300]);
  const candyScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.75, 1.15, 0.8]);
  const beat1Opacity = useTransform(scrollYProgress, [0, 0.1, 0.28, 0.38], [0, 1, 1, 0]);
  const beat2Opacity = useTransform(scrollYProgress, [0.33, 0.43, 0.61, 0.71], [0, 1, 1, 0]);
  const beat3Opacity = useTransform(scrollYProgress, [0.66, 0.76, 0.95, 1], [0, 1, 1, 0]);
  const beatOpacities = [beat1Opacity, beat2Opacity, beat3Opacity];

  if (!pointerFine || reducedMotion) {
    // Esquina redondeada + sombra propia + solapado hacia arriba (-mt-8):
    // hace que esta sección se lea como una tarjeta apoyada SOBRE el video
    // del Hero (que ahora mide menos del 100svh a propósito, ver Home.tsx
    // `Hero()`) en vez de un corte recto entre dos bloques -- el "efecto
    // apilado" que le muestra a la persona, sin animar nada ligado al
    // scroll, que hay una interfaz de verdad debajo del Hero y no una foto
    // fija. Se aplica igual en cualquier ancho (pedido explícito del dueño:
    // la misma experiencia visual en desktop y mobile) -- la versión con
    // pin+scrub de abajo (mouse fino) suma su propio solapado más abajo.
    return (
      <motion.section
        {...reveal}
        className="relative z-10 -mt-8 py-16 px-4 text-center overflow-hidden rounded-t-[2rem] bg-background shadow-[0_-12px_40px_rgba(0,0,0,0.25)]"
      >
        <p className="font-heading text-2xl sm:text-3xl font-bold text-gradient-candy max-w-xl mx-auto">
          {FULL_SENTENCE}
        </p>
      </motion.section>
    );
  }

  return (
    <div ref={pinRef} className="relative z-10 -mt-8 h-[250vh]">
      <div className="sticky top-0 h-screen overflow-hidden flex items-center justify-center rounded-t-[2rem] bg-background shadow-[0_-12px_40px_rgba(0,0,0,0.25)]">
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10"
          style={{ opacity: bgOpacity }}
        />

        <motion.span
          aria-hidden
          className="absolute text-8xl md:text-9xl select-none opacity-70 drop-shadow-[0_10px_40px_oklch(0.70_0.19_340_/_0.35)]"
          style={{ rotate: candyRotate, scale: candyScale }}
        >
          🍬
        </motion.span>

        {/* w-full es necesario acá: las 3 frases de abajo son las únicas
         * hijas con contenido real y son todas `absolute` (fuera de flujo),
         * así que sin w-full esta caja se encoge a su ancho mínimo (el de
         * los paddings) en vez de ocupar max-w-2xl -- eso partía el texto
         * letra por letra dentro de una columna de ~32px. */}
        <div className="relative z-10 w-full min-h-[8rem] md:min-h-[10rem] max-w-2xl mx-auto px-4 flex items-center justify-center text-center">
          <span className="sr-only">{FULL_SENTENCE}</span>
          {BEATS.map((beat, i) => (
            <motion.p
              key={beat}
              aria-hidden
              style={{ opacity: beatOpacities[i] }}
              // inset-0 (no solo inset-x-0) + flex en el padre: las 3 frases
              // tienen que ocupar EXACTAMENTE la misma caja para que el
              // crossfade sea limpio -- con solo inset-x-0 (sin top) cada
              // <p> caía en su posición estática de flujo normal (una
              // debajo de la otra) en vez de superponerse, y el resultado
              // eran letras sueltas de dos frases distintas mezcladas.
              className="absolute inset-0 flex items-center justify-center font-heading text-3xl sm:text-4xl md:text-6xl font-bold text-gradient-candy"
            >
              {beat}
            </motion.p>
          ))}
        </div>
      </div>
    </div>
  );
}
