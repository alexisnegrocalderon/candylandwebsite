import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion, isFinePointer } from '@/lib/smoothScroll';

let registered = false;

/** Registra ScrollTrigger una sola vez. */
export function ensureScrollTrigger() {
  if (!registered && typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return { gsap, ScrollTrigger };
}

/**
 * ¿Corren los efectos cinematográficos pesados (pin, scroll horizontal)?
 * Solo en desktop (pointer fino) y si el usuario no pide menos movimiento.
 * En móvil devolvemos false → se usa el fallback táctil (scroll-snap nativo).
 */
export function cinematicOn(): boolean {
  return typeof window !== 'undefined' && isFinePointer() && !prefersReducedMotion();
}
