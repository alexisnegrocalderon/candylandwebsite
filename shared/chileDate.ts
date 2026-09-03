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

/** La HORA del día (0-23) de un instante, en hora de Chile.
 *
 * `new Date(x).getHours()` devuelve la hora del runtime, que en Vercel es
 * UTC: el gráfico de "horas punta" del admin quedaba corrido 3-4 horas, y
 * una fiesta de 21:00 a 05:00 aparecía repartida donde no era. Misma razón
 * que el resto de este archivo, pero para la hora suelta en vez de un texto
 * formateado.
 *
 * Se usa la zona IANA para que el horario de verano se resuelva solo. */
export function chileHourOf(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: CHILE_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(d);
  // `hour12: false` puede devolver "24" a la medianoche según el motor.
  return Number(hour) % 24;
}
