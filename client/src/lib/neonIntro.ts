/* Intro cinematográfica de apertura: "letrero de neón que se enciende".
 *
 * Toma el splash oscuro (#initial-loader) que ya está en pantalla y, en vez de
 * desvanecerlo, lo convierte en la intro: el logo se "dibuja" de abajo hacia
 * arriba como un tubo apagado, titila, se enciende con brillo rosa y azul, y
 * aparece "MANSION PLAYROOM" letra por letra antes de subir y dar paso a la
 * pantalla (que ya está montada debajo). Estilos en client/src/admin.css
 * (`.neon-intro`).
 *
 * Reglas del dueño: solo la primera apertura del día de cada app (después
 * abre rápido), un toque la salta, vibración suave al encenderse, versión
 * corta en las terminales y versión quieta con "Reducir movimiento". */

const DAY_KEY = 'neon-intro.day.';

/** Duración total en ms: panel completo, terminales corta. */
const FULL_MS = 3000;
const SHORT_MS = 1600;
const STATIC_MS = 900;

/** Qué app es (admin, caja, puerta…) según la ruta. */
function appKey(): string {
  return (typeof location !== 'undefined' ? location.pathname.split('/')[1] : '') || 'app';
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ¿Toca la intro? Solo la primera apertura del día de esta app. La marca de
 * "ya se vio hoy" se guarda al reproducirla. */
export function introDue(): boolean {
  try { return localStorage.getItem(DAY_KEY + appKey()) !== today(); } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(DAY_KEY + appKey(), today()); } catch { /* sin storage: se verá de nuevo, no pasa nada */ }
}

const WORD_TOP = 'MANSION';
const WORD_BOTTOM = 'PLAYROOM';

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
  el.setAttribute('aria-label', 'Mansion Playroom');
  el.innerHTML = `
    <div class="neon-intro-stage">
      <div class="neon-intro-logo">
        <img class="neon-intro-tube" src="${logoSrc}" alt="" />
        <img class="neon-intro-light" src="${logoSrc}" alt="" />
      </div>
      <div class="neon-intro-word">
        ${letters(WORD_TOP, 'neon-intro-top', 0)}
        ${letters(WORD_BOTTOM, 'neon-intro-bottom font-heading', WORD_TOP.length)}
      </div>
    </div>
    <span class="neon-intro-skip">Toca para entrar</span>`;

  let finished = false;
  const timers: number[] = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    el.classList.add('neon-intro--out');
    window.setTimeout(() => { el.remove(); done(); }, 320);
  };

  // Un toque en cualquier parte salta la intro.
  el.addEventListener('pointerdown', finish, { once: true });

  // Vibración suave justo cuando el letrero se enciende (donde el sistema la permite).
  if (!still) {
    timers.push(window.setTimeout(() => { try { navigator.vibrate?.(14); } catch { /* sin vibración */ } }, short ? 560 : 1150));
  }
  timers.push(window.setTimeout(finish, total));
}
