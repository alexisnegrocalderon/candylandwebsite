/* Campañas aliadas: el link privado /electronica (comunidad electrónica del
 * B2B Aldo Medel x German Courtin) y los que vengan después. Las reglas
 * puras (precio, accesos permitidos, tope) viven en shared/partnerCampaign.ts;
 * acá solo lo que necesita base de datos.
 *
 * Todo lo que lee `partnerCampaigns`/`partnerOrders` desde pantallas que NO
 * son de la campaña (Ventas Web, el email, el webhook) nunca tira: si la
 * migración 0107 todavía no está aplicada, esas pantallas siguen funcionando
 * igual que antes, solo sin el sello. */
import { and, asc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { customers, events, orderItems, orders, partnerCampaigns, partnerOrders, ticketTypes, type PartnerCampaign } from '../drizzle/schema';
import { getDb } from './db';
import { normalizeRut } from '../shared/rut';
import { personasForAccesoSlug } from '../shared/mission300';
import {
  PARTNER_DEFAULT_HEADLINE, PARTNER_PERSONAS, partnerAccessPrice, partnerAllowedAccesos, partnerCustomerTag,
  partnerRulesList,
} from '../shared/partnerCampaign';

/** Única campaña que existe hoy. Si algún día hay otra, se crea con otro slug
 * y su propia ruta en App.tsx. */
export const ELECTRONICA_SLUG = 'electronica';

export async function getPartnerCampaignBySlug(slug: string): Promise<PartnerCampaign | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(partnerCampaigns).where(eq(partnerCampaigns.slug, slug)).limit(1);
  return row ?? null;
}

/** Personas con pago aprobado que ya entraron por la campaña (para el tope y
 * el contador del admin). Cuenta por acceso, no por orden: un Grupo son 4. */
export async function getPartnerCampaignStats(campaignId: number) {
  const db = await getDb();
  const empty = { orders: 0, personas: 0, revenue: 0, pendingOrders: 0, byAcceso: {} as Record<string, number> };
  if (!db) return empty;
  const orderRows = await db.select({ id: orders.id, total: orders.total, paymentStatus: orders.paymentStatus })
    .from(partnerOrders)
    .innerJoin(orders, eq(partnerOrders.orderId, orders.id))
    .where(eq(partnerOrders.campaignId, campaignId));
  const approved = orderRows.filter((o) => o.paymentStatus === 'approved');
  const stats = { ...empty, byAcceso: {} as Record<string, number> };
  stats.orders = approved.length;
  stats.pendingOrders = orderRows.filter((o) => o.paymentStatus === 'pending').length;
  stats.revenue = approved.reduce((s, o) => s + Number(o.total), 0);
  if (approved.length === 0) return stats;
  const items = await db.select({ quantity: orderItems.quantity, accesoSlug: ticketTypes.accesoSlug })
    .from(orderItems)
    .innerJoin(ticketTypes, eq(orderItems.ticketTypeId, ticketTypes.id))
    .where(and(inArray(orderItems.orderId, approved.map((o) => o.id)), eq(ticketTypes.category, 'acceso')));
  for (const it of items) {
    const personas = personasForAccesoSlug(it.accesoSlug) * it.quantity;
    stats.personas += personas;
    const key = it.accesoSlug ?? 'otro';
    stats.byAcceso[key] = (stats.byAcceso[key] ?? 0) + personas;
  }
  return stats;
}

/** ¿Ya es cliente de Playroom? = tiene ficha con al menos una compra y no la
 * hizo por esta misma campaña (alguien de la comunidad que vuelve a comprar
 * para sumar amigos no se bloquea). Se cruza por email y por RUT normalizado
 * -- customers.rut se guarda tal como se escribió, por eso el REPLACE. */
