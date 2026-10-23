import { useMemo } from 'react';
import { motion } from 'framer-motion';

/* Lluvia de confeti para celebrar la compra: piezas de colores de la marca que
 * caen y giran una sola vez. Sin librerías; con «reducir movimiento» no se ve. */

const COLORS = ['#ec4899', '#d946ef', '#38bdf8', '#facc15', '#f9a8d4', '#a78bfa'];

export function Confetti({ pieces = 70 }: { pieces?: number }) {
  const list = useMemo(() => Array.from({ length: pieces }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2.2 + Math.random() * 1.6,
    drift: (Math.random() - 0.5) * 160,
    spin: (Math.random() - 0.5) * 900,
    size: 6 + Math.random() * 7,
    round: Math.random() > 0.6,
    color: COLORS[i % COLORS.length],
  })), [pieces]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] overflow-hidden motion-reduce:hidden">
      {list.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{ left: `${p.left}%`, width: p.size, height: p.round ? p.size : p.size * 0.45, background: p.color, borderRadius: p.round ? '50%' : 2 }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift, rotate: p.spin, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.25, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}
