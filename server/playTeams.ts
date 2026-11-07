/* El color de cada persona de un ticket: hash del código con una clave secreta del servidor (ver shared/playTeams.ts). */
import { createHash } from 'node:crypto';
import { otherTeam, type PlayTeam } from '../shared/playTeams';

/** Color de la primera persona del ticket: una moneda justa, determinada por el código y la clave. */
export function firstTeamFor(ticketCode: string, secret: string): PlayTeam {
  const digest = createHash('sha256').update(`${secret}:playteam:${ticketCode.trim().toUpperCase()}`).digest();
  return digest[0] % 2 === 0 ? 'magenta' : 'azul';
}

/** Los colores de las personas de un ticket, en orden: se alternan para que una pareja quede repartida. */
export function teamsForTicket(ticketCode: string, people: number, secret: string): PlayTeam[] {
  const first = firstTeamFor(ticketCode, secret);
  return Array.from({ length: Math.max(1, Math.min(people, 6)) }, (_, i) => (i % 2 === 0 ? first : otherTeam(first)));
}