export async function isExistingPlayroomCustomer(params: { email: string; rut?: string | null; campaignSlug: string }): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const email = params.email.trim().toLowerCase();
  const rut = params.rut?.trim() ? normalizeRut(params.rut) : null;
  const conditions = [eq(customers.email, email)];
  if (rut) conditions.push(sql`UPPER(REPLACE(REPLACE(${customers.rut}, '.', ''), ' ', '')) = ${rut}`);
  const rows = await db.select({ totalOrders: customers.totalOrders, tags: customers.tags })
    .from(customers)
    .where(or(...conditions));
  const tag = partnerCustomerTag(params.campaignSlug);
  return rows.some((c) => c.totalOrders > 0 && !(Array.isArray(c.tags) && (c.tags as unknown[]).includes(tag)));
}

export async function recordPartnerOrder(orderId: number, campaignId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(partnerOrders).values({ orderId, campaignId });
}

/** Campaña de una orden, o null. Nunca tira (ver comentario de arriba). */
export async function getPartnerCampaignForOrder(orderId: number): Promise<PartnerCampaign | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db.select({ campaign: partnerCampaigns })
      .from(partnerOrders)
      .innerJoin(partnerCampaigns, eq(partnerOrders.campaignId, partnerCampaigns.id))
      .where(eq(partnerOrders.orderId, orderId))
      .limit(1);
    return row?.campaign ?? null;
  } catch (error) {
    console.warn('[partnerCampaigns] No se pudo leer la campaña de la orden (¿falta la migración 0107?):', error);
    return null;
  }
}

/** Sello por orden para la lista de Ventas Web: orderId → {label, emoji}. */
export async function getPartnerBadgesByOrderIds(orderIds: number[]): Promise<Map<number, { label: string; emoji: string }>> {
  const out = new Map<number, { label: string; emoji: string }>();
  const db = await getDb();
  if (!db || orderIds.length === 0) return out;
  try {
    const rows = await db.select({ orderId: partnerOrders.orderId, label: partnerCampaigns.label, emoji: partnerCampaigns.emoji })
      .from(partnerOrders)
      .innerJoin(partnerCampaigns, eq(partnerOrders.campaignId, partnerCampaigns.id))
      .where(inArray(partnerOrders.orderId, orderIds));
    for (const r of rows) out.set(r.orderId, { label: r.label, emoji: r.emoji });
  } catch (error) {
    console.warn('[partnerCampaigns] Sin sellos de campaña (¿falta la migración 0107?):', error);
  }
  return out;
}

/** Al aprobarse el pago: deja al cliente etiquetado como parte de la
 * comunidad (ficha del cliente) y, si todavía no tenía origen, se lo pone. */
export async function tagCustomerForPartnerOrder(orderId: number, buyerEmail: string) {
  const campaign = await getPartnerCampaignForOrder(orderId);
  if (!campaign) return;
  const db = await getDb();
  if (!db) return;
  const email = buyerEmail.trim().toLowerCase();
  const [customer] = await db.select({ id: customers.id, tags: customers.tags, source: customers.source })
    .from(customers).where(eq(customers.email, email)).limit(1);
  if (!customer) return;
  const tag = partnerCustomerTag(campaign.slug);
  const tags = Array.isArray(customer.tags) ? (customer.tags as string[]) : [];
  await db.update(customers).set({
    tags: tags.includes(tag) ? tags : [...tags, tag],
    source: customer.source || tag,
  }).where(eq(customers.id, customer.id));
}

/** Lo que ve el link público: precios por acceso, textos y si está abierto.
 * A propósito sin contadores (ni ventas ni cupos restantes exactos). */
