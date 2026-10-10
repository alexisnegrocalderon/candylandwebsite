import { useEffect } from 'react';
import { isFinePointer } from '@/lib/smoothScroll';

/* Aparición al deslizar, compartida por la Home y sus secciones.
 *
 * Regla de oro: el contenido NUNCA se queda invisible. El efecto es un extra
 * -- si el navegador (un iPhone lento) no alcanza a dispararlo, el vigilante
 * de `useRevealWatchdog` muestra igual lo que ya está en pantalla.
 *
 * - `reveal`: un bloque suelto (sube y se aclara).
 * - `revealGroup` + `revealItemProps`: un contenedor y sus hijos entran en
 *   cascada (escalonado ~80 ms).
 * El margen de 400px es POSITIVO a propósito: el bloque empieza a aparecer
 * antes de llegar a la pantalla y para cuando lo miras ya terminó.
 * En pointer fino se suma un leve desenfoque; en touch no (el filtro cuesta
 * GPU en iOS). `prefers-reduced-motion` lo maneja `MotionConfig` en Home. */
const EASE = [0.23, 1, 0.32, 1] as const;
const fine = typeof window !== 'undefined' && isFinePointer();

const hiddenState = fine ? { opacity: 0, y: 28, filter: 'blur(6px)' } : { opacity: 0, y: 28 };
const shownState = fine ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 1, y: 0 };
const VIEWPORT = { once: true, margin: '400px' } as const;

export const reveal = {
  initial: hiddenState,
  whileInView: shownState,
  viewport: VIEWPORT,
  transition: { duration: 0.55, ease: EASE },
  'data-reveal': '',
};

/** Contenedor de una cascada: se le pasa con `{...revealGroup}`. */
export const revealGroup = {
  initial: 'hidden',
  whileInView: 'show',
  viewport: VIEWPORT,
  variants: { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } } },
};

/** Cada hijo de una cascada: `{...revealItemProps}`. */
export const revealItemProps = {
  variants: {
    hidden: hiddenState,
    show: { ...shownState, transition: { duration: 0.55, ease: EASE } },
  },
  'data-reveal': '',
};

/** Red de seguridad: si algo que ya está en pantalla sigue invisible ~1 s
 * después (observador tardío, hilo principal ocupado), se marca
 * `data-reveal-done` y el CSS (index.css) lo muestra sin esperar. */
export function useRevealWatchdog() {
  useEffect(() => {
    const stuck = new WeakMap<Element, number>();
    const id = window.setInterval(() => {
      const vh = window.innerHeight;
      document.querySelectorAll('[data-reveal]:not([data-reveal-done])').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh) return;
        if (parseFloat(getComputedStyle(el).opacity) >= 0.99) {
          el.setAttribute('data-reveal-done', '');
          return;
        }
        const n = (stuck.get(el) ?? 0) + 1;
        stuck.set(el, n);
        if (n >= 3) el.setAttribute('data-reveal-done', '');
      });
    }, 400);
    return () => window.clearInterval(id);
  }, []);
}
