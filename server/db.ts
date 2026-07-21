import { eq, desc, and, sql, or, gte, lte, like, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, events, ticketTypes, orders, orderItems, tickets, discountCodes, communityCodes, referrals, siteSettings, operators, InsertOperator, ops, registers, rateLimits, devices, customers, shifts, playcoinsLedger } from "../drizzle/schema";
import { ENV } from './_core/env';
import { nanoid } from 'nanoid';
import { isMissionWindowOpen, missionDepositPrice } from '../shared/mission300';
import { playcoinsEarnedForPurchase, clampRedeemAmount } from '../shared/playcoins';

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

/** `channel`: 'web' = ventas del sitio (incluye 'import', la migración de la
 * ticketera anterior -- nunca fueron ventas de caja); 'caja' = solo ventas
 * presenciales. Nunca se mezclan en pantalla (pedido explícito del usuario). */
export async function getAllOrders(page: number = 1, limit: number = 50, status?: string, channel?: 'web' | 'caja') {
  const db = await getDb();
  if (!db) return { orders: [], total: 0 };

  const offset = (page - 1) * limit;
  const conditions = [];
  if (status) conditions.push(eq(orders.paymentStatus, status as any));
  if (channel === 'caja') conditions.push(eq(orders.channel, 'caja'));
  else if (channel === 'web') conditions.push(sql`${orders.channel} != 'caja'`);
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
export async function getOrdersForExport(filters: { eventId?: number; dateFrom?: string; dateTo?: string; status?: string; channel?: 'web' | 'caja' }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.eventId) conditions.push(eq(orders.eventId, filters.eventId));
  if (filters.status) conditions.push(eq(orders.paymentStatus, filters.status as any));
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
  if (filters.channel === 'caja') conditions.push(eq(orders.channel, 'caja'));
  else if (filters.channel === 'web') conditions.push(sql`${orders.channel} != 'caja'`);

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

export async function getOrderStats(channel?: 'web' | 'caja') {
  const db = await getDb();
  if (!db) return { totalOrders: 0, totalRevenue: 0, approvedOrders: 0 };

  const where = channel === 'caja' ? eq(orders.channel, 'caja') : channel === 'web' ? sql`${orders.channel} != 'caja'` : undefined;
  const [stats] = await db.select({
    totalOrders: sql<number>`COUNT(*)`,
    totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN paymentStatus = 'approved' THEN total ELSE 0 END), 0)`,
    approvedOrders: sql<number>`SUM(CASE WHEN paymentStatus = 'approved' THEN 1 ELSE 0 END)`,
  }).from(orders).where(where);

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

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60 * 1000;

/** Rate limiting del login por PIN (docs/ARQUITECTURA-CAJA.md §13, riesgo 7). */
export async function recordFailedPinAttempt(operatorId: number) {
  const db = await getDb();
  if (!db) return;
  const [operator] = await db.select().from(operators).where(eq(operators.id, operatorId)).limit(1);
  if (!operator) return;
  const attempts = operator.failedPinAttempts + 1;
  await db.update(operators).set({
    failedPinAttempts: attempts,
    lockedUntil: attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS) : operator.lockedUntil,
  }).where(eq(operators.id, operatorId));
}

export async function resetPinAttempts(operatorId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set({ failedPinAttempts: 0, lockedUntil: null }).where(eq(operators.id, operatorId));
}

const IP_RATE_LIMIT_MAX_ATTEMPTS = 15;
const IP_RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000;

/** Rate limiting por IP para el login por PIN (docs/ARQUITECTURA-CAJA.md §13,
 * riesgo 7) -- complementa el límite por operador: sin esto, alguien podría
 * probar pocos intentos por cada operador (listOperators es público) y
 * rotar entre todos sin nunca disparar el bloqueo individual. Límite más
 * generoso (15/15min) porque una tablet compartida legítima puede fallar
 * varias veces entre distintos operadores en un rato. */
export async function checkIpRateLimit(key: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  if (!row?.lockedUntil) return true;
  return new Date(row.lockedUntil).getTime() <= Date.now();
}

export async function recordIpFailedAttempt(key: string) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  const attempts = (row?.attempts ?? 0) + 1;
  const lockedUntil = attempts >= IP_RATE_LIMIT_MAX_ATTEMPTS ? new Date(Date.now() + IP_RATE_LIMIT_LOCKOUT_MS) : (row?.lockedUntil ?? null);
  await db.insert(rateLimits).values({ key, attempts, lockedUntil })
    .onDuplicateKeyUpdate({ set: { attempts, lockedUntil } });
}

// --- Enrolamiento de dispositivos (pedido explícito del usuario) ---

export async function createDeviceEnrollment(name: string, enrollCode: string, enrollCodeExpiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(devices).values({ name, enrollCode, enrollCodeExpiresAt });
  return (result as unknown as { insertId: number }).insertId;
}

export async function getDeviceByEnrollCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [device] = await db.select().from(devices).where(eq(devices.enrollCode, code)).limit(1);
  return device;
}

export async function completeDeviceEnrollment(deviceId: number, deviceTokenHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ enrolled: 1, deviceTokenHash, enrollCode: null, enrollCodeExpiresAt: null, lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
}

export async function getDeviceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [device] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  return device;
}

export async function listAllDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: devices.id, name: devices.name, enrolled: devices.enrolled, active: devices.active, createdAt: devices.createdAt, lastSeenAt: devices.lastSeenAt })
    .from(devices).orderBy(desc(devices.createdAt));
}

export async function updateDeviceActive(id: number, active: 0 | 1) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ active }).where(eq(devices.id, id));
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

// --- Módulo /caja: supervisor (docs/ARQUITECTURA-CAJA.md §8, Fase 4) ---

/** Canjes dobles todavía sin revisar por un supervisor (§8). "Resuelto" =
 * existe un op `manual_adjust` posterior cuyo payload lo referencia --
 * evita una columna nueva de "revisado" en `ops` (que es append-only). */
export async function getConflictQueue(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const conflicts = await db.select().from(ops).where(and(eq(ops.eventId, eventId), eq(ops.type, 'redeem'), eq(ops.result, 'conflict')));
  if (conflicts.length === 0) return [];

  const resolutions = await db.select().from(ops).where(and(eq(ops.eventId, eventId), eq(ops.type, 'manual_adjust')));
  const resolvedIds = new Set(resolutions.map((r: any) => (r.payload as any)?.resolvedConflictOpId).filter(Boolean));
  const pending = conflicts.filter((c: any) => !resolvedIds.has(c.id));
  if (pending.length === 0) return [];

  const operatorIds = Array.from(new Set(pending.map((c: any) => c.operatorId)));
  const opRows = await db.select().from(operators).where(inArray(operators.id, operatorIds));
  const opById = new Map<number, any>(opRows.map((o: any) => [o.id, o]));

  return pending.map((c: any) => ({
    opId: c.id,
    displayCode: (c.payload as any)?.displayCode ?? c.targetId,
    operatorName: opById.get(c.operatorId)?.name ?? 'Operador eliminado',
    registerId: c.registerId,
    serverAt: c.serverAt,
    conflictNote: c.conflictNote,
  }));
}

export async function resolveConflict(rawDb: any, params: { opId: string; eventId: number; operatorId: number; conflictOpId: string; note?: string; clientAt: Date }) {
  const { applyOp } = await import('./caja/ops');
  return applyOp(
    rawDb,
    {
      id: params.opId,
      type: 'manual_adjust',
      eventId: params.eventId,
      operatorId: params.operatorId,
      targetType: 'op',
      targetId: params.conflictOpId,
      payload: { resolvedConflictOpId: params.conflictOpId, note: params.note ?? null },
      clientAt: params.clientAt,
    },
    async () => ({ result: 'applied' as const })
  );
}

// --- Módulo /caja: reportes de utilidad/margen/comparativas/horas punta (§12, Fase 4) ---

/** Utilidad/margen por producto de un evento -- unitCost queda congelado al
 * momento de la venta (§12), así que si el costo cambia después esto sigue
 * reflejando la utilidad real de ESE evento, no la de hoy. */
export async function getProfitReport(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select({
    ticketTypeId: orderItems.ticketTypeId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost,
  }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved')));

  const allTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const ttById = new Map<number, any>(allTicketTypes.map((t: any) => [t.id, t]));

  const byType = new Map<number, { name: string; unitsSold: number; revenue: number; cost: number; hasCost: boolean }>();
  for (const r of rows) {
    const tt = ttById.get(r.ticketTypeId);
    const entry = byType.get(r.ticketTypeId) ?? { name: tt?.name ?? `#${r.ticketTypeId}`, unitsSold: 0, revenue: 0, cost: 0, hasCost: false };
    entry.unitsSold += r.quantity;
    entry.revenue += Number(r.unitPrice) * r.quantity;
    if (r.unitCost != null) { entry.cost += Number(r.unitCost) * r.quantity; entry.hasCost = true; }
    byType.set(r.ticketTypeId, entry);
  }

  return Array.from(byType.values())
    .map((e) => ({
      name: e.name,
      unitsSold: e.unitsSold,
      revenue: e.revenue,
      cost: e.hasCost ? e.cost : null,
      profit: e.hasCost ? e.revenue - e.cost : null,
      marginPercent: e.hasCost && e.revenue > 0 ? Math.round(((e.revenue - e.cost) / e.revenue) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Comparativa simple entre eventos: ingresos, utilidad (donde haya costo
 * cargado) y entradas vendidas por evento, más reciente primero. */
export async function getEventComparison() {
  const db = await getDb();
  if (!db) return [];

  const allEvents = await db.select().from(events).orderBy(desc(events.eventDate));
  const rows = await db.select({
    eventId: orders.eventId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost,
  }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orders.paymentStatus, 'approved'));

  const byEvent = new Map<number, { revenue: number; cost: number; hasCost: boolean; unitsSold: number }>();
  for (const r of rows) {
    const entry = byEvent.get(r.eventId) ?? { revenue: 0, cost: 0, hasCost: false, unitsSold: 0 };
    entry.revenue += Number(r.unitPrice) * r.quantity;
    entry.unitsSold += r.quantity;
    if (r.unitCost != null) { entry.cost += Number(r.unitCost) * r.quantity; entry.hasCost = true; }
    byEvent.set(r.eventId, entry);
  }

  return allEvents.map((e: any) => {
    const agg = byEvent.get(e.id);
    return {
      eventId: e.id,
      title: e.title,
      eventDate: e.eventDate,
      revenue: agg?.revenue ?? 0,
      unitsSold: agg?.unitsSold ?? 0,
      profit: agg?.hasCost ? agg.revenue - agg.cost : null,
    };
  });
}

/** Histograma de operaciones por hora del día (0-23), del ledger completo
 * del evento -- "horas punta" sale gratis de `ops`, sin tabla nueva. */
export async function getPeakHours(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ serverAt: ops.serverAt }).from(ops).where(eq(ops.eventId, eventId));
  const counts = new Array(24).fill(0);
  for (const r of rows) counts[new Date(r.serverAt).getHours()]++;
  return counts.map((count, hour) => ({ hour, count }));
}

/** Auditoría: el ledger completo de un evento, filtrable, con nombre de
 * operador ya resuelto (§11). */
export async function getLedger(eventId: number, filters: { operatorId?: number; type?: string; dateFrom?: string; dateTo?: string } = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(ops.eventId, eventId)];
  if (filters.operatorId) conditions.push(eq(ops.operatorId, filters.operatorId));
  if (filters.type) conditions.push(eq(ops.type, filters.type as any));
  if (filters.dateFrom) conditions.push(gte(ops.serverAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(ops.serverAt, new Date(filters.dateTo)));

  const rows = await db.select().from(ops).where(and(...conditions)).orderBy(desc(ops.serverAt)).limit(500);
  const operatorIds = Array.from(new Set(rows.map((r: any) => r.operatorId)));
  const opRows = operatorIds.length ? await db.select().from(operators).where(inArray(operators.id, operatorIds)) : [];
  const opById = new Map<number, any>(opRows.map((o: any) => [o.id, o]));

  return rows.map((r: any) => ({
    id: r.id,
    type: r.type,
    operatorName: opById.get(r.operatorId)?.name ?? 'Operador eliminado',
    registerId: r.registerId,
    targetType: r.targetType,
    targetId: r.targetId,
    result: r.result,
    conflictNote: r.conflictNote,
    serverAt: r.serverAt,
  }));
}

// --- Módulo /caja: cajas físicas + apertura/cierre de turno (§13, Fase 5) ---

export async function listActiveRegisters() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: registers.id, name: registers.name }).from(registers).where(eq(registers.active, 1));
}

