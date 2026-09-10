import type Lenis from 'lenis';

// Instancia global de Lenis (solo desktop). Permite scroll programático suave
// y que los anchors internos usen la misma animación.
let lenisInstance: Lenis | null = null;

export function setLenis(instance: Lenis | null) {
  lenisInstance = instance;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isFinePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

/** Mismo corte que el breakpoint `md` de Tailwind (768px) -- para elegir qué
 * asset servir (ej. el video mobile-cropped del Hero) en vez de dejar que
 * CSS lo achique en pantalla, que gastaría el ancho de banda del video de
 * escritorio en un celular igual. Se captura una sola vez al montar (mismo
 * criterio que `isFinePointer`), no reacciona a un resize/rotación en vivo:
 * es un video de fondo decorativo, no vale la pena la complejidad de un
 * listener para eso. */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

/** Scroll a un elemento por id, usando Lenis si está activo (desktop) o nativo. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenisInstance) {
    lenisInstance.scrollTo(el, { offset: -80, duration: 1.2 });
  } else {
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
}

/** Vuelve al tope de la página, sin animación -- pensado para llamarse al
 * cambiar de ruta (wouter no resetea el scroll solo, a diferencia de una
 * navegación de página completa). Reportado con el link "Conocer la
 * PlayCard" del banner de Inicio: al hacer click estando scrolleado más
 * abajo, la página nueva abría a mitad de camino en vez de arriba. En
 * desktop hay que resetear Lenis explícitamente (mantiene su propio
 * offset virtual, `window.scrollTo` solo no alcanza -- Lenis lo pisa de
 * vuelta al siguiente frame); en móvil (sin Lenis) el nativo basta. */
export function resetScrollPosition() {
  if (lenisInstance) {
    lenisInstance.scrollTo(0, { immediate: true });
  } else {
    window.scrollTo(0, 0);
  }
}
