/* El evento que Inicio muestra como «próximo»: el que está pasando o el siguiente que viene. Si ya no hay
 * ninguno por venir, el último que pasó (y la tarjeta lo dice). Antes tomaba el evento «más cercano en el
 * tiempo» de /caja, que después de una fiesta sigue siendo la fiesta pasada hasta que se acerca la próxima. */

/** Una fiesta sigue «en curso» hasta unas horas después de su hora de inicio (termina de madrugada). */
export const EVENT_ONGOING_HOURS = 12;
/** Para las pantallas de trabajo (Noche, Ventas, Finanzas): el cierre de la fiesta (conteo, pagos, resumen) se
 * revisa al día siguiente, así que el evento que acaba de pasar sigue siendo el de esas pantallas por dos días. */
export const EVENT_WRAPUP_HOURS = 48;

type EventLike = { id: number; eventDate: string | Date; status?: string | null };

export function pickCurrentEvent<T extends EventLike>(events: readonly T[] | null | undefined, now: Date = new Date(), graceHours: number = EVENT_ONGOING_HOURS): { event: T | null; past: boolean } {
  const list = [...(events ?? [])]
    .filter((e) => e.status !== 'draft' && e.status !== 'cancelled')
    .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  const limit = now.getTime() - graceHours * 3600_000;
  const upcoming = list.find((e) => new Date(e.eventDate).getTime() >= limit);
  if (upcoming) return { event: upcoming, past: false };
  const last = list[list.length - 1] ?? null;
  return { event: last, past: !!last };
}
