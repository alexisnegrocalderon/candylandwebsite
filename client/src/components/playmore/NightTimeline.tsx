import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { CoproductionMoment } from '@shared/coproduction';
import { Eyebrow, reveal } from './sections';

/* "La noche minuto a minuto": la pantalla queda fija y, al bajar, un reloj
 * dorado avanza por los momentos de la noche. Cada hora cambia la luz de
 * fondo. Con "reducir movimiento" se ve como una lista simple. Los momentos
 * se editan en el panel (landing.timeline). */

// Luz de cada momento: de la llegada (oro tibio) al cierre (azul madrugada).
const LIGHTS = [
  'radial-gradient(60% 50% at 50% 60%, rgba(214,178,94,0.30), transparent 70%)',
  'radial-gradient(60% 50% at 30% 55%, rgba(244,114,182,0.32), transparent 70%), radial-gradient(50% 45% at 72% 50%, rgba(150,21,157,0.35), transparent 70%)',
  'radial-gradient(60% 55% at 50% 55%, rgba(228,119,234,0.38), transparent 70%)',
  'radial-gradient(70% 55% at 50% 50%, rgba(150,21,157,0.45), transparent 70%), radial-gradient(40% 35% at 50% 50%, rgba(247,231,168,0.25), transparent 70%)',
  'radial-gradient(60% 50% at 50% 70%, rgba(125,211,252,0.25), transparent 70%)',
];

export function NightTimeline({ moments }: { moments: CoproductionMoment[] }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [active, setActive] = useState(0);
  const n = moments.length;
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor(v * n * 0.999)));
    setActive((prev) => (prev === i ? prev : i));
  });
  const railScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  if (n === 0) return null;

  // Sin overflow: clip (navegadores viejos) el scroll fijo no funciona: lista simple.
  const stickyOk = typeof CSS !== 'undefined' && !!CSS.supports?.('overflow-x', 'clip');
  if (reduce || !stickyOk) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-24">
        <div className="mb-10 text-center"><Eyebrow>La noche minuto a minuto</Eyebrow></div>
        <ol className="space-y-8">
          {moments.map((m) => (
            <li key={m.time + m.title} className="flex gap-6 border-b border-white/10 pb-6">
              <span className="playmore-sans playmore-gold w-20 shrink-0 text-2xl font-extrabold tabular-nums">{m.time}</span>
              <div><p className="text-lg font-bold">{m.title}</p>{m.text && <p className="mt-1 text-[var(--pm-cream)]/75">{m.text}</p>}</div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const m = moments[active];
  return (
    <section ref={ref} className="relative" style={{ height: `${Math.max(2, n) * 50}vh` }} aria-label="La noche minuto a minuto">
      <div className="sticky top-0 flex h-dvh flex-col items-center justify-center overflow-hidden px-5">
        <AnimatePresence>
          <motion.div key={active} className="pointer-events-none absolute inset-0" style={{ background: LIGHTS[active % LIGHTS.length] }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }} aria-hidden="true" />
        </AnimatePresence>
        <motion.div {...reveal} className="relative mb-8 text-center"><Eyebrow>La noche minuto a minuto</Eyebrow></motion.div>

        {/* Reloj */}
        <div className="relative h-[1em] overflow-hidden text-[22vw] leading-none sm:text-[11rem]" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p key={m.time} className="playmore-sans playmore-gold font-extrabold tabular-nums tracking-[-0.04em]"
              initial={{ y: '100%', opacity: 0, filter: 'blur(8px)' }} animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }} exit={{ y: '-100%', opacity: 0, filter: 'blur(8px)' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
              {m.time}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="relative mt-6 min-h-[8rem] max-w-xl text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={active} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}>
              <p className="playmore-sans text-2xl font-extrabold tracking-[0.12em] sm:text-3xl">{m.title}</p>
              {m.text && <p className="mt-3 text-[var(--pm-cream)]/75 sm:text-lg">{m.text}</p>}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Riel con las horas: se llena al bajar */}
        <div className="relative mt-10 w-full max-w-2xl">
          <div className="h-px w-full bg-white/15" />
          <motion.div className="absolute left-0 top-0 h-px w-full origin-left bg-gradient-to-r from-[#d6b25e] via-[#E477EA] to-[#7dd3fc]" style={{ scaleX: railScale }} />
          <div className="absolute inset-x-0 -top-[5px] flex justify-between">
            {moments.map((x, i) => (
              <span key={x.time + i} className={`h-[11px] w-[11px] rounded-full border transition-colors duration-500 ${i <= active ? 'border-[#f7e7a8] bg-[#d6b25e]' : 'border-white/30 bg-[var(--pm-ink)]'}`} />
            ))}
          </div>
          <div className="mt-4 flex justify-between text-[10px] tracking-[0.2em] text-[var(--pm-sand)]/60 tabular-nums">
            {moments.map((x, i) => <span key={x.time + i} className={i === active ? 'text-[var(--pm-sand)]' : ''}>{x.time}</span>)}
          </div>
        </div>
      </div>
    </section>
  );
}
