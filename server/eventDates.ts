/** Normaliza los campos de fecha de un evento antes de escribirlos a la base.
 *
 * El formulario del admin manda `doorsOpen`/`eventEnd` como texto vacío ('')
 * cuando el evento no tiene esos datos (los eventos viejos importados no los
 * tienen). Drizzle convierte las columnas `timestamp` llamando a
 * `value.toISOString()`, así que un '' que llegaba hasta ahí reventaba el
 * guardado entero con "value.toISOString is not a function" -- y con eso no se
 * podía ni cambiar el flyer de esos eventos.
 *
 *  - `doorsOpen` / `eventEnd`: '' o null → null (se borra la fecha); texto con
 *    fecha → Date; ausente → no se toca.
 *  - `eventDate` es obligatoria: vacía se ignora (conserva la que ya tenía). */
export function normalizeEventDates<T extends Record<string, any>>(data: T): T {
  const out: Record<string, any> = { ...data };

  for (const key of ['doorsOpen', 'eventEnd'] as const) {
    if (!(key in out) || out[key] === undefined) continue;
    const value = out[key];
    if (value === null || value === '') {
      out[key] = null;
      continue;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`Fecha inválida en "${key}".`);
    out[key] = date;
  }

  if ('eventDate' in out) {
    if (!out.eventDate) {
      delete out.eventDate;
    } else {
      const date = new Date(out.eventDate);
      if (Number.isNaN(date.getTime())) throw new Error('Fecha inválida en "eventDate".');
      out.eventDate = date;
    }
  }

  return out as T;
}