export async function listAllRegisters() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(registers).orderBy(registers.name);
}

export async function createRegister(name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(registers).values({ name });
  return (result as unknown as { insertId: number }).insertId;
}

/** Cuadre de caja (pedido explícito del usuario): abre un turno persistido
 * con el efectivo inicial declarado por la cajera. Si ya hay un turno
 * abierto para el mismo evento+caja (p. ej. refresh de página), se reusa en
 * vez de crear uno nuevo -- así "abrir turno" es idempotente por sesión. */
export async function openShift(params: { eventId: number; operatorId: number; registerId?: number; openingCash: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getOpenShift(params.eventId, params.registerId);
  if (existing) return existing.id;

  const [result] = await db.insert(shifts).values({
    eventId: params.eventId,
    operatorId: params.operatorId,
    registerId: params.registerId ?? null,
    openingCash: String(params.openingCash),
  });
  return (result as unknown as { insertId: number }).insertId;
}

/** Turno abierto para un evento+caja (o "sin caja asignada" si registerId es
 * undefined) -- es lo que le da identidad estable a un turno en vez de tener
 * que reconstruirlo cada vez a partir del ledger `ops`. */
export async function getOpenShift(eventId: number, registerId?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq(shifts.eventId, eventId), eq(shifts.status, 'open')];
  conditions.push(registerId ? eq(shifts.registerId, registerId) : isNull(shifts.registerId));
  const [row] = await db.select().from(shifts).where(and(...conditions)).orderBy(desc(shifts.openedAt)).limit(1);
  return row ?? null;
}

