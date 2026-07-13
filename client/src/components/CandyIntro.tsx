import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/smoothScroll';

const SEEN_KEY = 'candyland_intro_seen';

/**
 * Intro tipo juego: un caramelo que "se desenvuelve" al tocar para entrar.
 * Se muestra 1 vez por sesión. No se monta con prefers-reduced-motion.
 */
export default function CandyIntro() {
  const [show, setShow] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (sessionStorage.getItem(SEEN_KEY)) return;
    setShow(true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const enter = () => {
    if (opening) return;
    setOpening(true);
    sessionStorage.setItem(SEEN_KEY, '1');
    document.body.style.overflow = '';
    setTimeout(() => setShow(false), 900);
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

          {/* Caramelo central interactivo */}
          <motion.button
            onClick={enter}
            className="relative z-10 flex flex-col items-center gap-8 cursor-pointer interactive"
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
                transition={{ delay: 0.4 }}
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

          {/* Saltar */}
          {!opening && (
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
