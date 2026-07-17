import { eq, desc, and, sql, or, gte, lte, like, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, events, ticketTypes, orders, orderItems, tickets, discountCodes, communityCodes, referrals, siteSettings, operators, InsertOperator } from "../drizzle/schema";
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
    costPrice: data.costPrice !== undefined ? String(data.costPrice) : undefined,
  });
  return { success: true };
}

export async function updateTicketType(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.price !== undefined) updateData.price = String(data.price);
  if (data.originalPrice !== undefined) updateData.originalPrice = String(data.originalPrice);
  if (data.costPrice !== undefined) updateData.costPrice = String(data.costPrice);
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

  // Extras de la misma orden (estacionamiento, piscolón, etc.) — cada uno ya
  // tiene su propio ticket/código generado (mismo loop que genera el acceso
  // principal), solo faltaba mostrarlo. Se agrupan por tipo con su cantidad.
  const extras = order ? await getOrderExtras(order.id) : [];

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
    extras,
  };
}

/** Extras (category="extra") de una orden, agrupados por tipo con su cantidad
 * y los códigos de ticket individuales generados para cada unidad. */
export async function getOrderExtras(orderId: number) {
  const db = await getDb();
  if (!db) return [];

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const grouped = new Map<number, { name: string; quantity: number; codes: string[] }>();

  for (const t of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, t.ticketTypeId)).limit(1);
    if (tt?.category !== 'extra') continue;
    const entry = grouped.get(t.ticketTypeId) ?? { name: tt.name, quantity: 0, codes: [] };
    entry.quantity += 1;
    // displayCode legible (PIS-XXXX-XXXX) es lo que se presenta en caja para
    // canjear (docs/ARQUITECTURA-CAJA.md §9); ticketCode queda como respaldo
    // para extras generados antes de la Fase 1, que no tienen displayCode.
    entry.codes.push(t.displayCode || t.ticketCode);
    grouped.set(t.ticketTypeId, entry);
  }

  return Array.from(grouped.values());
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

// Site settings (fila única — Instagram followers/posts para el footer, y el
// recargo por servicio (%) que se suma a toda venta nueva)
export async function getSiteSettings() {
  const db = await getDb();
  if (!db) return { instagramFollowers: 0, instagramPosts: 0, serviceFeePercent: "0" };
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) return row;
  return { instagramFollowers: 0, instagramPosts: 0, serviceFeePercent: "0" };
}

export async function updateSiteSettings(data: { instagramFollowers?: number; instagramPosts?: number; serviceFeePercent?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.serviceFeePercent !== undefined) updateData.serviceFeePercent = String(data.serviceFeePercent);
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) {
    await db.update(siteSettings).set(updateData).where(eq(siteSettings.id, row.id));
  } else {
    await db.insert(siteSettings).values({ instagramFollowers: 0, instagramPosts: 0, ...updateData });
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

  // Recargo por servicio: % configurable en Ajustes, se calcula sobre el
  // total YA con el descuento aplicado (entradas + extras) y se suma encima
  // -- se guarda el monto ya calculado en orders.serviceFee, no el %, para
  // que quede fijo aunque el % de siteSettings cambie después.
  const preTotal = Math.max(0, subtotal - discountAmount);
  const settings = await getSiteSettings();
  const serviceFeePercent = Number(settings.serviceFeePercent ?? 0);
  const serviceFee = serviceFeePercent > 0 ? Math.round(preTotal * serviceFeePercent / 100) : 0;
  const total = preTotal + serviceFee;
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
    serviceFee: String(serviceFee),
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
    const tt = tts.find(t => t.id === item.ticketTypeId);
    await db.insert(orderItems).values({
      orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      totalPrice: String(unitPrice * item.quantity),
      // Copia el costo del producto al momento de la venta (docs/ARQUITECTURA-CAJA.md
      // §12) -- si el costo se edita después, la utilidad histórica no cambia.
      unitCost: tt?.costPrice != null ? String(tt.costPrice) : null,
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

/** Todos los tickets (entrada principal + extras) de una orden, para el
 * panel admin — poder ver/reenviar los códigos generados sin tener que
 * buscar en la base a mano. */
export async function getOrderTickets(orderId: number) {
  const db = await getDb();
  if (!db) return [];

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const result = [];
  for (const t of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, t.ticketTypeId)).limit(1);
    result.push({
      ticketCode: t.ticketCode,
      status: t.status,
      holderName: t.holderName,
      ticketTypeName: tt?.name ?? 'Entrada',
      category: tt?.category ?? 'acceso',
    });
  }
  return result;
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

/** Ranking público para el Hall de la Fama -- a diferencia de getReferralStats
 * (admin, incluye montos $), esto solo expone lo necesario para una
 * competencia pública: código, primer nombre (nunca apellido) y cantidad de
 * ventas. Se escala por evento (vía referrals.orderId -> orders.eventId) a
 * propósito -- no se suma todo junto -- para que el mismo query sirva más
 * adelante para "últimas 3 fiestas" (pasando varios eventId) o el acumulado
 * anual (sin filtro), sin tener que tocar el schema. Solo incluye códigos
 * con al menos 1 venta (incluidos vía el propio GROUP BY). */
export async function getReferralLeaderboard(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      ambassadorCode: referrals.ambassadorCode,
      totalReferrals: sql<number>`COUNT(*)`,
      lastReferralAt: sql<Date>`MAX(${referrals.createdAt})`,
    })
    .from(referrals)
    .innerJoin(orders, eq(orders.id, referrals.orderId))
    .where(eq(orders.eventId, eventId))
    .groupBy(referrals.ambassadorCode)
    .orderBy(desc(sql`COUNT(*)`));

  const leaderboard = [];
  for (const row of rows) {
    const [owner] = await db.select().from(orders)
      .where(and(eq(orders.ambassadorCode, row.ambassadorCode), eq(orders.paymentStatus, 'approved')))
      .limit(1);
    if (!owner) continue;
    leaderboard.push({
      ambassadorCode: row.ambassadorCode,
      firstName: owner.buyerName.trim().split(/\s+/)[0],
      totalReferrals: Number(row.totalReferrals),
      recentStreak: Date.now() - new Date(row.lastReferralAt).getTime() <= 48 * 60 * 60 * 1000,
    });
  }
  return leaderboard;
}