/** Cierre de turno con cuadre de caja (pedido explícito del usuario):
 * - `countedCash` es el efectivo TOTAL contado en el cajón (no la diferencia
 *   -- se resta `openingCash` automáticamente vía `expectedCash`).
 * - `expected*` sale solo de ventas canal='caja' dentro de la ventana del
 *   turno (openedAt → ahora), nunca de ventas web.
 * - `topCustomers`/`topProducts` son del EVENTO completo (todas las
 *   ventas aprobadas, cualquier canal) -- es "cómo terminó la fiesta", no
 *   solo este turno -- y quedan grabados como snapshot para que el reporte
 *   de un evento pasado no cambie si se generan más ventas después. */
export async function closeShift(params: {
  shiftId: number;
  closedByOperatorId: number;
  countedCash: number;
  countedDebit: number;
  countedCredit: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [shift] = await db.select().from(shifts).where(eq(shifts.id, params.shiftId)).limit(1);
  if (!shift) throw new Error("Turno no encontrado");
  if (shift.status === 'closed') throw new Error("Este turno ya fue cerrado");

  const closedAt = new Date();

  const shiftSalesConditions = [
    eq(orders.eventId, shift.eventId),
    eq(orders.channel, 'caja'),
    eq(orders.paymentStatus, 'approved'),
    gte(orders.createdAt, shift.openedAt),
  ];
  if (shift.registerId) shiftSalesConditions.push(eq(orders.registerId, shift.registerId));
  const shiftSales = await db.select({ total: orders.total, paymentMethod: orders.paymentMethod })
    .from(orders).where(and(...shiftSalesConditions));

  let expectedCash = 0, expectedDebit = 0, expectedCredit = 0;
  for (const s of shiftSales) {
    const amount = Number(s.total);
    if (s.paymentMethod === 'efectivo') expectedCash += amount;
    else if (s.paymentMethod === 'debito') expectedDebit += amount;
    else if (s.paymentMethod === 'credito') expectedCredit += amount;
  }

  const redeemsCount = await db.select({ count: sql<number>`count(*)` }).from(ops).where(and(
    eq(ops.eventId, shift.eventId), eq(ops.type, 'redeem'), eq(ops.result, 'applied'), gte(ops.serverAt, shift.openedAt),
    ...(shift.registerId ? [eq(ops.registerId, shift.registerId)] : []),
  ));

  // "Cómo terminó la fiesta": top 3 clientes/productos del evento completo,
  // excluyendo el comprador placeholder de caja (no es un cliente real).
  const eventOrders = await db.select({ buyerName: orders.buyerName, buyerEmail: orders.buyerEmail, total: orders.total })
    .from(orders).where(and(eq(orders.eventId, shift.eventId), eq(orders.paymentStatus, 'approved'), sql`${orders.channel} != 'caja'`));
  const byCustomer = new Map<string, { name: string; email: string; total: number }>();
  for (const o of eventOrders) {
    const entry = byCustomer.get(o.buyerEmail) ?? { name: o.buyerName, email: o.buyerEmail, total: 0 };
    entry.total += Number(o.total);
    byCustomer.set(o.buyerEmail, entry);
  }
  const topCustomers = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total).slice(0, 3);

  const eventItems = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, shift.eventId), eq(orders.paymentStatus, 'approved')));
  const allTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, shift.eventId));
  const ttById = new Map<number, any>(allTicketTypes.map((t: any) => [t.id, t]));
  const byProduct = new Map<number, { name: string; quantity: number; revenue: number }>();
  for (const item of eventItems) {
    const entry = byProduct.get(item.ticketTypeId) ?? { name: ttById.get(item.ticketTypeId)?.name ?? `#${item.ticketTypeId}`, quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.totalPrice);
    byProduct.set(item.ticketTypeId, entry);
  }
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 3);

  await db.update(shifts).set({
    closedAt,
    closedByOperatorId: params.closedByOperatorId,
    countedCash: String(params.countedCash),
    countedDebit: String(params.countedDebit),
    countedCredit: String(params.countedCredit),
    expectedCash: String(expectedCash),
    expectedDebit: String(expectedDebit),
    expectedCredit: String(expectedCredit),
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts,
    status: 'closed',
  }).where(eq(shifts.id, shift.id));

  const [event] = await db.select({ title: events.title }).from(events).where(eq(events.id, shift.eventId)).limit(1);
  const [register] = shift.registerId ? await db.select({ name: registers.name }).from(registers).where(eq(registers.id, shift.registerId)).limit(1) : [null];
  const [operator] = await db.select({ name: operators.name }).from(operators).where(eq(operators.id, shift.operatorId)).limit(1);

  return {
    id: shift.id,
    eventTitle: event?.title ?? `Evento #${shift.eventId}`,
    registerName: register?.name ?? 'Sin caja asignada',
    operatorName: operator?.name ?? 'Operador eliminado',
    openedAt: shift.openedAt,
    closedAt,
    openingCash: Number(shift.openingCash),
    countedCash: params.countedCash,
    countedDebit: params.countedDebit,
    countedCredit: params.countedCredit,
    expectedCash,
    expectedDebit,
    expectedCredit,
    cashDiff: params.countedCash - expectedCash - Number(shift.openingCash),
    debitDiff: params.countedDebit - expectedDebit,
    creditDiff: params.countedCredit - expectedCredit,
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts,
  };
}

