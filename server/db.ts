import { eq, desc, and, sql, or, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, events, ticketTypes, orders, orderItems, tickets, discountCodes, communityCodes, referrals, siteSettings } from "../drizzle/schema";
import { ENV } from './_core/env';
import { nanoid } from 'nanoid';
import { createPaymentPreference } from './mercadopago';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    // Generate ambassador code for new users
    if (!values.ambassadorCode) {
      values.ambassadorCode = nanoid(8).toUpperCase();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Events
export async function getPublishedEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(eq(events.status, 'published')).orderBy(events.eventDate);
}

export async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).orderBy(desc(events.createdAt));
}

// Publicados + pasados (para la sección "Próximos Eventos" de la home: pasados en
// blanco y negro, próximos a color). Nunca expone 'draft'/'cancelled'.
export async function getHomeEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events)
    .where(or(eq(events.status, 'published'), eq(events.status, 'past'), eq(events.status, 'soldout')))
    .orderBy(events.eventDate);
}

export async function getEventBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return result[0] ?? null;
}

export async function createEvent(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const eventDate = new Date(data.eventDate);
  const doorsOpen = data.doorsOpen ? new Date(data.doorsOpen) : undefined;
  await db.insert(events).values({
    ...data,
    eventDate,
    doorsOpen,
    status: data.status || 'draft',
  });
  return { success: true };
}

export async function updateEvent(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.eventDate) updateData.eventDate = new Date(data.eventDate);
  if (data.doorsOpen) updateData.doorsOpen = new Date(data.doorsOpen);
  await db.update(events).set(updateData).where(eq(events.id, id));
  return { success: true };
}

export async function deleteEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(events).where(eq(events.id, id));
  return { success: true };
}

// Ticket Types
export async function getTicketTypesByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(ticketTypes.sortOrder);
}

export async function createTicketType(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(ticketTypes).values({
    ...data,
    price: String(data.price),
    originalPrice: data.originalPrice ? String(data.originalPrice) : undefined,
  });
  return { success: true };
}

export async function updateTicketType(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.price !== undefined) updateData.price = String(data.price);
  if (data.originalPrice !== undefined) updateData.originalPrice = String(data.originalPrice);
  await db.update(ticketTypes).set(updateData).where(eq(ticketTypes.id, id));
  return { success: true };
}

export async function deleteTicketType(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ticketTypes).where(eq(ticketTypes.id, id));
  return { success: true };
}

// Discount Codes
export async function validateDiscountCode(code: string, eventId: number) {
  const db = await getDb();
  if (!db) return { valid: false, message: 'Service unavailable' };

  const result = await db.select().from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
  if (result.length === 0) return { valid: false, message: 'Código no encontrado' };

  const discount = result[0];
  if (!discount.isActive) return { valid: false, message: 'Código inactivo' };
  if (discount.maxUses && discount.usedCount >= discount.maxUses) return { valid: false, message: 'Código agotado' };
  if (discount.validUntil && new Date(discount.validUntil) < new Date()) return { valid: false, message: 'Código expirado' };
  if (discount.validFrom && new Date(discount.validFrom) > new Date()) return { valid: false, message: 'Código aún no válido' };
  if (discount.eventId && discount.eventId !== eventId) return { valid: false, message: 'Código no válido para este evento' };

  return { valid: true, discount };
}

export async function getAllDiscountCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
}

export async function createDiscountCode(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(discountCodes).values({
    ...data,
    discountValue: String(data.discountValue),
    minPurchase: data.minPurchase ? String(data.minPurchase) : undefined,
    validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
    validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
  });
  return { success: true };
}

export async function updateDiscountCode(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.discountValue !== undefined) updateData.discountValue = String(data.discountValue);
  if (data.validUntil) updateData.validUntil = new Date(data.validUntil);
  await db.update(discountCodes).set(updateData).where(eq(discountCodes.id, id));
  return { success: true };
}

