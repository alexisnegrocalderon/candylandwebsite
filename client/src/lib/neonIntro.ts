/* Intro cinematográfica de apertura: "letrero de neón que se enciende".
 *
 * Toma el splash oscuro (#initial-loader) que ya está en pantalla y, en vez de
 * desvanecerlo, lo convierte en la intro: el logo se "dibuja" de abajo hacia
 * arriba como un tubo apagado, titila, se enciende con brillo rosa y azul, y
 * aparece "PLAYROOM" letra por letra antes de subir y dar paso a la
 * pantalla (que ya está montada debajo). Estilos en client/src/admin.css
 * (`.neon-intro`).
 *
 * Reglas del dueño: cada vez que se abre la app (después de cerrarla), pero no
 * de nuevo mientras sigue abierta -- por eso la marca va en sessionStorage,
 * que el sistema borra al cerrar la app y que sobrevive a una recarga
 * mientras está abierta. Un toque la salta, vibración suave al encenderse, versión
 * corta en las terminales y versión quieta con "Reducir movimiento". */

import '@/neonIntro.css';

const SEEN_KEY = 'neon-intro.seen.';

/** Duración total en ms: la intro corta (terminales, sitio) entra sola al terminar; la del panel espera el toque. */
const FULL_MS = 3000;
const SHORT_MS = 1600;
const STATIC_MS = 900;

/** Qué app es (admin, caja, puerta…) según la ruta. El sitio instalado es
 * una sola app aunque se abra en otra ruta (un aviso push que lleva a la entrada). */
function appKey(): string {
  if (typeof document !== 'undefined' && document.documentElement.dataset.splash === 'site') return 'site';
  return (typeof location !== 'undefined' ? location.pathname.split('/')[1] : '') || 'app';
}

/** ¿Toca la intro? Sí al abrir la app; no si ya se vio con la app abierta. */
export function introDue(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY + appKey()) !== '1'; } catch { return false; }
}

function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY + appKey(), '1'); } catch { /* sin storage: se verá de nuevo, no pasa nada */ }
}

// Solo "PLAYROOM" (pedido del dueño), sin el "MANSION" de arriba.
const WORD = 'PLAYROOM';

function letters(word: string, className: string, startIndex: number): string {
  // --i: orden de aparición global; --j/--n: posición dentro de la palabra,
  // para que el degradado recorra la palabra entera y no se repita por letra.
  return `<span class="${className}" aria-hidden="true">${word.split('').map((ch, i) => `<span class="neon-intro-letter" style="--i:${startIndex + i};--j:${i};--n:${word.length}">${ch}</span>`).join('')}</span>`;
}

/** Convierte el splash en la intro y lo quita al terminar. `done` se llama
 * cuando el overlay ya no está. */
export function playNeonIntro(el: HTMLElement, done: () => void): void {
  markSeen();
  const short = appKey() !== 'admin';
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const total = still ? STATIC_MS : short ? SHORT_MS : FULL_MS;

  const logoSrc = el.querySelector('img')?.getAttribute('src') ?? '/candyland/logo-isotipo-transparent.png';
  el.classList.add('neon-intro', short ? 'neon-intro--short' : 'neon-intro--full');
  if (still) el.classList.add('neon-intro--still');
  el.setAttribute('aria-label', 'Playroom');
  el.innerHTML = `
    <div class="neon-intro-stage">
      <div class="neon-intro-logo">
        <img class="neon-intro-tube" src="${logoSrc}" alt="" />
        <img class="neon-intro-light" src="${logoSrc}" alt="" />
      </div>
      <div class="neon-intro-word">
        ${letters(WORD, 'neon-intro-bottom font-heading', 0)}
      </div>
    </div>
    <span class="neon-intro-skip">Toca para entrar</span>`;

  let finished = false;
  const timers: number[] = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    stopKey();
    el.classList.add('neon-intro--out');
    window.setTimeout(() => { el.remove(); done(); }, 320);
  };

  // Un toque en cualquier parte entra (también Enter o espacio con teclado).
  el.addEventListener('pointerdown', finish, { once: true });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') finish(); };
  window.addEventListener('keydown', onKey);
  const stopKey = () => window.removeEventListener('keydown', onKey);

  // Vibración suave justo cuando el letrero se enciende (donde el sistema la permite).
  if (!still) {
    timers.push(window.setTimeout(() => { try { navigator.vibrate?.(14); } catch { /* sin vibración */ } }, short ? 560 : 1150));
  }
  // El panel espera el toque (pedido del dueño: «quiero hacer clic para entrar»); la versión corta
  // (terminales y sitio instalado) sigue entrando sola para no frenar la puerta ni la caja.
  if (short) timers.push(window.setTimeout(finish, total));
}
