import superjson from 'superjson';

/* «Mi cuenta» sin señal (en la puerta suele no haber). La última respuesta de
 * `member.me` (entradas con su QR, que viene como imagen dentro del mismo
 * dato, saldo, Playcoins, cupones) queda guardada en este teléfono: la app
 * abre al instante con ella y la reemplaza apenas llega la de la red. Si no
 * hay red, se queda con la guardada y lo dice arriba. La pantalla de la app y
 * sus archivos los guarda el service worker (public/sw-site.js).
 *
 * Se borra al cerrar sesión y cuando el servidor dice que ya no hay sesión,
 * así un teléfono prestado no queda mostrando la cuenta de otro. */

const KEY = 'cuenta.offline.v1';

export type AccountSnapshot<T> = { me: T; savedAt: number };

export function loadAccountSnapshot<T>(): AccountSnapshot<T> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = superjson.parse<AccountSnapshot<T>>(raw);
    return snap && snap.me ? snap : null;
  } catch {
    return null;
  }
}

export function saveAccountSnapshot<T>(me: T): void {
  try { localStorage.setItem(KEY, superjson.stringify({ me, savedAt: Date.now() })); } catch { /* sin espacio o modo privado: sigue sin copia */ }
}

export function clearAccountSnapshot(): void {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}

export function hasAccountSnapshot(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

/** Registra el worker del sitio (si los avisos no lo hicieron ya) y le pasa los archivos que
 * usó esta pantalla, para que la próxima vez abra aunque no haya señal. */
export function warmOfflineApp(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw-site.js', { scope: '/' })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const urls = performance.getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => { try { const p = new URL(u).pathname; return new URL(u).origin === location.origin && /^\/(assets|fonts|candyland)\//.test(p); } catch { return false; } });
      reg.active?.postMessage({ type: 'warm', urls, shell: '/cuenta' });
    })
    .catch(() => { /* sin worker: la app sigue funcionando, solo que necesita red */ });
}
