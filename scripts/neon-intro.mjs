/* Intro de neón: el letrero que se enciende al abrir la app, el panel y el sitio.
 *
 * Esto es lo que comparten los dos HTML que la llevan (client/index.html para el sitio y scripts/generate-pwa-html.mjs para el
 * panel y las terminales): el escenario (isotipo + PLAYROOM) y la función que decide, ANTES del primer cuadro, si toca la intro.
 * Los estilos están en client/src/neonIntro.css y el final (abrir la app) en client/src/lib/neonIntro.ts.
 *
 * Por qué así: antes la intro cambiaba el contenido del splash cuando React estaba listo y el isotipo desaparecía, cambiaba de
 * tamaño y titilaba. Ahora el escenario ya está en el HTML y la animación corre desde el primer cuadro, sin reemplazar nada:
 * la imagen de arranque de iOS, el splash y la intro son un solo movimiento continuo. */

export const NEON_INTRO_WORD = 'PLAYROOM';

/** Escenario de la intro. El isotipo sale de `--ni-logo` (una variable en el #initial-loader), así el HTML lleva la imagen una sola vez. */
export function neonIntroStageHtml() {
  const n = NEON_INTRO_WORD.length;
  const letters = NEON_INTRO_WORD.split('').map((ch, i) => `<span class="neon-intro-letter" style="--i:${i};--j:${i};--n:${n}">${ch}</span>`).join('');
  return '<div class="neon-intro-camera" aria-hidden="true"><div class="neon-intro-stage">'
    + '<div class="neon-intro-bloom"></div>'
    + '<div class="neon-intro-logo"><div class="neon-intro-base"></div><div class="neon-intro-reveal"><div class="neon-intro-light"></div></div></div>'
    + `<div class="neon-intro-word font-heading">${letters}</div>`
    + '</div></div>'
    // La luz del borde de la pantalla. Va fuera de la cámara (ocupa toda la pantalla, no el escenario) y con su posición en
    // línea: así no entra al flujo del splash ni mueve el isotipo aunque todavía no haya llegado la hoja de estilos.
    + '<div class="neon-intro-edge" aria-hidden="true" style="position:absolute;inset:0;pointer-events:none"></div>';
}

/** Decide si toca la intro y, si toca, la enciende (clase `neon-intro` en el splash). Corre en el HTML, antes del primer cuadro.
 * Una vez por apertura de la app: la marca va en sessionStorage, que el sistema borra al cerrar la app y que sobrevive a una
 * recarga mientras sigue abierta. `env` es lo que la página le pasa (así se puede probar sin navegador).
 * ⚠️ Se copia tal cual (`toString`) dentro de los HTML: ES5, sin importar nada. */
export function neonIntroStart(env) {
  var el = env.doc.getElementById('initial-loader');
  if (!el) return false;
  var site = env.kind === 'site';
  // El sitio solo la muestra en la home; las pruebas automáticas entran directo.
  if (site && (env.path !== '/' || env.webdriver)) return false;
  var key = site ? 'site' : (env.path.split('/')[1] || 'app');
  var mark = 'neon-intro.seen.' + key;
  try { if (env.storage.getItem(mark) === '1') return false; } catch (e) { return false; }
  try { env.storage.setItem(mark, '1'); } catch (e) { /* sin storage: se verá de nuevo, no pasa nada */ }
  // Las terminales (caja, puerta…) la ven corta para no frenar la noche; el panel y el sitio, completa.
  var classes = ' neon-intro' + (!site && key !== 'admin' ? ' neon-intro--short' : '') + (env.reducedMotion ? ' neon-intro--still' : '');
  el.className = (el.className + classes).replace(/^\s+/, '');
  el.setAttribute('data-ni-t0', String(env.now));
  return true;
}

/** La llamada que va en el HTML de las pantallas oscuras (panel y terminales). */
export function neonIntroStartCall(kind) {
  return `try{neonIntroStart({doc:document,storage:sessionStorage,path:location.pathname,kind:'${kind}',webdriver:navigator.webdriver,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,now:Date.now()})}catch(e){}`;
}

/** Script completo para el HTML de las pantallas oscuras. */
export function neonIntroInlineScript(kind) {
  return `<script>\n${neonIntroStart.toString()}\n${neonIntroStartCall(kind)}\n</script>`;
}
