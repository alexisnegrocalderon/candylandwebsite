import { useEffect } from 'react';

/**
 * Registra el service worker de una pantalla de operación interna (/caja,
 * /gastos, /puerta, /admin) para que quede instalable en la pantalla de
 * inicio, con su propio ícono, nombre y sin la barra del navegador.
 *
 * El manifest y los meta tags de iOS (`apple-mobile-web-app-title`,
 * `apple-mobile-web-app-capable`) YA NO se tocan acá -- antes este hook los
 * mutaba en el `<head>` con un `useEffect`, es decir DESPUÉS del primer
 * render, y "Agregar a Inicio" de iOS podía leer el `<head>` antes de esa
 * corrección: sin importar qué pantalla se compartiera, terminaba
 * instalando Caja (la única cuyo manifest coincidía con el que
 * `vite-plugin-pwa` dejaba de fábrica en el único `index.html` de la SPA).
 * Ahora cada pantalla instalable tiene su propio HTML estático generado en
 * el build (`scripts/generate-pwa-html.mjs`, servido vía `vercel.json`) ya
 * con su manifest correcto desde el primer byte -- no queda nada que
 * corregir en el navegador, así que no hay carrera posible.
 *
 * Lo único que sigue necesitando JS es el registro del service worker (no
 * se puede declarar en HTML estático).
 */
export function useInstallableApp(swPath: string, swScope: string) {
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(swPath, { scope: swScope }).catch(() => {});
    }
  }, [swPath, swScope]);
}
