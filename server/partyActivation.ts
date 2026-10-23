import { eq } from 'drizzle-orm';
import { getDb, getPartyActor, updatePartyProfile } from './db';
import { orders, tickets } from '../drizzle/schema';
import { canEnterParty } from '../shared/party';
import { pushToEmail } from './customerPush';

/* Inscripción anticipada en Playmatch: quien dejó su perfil listo antes de la
 * fiesta queda invisible (`active=0`) hasta que escanean su entrada. Al
 * escanearla en la puerta se activa y le llega el aviso al teléfono, para que
 * entre de inmediato desde la app. Nunca frena la puerta. */
export async function activatePlaymatchForTicket(ticketCode: string): Promise<void> {
  try {
    const actor = await getPartyActor(ticketCode);
    if (!actor?.profile || actor.profile.active || actor.profile.banned) return;
    if (!canEnterParty(actor.ticket, actor.event)) return;
    await updatePartyProfile(actor.profile.id, { active: 1, lastSeenAt: new Date() });
    const db = await getDb();
    if (!db) return;
    const [row] = await db.select({ email: orders.buyerEmail }).from(tickets).innerJoin(orders, eq(orders.id, tickets.orderId)).where(eq(tickets.id, actor.ticket.id)).limit(1);
    if (!row?.email) return;
    await pushToEmail(row.email, {
      title: '🍬 ¡Ya estás en Playmatch!',
      body: `${actor.profile.alias} ya aparece en la fiesta. Entra y mira quién está.`,
      url: '/cuenta?tab=playmatch',
    });
  } catch (err) {
    console.error('[playmatch] No se pudo activar el perfil tras el check-in:', err);
  }
}
