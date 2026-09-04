import { eq, and, isNull, inArray } from "drizzle-orm";
import { leads, customers } from "../drizzle/schema";

/** Tag fijo con el que se marca a un lead sincronizado como audiencia de
 * mailing (ver `syncLeadsAsMailingAudience`). Exportado para que
 * `matchLeadForOrder` lo saque con el mismo nombre exacto. */
export const LEADS_MAILING_TAG = 'leads';

/** Mismo comportamiento que `db.addCustomerTag`/`db.removeCustomerTag`
 * (server/db.ts), pero recibiendo el `db` como parámetro en vez de abrir su
 * propia conexión -- así las dos funciones de este archivo se pueden probar
 * con un solo doble de base, mismo criterio que `server/caja/sale.ts`. */
async function addTag(db: any, customerId: number, tag: string): Promise<void> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
  if (tags.includes(tag)) return;
  await db.update(customers).set({ tags: [...tags, tag] }).where(eq(customers.id, customerId));
}

async function removeTag(db: any, customerId: number, tag: string): Promise<void> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
  await db.update(customers).set({ tags: tags.filter((t: string) => t !== tag) }).where(eq(customers.id, customerId));
}

/** Cuando una compra se aprueba, marca cualquier lead que dejó ESE correo
 * como convertido y, si ese lead se había sincronizado como audiencia de
 * mailing, le saca el tag "leads" del cliente -- ya no tiene sentido
 * tratarlo como alguien sin convertir.
 *
 * `leads.convertedOrderId` existía en el schema desde que se creó la tabla
 * pero nadie lo llenaba. No importa a qué evento estaba atado el lead ni qué
 * canal usó para comprar -- si dejó el correo y después compró algo, es
 * información útil de todos modos. */
export async function matchLeadForOrder(db: any, order: { buyerEmail: string; id: number }): Promise<void> {
  if (!order.buyerEmail) return;
  const email = order.buyerEmail.trim().toLowerCase();

  const openLeads = await db.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.email, email), isNull(leads.convertedOrderId)));
  if (openLeads.length === 0) return;

  for (const l of openLeads as { id: number }[]) {
    await db.update(leads).set({ convertedOrderId: order.id }).where(eq(leads.id, l.id));
  }

  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
  if (customer) await removeTag(db, customer.id, LEADS_MAILING_TAG);
}

/** Convierte los leads sin convertir (`convertedOrderId IS NULL`) en filas
 * mínimas de `customers`, taggeadas "leads", para poder mandarles mailing
 * reusando TODO el pipeline que ya existe (MailingComposer, sendBatch,
 * createAutoCampaign, el cron, el presupuesto diario, el tageo por
 * campaña) -- ese pipeline está construido sobre `customerIds`, no sobre
 * leads, y tocarlo para aceptar los dos tipos de destinatario habría sido
 * mucho más riesgo que reusar el upsert-por-email que ya usa
 * `db.upsertCustomerFromOrder`.
 *
 * Si el lead ya es cliente de verdad (compró antes por otro medio), el
 * upsert por email solo le agrega el tag sin tocar sus datos reales -- nunca
 * se pisa un `customers` existente. Devuelve las filas resultantes en el
 * mismo shape que ya usa `customers.listAll`, para que el selector de
 * audiencia del admin no necesite ningún cambio. */
export async function syncLeadsAsMailingAudience(db: any, filter: { eventId?: number } = {}) {
  const conditions = [isNull(leads.convertedOrderId)];
  if (filter.eventId) conditions.push(eq(leads.eventId, filter.eventId));
  const openLeads = await db.select().from(leads).where(and(...conditions));

  const customerIds: number[] = [];
  for (const l of openLeads as any[]) {
    const [existing] = await db.select().from(customers).where(eq(customers.email, l.email)).limit(1);
    let customerId: number;
    if (existing) {
      customerId = existing.id;
    } else {
      const [result] = await db.insert(customers).values({
        email: l.email,
        phone: l.phone ?? null,
        instagram: l.instagram ?? null,
        tags: [],
      });
      customerId = (result as { insertId: number }).insertId;
    }
    await addTag(db, customerId, LEADS_MAILING_TAG);
    customerIds.push(customerId);
  }

  if (customerIds.length === 0) return [];
  return db.select().from(customers).where(inArray(customers.id, customerIds));
}
