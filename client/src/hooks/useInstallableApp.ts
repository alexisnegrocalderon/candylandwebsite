import { useEffect } from 'react';

/**
 * Hace instalable una pantalla de operación interna (/caja, /gastos, /puerta,
 * /admin) como app aparte en la pantalla de inicio, con su propio ícono,
 * nombre y sin la barra del navegador.
 *
 * Extraído después de un bug real: dos pantallas repitiendo esta lógica a
 * mano (una con un descuido de una línea) hicieron que "agregar a inicio"
 * desde /gastos instalara /caja en su lugar. Las dos causas por las que este
 * hook existe en vez de un simple `<link>` estático por página:
 *
 * 1. Solo hay UN <link rel="manifest"> en todo el sitio: vite-plugin-pwa lo
 *    inyecta en el único index.html que comparte la SPA completa (todas las
 *    rutas usan el mismo HTML), apuntando por defecto al manifest de /caja.
 *    Agregar una segunda etiqueta en vez de MUTAR la existente deja dos en el
 *    DOM, y el navegador siempre usa la primera -- la de caja, sin importar
 *    en qué pantalla estés. Por eso acá se reusa el link existente.
 * 2. El service worker de cada pantalla debe registrarse con SU PROPIO scope
 *    explícito (`/puerta/`, `/admin/`, etc.) -- sin esto, vite-plugin-pwa cae
 *    al scope raíz ('/') y termina controlando TODO el sitio, no solo esa
 *    pantalla (ver el `scope` de nivel superior en vite.config.ts para caja).
 *
 * El manifest se restaura a su valor original al desmontar, para que
 * volver al sitio público no deje "pegado" el de la última pantalla interna
 * visitada.
 */
export function useInstallableApp(manifestHref: string, swPath: string, swScope: string) {
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const originalHref = existing?.getAttribute('href') ?? null;
    const link = existing ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'manifest' }));
    link.setAttribute('href', manifestHref);

    const meta = document.createElement('meta');
    meta.name = 'apple-mobile-web-app-capable';
    meta.content = 'yes';
    document.head.appendChild(meta);

    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(swPath, { scope: swScope }).catch(() => {});
    }

    return () => {
      if (originalHref !== null) link.setAttribute('href', originalHref);
      else link.remove();
      meta.remove();
    };
  }, [manifestHref, swPath, swScope]);
}
