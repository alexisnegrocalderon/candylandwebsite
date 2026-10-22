/* Splash de apertura de las apps instalables (panel y terminales).
 *
 * El HTML de esas pantallas (scripts/generate-pwa-html.mjs) trae un
 * `#initial-loader` oscuro con el isotipo y marca `<html data-splash="dark">`.
 * A diferencia del sitio público -- donde el loader se va apenas React monta --
 * acá se queda hasta que la pantalla tiene algo real que mostrar (el panel, el
 * login o el PIN de la terminal), así la apertura es una sola pantalla de
 * principio a fin, sin círculos girando entre medio. */

import { useEffect, type RefObject } from 'react';
import { introDue, playNeonIntro } from './neonIntro';

const FADE_MS = 260;
/** Respaldo: pase lo que pase, a los 12 s el splash se va solo. */
const SAFETY_MS = 12_000;

let hidden = false;

/** ¿Esta pantalla usa el splash oscuro que espera a la app? */
export function hasDarkSplash(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.splash === 'dark';
}

/** ¿El sitio público abierto como app instalada? (lo marca un script inline
 * de client/index.html). Ahí el loader es el oscuro y abre con la intro de neón (espera el toque). */
export function isSiteApp(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.splash === 'site';
}

/** Termina el «modo splash» del sitio: devuelve el color de la barra de estado y quita la marca de <html>,
 * para que el fondo oscuro de la intro no se quede pegado a las páginas (que son pastel). */
function endSiteSplash(): void {
  const root = document.documentElement;
  if (root.dataset.splash !== 'site') return;
  delete root.dataset.splash;
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  const original = meta?.getAttribute('data-site-color');
  if (meta && original) { meta.setAttribute('content', original); meta.removeAttribute('data-site-color'); }
}

/** Quita el splash. Si es la primera apertura del día, antes pasa la intro
 * de neón (client/src/lib/neonIntro.ts); si no, un fundido corto. `intro:
 * false` para salir sin intro (error, respaldo de tiempo). Se puede llamar
 * las veces que sea. */
export function hideSplash(opts: { intro?: boolean } = {}): void {
  if (hidden || typeof document === 'undefined') return;
  const el = document.getElementById('initial-loader');
  hidden = true;
  if (!el) { endSiteSplash(); return; }
  if (opts.intro !== false && (hasDarkSplash() || isSiteApp()) && introDue()) {
    playNeonIntro(el, endSiteSplash);
    return;
  }
  el.classList.add('splash-out');
  window.setTimeout(() => { el.remove(); endSiteSplash(); }, FADE_MS);
}

if (typeof window !== 'undefined' && hasDarkSplash()) {
  window.setTimeout(() => hideSplash({ intro: false }), SAFETY_MS);
}

/** Para pantallas que ya están listas al montar (login, PIN, panel). */
export function useHideSplashOnMount(): void {
  useEffect(() => { hideSplash(); }, []);
}

/** Para los marcos de las terminales: quita el splash cuando adentro ya no
 * queda ningún "cargando" (los spinners llevan `data-splash-wait`). Así la
 * apertura pasa directo del splash al PIN o a la pantalla principal. */
export function useHideSplashWhenSettled(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (hidden || !hasDarkSplash()) return;
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (el.childElementCount > 0 && !el.querySelector('[data-splash-wait]')) {
        observer.disconnect();
        hideSplash();
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true, subtree: true });
    check();
    return () => observer.disconnect();
  }, [ref]);
}
