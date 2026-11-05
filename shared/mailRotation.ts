/* Rotación de los mails de venta de un evento: a cada persona que todavía no
 * compró le llegan como máximo N correos del evento (el primero, el masivo del
 * lanzamiento, cuenta como uno), repartidos de a poco en los días siguientes.
 * Vive en `shared/` y sin dependencias para poder probarlo sin base de datos. */

/** Cuántos mails de un mismo evento recibe como máximo cada persona (incluye el masivo del lanzamiento). */
export const MAX_EVENT_MAILS_PER_PERSON = 3;

/** Lo que ya se le mandó a una persona de este evento (masivo + avisos diarios). */
export type MailStat = { count: number; last: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;

/** A quiénes les toca hoy, en orden de envío:
 *  - se excluye a quien ya llegó al tope (`maxPerPerson`) o recibió uno hace menos de `intervalDays`;
 *  - primero los que menos mails llevan (así todos reciben el 2º antes de que alguien reciba el 3º: se
 *    van turnando), y dentro de eso el último envío más antiguo; el id desempata para que sea estable. */
export function pickDueForRotation<T extends { id: number }>(
  eligible: T[],
  stats: Map<number, MailStat>,
  opts: { maxPerPerson?: number; intervalDays: number; now?: Date },
): T[] {
  const max = opts.maxPerPerson ?? MAX_EVENT_MAILS_PER_PERSON;
  const cutoff = (opts.now ?? new Date()).getTime() - opts.intervalDays * DAY_MS;
  const statOf = (id: number): MailStat => stats.get(id) ?? { count: 0, last: null };
  return eligible
    .filter((c) => {
      const s = statOf(c.id);
      if (s.count >= max) return false;
      return !s.last || s.last.getTime() <= cutoff;
    })
    .sort((a, b) => {
      const sa = statOf(a.id);
      const sb = statOf(b.id);
      return (sa.count - sb.count) || ((sa.last?.getTime() ?? 0) - (sb.last?.getTime() ?? 0)) || (a.id - b.id);
    });
}

/** Mails que todavía se les pueden mandar a quienes siguen sin comprar (para saber si el tope diario alcanza). */
export function remainingMailsNeeded(eligibleIds: number[], stats: Map<number, MailStat>, maxPerPerson: number = MAX_EVENT_MAILS_PER_PERSON): number {
  return eligibleIds.reduce((sum, id) => sum + Math.max(0, maxPerPerson - (stats.get(id)?.count ?? 0)), 0);
}