/** Cierres de turno guardados, para comparar entre eventos y exportar a CSV
 * (pedido explícito del usuario). */
export async function listShiftClosings(eventId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(shifts.status, 'closed')];
  if (eventId) conditions.push(eq(shifts.eventId, eventId));
  const rows = await db.select().from(shifts).where(and(...conditions)).orderBy(desc(shifts.closedAt));

  const eventIds = Array.from(new Set(rows.map((r: any) => r.eventId)));
  const registerIds = Array.from(new Set(rows.map((r: any) => r.registerId).filter((id: any) => id != null)));
  const operatorIds = Array.from(new Set([...rows.map((r: any) => r.operatorId), ...rows.map((r: any) => r.closedByOperatorId)].filter((id: any) => id != null)));

  const eventRows = eventIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds)) : [];
  const registerRows = registerIds.length ? await db.select({ id: registers.id, name: registers.name }).from(registers).where(inArray(registers.id, registerIds)) : [];
  const operatorRows = operatorIds.length ? await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray(operators.id, operatorIds)) : [];
  const eventById = new Map(eventRows.map((e: any) => [e.id, e.title]));
  const registerById = new Map(registerRows.map((r: any) => [r.id, r.name]));
  const operatorById = new Map(operatorRows.map((o: any) => [o.id, o.name]));

  return rows.map((r: any) => ({
    id: r.id,
    eventId: r.eventId,
    eventTitle: eventById.get(r.eventId) ?? `Evento #${r.eventId}`,
    registerName: r.registerId ? (registerById.get(r.registerId) ?? 'Caja eliminada') : 'Sin caja asignada',
    operatorName: operatorById.get(r.operatorId) ?? 'Operador eliminado',
    closedByName: r.closedByOperatorId ? (operatorById.get(r.closedByOperatorId) ?? 'Operador eliminado') : null,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    openingCash: Number(r.openingCash),
    countedCash: Number(r.countedCash ?? 0),
    countedDebit: Number(r.countedDebit ?? 0),
    countedCredit: Number(r.countedCredit ?? 0),
    expectedCash: Number(r.expectedCash ?? 0),
    expectedDebit: Number(r.expectedDebit ?? 0),
    expectedCredit: Number(r.expectedCredit ?? 0),
    cashDiff: Number(r.countedCash ?? 0) - Number(r.expectedCash ?? 0) - Number(r.openingCash),
    debitDiff: Number(r.countedDebit ?? 0) - Number(r.expectedDebit ?? 0),
    creditDiff: Number(r.countedCredit ?? 0) - Number(r.expectedCredit ?? 0),
    salesCount: r.salesCount ?? 0,
    redeemsCount: r.redeemsCount ?? 0,
    topCustomers: r.topCustomers ?? [],
    topProducts: r.topProducts ?? [],
  }));
}

