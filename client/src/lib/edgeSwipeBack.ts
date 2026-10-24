import { useEffect } from 'react';

/* Volver deslizando desde el borde izquierdo, como en cualquier app de iPhone. La app instalada
 * (pantalla completa) no tiene el gesto del navegador, así que se agrega acá. Solo en la app
 * instalada: en Safari el navegador ya lo hace y se volvería dos veces. */

const EDGE_PX = 24;
const MIN_DX = 70;
const MAX_DY = 60;
const MAX_MS = 700;

/** ¿Ese recorrido del dedo cuenta como «volver»? (pura, para los tests). */
export function isBackSwipe(start: { x: number; y: number; t: number }, end: { x: number; y: number; t: number }): boolean {
  return start.x <= EDGE_PX && end.x - start.x >= MIN_DX && Math.abs(end.y - start.y) <= MAX_DY && end.t - start.t <= MAX_MS;
}

export function useEdgeSwipeBack(enabled: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: TouchEvent) => {
      const p = e.touches[0];
      start = e.touches.length === 1 && p.clientX <= EDGE_PX ? { x: p.clientX, y: p.clientY, t: e.timeStamp } : null;
    };
    const up = (e: TouchEvent) => {
      const p = e.changedTouches[0];
      if (start && p && isBackSwipe(start, { x: p.clientX, y: p.clientY, t: e.timeStamp })) onBack();
      start = null;
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchend', up, { passive: true });
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchend', up);
    };
  }, [enabled, onBack]);
}