export async function getPublicPartnerCampaign(slug: string) {
  const campaign = await getPartnerCampaignBySlug(slug);
  if (!campaign) return null;
  const db = await getDb();
  const [event] = db ? await db.select({ slug: events.slug, name: events.title }).from(events).where(eq(events.id, campaign.eventId)).limit(1) : [];
  if (!event) return null;
  let full = false;
  if (campaign.maxPersons != null) {
    const stats = await getPartnerCampaignStats(campaign.id);
    full = stats.personas >= campaign.maxPersons;
  }
  const allowed = partnerAllowedAccesos(campaign.allowedAccesoSlugs);
  return {
    slug: campaign.slug,
    label: campaign.label,
    emoji: campaign.emoji,
    headline: campaign.headline || PARTNER_DEFAULT_HEADLINE,
    pricePerPerson: campaign.pricePerPerson,
    prices: Object.fromEntries(allowed.map((s) => [s, partnerAccessPrice(campaign.pricePerPerson, s)!])) as Record<string, number>,
    personas: Object.fromEntries(allowed.map((s) => [s, PARTNER_PERSONAS[s]])) as Record<string, number>,
    rules: partnerRulesList(campaign.rulesText),
    eventSlug: event.slug,
    eventName: event.name,
    status: !campaign.isActive ? 'closed' as const : full ? 'full' as const : 'open' as const,
  };
}

/** Admin: la campaña con sus números. Si la fila no existe (migración aplicada
 * sin el seed, o evento con otro slug), la crea apagada para el próximo
 * evento, así la pantalla siempre tiene algo que configurar. */
export async function getPartnerCampaignForAdmin(slug: string) {
  const db = await getDb();
  if (!db) return null;
  let campaign = await getPartnerCampaignBySlug(slug);
  if (!campaign) {
    const [next] = await db.select({ id: events.id }).from(events)
      .where(gte(events.eventDate, new Date())).orderBy(asc(events.eventDate)).limit(1);
    if (!next) return null;
    await db.insert(partnerCampaigns).values({
      slug, eventId: next.id, label: 'Comunidad Electrónica', emoji: '🎧', pricePerPerson: 5000, isActive: 0,
    });
    campaign = await getPartnerCampaignBySlug(slug);
    if (!campaign) return null;
  }
  const [stats, eventRows] = await Promise.all([
    getPartnerCampaignStats(campaign.id),
    db.select({ name: events.title, slug: events.slug }).from(events).where(eq(events.id, campaign.eventId)).limit(1),
  ]);
  return {
    ...campaign,
    allowedAccesoSlugs: partnerAllowedAccesos(campaign.allowedAccesoSlugs),
    headlineEffective: campaign.headline || PARTNER_DEFAULT_HEADLINE,
    rulesEffective: partnerRulesList(campaign.rulesText).join('\n'),
    eventName: eventRows[0]?.name ?? null,
    eventSlug: eventRows[0]?.slug ?? null,
    stats,
  };
}

export async function updatePartnerCampaign(slug: string, patch: {
  isActive?: boolean;
  pricePerPerson?: number;
  maxPersons?: number | null;
  headline?: string | null;
  rulesText?: string | null;
  label?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const campaign = await getPartnerCampaignBySlug(slug);
  if (!campaign) throw new Error('Campaña no encontrada');
  await db.update(partnerCampaigns).set({
    ...(patch.isActive !== undefined ? { isActive: patch.isActive ? 1 : 0 } : {}),
    ...(patch.pricePerPerson !== undefined ? { pricePerPerson: patch.pricePerPerson } : {}),
    ...(patch.maxPersons !== undefined ? { maxPersons: patch.maxPersons } : {}),
    ...(patch.headline !== undefined ? { headline: patch.headline?.trim() || null } : {}),
    ...(patch.rulesText !== undefined ? { rulesText: patch.rulesText?.trim() || null } : {}),
    ...(patch.label !== undefined && patch.label.trim() ? { label: patch.label.trim() } : {}),
  }).where(eq(partnerCampaigns.id, campaign.id));
  return getPartnerCampaignForAdmin(slug);
}

/** Ids de órdenes de una campaña, para el filtro de Ventas Web. */
export async function getPartnerOrderIds(campaignId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ orderId: partnerOrders.orderId }).from(partnerOrders).where(eq(partnerOrders.campaignId, campaignId));
  return rows.map((r) => r.orderId);
}