export async function getShiftClosingsForExport(eventId?: number) {
  return listShiftClosings(eventId);
}

// --- Base de datos de clientes (pedido explícito del usuario) ---

/** Se llama una sola vez por orden, desde processApprovedOrder (solo ventas
 * web -- las de caja no tienen identidad real de comprador). Acumula
 * accessTypes en vez de sobreescribir, para poder segmentar mailing por
 * "alguna vez compró Dúo" aunque la compra más reciente haya sido Soltera. */
export async function upsertCustomerFromOrder(order: any, accesoSlugs: string[]) {
  const db = await getDb();
  if (!db) return;
  if (!order.buyerEmail) return;

  let rut: string | null = null;
  let instagram: string | null = null;
  try {
    const parsed = order.attendeeData ? JSON.parse(order.attendeeData) : null;
    const campos = parsed?.campos ?? {};
    if (typeof campos.rut === 'string' && campos.rut.trim()) rut = campos.rut.trim();
    if (typeof campos.instagram === 'string' && campos.instagram.trim()) instagram = campos.instagram.trim();
  } catch {
    // attendeeData mal formado -- no bloquea el registro del cliente.
  }

  const email = order.buyerEmail.trim().toLowerCase();
  const [existing] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  const existingAccessTypes: string[] = Array.isArray(existing?.accessTypes) ? existing!.accessTypes as string[] : [];
  const mergedAccessTypes = Array.from(new Set([...existingAccessTypes, ...accesoSlugs]));

  if (existing) {
    await db.update(customers).set({
      fullName: order.buyerName || existing.fullName,
      phone: order.buyerPhone || existing.phone,
      rut: rut ?? existing.rut,
      instagram: instagram ?? existing.instagram,
      accessTypes: mergedAccessTypes,
      totalOrders: existing.totalOrders + 1,
      totalSpent: String(Number(existing.totalSpent) + Number(order.total)),
      lastSeenAt: new Date(),
    }).where(eq(customers.id, existing.id));
  } else {
    await db.insert(customers).values({
      email,
      fullName: order.buyerName,
      phone: order.buyerPhone,
      rut,
      instagram,
      accessTypes: mergedAccessTypes,
      tags: [],
      totalOrders: 1,
      totalSpent: String(Number(order.total)),
    });
  }
}

