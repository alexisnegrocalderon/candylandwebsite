import { useEffect } from 'react';

/** Pantallas oscuras dentro del sitio pastel («Mi cuenta», la entrada, la recarga): mientras están montadas,
 * la barra de estado del teléfono, el fondo de la página y el rebote del scroll se ven oscuros, para que no
 * asome una franja blanca/rosa arriba ni un destello al navegar. Al salir se devuelve todo como estaba. */
export const DARK_CHROME_BG = '#0b0612';

export function useDarkChrome(): void {
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute('content') ?? null;
    const prevRoot = root.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    meta?.setAttribute('content', DARK_CHROME_BG);
    root.style.backgroundColor = DARK_CHROME_BG;
    document.body.style.backgroundColor = DARK_CHROME_BG;
    return () => {
      if (prevMeta !== null) meta?.setAttribute('content', prevMeta);
      root.style.backgroundColor = prevRoot;
      document.body.style.backgroundColor = prevBody;
    };
  }, []);
}

/** Rutas oscuras: ahí el «cargando» entre páginas también es oscuro (antes era un destello pastel). */
export const isDarkRoute = (path: string) => /^\/(cuenta|mis-puntos|verificar|recargar)(\/|$|\?)/.test(path);