export async function deleteDiscountCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(discountCodes).where(eq(discountCodes.id, id));
  return { success: true };
}

// Community Access Codes (gate-only — Soltero / Dúo Dos Hombres)
export async function validateCommunityCode(code: string) {
  const db = await getDb();
  if (!db) return { valid: false, message: 'Service unavailable' };

  const result = await db.select().from(communityCodes).where(eq(communityCodes.code, code)).limit(1);
  if (result.length === 0) return { valid: false, message: 'Código no encontrado' };

  const entry = result[0];
  if (!entry.isActive) return { valid: false, message: 'Código inactivo' };
  if (entry.maxUses && entry.usedCount >= entry.maxUses) return { valid: false, message: 'Código agotado' };

  return { valid: true, communityCode: entry };
}

export async function markCommunityCodeUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(communityCodes).set({ usedCount: sql`usedCount + 1` }).where(eq(communityCodes.id, id));
}

export async function getAllCommunityCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(communityCodes).orderBy(desc(communityCodes.createdAt));
}

export async function createCommunityCode(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(communityCodes).values(data);
  return { success: true };
}

export async function updateCommunityCode(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(communityCodes).set(data).where(eq(communityCodes.id, id));
  return { success: true };
}

export async function deleteCommunityCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(communityCodes).where(eq(communityCodes.id, id));
  return { success: true };
}

// Site settings (fila única — Instagram followers/posts para el footer)
export async function getSiteSettings() {
  const db = await getDb();
  if (!db) return { instagramFollowers: 0, instagramPosts: 0 };
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) return row;
  return { instagramFollowers: 0, instagramPosts: 0 };
}

export async function updateSiteSettings(data: { instagramFollowers?: number; instagramPosts?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) {
    await db.update(siteSettings).set(data).where(eq(siteSettings.id, row.id));
  } else {
    await db.insert(siteSettings).values({ instagramFollowers: 0, instagramPosts: 0, ...data });
  }
  return { success: true };
}