// --- Playcoins (pedido explícito del usuario, reemplaza el sistema de
// puntos de Shopify): 25 Playcoins por cada $1.000 CLP gastados, 1 Playcoin
// = $1 CLP al canjear, mínimo 5.000 de saldo para poder canjear (parcial
// permitido). Se gana en compras web Y en caja (ver shared/playcoins.ts). ---

/** Otorga Playcoins por una compra -- crea el cliente si no existe (una
 * venta de caja con email puede ser la primera vez que se ve ese comprador).
 * Idempotente por (reason, orderId) u (reason, opId): un reintento de
 * webhook o de `caja.sync` nunca duplica el otorgamiento. */
export async function awardPlaycoins(params: {
  email: string;
  totalClp: number;
  reason: 'earn_web' | 'earn_caja';
  orderId?: number;
  opId?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const email = params.email.trim().toLowerCase();
  if (!email) return;

  const points = playcoinsEarnedForPurchase(params.totalClp);
  if (points <= 0) return;

  const dupConditions = params.opId
    ? and(eq(playcoinsLedger.opId, params.opId), eq(playcoinsLedger.reason, params.reason))
    : params.orderId
    ? and(eq(playcoinsLedger.orderId, params.orderId), eq(playcoinsLedger.reason, params.reason))
    : undefined;
  if (dupConditions) {
    const [dup] = await db.select().from(playcoinsLedger).where(dupConditions).limit(1);
    if (dup) return;
  }

  let [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!customer) {
    const [ins] = await db.insert(customers).values({ email, accessTypes: [], tags: [] });
    const insertId = (ins as unknown as { insertId: number }).insertId;
    [customer] = await db.select().from(customers).where(eq(customers.id, insertId)).limit(1);
  }

  const balanceAfter = customer.playcoins + points;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq(customers.id, customer.id));
  await db.insert(playcoinsLedger).values({
    customerId: customer.id, delta: points, reason: params.reason,
    orderId: params.orderId ?? null, opId: params.opId ?? null, balanceAfter,
  });
}

