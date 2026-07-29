/** "¿Es hoy el día del evento?", para el correo de las 3am con el total de
 * gente que entró (server/cronRoutes.ts) -- pura y testeable, separada de la
 * consulta a la base en server/db.ts.
 *
 * El proyecto no trae una librería de zonas horarias, así que se usa un
 * offset fijo de Chile continental. No se ajusta solo entre CLST (verano,
 * UTC-3) y CLT (invierno, UTC-4): en la semana exacta del cambio de hora
 * esto puede desviarse ~1h. Para un chequeo de "es hoy" (no algo fino al
 * minuto) es aceptable. */
export const CHILE_OFFSET_HOURS = -4;

function dateKey(d: Date, offsetHours: number): string {
  const shifted = new Date(d.getTime() + offsetHours * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function isEventToday(eventDate: Date | string, now: Date, offsetHours: number = CHILE_OFFSET_HOURS): boolean {
  const d = eventDate instanceof Date ? eventDate : new Date(eventDate);
  if (Number.isNaN(d.getTime())) return false;
  return dateKey(d, offsetHours) === dateKey(now, offsetHours);
}
