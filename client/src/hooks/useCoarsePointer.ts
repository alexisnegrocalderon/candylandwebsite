import { useEffect, useState } from 'react';

/** true en dispositivos táctiles (iPad, iPhone -- el puntero "primario" es
 * un dedo, impreciso), false en mouse/trackpad real. A diferencia de un
 * breakpoint de ancho de pantalla, esto distingue el iPad (pantalla grande
 * pero táctil) de una laptop real -- necesario porque el swipe-to-delete
 * debe aparecer en el iPad (que sigue mostrando la tabla, no las tarjetas
 * de iPhone) pero nunca en escritorio con mouse. */
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setCoarse(mq.matches);
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return coarse;
}
