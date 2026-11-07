/* El color de pulsera de cada persona, dentro de la lista que baja la puerta (así funciona sin señal).
 * Solo en eventos de colaboración (PLAYMORE). El color sale de la clave del servidor: viaja únicamente al personal
 * autenticado de la puerta, nunca a la app de quien compró antes de llegar. */
import { ENV } from './_core/env';
import { isEventColab } from './coproduction';
import { peopleForAcceso, type PlayTeam } from '../shared/playTeams';
import { teamsForTicket } from './playTeams';

type Access = { ticketCode: string; accesoSlug: string | null; groupSize: number | null; teams?: PlayTeam[] };
type Snapshot = { event: { id: number }; attendees: { access: Access[] }[] } & Record<string, unknown>;

export async function withPlayTeams<T extends Snapshot | null>(snapshot: T): Promise<T & { playTeams?: boolean }> {
  if (!snapshot) return snapshot as T & { playTeams?: boolean };
  if (!ENV.cookieSecret || !(await isEventColab(snapshot.event.id))) return snapshot as T & { playTeams?: boolean };
  for (const attendee of snapshot.attendees) {
    for (const acc of attendee.access) {
      acc.teams = teamsForTicket(acc.ticketCode, peopleForAcceso(acc.accesoSlug, acc.groupSize), ENV.cookieSecret);
    }
  }
  return { ...snapshot, playTeams: true };
}
