/* Qué le decimos al cliente cuando el teléfono no logra activar los avisos.
 * Los errores del navegador vienen en inglés y sin pistas ("Registration
 * failed - push service error"); acá se traducen a algo que se pueda hacer. */

const SERVICE_ERROR =
  'Tu teléfono no pudo conectarse al servicio de avisos de Google. Prueba con otra red (datos móviles o WiFi), apaga la VPN o el bloqueador de anuncios si tienes uno, y revisa que Chrome y Google Play Services estén actualizados.';

const BLOCKED = 'Los avisos están bloqueados para este sitio. Actívalos en los ajustes del navegador o del teléfono.';

const GENERIC = 'No se pudieron activar los avisos en este teléfono. Inténtalo de nuevo, o abre Playroom en Chrome.';

export function pushErrorMessage(err: unknown): string {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : '';
  const message = err instanceof Error ? err.message : '';
  // Los errores del navegador (DOMException): se traducen según su tipo.
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    if (/push service error|network error|could not be reached/i.test(message)) return SERVICE_ERROR;
    if (name === 'NotAllowedError' || /permission denied/i.test(message)) return BLOCKED;
    if (name === 'AbortError') return SERVICE_ERROR;
    return GENERIC;
  }
  // El mismo texto sin ser DOMException (algunos navegadores lo lanzan como Error).
  if (/push service error/i.test(message)) return SERVICE_ERROR;
  if (/permission denied/i.test(message)) return BLOCKED;
  // Los errores de nuestro servidor ya vienen en español: se muestran tal cual.
  if (message && /[áéíóúñ¿¡]|\b(los|las|el|la|no|se|tu)\b/i.test(message) && !/^[A-Za-z .,-]*failed/i.test(message)) return message;
  return GENERIC;
}