/** Estadísticas + historial de un embajador buscando directo por su código
 * (sin login) — el mismo código que le llega en su email de confirmación. */
export async function getReferralsByCode(ambassadorCode: string) {
  const db = await getDb();
  if (!db) return null;

  const code = ambassadorCode.trim().toUpperCase();
  if (!code) return null;

  // Confirma que el código realmente existe (le pertenece a alguna orden
  // aprobada) antes de devolver "0 referidos" para un código inventado.
  const [owner] = await db.select().from(orders).where(and(eq(orders.ambassadorCode, code), eq(orders.paymentStatus, 'approved'))).limit(1);
  if (!owner) return null;

  const rows = await db.select().from(referrals).where(eq(referrals.ambassadorCode, code)).orderBy(desc(referrals.createdAt));
  return { ambassadorCode: code, buyerName: owner.buyerName, referrals: rows };
}

// --- Módulo /caja: operadores (docs/ARQUITECTURA-CAJA.md §4.2, Fase 0) ---

export async function createOperator(input: InsertOperator) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(operators).values(input);
  return (result as unknown as { insertId: number }).insertId;
}

export async function getOperatorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(operators).where(eq(operators.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Lista solo lo necesario para la pantalla de "toca tu nombre" del login por PIN (§10.2) — nunca el pinHash. */
export async function listActiveOperatorsPublic() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role })
    .from(operators)
    .where(eq(operators.active, 1))
    .orderBy(operators.name);
}

export async function listAllOperators() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role, active: operators.active, createdAt: operators.createdAt })
    .from(operators)
    .orderBy(desc(operators.createdAt));
}

export async function updateOperator(id: number, input: Partial<InsertOperator>) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set(input).where(eq(operators.id, id));
}

// --- Módulo /caja: pantallas de solo lectura (docs/ARQUITECTURA-CAJA.md §10.2, Fase 2) ---

/** Evento "en curso" para la tablet de caja: el publicado/agotado con fecha
 * más cercana a ahora (antes o después) -- funciona bien el mismo día del
 * evento sin necesitar que alguien lo seleccione a mano. */
export async function getActiveEventForCaja() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(events).where(or(eq(events.status, 'published'), eq(events.status, 'soldout')));
  if (rows.length === 0) return undefined;
  const now = Date.now();
  return rows.reduce((best: any, r: any) =>
    Math.abs(new Date(r.eventDate).getTime() - now) < Math.abs(new Date(best.eventDate).getTime() - now) ? r : best
  , rows[0]);
}

/** Búsqueda de la pantalla principal de caja: primero intenta match exacto
 * por código (QR de acceso o displayCode de un extra); si no hay, busca por
 * nombre/email/teléfono. Solo dentro del evento activo, solo órdenes aprobadas. */
export async function searchCajaCustomers(eventId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const q = query.trim();
  if (!q) return [];
  const qUpper = q.toUpperCase();

  const [byCode] = await db.select().from(tickets).where(and(eq(tickets.eventId, eventId), or(eq(tickets.ticketCode, qUpper), eq(tickets.displayCode, qUpper)))).limit(1);
  let orderIds: number[];
  if (byCode) {
    orderIds = [byCode.orderId];
  } else {
    const pattern = `%${q}%`;
    const rows = await db.select({ id: orders.id }).from(orders).where(and(
      eq(orders.eventId, eventId),
      eq(orders.paymentStatus, 'approved'),
      or(like(orders.buyerName, pattern), like(orders.buyerEmail, pattern), like(orders.buyerPhone, pattern))
    )).limit(20);
    orderIds = rows.map((r: any) => r.id);
  }
  if (orderIds.length === 0) return [];

  const rows = await db.select().from(orders).where(inArray(orders.id, orderIds));
  return rows.map((o: any) => ({ orderId: o.id, orderNumber: o.orderNumber, buyerName: o.buyerName, buyerEmail: o.buyerEmail, buyerPhone: o.buyerPhone }));
}

