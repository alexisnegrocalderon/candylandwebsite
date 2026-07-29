/** Lectura del QR de una entrada, compartida entre cliente y servidor.
 *
 * El QR no contiene el código pelado: contiene la URL de la página pública
 * de la entrada (`server/qr.ts` genera `<baseUrl>/verificar/<ticketCode>`),
 * para que quien lo escanee con la cámara del teléfono llegue a su entrada
 * sin instalar nada. La pantalla de puerta, en cambio, necesita el código
 * suelto para marcar el ingreso. */

/** Códigos válidos: mayúsculas, dígitos y guiones. Hoy todos salen como
 * `MP-XXXXXXXXXXXX` (server/webhooks.ts), pero el patrón se deja amplio a
 * propósito: si mañana cambia el prefijo, la puerta no deja de funcionar. */
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{4,63}$/;

/** Extrae el código de entrada desde lo que sea que devolvió la cámara.
 * Acepta la URL completa del QR o el código tecleado a mano; devuelve
 * `null` si no reconoce nada utilizable. */
export function parseTicketCodeFromQr(raw: string): string | null {
  const input = (raw ?? '').trim();
  if (!input) return null;

  // Caso normal: la URL del QR. Se corta en el primer `?` o `#` por si
  // algún lector le agrega parámetros de seguimiento.
  const match = input.match(/\/verificar\/([^/?#\s]+)/i);
  if (match) {
    const code = decodeURIComponent(match[1]).toUpperCase();
    return CODE_RE.test(code) ? code : null;
  }

  // Si vino algo con pinta de URL pero sin /verificar/, no es una entrada.
  if (/^https?:\/\//i.test(input) || input.includes('/')) return null;

  // Caso manual: alguien tecleó el código directamente.
  const code = input.toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
