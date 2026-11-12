/* Final de la intro de neón: abre la app sola cuando la intro termina y la pantalla está lista.
 *
 * La intro en sí (el escenario y su animación) ya viene en el HTML del splash y corre desde el primer cuadro
 * (scripts/neon-intro.mjs, client/src/neonIntro.css): acá no se dibuja nada ni se reemplaza nada, solo se decide CUÁNDO se va.
 * Dura unos 2 segundos (1,7 s de luz y 0,46 s de salida). Si la app se demora más, el letrero queda encendido hasta que esté lista;
 * si ya estaba lista, espera a que termine la luz. Sin «toca para entrar»: se abre sola (un toque igual la salta). */

import '@/neonIntro.css';

/** Cuánto dura la luz, en ms (la misma cuenta de neonIntro.css: 1,7 s × `--u`). */
const LIGHT_MS = 1700;
const SHORT_FACTOR = 0.6;
const STILL_MS = 900;
const OUT_MS = 460;
/** Cuánto lleva <html> la marca `splash-reveal` (la app sube desde atrás; neonIntro.css). */
const REVEAL_MS = 900;
/** Tope absoluto: pase lo que pase, la intro no se queda pegada. */
const MAX_WAIT_MS = 2600;

/** Cuánto falta para que termine la luz (0 si ya terminó). `t0` es cuando arrancó, en ms (Date.now). Es lo que se usa si el navegador no entrega el
 * reloj de la animación. */
export function introRemainingMs(now: number, t0: number, flavor: { short: boolean; still: boolean }): number {
  const total = flavor.still ? STILL_MS : flavor.short ? LIGHT_MS * SHORT_FACTOR : LIGHT_MS;
  const elapsed = Number.isFinite(t0) && t0 > 0 ? now - t0 : total;
  return Math.max(0, Math.min(MAX_WAIT_MS, total - elapsed));
}

/** Abre la app: espera a que termine la luz de la intro y se va con un fundido corto. `done` se llama cuando el overlay ya no está. */
export function finishNeonIntro(el: HTMLElement, done: () => void): void {
  let finished = false;
  const timers: number[] = [];
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') leave(); };
  const leave = () => {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener('keydown', onKey);
    el.classList.add('neon-intro--out');
    // La app entra mientras la intro se disuelve. Se quita sola: si quedara puesta no pasa nada (la animación corre una vez).
    const root = document.documentElement;
    root.classList.add('splash-reveal');
    window.setTimeout(() => root.classList.remove('splash-reveal'), REVEAL_MS);
    window.setTimeout(() => { el.remove(); done(); }, OUT_MS);
  };

  // Un toque (o Enter/espacio) la salta, aunque ya nada lo pide en pantalla.
  el.addEventListener('pointerdown', leave, { once: true });
  window.addEventListener('keydown', onKey);
  timers.push(window.setTimeout(leave, MAX_WAIT_MS));

  // Lo normal: esperar al reloj de la propia animación, así la salida cae justo cuando termina la luz, sin adivinar tiempos.
  const clock = typeof el.getAnimations === 'function'
    ? el.getAnimations().find((a) => (a as CSSAnimation).animationName === 'neon-clock')
    : undefined;
  if (clock) {
    clock.finished.then(leave, leave);
    return;
  }
  // Sin reloj (la luz ya terminó, o el navegador no lo entrega): lo que falte según cuándo arrancó.
  const flavor = { short: el.classList.contains('neon-intro--short'), still: el.classList.contains('neon-intro--still') };
  timers.push(window.setTimeout(leave, introRemainingMs(Date.now(), Number(el.dataset.niT0), flavor)));
}
