/* Estado de vinculación de una conversación de Instagram con la ficha real de
 * cliente: ¿ya está vinculada?, ¿dice que ya compró?, ¿a qué compradores se
 * parece? Solo lee; la vinculación la confirma el dueño (instagram.linkCustomer). */
import * as db from './db';
import { normalizeIgHandle, rankCustomerSuggestions, saysAlreadyBought, type CustomerSuggestion } from '../shared/igCustomerLink';

export interface IgCustomerLinkState {
  /** Ficha ya vinculada a este @ (la primera si hubiera varias). */
  linked: { customerId: number; fullName: string | null; email: string } | null;
  saysBought: boolean;
  /** Compradores del próximo evento que se parecen a la conversación. */
  suggestions: CustomerSuggestion[];
  /** Sin @ no se puede vincular (a veces Meta no entrega el username). */
  canLink: boolean;
  eventTitle: string | null;
}

/** El evento sobre el que se busca al comprador: el próximo publicado o, si
 * la fiesta fue hace menos de un día, ese. */
async function currentEvent() {
  const events = await db.getHomeEvents();
  const from = Date.now() - 24 * 60 * 60 * 1000;
  return events.find((e) => (e.status === 'published' || e.status === 'soldout') && new Date(e.eventDate).getTime() >= from) ?? null;
}

export async function getIgCustomerLinkState(threadId: number): Promise<IgCustomerLinkState | null> {
  const thread = await db.getIgThreadById(threadId);
  if (!thread) return null;
  const handle = normalizeIgHandle(thread.username);
  const linkedRows = handle ? await db.findCustomersByInstagram(handle) : [];
  const linked = linkedRows[0] ? { customerId: linkedRows[0].id, fullName: linkedRows[0].fullName, email: linkedRows[0].email } : null;
  const messages = await db.getIgMessages(threadId, 100);
  const saysBought = saysAlreadyBought(messages.filter((m) => m.direction === 'in').map((m) => m.text));
  let suggestions: CustomerSuggestion[] = [];
  let eventTitle: string | null = null;
  if (!linked && saysBought) {
    const event = await currentEvent();
    if (event) {
      eventTitle = event.title;
      suggestions = rankCustomerSuggestions(
        { username: thread.username, name: thread.name, notes: thread.customerNotes },
        await db.getEventBuyerCandidates(event.id),
      );
    }
  }
  return { linked, saysBought, suggestions, canLink: Boolean(handle), eventTitle };
}