// Orders
export async function createOrder(input: {
  eventSlug: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  items: { ticketTypeId: number; quantity: number }[];
  discountCode?: string;
  ambassadorCode?: string;
  communityCode?: string;
  attendeeData?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const event = await getEventBySlug(input.eventSlug);
  if (!event) throw new Error("Event not found");

  // Calculate totals
  const tts = await getTicketTypesByEventId(event.id);
  let subtotal = 0;
  for (const item of input.items) {
    const tt = tts.find(t => t.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Not enough stock for ${tt.name}`);
    subtotal += Number(tt.price) * item.quantity;
  }

  // Apply discount
  let discountAmount = 0;
  let discountCodeId: number | undefined;
  if (input.discountCode) {
    const validation = await validateDiscountCode(input.discountCode, event.id);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      discountCodeId = disc.id;
      if (disc.discountType === 'percentage') {
        discountAmount = Math.round(subtotal * Number(disc.discountValue) / 100);
      } else {
        discountAmount = Number(disc.discountValue);
      }
      // Increment used count
      await db.update(discountCodes).set({ usedCount: sql`usedCount + 1` }).where(eq(discountCodes.id, disc.id));
    }
  }

  // Confirm community access code (Soltero / Dúo Dos Hombres) — defense in depth,
  // el checkout ya lo valida en vivo antes de dejar avanzar.
  if (input.communityCode) {
    const validation = await validateCommunityCode(input.communityCode);
    if (!validation.valid) throw new Error(validation.message || 'Código de comunidad inválido');
    if (validation.communityCode) await markCommunityCodeUsed(validation.communityCode.id);
  }

  const total = Math.max(0, subtotal - discountAmount);
  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;

  // Create order
  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    eventId: event.id,
    subtotal: String(subtotal),
    discount: String(discountAmount),
    total: String(total),
    discountCodeId,
    ambassadorCode: input.ambassadorCode,
    paymentStatus: 'pending',
  });

  const orderId = orderResult.insertId;

  // Create order items
  for (const item of input.items) {
    const tt = tts.find(t => t.id === item.ticketTypeId)!;
    await db.insert(orderItems).values({
      orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: tt.price,
      totalPrice: String(Number(tt.price) * item.quantity),
    });
    // Reserve stock (released if payment is rejected via webhook)
    await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
  }

  // Create Mercado Pago preference (placeholder - will be replaced with real integration)
  // Build items for Mercado Pago
  const mpItems = [];
  for (const item of input.items) {
    const tt = tts.find(t => t.id === item.ticketTypeId)!;
    mpItems.push({
      title: `${tt.name} - ${event.title}`,
      quantity: item.quantity,
      unitPrice: Number(tt.price),
    });
  }

  const preference = await createPaymentPreference({
    orderNumber,
    items: mpItems,
    buyerEmail: input.buyerEmail,
    buyerName: input.buyerName,
    total,
    attendeeData: input.attendeeData,
  });

  // Update order with preference ID
  if (preference.id) {
    await db.update(orders).set({ mercadoPagoPreferenceId: preference.id }).where(eq(orders.orderNumber, orderNumber));
  }

  const checkoutUrl = preference.initPoint || `/pago/exito?order=${orderNumber}`;

  return { orderId, orderNumber, checkoutUrl, total, preferenceId: preference.id };
}

export async function getAllOrders(page: number = 1, limit: number = 50, status?: string) {
  const db = await getDb();
  if (!db) return { orders: [], total: 0 };

  const offset = (page - 1) * limit;
  const conditions = status ? [eq(orders.paymentStatus, status as any)] : [];
  const query = db.select().from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt)).limit(limit).offset(offset);

  const allOrders = await query;
  return { orders: allOrders, total: allOrders.length };
}

// Export completo (sin paginar) para CSV — filtra por evento/rango de fechas/estado.
export async function getOrdersForExport(filters: { eventId?: number; dateFrom?: string; dateTo?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.eventId) conditions.push(eq(orders.eventId, filters.eventId));
  if (filters.status) conditions.push(eq(orders.paymentStatus, filters.status as any));
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));

  const rows = await db.select({
    orderNumber: orders.orderNumber,
    createdAt: orders.createdAt,
    eventTitle: events.title,
    buyerName: orders.buyerName,
    buyerEmail: orders.buyerEmail,
    buyerPhone: orders.buyerPhone,
    subtotal: orders.subtotal,
    discount: orders.discount,
    total: orders.total,
    paymentStatus: orders.paymentStatus,
    paymentMethod: orders.paymentMethod,
    ambassadorCode: orders.ambassadorCode,
  }).from(orders)
    .leftJoin(events, eq(orders.eventId, events.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt));

  return rows;
}

export async function getOrderStats() {
  const db = await getDb();
  if (!db) return { totalOrders: 0, totalRevenue: 0, approvedOrders: 0 };

  const [stats] = await db.select({
    totalOrders: sql<number>`COUNT(*)`,
    totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN paymentStatus = 'approved' THEN total ELSE 0 END), 0)`,
    approvedOrders: sql<number>`SUM(CASE WHEN paymentStatus = 'approved' THEN 1 ELSE 0 END)`,
  }).from(orders);

  return stats;
}

// Referrals
export async function getReferralStats() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    ambassadorCode: referrals.ambassadorCode,
    ambassadorUserId: referrals.ambassadorUserId,
    totalReferrals: sql<number>`COUNT(*)`,
    totalTickets: sql<number>`SUM(ticketCount)`,
    totalRevenue: sql<number>`SUM(orderTotal)`,
  }).from(referrals).groupBy(referrals.ambassadorCode, referrals.ambassadorUserId);
}

export async function getUserReferrals(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(referrals).where(eq(referrals.ambassadorUserId, userId)).orderBy(desc(referrals.createdAt));
}