/** Ficha del cliente (§10.2.3): accesos con su estado y extras con su código
 * de canje + estado, para una orden puntual. */
export async function getCajaCustomerSheet(orderId: number) {
  const db = await getDb();
  if (!db) return null;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const ticketTypeIds = Array.from(new Set(orderTickets.map((t: any) => t.ticketTypeId)));
  const tts = ticketTypeIds.length ? await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ticketTypeIds)) : [];
  const ttById = new Map<number, any>(tts.map((t: any) => [t.id, t]));

  const access = orderTickets
    .filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'acceso')
    .map((t: any) => ({ ticketCode: t.ticketCode, status: t.status, typeName: ttById.get(t.ticketTypeId)?.name }));

  const extras = orderTickets
    .filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'extra')
    .map((t: any) => ({ displayCode: t.displayCode, status: t.status, typeName: ttById.get(t.ticketTypeId)?.name, usedAt: t.usedAt }));

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerPhone: order.buyerPhone,
    paymentStatus: order.paymentStatus,
    channel: order.channel,
    createdAt: order.createdAt,
    access,
    extras,
  };
}

/** Snapshot completo para el modo offline de /caja (§6.2): todo lo que la
 * tablet necesita para buscar/ver fichas/vender sin red, en una sola
 * descarga -- se guarda en IndexedDB (Dexie) del lado del cliente. */
export async function getCajaSnapshot(eventId: number) {
  const db = await getDb();
  if (!db) return null;

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return null;

  const approvedOrders = await db.select().from(orders).where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved')));
  const orderIds = approvedOrders.map((o: any) => o.id);
  const allTickets = orderIds.length ? await db.select().from(tickets).where(inArray(tickets.orderId, orderIds)) : [];
  const allTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const ttById = new Map<number, any>(allTicketTypes.map((t: any) => [t.id, t]));

  const ticketsByOrder = new Map<number, any[]>();
  for (const t of allTickets) {
    const list = ticketsByOrder.get(t.orderId) ?? [];
    list.push(t);
    ticketsByOrder.set(t.orderId, list);
  }

  const attendees = approvedOrders.map((o: any) => {
    const ts = ticketsByOrder.get(o.id) ?? [];
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      buyerPhone: o.buyerPhone,
      access: ts.filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'acceso').map((t: any) => ({ ticketCode: t.ticketCode, status: t.status, typeName: ttById.get(t.ticketTypeId)?.name })),
      extras: ts.filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'extra').map((t: any) => ({ displayCode: t.displayCode, status: t.status, typeName: ttById.get(t.ticketTypeId)?.name })),
    };
  });

  const catalog = allTicketTypes
    .filter((t: any) => t.category === 'extra' && t.status === 'active')
    .map((t: any) => ({ id: t.id, name: t.name, price: Number(t.price), color: t.color as string | null, internalCode: t.internalCode as string | null }));

  return {
    event: { id: event.id, title: event.title, slug: event.slug },
    attendees,
    catalog,
    serverTime: new Date().toISOString(),
  };
}

/** Catálogo de "Nueva venta" (§10.2.4): solo extras activos del evento. */
export async function getCajaCatalog(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.category, 'extra'), eq(ticketTypes.status, 'active')));
}

/** Dashboard de caja (§10.2.5): ventas del día, top productos, últimas ventas, canjes. */
export async function getCajaDashboard(eventId: number) {
  const db = await getDb();
  if (!db) return null;

  const cajaOrders = await db.select().from(orders).where(and(eq(orders.eventId, eventId), eq(orders.channel, 'caja'), eq(orders.paymentStatus, 'approved')));
  const totalSales = cajaOrders.reduce((s: number, o: any) => s + Number(o.total), 0);

  const [{ count: redeemedCount }] = await db.select({ count: sql<number>`COUNT(*)` }).from(tickets).where(and(eq(tickets.eventId, eventId), eq(tickets.status, 'used')));

  const items = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.channel, 'caja'), eq(orders.paymentStatus, 'approved')));
  const qtyByType = new Map<number, number>();
  for (const i of items) qtyByType.set(i.ticketTypeId, (qtyByType.get(i.ticketTypeId) || 0) + i.quantity);
  const ttIds = Array.from(qtyByType.keys());
  const tts = ttIds.length ? await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ttIds)) : [];
  const topProducts = tts
    .map((t: any) => ({ name: t.name, quantity: qtyByType.get(t.id) || 0 }))
    .sort((a: any, b: any) => b.quantity - a.quantity)
    .slice(0, 5);

  const recentSales = [...cajaOrders]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((o: any) => ({ orderNumber: o.orderNumber, total: Number(o.total), createdAt: o.createdAt, paymentMethod: o.paymentMethod }));

  return {
    totalSales,
    salesCount: cajaOrders.length,
    redeemedCount: Number(redeemedCount),
    topProducts,
    recentSales,
  };
}