/** Canje SERVER-AUTHORITATIVE: relee el saldo real en la BD en el instante
 * en que esta operación finalmente se aplica (no confía en lo que el
 * dispositivo offline mostraba al encolarla) -- mismo principio que
 * `redeemDisplayCode` usa para códigos de ticket. Si el saldo no alcanza
 * para el monto exacto pedido, devuelve un conflicto en vez de canjear un
 * monto distinto en silencio. */
export async function redeemPlaycoinsAuthoritative(params: { email: string; requestedAmount: number; opId: string }): Promise<
  { ok: true; redeemed: number; balanceAfter: number } | { ok: false; conflictNote: string }
> {
  const db = await getDb();
  if (!db) return { ok: false, conflictNote: "Base de datos no disponible" };
  const email = params.email.trim().toLowerCase();
  const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!customer) return { ok: false, conflictNote: "Cliente no encontrado para canjear Playcoins" };

  const redeemed = clampRedeemAmount(params.requestedAmount, customer.playcoins);
  if (redeemed <= 0) {
    return { ok: false, conflictNote: `Saldo insuficiente para canjear Playcoins (saldo actual: ${customer.playcoins})` };
  }
  if (redeemed < params.requestedAmount) {
    return { ok: false, conflictNote: `Saldo insuficiente: se pidieron ${params.requestedAmount} Playcoins pero solo hay ${customer.playcoins} disponibles` };
  }

  const balanceAfter = customer.playcoins - redeemed;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq(customers.id, customer.id));
  await db.insert(playcoinsLedger).values({
    customerId: customer.id, delta: -redeemed, reason: 'redeem_caja', opId: params.opId, balanceAfter,
  });
  return { ok: true, redeemed, balanceAfter };
}

export async function getPlaycoinsBalance(email: string) {
  const db = await getDb();
  if (!db) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.email, email.trim().toLowerCase())).limit(1);
  if (!customer) return null;
  return { email: customer.email, playcoins: customer.playcoins };
}

/** Ajuste manual desde /admin (migrar saldo de Shopify a mano, corregir). */
export async function adjustPlaycoinsManually(customerId: number, delta: number, note: string) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const balanceAfter = Math.max(0, customer.playcoins + delta);
  const appliedDelta = balanceAfter - customer.playcoins;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq(customers.id, customerId));
  await db.insert(playcoinsLedger).values({ customerId, delta: appliedDelta, reason: 'manual_adjust', balanceAfter, note });
}

export async function listCustomers(filters: { search?: string; accessType?: string; tag?: string; excludeTag?: string; eventId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  let rows = await db.select().from(customers).orderBy(desc(customers.lastSeenAt));

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    rows = rows.filter((c: any) =>
      c.email.toLowerCase().includes(needle) ||
      (c.fullName && c.fullName.toLowerCase().includes(needle)) ||
      (c.phone && c.phone.includes(filters.search!))
    );
  }
  if (filters.accessType) {
    rows = rows.filter((c: any) => Array.isArray(c.accessTypes) && c.accessTypes.includes(filters.accessType));
  }
  if (filters.tag) {
    rows = rows.filter((c: any) => Array.isArray(c.tags) && c.tags.includes(filters.tag));
  }
  // Excluir por etiqueta (pedido explícito del usuario): armar audiencias de
  // mailing tipo "todos menos los que ya recibieron la campaña X" sin tener
  // que mantener una lista aparte -- reusa las mismas tags libres de siempre.
  if (filters.excludeTag) {
    rows = rows.filter((c: any) => !Array.isArray(c.tags) || !c.tags.includes(filters.excludeTag));
  }
  // "Clientes de este evento" no vive en `customers` (no tiene FK a events) --
  // se resuelve cruzando por email contra las órdenes aprobadas de ese evento
  // (mismo criterio que el resto del sistema: la fuente de verdad es `orders`,
  // `customers` es una proyección materializada, ver comentario en el schema).
  if (filters.eventId) {
    const approvedOrders = await db.select({ buyerEmail: orders.buyerEmail }).from(orders).where(and(
      eq(orders.eventId, filters.eventId),
      eq(orders.paymentStatus, 'approved'),
    ));
    const emails = new Set(approvedOrders.map((o) => o.buyerEmail.toLowerCase()));
    rows = rows.filter((c: any) => emails.has(c.email.toLowerCase()));
  }
  return rows;
}

/** Resuelve destinatarios de un lote de mailing masivo por id (server/mailing.ts). */
export async function listCustomersByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(customers).where(inArray(customers.id, ids));
}

