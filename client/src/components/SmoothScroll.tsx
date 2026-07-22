import { useEffect } from 'react';
import Lenis from 'lenis';
import { setLenis, prefersReducedMotion, isFinePointer } from '@/lib/smoothScroll';

/**
 * Scroll suave inmersivo (estilo noth.in) con Lenis.
 * Solo en desktop (pointer:fine) y si el usuario no pide movimiento reducido.
 * En móvil se usa el scroll nativo (mejor rendimiento y no interfiere con la compra).
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion() || !isFinePointer()) return;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
    });
    setLenis(lenis);

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  return null;
}
