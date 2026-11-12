/* ¿El Estudio estaba abierto cuando el panel se recargó? (marca por apertura de la app, en sessionStorage).
 * Archivo aparte y sin imports: lo lee el panel al arrancar, sin traerse el código del Estudio. */

const OPEN_KEY = 'motion-studio.open';
const RESTORED_KEY = 'motion-studio.restored-at';
/** Dos recargas seguidas dentro de este plazo = el Estudio está botando la página en este teléfono: se vuelve a Inicio. */
const LOOP_MS = 45_000;

export function markStudioOpen(open: boolean): void {
  try {
    if (open) window.sessionStorage.setItem(OPEN_KEY, '1');
    else window.sessionStorage.removeItem(OPEN_KEY);
  } catch { /* sin sessionStorage: tras recargar abre en Inicio, como antes */ }
}

/** true si hay que volver al Estudio tras una recarga. Nunca dos veces seguidas: si la página se cae apenas vuelve, la
 * siguiente apertura es en Inicio (el borrador sigue guardado y se recupera al entrar al Estudio a mano). */
export function wasStudioOpen(): boolean {
  try {
    const s = window.sessionStorage;
    if (s.getItem(OPEN_KEY) !== '1') return false;
    const last = Number(s.getItem(RESTORED_KEY) || 0);
    if (Date.now() - last < LOOP_MS) { s.removeItem(OPEN_KEY); return false; }
    s.setItem(RESTORED_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}
