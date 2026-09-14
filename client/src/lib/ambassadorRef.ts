/** Link personal de embajador: `?embajador=CODIGO` en cualquier página del
 * sitio guarda el código para que se aplique SOLO cuando la persona compre,
 * aunque sea horas o días después -- mismo mecanismo y mismo criterio de
 * "último toque gana" que `client/src/lib/utm.ts` (ver ese archivo para el
 * razonamiento completo), pensado para el link que un embajador pone en el
 * swipe-up de una historia: nadie transcribe un código a mano desde ahí,
 * pero sí toca un link.
 *
 * Se captura una sola vez por carga completa de página (ver main.tsx),
 * Checkout.tsx lo lee de vuelta y lo aplica solo si la persona no escribió
 * ya un código a mano. */

const STORAGE_KEY = 'mp_ambassador_ref';

/** Se llama una vez al arrancar la app (main.tsx). Si la URL actual trae
 * `?embajador=`, reemplaza lo guardado; si no, no toca lo que ya había. */
export function captureAmbassadorRef(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('embajador')?.trim();
    if (!code) return;
    localStorage.setItem(STORAGE_KEY, code.toUpperCase());
  } catch {
    // localStorage puede fallar (modo privado, storage lleno) -- no es
    // crítico, esa sesión simplemente no trae el código pre-aplicado.
  }
}

/** Lee lo guardado (Checkout.tsx, al montar). Nunca revienta si no hay nada
 * guardado o el navegador bloquea localStorage. */
export function getStoredAmbassadorRef(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
