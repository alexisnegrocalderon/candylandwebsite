import { isInstalledApp } from './appInstall';

/* «Modo app»: en el celular el sitio ES la app. Quien llega desde un link de
 * Instagram o WhatsApp al teléfono ve la misma app que quien la instaló (barra
 * de app, compra de vidrio oscuro, sin el menú ni la portada del sitio). El
 * sitio de siempre queda para computadores y para Google (los buscadores ven
 * la portada completa, con todo su contenido).
 *
 * Salidas para probar: `?app=1` fuerza la app en cualquier navegador (también
 * en las pruebas automáticas) y `?sitio=1` muestra el sitio en el celular.
 * Las dos se recuerdan mientras dure la pestaña. */

const FORCE_KEY = 'mp.modo';

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|embedly|lighthouse|headless|prerender|vercel-screenshot/i;

/** Un teléfono (no tablet ni computador): iPhone o Android «Mobile». */
export function isPhoneBrowser(ua: string): boolean {
  return /iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
}

export function isCrawler(ua: string): boolean {
  return BOT_RE.test(ua);
}

/** Lo que pidió esta pestaña por URL (`?app=1` / `?sitio=1`), o null. */
function forcedMode(): 'app' | 'sitio' | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('app') === '1') sessionStorage.setItem(FORCE_KEY, 'app');
    else if (params.get('sitio') === '1') sessionStorage.setItem(FORCE_KEY, 'sitio');
    const v = sessionStorage.getItem(FORCE_KEY);
    return v === 'app' || v === 'sitio' ? v : null;
  } catch {
    return null;
  }
}

/** Decide el modo con los datos del navegador (pura, para los tests). */
export function decideAppMode(opts: { installed: boolean; ua: string; webdriver: boolean; forced: 'app' | 'sitio' | null }): boolean {
  if (opts.forced) return opts.forced === 'app';
  if (opts.installed) return true;
  return isPhoneBrowser(opts.ua) && !isCrawler(opts.ua) && !opts.webdriver;
}

let cached: boolean | null = null;

/** ¿Esta pestaña se ve como la app? Se calcula una vez (no cambia mientras está abierta). */
export function isAppMode(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;
  cached = decideAppMode({
    installed: isInstalledApp(),
    ua: navigator.userAgent,
    webdriver: navigator.webdriver === true,
    forced: forcedMode(),
  });
  return cached;
}
