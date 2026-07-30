/* Formato de fechas en hora de Chile.
 *
 * ⚠️ POR QUÉ EXISTE ESTE ARCHIVO: `toLocaleDateString('es-CL', ...)` define el
 * IDIOMA, no la zona horaria. La zona sigue siendo la del runtime, que en
 * Vercel es UTC. Como el evento se guarda como un instante (21:00 en Chile =
 * 01:00 UTC del día SIGUIENTE), formatear sin `timeZone` corre la fecha un día
 * y la hora cuatro: "Sábado 8 a las 21:00" salía como "domingo 9" en los
 * correos.
 *
 * Ese bug ya se había arreglado a mano en webhooks.ts, pero solo ahí, y volvió
 * a aparecer en cada lugar nuevo que formateaba una fecha. Por eso ahora vive
 * en un solo lugar: si formateas una fecha para mostrarle a alguien, usa estas
 * funciones y no `toLocale*` directo.
 *
 * Se usa la zona IANA (no un offset fijo) para que el horario de verano
 * chileno se resuelva solo: Chile es UTC-4 en invierno y UTC-3 en verano. */

export const CHILE_TZ = 'America/Santiago';

/** "sábado, 8 de agosto" (o con año si `withYear`). */
export function formatChileDate(date: Date | string, opts: { withYear?: boolean; withWeekday?: boolean } = {}): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('es-CL', {
    ...(opts.withWeekday === false ? {} : { weekday: 'long' }),
    day: 'numeric',
    month: 'long',
    ...(opts.withYear ? { year: 'numeric' } : {}),
    timeZone: CHILE_TZ,
  });
}

/** "21:00" — en 24 horas a propósito: `es-CL` por defecto devuelve
 * "09:00 p. m.", que no calza con cómo se muestra el horario en el sitio
 * ("21:00 — 04:30 hrs") ni con cómo se habla de la hora acá. */
export function formatChileTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CHILE_TZ });
}

/** "08-08-2026 21:00" — para exportaciones y tablas del admin. */
export function formatChileDateTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('es-CL', { timeZone: CHILE_TZ });
}

/** Solo la fecha en números: "08-08-2026". */
export function formatChileShortDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('es-CL', { timeZone: CHILE_TZ });
}
