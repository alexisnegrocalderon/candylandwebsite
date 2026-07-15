import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/smoothScroll';

const SEEN_KEY = 'candyland_intro_seen';

/** Dulces orbitando alrededor del medallón mientras carga la página. */
const ORBIT_CANDIES = ['🍬', '🍭', '🍒', '🍥', '🫧', '🍡'];

function LoadingMedallion() {
  return (
    <div className="relative w-36 h-36 md:w-48 md:h-48 flex items-center justify-center">
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
      >
        {ORBIT_CANDIES.map((c, i) => {
          const angle = (i / ORBIT_CANDIES.length) * 2 * Math.PI;
          const x = 50 + 46 * Math.cos(angle);
          const y = 50 + 46 * Math.sin(angle);
          return (
            <span
              key={i}
              aria-hidden
              className="absolute text-2xl md:text-3xl select-none"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
            >
              {c}
            </span>
          );
        })}
      </motion.div>
      <motion.div
        className="text-[4.5rem] md:text-[6rem] leading-none drop-shadow-[0_0_40px_oklch(0.68_0.16_340_/_0.4)]"
        animate={{ rotate: [0, 14, -14, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        🍭
      </motion.div>
    </div>
  );
}

/**
 * Intro tipo juego: un caramelo que "se desenvuelve" al tocar para entrar.
 * Se muestra 1 vez por sesión. No se monta con prefers-reduced-motion.
 *
 * Antes el botón "Toca para entrar" aparecía de inmediato aunque la página
 * (video del hero, imágenes) todavía estuviera cargando — si alguien
 * entraba rápido, se encontraba con contenido a medio cargar detrás. Ahora
 * primero se muestra un medallón de carga real: espera a que el poster del
 * hero termine de cargar + un piso mínimo de 1.2s (para que no parpadee en
 * conexiones rápidas), con un techo de 6s por si la conexión es lenta —
 * nunca deja a nadie atascado esperando.
 */
export default function CandyIntro() {
  const [show, setShow] = useState(false);
  const [opening, setOpening] = useState(false);
  const [ready, setReady] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (sessionStorage.getItem(SEEN_KEY)) return;
    setShow(true);
    document.body.style.overflow = 'hidden';

    let imgLoaded = false;
    let minElapsed = false;
    const checkReady = () => { if (imgLoaded && minElapsed) setReady(true); };

    const img = new Image();
    img.onload = img.onerror = () => { imgLoaded = true; checkReady(); };
    img.src = '/candyland/poster-hero.webp';

    const minTimer = window.setTimeout(() => { minElapsed = true; checkReady(); }, 1200);
    const maxTimer = window.setTimeout(() => setReady(true), 6000);

    return () => {
      document.body.style.overflow = '';
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, []);

  // Limpia el timeout de salida si el componente se desmonta antes de que
  // termine (evita un setTimeout suelto llamando setState en un componente ya fuera).
  useEffect(() => () => {
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
  }, []);

  const enter = () => {
    if (opening || !ready) return;
    setOpening(true);
    sessionStorage.setItem(SEEN_KEY, '1');
    document.body.style.overflow = '';
    closeTimeoutRef.current = window.setTimeout(() => setShow(false), 900);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-label="Entrar a Candyland"
        >
          {/* Fondo candy */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, oklch(0.68 0.1 295 / 0.35), transparent 55%), radial-gradient(circle at 70% 70%, oklch(0.76 0.13 35 / 0.3), transparent 55%), oklch(0.97 0.014 340)',
            }}
            animate={opening ? { scale: 1.3, opacity: 0 } : {}}
            transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
          />

          {/* Caramelos flotantes de fondo */}
          {['🍬', '🍭', '🍥', '🫧', '🍒', '🍡'].map((c, i) => (
            <motion.span
              key={i}
              className="absolute text-4xl md:text-6xl select-none pointer-events-none"
              style={{ left: `${12 + i * 14}%`, top: `${15 + ((i * 27) % 70)}%` }}
              animate={{ y: [0, -22, 0], rotate: [0, 12, 0] }}
              transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
            >
              {c}
            </motion.span>
          ))}

          {/* Antes esto usaba AnimatePresence con mode="wait" para animar
           * también la salida del medallón de carga — mismo bug ya visto en
           * el resto del sitio: mode="wait" depende de que la animación de
           * salida termine (requestAnimationFrame) para recién ahí montar lo
           * nuevo, y en pestañas en 2do plano (document.hidden) rAF se
           * congela, dejando el medallón de carga pegado para siempre aunque
           * `ready` ya sea true. Con un render condicional simple, React
           * muestra el botón de entrar apenas `ready` cambia, sin depender
           * de que ninguna animación llegue a completarse. */}
          {!ready ? (
            <motion.div
              className="relative z-10 flex flex-col items-center gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <LoadingMedallion />
              <p className="text-foreground/80 text-sm md:text-base uppercase tracking-[0.3em] animate-pulse">
                Cargando tu fiesta...
              </p>
            </motion.div>
          ) : (
              <motion.button
                onClick={enter}
                className="relative z-10 flex flex-col items-center gap-8 cursor-pointer interactive"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.94 }}
                aria-label="Toca para entrar"
              >
                <motion.div
                  className="text-[7rem] md:text-[10rem] leading-none drop-shadow-[0_0_40px_oklch(0.68_0.16_340_/_0.4)]"
                  animate={
                    opening
                      ? { scale: [1, 1.25, 0], rotate: [0, -8, 20] }
                      : { rotate: [0, -6, 6, 0] }
                  }
                  transition={
                    opening
                      ? { duration: 0.8, ease: 'easeIn' }
                      : { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }
                  }
                >
                  🍭
                </motion.div>
                {!opening && (
                  <motion.div
                    className="text-center"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <p className="font-heading font-extrabold text-3xl md:text-5xl text-gradient-candy mb-2">
                      CANDYLAND
                    </p>
                    <p className="text-foreground/90 text-base md:text-lg uppercase tracking-[0.25em] animate-pulse">
                      Toca para entrar
                    </p>
                  </motion.div>
                )}
              </motion.button>
            )}

          {/* Saltar — solo disponible cuando ya está listo para entrar */}
          {ready && !opening && (
            <button
              onClick={enter}
              className="absolute bottom-8 text-sm text-muted-foreground hover:text-foreground transition-colors interactive z-10"
            >
              Saltar intro
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
