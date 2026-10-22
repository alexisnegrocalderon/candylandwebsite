/* Ventana de bienvenida a la comunidad: la notificación de bienvenida (server/
 * customerPush.ts) abre el sitio con este parámetro y el sitio muestra el
 * mensaje de respeto, consentimiento y libertad (client/src/components/site/
 * WelcomeDialog.tsx). Antes la notificación abría el inicio tal cual y, si la
 * persona ya estaba en la app, no se veía nada. */

export const WELCOME_PARAM = 'bienvenida';
/** A dónde lleva la notificación de bienvenida. */
export const WELCOME_URL = `/?${WELCOME_PARAM}=1`;

function params(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/** ¿La dirección pide mostrar la bienvenida? Solo con el valor «1». */
export function hasWelcomeParam(search: string): boolean {
  return params(search).get(WELCOME_PARAM) === '1';
}

/** La misma búsqueda sin el parámetro (y con los demás intactos), para que
 * recargar la página no vuelva a mostrar la ventana. Devuelve '' o '?a=b'. */
export function withoutWelcomeParam(search: string): string {
  const p = params(search);
  p.delete(WELCOME_PARAM);
  const rest = p.toString();
  return rest ? `?${rest}` : '';
}
