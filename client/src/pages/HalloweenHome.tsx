import { useEffect } from 'react';
import { motion } from 'framer-motion';
import Home from './Home';

/* Portada con tema Halloween. NO es una copia de la Home: es la misma Home
 * oficial, re-teñida poniendo la clase `.halloween` en <html> (paleta en
 * client/src/index.css). Así Navbar, menús, footer y cada sección cambian
 * juntos, y la Home oficial no se edita en nada.
 *
 * - `/halloween`: siempre en tema Halloween (vista previa; se usará de nuevo el próximo Halloween).
 * - `/`: ya no hay interruptor en el panel, así que la portada oficial no lo usa. */

export default function HalloweenHome({ force = false }: { force?: boolean }) {
  const enabled = force;

  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    html.classList.add('halloween');
    return () => html.classList.remove('halloween');
  }, [enabled]);

  return (
    <>
      {enabled && <HalloweenAmbient />}
      <Home />
    </>
  );
}

const AMBIENT = [
  { emoji: '🦇', left: '6%', top: '18%', dur: 7 },
  { emoji: '🕸️', left: '88%', top: '12%', dur: 9 },
  { emoji: '🎃', left: '12%', top: '72%', dur: 8 },
  { emoji: '👻', left: '82%', top: '64%', dur: 10 },
  { emoji: '🌙', left: '50%', top: '6%', dur: 11 },
];

/** Emoji flotando fijos sobre toda la página, muy tenues y sin capturar
 * clics. Se apagan con reduced-motion. */
function HalloweenAmbient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden motion-reduce:hidden">
      {AMBIENT.map((a) => (
        <motion.span
          key={a.emoji}
          className="absolute text-2xl md:text-3xl opacity-20 select-none"
          style={{ left: a.left, top: a.top }}
          animate={{ y: [0, -16, 0], rotate: [0, 6, -6, 0] }}
          transition={{ duration: a.dur, repeat: Infinity, ease: 'easeInOut' }}
        >
          {a.emoji}
        </motion.span>
      ))}
    </div>
  );
}