/** Taguea en masa clientes existentes por email (pedido explícito del
 * usuario: marcar como "ya enviado" a partir de un CSV externo, ej. el
 * reporte de entregados de Resend). No crea clientes nuevos -- si un email
 * del CSV no está en la base, se reporta en `notFound` para que quede claro
 * (no falla silenciosamente). */
export async function bulkAddTagByEmails(emails: string[], tag: string): Promise<{ tagged: number; alreadyTagged: number; notFound: string[] }> {
  const db = await getDb();
  const cleanTag = tag.trim();
  const normalizedEmails = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!db || !cleanTag || normalizedEmails.length === 0) {
    return { tagged: 0, alreadyTagged: 0, notFound: normalizedEmails };
  }

  const matches = await db.select().from(customers).where(inArray(customers.email, normalizedEmails));
  const matchedEmails = new Set(matches.map((c) => c.email.toLowerCase()));
  const notFound = normalizedEmails.filter((e) => !matchedEmails.has(e));

  let tagged = 0;
  let alreadyTagged = 0;
  for (const customer of matches) {
    const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
    if (tags.includes(cleanTag)) {
      alreadyTagged++;
      continue;
    }
    await db.update(customers).set({ tags: [...tags, cleanTag] }).where(eq(customers.id, customer.id));
    tagged++;
  }

  return { tagged, alreadyTagged, notFound };
}

export async function addCustomerTag(customerId: number, tag: string) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
  const clean = tag.trim();
  if (!clean || tags.includes(clean)) return;
  await db.update(customers).set({ tags: [...tags, clean] }).where(eq(customers.id, customerId));
}

export async function removeCustomerTag(customerId: number, tag: string) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
  await db.update(customers).set({ tags: tags.filter((t) => t !== tag) }).where(eq(customers.id, customerId));
}

export async function updateCustomerNotes(customerId: number, notes: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set({ notes }).where(eq(customers.id, customerId));
}

/** Importación manual desde CSV (server/adminRoutes.ts): mismo criterio de
 * merge que upsertCustomerFromOrder -- por email, acumulando accessTypes/tags
 * en vez de sobreescribir, para no perder segmentación ya hecha a mano. */
export async function importCustomers(rows: {
  email: string;
  fullName?: string;
  phone?: string;
  rut?: string;
  instagram?: string;
  accessTypes?: string[];
  tags?: string[];
  notes?: string;
  totalOrders?: number;
  totalSpent?: number;
}[]) {
  const db = await getDb();
  if (!db) return { imported: 0, updated: 0 };
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;

    const [existing] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (existing) {
      const existingAccessTypes: string[] = Array.isArray(existing.accessTypes) ? existing.accessTypes as string[] : [];
      const existingTags: string[] = Array.isArray(existing.tags) ? existing.tags as string[] : [];
      // totalOrders/totalSpent importados son un baseline histórico (ej. export de
      // Shopify) -- se toma el máximo contra lo ya acumulado por compras web reales
      // en vez de sobreescribir, para no perder conteo si el cliente ya compró acá.
      const importedOrders = row.totalOrders !== undefined && !Number.isNaN(row.totalOrders) ? row.totalOrders : undefined;
      const importedSpent = row.totalSpent !== undefined && !Number.isNaN(row.totalSpent) ? row.totalSpent : undefined;
      await db.update(customers).set({
        fullName: row.fullName || existing.fullName,
        phone: row.phone || existing.phone,
        rut: row.rut || existing.rut,
        instagram: row.instagram || existing.instagram,
        accessTypes: Array.from(new Set([...existingAccessTypes, ...(row.accessTypes ?? [])])),
        tags: Array.from(new Set([...existingTags, ...(row.tags ?? [])])),
        notes: row.notes || existing.notes,
        totalOrders: importedOrders !== undefined ? Math.max(existing.totalOrders, importedOrders) : existing.totalOrders,
        totalSpent: importedSpent !== undefined ? String(Math.max(Number(existing.totalSpent), importedSpent)) : existing.totalSpent,
      }).where(eq(customers.id, existing.id));
      updated++;
    } else {
      await db.insert(customers).values({
        email,
        fullName: row.fullName || null,
        phone: row.phone || null,
        rut: row.rut || null,
        instagram: row.instagram || null,
        accessTypes: row.accessTypes ?? [],
        tags: row.tags ?? [],
        notes: row.notes || null,
        totalOrders: row.totalOrders ?? 0,
        totalSpent: row.totalSpent !== undefined ? String(row.totalSpent) : "0",
      });
      imported++;
    }
  }

  return { imported, updated };
}
