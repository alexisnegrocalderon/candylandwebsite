import { useEffect } from 'react';
import Lenis from 'lenis';
import { setLenis, prefersReducedMotion, isFinePointer } from '@/lib/smoothScroll';
import { ensureScrollTrigger } from '@/lib/scrollFx';

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

    // Sincroniza GSAP ScrollTrigger con el scroll suave de Lenis
    const { ScrollTrigger } = ensureScrollTrigger();
    lenis.on('scroll', ScrollTrigger.update);

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // Recalcula posiciones cuando cargan imágenes/fuentes
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('load', refresh);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  return null;
}
