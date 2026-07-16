import { eq, desc, and, sql, or, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, events, ticketTypes, orders, orderItems, tickets, discountCodes, communityCodes, referrals, siteSettings } from "../drizzle/schema";
import { ENV } from './_core/env';
import { nanoid } from 'nanoid';
import { isMissionWindowOpen, missionDepositPrice } from '../shared/mission300';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // mysql2 no soporta ssl={"rejectUnauthorized":true} embebido en la URI
      // (solo perfiles con nombre tipo "Amazon RDS") — proveedores como TiDB
      // exigen TLS, así que se pasa como opción separada del pool.
      _db = drizzle({
        connection: {
          uri: process.env.DATABASE_URL,
          ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        },
      });
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

/** Datos públicos de un ticket para la página "Mi entrada" (/verificar/:ticketCode)
 * — de solo lectura, no marca nada como usado (eso queda para la futura
 * pantalla de staff). El ticketCode funciona como token portador: quien
 * tenga el link (del QR o del email) puede verlo, igual que una entrada física. */
export async function getTicketByCode(ticketCode: string) {
  const db = await getDb();
  if (!db) return null;

  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketCode, ticketCode)).limit(1);
  if (!ticket) return null;

  const [order] = await db.select().from(orders).where(eq(orders.id, ticket.orderId)).limit(1);
  const [event] = await db.select().from(events).where(eq(events.id, ticket.eventId)).limit(1);
  const [ticketType] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticket.ticketTypeId)).limit(1);

  const attendeeNames = parseAttendeeNames(order?.attendeeData);

  return {
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    qrImageUrl: ticket.qrImageUrl,
    holderName: ticket.holderName,
    attendeeNames: attendeeNames.length > 0 ? attendeeNames : (ticket.holderName ? [ticket.holderName] : []),
    ticketTypeName: ticketType?.name ?? 'Entrada',
    eventTitle: event?.title ?? '',
    eventDate: event?.eventDate ?? null,
    doorsOpen: event?.doorsOpen ?? null,
    eventEnd: event?.eventEnd ?? null,
    venue: event?.venue ?? '',
    address: event?.address ?? '',
  };
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

/** Extrae los nombres de todas las personas asociadas a una orden (titular +
 * acompañantes) desde el `attendeeData` guardado en el checkout — busca
 * cualquier campo cuya clave contenga "nombre" (`buyer__nombre`,
 * `acceso__acomp1_nombre`, `acceso__acomp2_nombre`, etc.), sin asumir una
 * lista fija de claves ya que cada tipo de acceso define las suyas. */
export function parseAttendeeNames(attendeeDataJson: string | null | undefined): string[] {
  if (!attendeeDataJson) return [];
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const campos = parsed?.campos ?? {};
    const names: string[] = [];
    for (const [key, value] of Object.entries(campos)) {
      if (typeof value === 'string' && value.trim() && /nombre/i.test(key)) {
        names.push(value.trim());
      }
    }
    return names;
  } catch {
    return [];
  }
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

  // Misión 300: mientras la ventana esté abierta (más de 3 días antes del
  // evento), las entradas category="acceso" se cobran al precio del abono
  // ($10.000/persona), no al precio general — el resto (diferencia hasta el
  // 60% si no se junta la meta, o nada si se junta) se resuelve después, ver
  // evaluateMission300() y el webhook de Mercado Pago.
  const missionOpen = isMissionWindowOpen(new Date(event.eventDate));
  let missionDeposit = false;

  // Calculate totals — separa el subtotal de accesos (a lo que aplica el
  // descuento) del de extras (parking/covers/etc, category="extra"), que
  // siempre se cobran completos.
  const tts = await getTicketTypesByEventId(event.id);
  let subtotal = 0;
  let accesoSubtotal = 0;
  const unitPrices = new Map<number, number>();
  for (const item of input.items) {
    const tt = tts.find(t => t.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Not enough stock for ${tt.name}`);
    const useDeposit = missionOpen && tt.category === 'acceso';
    const unitPrice = useDeposit ? missionDepositPrice(tt.accesoSlug) : Number(tt.price);
    if (useDeposit) missionDeposit = true;
    unitPrices.set(item.ticketTypeId, unitPrice);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    if (tt.category === 'acceso') accesoSubtotal += lineTotal;
  }

  // Apply discount — solo sobre el subtotal de accesos, nunca sobre extras.
  let discountAmount = 0;
  let discountCodeId: number | undefined;
  if (input.discountCode) {
    const validation = await validateDiscountCode(input.discountCode, event.id);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      discountCodeId = disc.id;
      if (disc.discountType === 'percentage') {
        discountAmount = Math.round(accesoSubtotal * Number(disc.discountValue) / 100);
      } else {
        discountAmount = Math.min(Number(disc.discountValue), accesoSubtotal);
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
    missionDeposit: missionDeposit ? 1 : 0,
    attendeeData: input.attendeeData,
  });

  const orderId = orderResult.insertId;

  // Create order items. soldCount (y con él, el contador de Misión 300) NO se
  // toca acá — la orden todavía está "pending", nadie pagó nada. Se
  // incrementa recién cuando el webhook de Mercado Pago confirma el pago
  // (ver processApprovedOrder en webhooks.ts) para que cancelar/abandonar el
  // pago no infle el contador.
  for (const item of input.items) {
    const unitPrice = unitPrices.get(item.ticketTypeId)!;
    await db.insert(orderItems).values({
      orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      totalPrice: String(unitPrice * item.quantity),
    });
  }

  // Si el descuento cubre el 100% del total (solo pasa cuando no hay extras
  // sin descontar — ver el cálculo de discountAmount arriba), no hay nada
  // que cobrar: la orden queda confirmada al instante, sin pasar por
  // Mercado Pago. Se suma el stock acá mismo (normalmente eso lo hace el
  // pago aprobado) y el router dispara el email de bienvenida con el QR.
  const isFree = total === 0;
  if (isFree) {
    await db.update(orders).set({
      paymentStatus: 'approved',
      paymentId: `FREE-${orderNumber}`,
      // Si esta orden usaba precio de abono Misión 300, no queda diferencia
      // por cobrar después — se resuelve de una, no entra a evaluateMission300.
      ...(missionDeposit ? { missionTopupStatus: 'paid', missionTopupAmount: '0' } : {}),
    }).where(eq(orders.id, orderId));

    for (const item of input.items) {
      await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
    }
  }

  return { orderId, orderNumber, total, isFree };
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
